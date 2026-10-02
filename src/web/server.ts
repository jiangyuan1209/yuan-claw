#!/usr/bin/env node
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createWebEventBusBroadcast } from "../events/web-event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
import { runDirectLLM } from "../agent/run-direct-llm.js";
import { createModelClient } from "../model/client.js";
import { STTService } from "../lib/stt.js";
import { AudioSTTBridge } from "./audio-stt-bridge.js";
import { ensureUserConfigInitialized } from "../config/init-user-config.js";
import { loadAppConfig } from "../config/load-config.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import type { ChatMessage } from "../memory/types.js";
import type { AgentEvent } from "../events/event-bus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3000;

type ChatSession = {
    id: string;
    /**
     * ===== Web 端的对话记忆 =====
     *
     * 每个 WebSocket 连接对应一个 ChatSession，messages 数组存储该会话的完整对话历史。
     * 每次用户发消息时，这个数组会被传入 runLocalAgentLoop / runDirectLLM 的 previousMessages，
     * 使 LLM 能看到同一会话中之前所有轮次的对话上下文。
     *
     * Agent 循环 / 直连调用完成后，通过 onMessagesUpdated 回调更新此数组，
     * 将本次问答（Agent 模式下还包括中间步骤）追加进来，供下一轮使用。
     *
     * 注意：session 是内存级别的，服务重启后对话记忆丢失。
     */
    messages: ChatMessage[];
    ws: WebSocket | null;
};

async function main() {
    // Initialize config (same as CLI does)
    await ensureUserConfigInitialized();
    const config = await loadAppConfig();

    const app = express();
    app.use(express.json({ limit: "10mb" }));

    // Workspace root defaults to current working directory
    const workspaceRoot = resolveWorkspaceRoot(process.cwd());

    // Shared resources (same as CLI)
    const tools = createToolRegistry({ workspaceRoot, config });
    const modelClient = createModelClient({ config });
    const sessionStore = new SessionStore();

    // 语音识别桥接器：将浏览器麦克风采集的音频转发到 DashScope 实时 ASR。
    // 延迟初始化——STTService 在缺少 MODEL_API_KEY 时会抛错，若在启动时构造
    // 会导致未配置密钥的用户整个 Web 服务无法启动。仅在首次用到语音时才创建，
    // 出错信息回传给前端而不影响文字对话功能。
    let audioBridge: AudioSTTBridge | null = null;
    const getAudioBridge = (): AudioSTTBridge => {
        if (!audioBridge) {
            audioBridge = new AudioSTTBridge(new STTService({ config }));
        }
        return audioBridge;
    };

    // In-memory session storage for web
    const sessions = new Map<string, ChatSession>();

    // Track sessions currently running an agent loop to prevent duplicates
    const runningSessions = new Set<string>();

    // WebSocket server for real-time events
    const server = app.listen(process.env.PORT ?? DEFAULT_PORT, () => {
        const port = (server.address() as import("net").AddressInfo).port;
        console.log(`Yuan Claw Web server running at http://localhost:${port}`);
        console.log(`Chat WebSocket:  ws://localhost:${port}/ws`);
        console.log(`Audio WebSocket: ws://localhost:${port}/ws/audio`);
    });

    // 使用 noServer 模式，手动按路径把 HTTP upgrade 请求分发到对应的 WSS：
    //   /ws       → 聊天事件
    //   /ws/audio → 语音识别（浏览器麦克风）
    // 若两个 WSS 都直接挂在同一 HTTP server 上，第一个会对不匹配的路径执行
    // abortHandshake(400) 并销毁 socket，导致第二个无法处理该连接。
    const chatWss = new WebSocketServer({ noServer: true });
    const audioWss = new WebSocketServer({ noServer: true });

    server.on("upgrade", (request, socket, head) => {
        const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;

        if (pathname === "/ws/audio") {
            audioWss.handleUpgrade(request, socket, head, (ws) => {
                audioWss.emit("connection", ws, request);
            });
        } else if (pathname === "/ws") {
            chatWss.handleUpgrade(request, socket, head, (ws) => {
                chatWss.emit("connection", ws, request);
            });
        }
        // 其他路径：不处理，交给 Vite HMR 等其他处理器
    });

    chatWss.on("connection", (ws) => {
        const sessionId = crypto.randomUUID();
        const session: ChatSession = {
            id: sessionId,
            messages: [],
            ws,
        };
        sessions.set(sessionId, session);

        console.log(`WebSocket connected: ${sessionId}`);

        // Send session ID to client
        ws.send(
            JSON.stringify({
                type: "session_init",
                sessionId,
            }),
        );

        ws.on("close", () => {
            console.log(`WebSocket disconnected: ${sessionId}`);
            // Clean up session on disconnect to prevent stale broadcasts
            const existing = sessions.get(sessionId);
            if (existing && existing.ws === ws) {
                sessions.delete(sessionId);
            }
        });

        ws.on("error", (err) => {
            console.error(`WebSocket error (${sessionId}):`, err.message);
        });
    });

    // ── 语音识别 WebSocket（/ws/audio）────────────────────────────
    audioWss.on("connection", (ws) => {
        const audioSessionId = crypto.randomUUID();
        console.log(`[audio] WebSocket connected: ${audioSessionId}`);

        ws.on("message", async (data, isBinary) => {
            // 二进制帧：浏览器麦克风采集的 PCM 音频块，直接转发给 STT
            if (isBinary) {
                audioBridge?.sendChunk(audioSessionId, data as Buffer);
                return;
            }

            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            switch (msg.type) {
                case "start": {
                    // 首次启动语音时才创建 STT 服务，缺少密钥等错误回传前端而非中断连接
                    try {
                        getAudioBridge().startSession(audioSessionId, ws);
                    } catch (err) {
                        if (ws.readyState === WebSocket.OPEN) {
                            ws.send(
                                JSON.stringify({
                                    type: "error",
                                    error: err instanceof Error ? err.message : String(err),
                                }),
                            );
                        }
                    }
                    break;
                }

                case "stop":
                    await audioBridge?.endSession(audioSessionId);
                    break;
            }
        });

        ws.on("close", () => {
            console.log(`[audio] WebSocket disconnected: ${audioSessionId}`);
            audioBridge?.removeSession(audioSessionId);
        });

        ws.on("error", (err) => {
            console.error(`[audio] WebSocket error (${audioSessionId}):`, err.message);
        });
    });

    // REST API: send a chat message
    app.post("/api/chat", async (req, res) => {
        const { message, sessionId, mode } = req.body as {
            message: string;
            sessionId?: string;
            mode?: "agent" | "direct";
        };

        if (!message || typeof message !== "string") {
            res.status(400).json({ error: "Missing 'message' field" });
            return;
        }

        let session: ChatSession | undefined;
        if (sessionId) {
            session = sessions.get(sessionId);
        }

        if (!session) {
            // Auto-create session if not provided
            const newId = crypto.randomUUID();
            session = {
                id: newId,
                messages: [],
                ws: null,
            };
            sessions.set(newId, session);
        }

        // Prevent duplicate agent loops for the same session
        if (runningSessions.has(session.id)) {
            console.warn(`[web] Duplicate request for session ${session.id}, skipping`);
            res.status(429).json({ error: "Already processing" });
            return;
        }

        res.json({ sessionId: session.id });

        // Run loop asynchronously (response already sent)
        runningSessions.add(session.id);
        const handler = mode === "direct" ? runDirectLLMHandler : runAgentLoop;
        handler(message, session, tools, modelClient)
            .finally(() => {
                runningSessions.delete(session.id);
            })
            .catch((err) => {
                console.error("Agent loop error:", err);
                if (session?.ws && session.ws.readyState === WebSocket.OPEN) {
                    session.ws.send(
                        JSON.stringify({
                            type: "run_error",
                            step: 0,
                            stage: "model_generate" as const,
                            error: err instanceof Error ? err.message : String(err),
                        }),
                    );
                }
            });
    });

    // Serve static files (built React app)
    const distPath = path.resolve(__dirname, "../../web-dist");
    if (fs.existsSync(distPath)) {
        app.use(express.static(distPath));
        // SPA fallback: serve index.html for non-API routes
        app.get("/{*path}", (_req, res) => {
            res.sendFile(path.resolve(distPath, "index.html"));
        });
    }
}

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
    generateStream: (messages: ChatMessage[]) => AsyncIterable<string>;
};

async function runAgentLoop(
    userInput: string,
    session: ChatSession,
    tools: Map<string, import("../tools/types.js").Tool>,
    modelClient: ModelClient,
) {
    const eventBus = createWebEventBusBroadcast(
        new Set(session.ws ? [session.ws] : []),
    );

    // Send run_start to the specific WebSocket
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
            JSON.stringify({
                type: "run_start",
                input: userInput,
            }),
        );
    }

    try {
        const result = await runLocalAgentLoop({
            userInput,
            modelClient,
            tools,
            eventBus,
            // Agent 多步骤上限：硬编码 30 步（Web 端不支持 --max-steps 参数）。
            // 仅限制单次任务内的步骤数，不影响跨轮次的对话记忆。
            maxSteps: 30,
            previousMessages: session.messages,
            approvalMode: "always-allow",
            requestApproval: undefined,
            onMessagesUpdated: async (messages: ChatMessage[]) => {
                session.messages = messages;
            },
        });

        console.log(`[web] Session ${session.id}: ${result.finalMessage.slice(0, 100)}...`);
    } catch (error) {
        console.error(`[web] Session ${session.id} error:`, error);
    }
}

async function runDirectLLMHandler(
    userInput: string,
    session: ChatSession,
    _tools: Map<string, import("../tools/types.js").Tool>,
    modelClient: ModelClient,
) {
    const eventBus = createWebEventBusBroadcast(
        new Set(session.ws ? [session.ws] : []),
    );

    // Send run_start to the specific WebSocket
    if (session.ws && session.ws.readyState === WebSocket.OPEN) {
        session.ws.send(
            JSON.stringify({
                type: "run_start",
                input: userInput,
            }),
        );
    }

    try {
        const result = await runDirectLLM({
            userInput,
            modelClient,
            eventBus,
            previousMessages: session.messages,
            onMessagesUpdated: async (messages: ChatMessage[]) => {
                session.messages = messages;
            },
        });

        console.log(`[web:direct] Session ${session.id}: ${result.finalMessage.slice(0, 100)}...`);
    } catch (error) {
        console.error(`[web:direct] Session ${session.id} error:`, error);
    }
}

main().catch((error) => {
    console.error("Failed to start web server:", error);
    process.exit(1);
});
