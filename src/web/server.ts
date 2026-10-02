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
import { extractImageText } from "../agent/extract-image-text.js";
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

    // 视觉模型客户端：用于图片 OCR 文字识别。
    // 延迟初始化，与 audioBridge 同理。
    let visionClient: ModelClient | null = null;
    const getVisionClient = (): ModelClient => {
        if (!visionClient) {
            const visionModel = config.VISION_MODEL ?? config.MODEL_NAME ?? "qwen-vl-plus";
            visionClient = createModelClient({ model: visionModel, config });
        }
        return visionClient;
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

    chatWss.on("connection", (ws, request) => {
        // 从 URL 查询参数中提取 sessionId，用于恢复之前的对话
        const url = new URL(request.url ?? "/", `http://${request.headers.host}`);
        const requestedSessionId = url.searchParams.get("sessionId");

        let sessionId: string;
        let restoredMessages: ChatMessage[] = [];

        if (requestedSessionId) {
            sessionId = requestedSessionId;
            // 尝试从内存中恢复
            const existingSession = sessions.get(sessionId);
            if (existingSession) {
                restoredMessages = existingSession.messages;
            }
        } else {
            sessionId = crypto.randomUUID();
        }

        const session: ChatSession = {
            id: sessionId,
            messages: restoredMessages,
            ws,
        };
        sessions.set(sessionId, session);

        console.log(`WebSocket connected: ${sessionId}${requestedSessionId ? " (restored)" : ""}`);

        // Send session ID to client, along with whether this is a restored session
        ws.send(
            JSON.stringify({
                type: "session_init",
                sessionId,
                restored: restoredMessages.length > 0,
            }),
        );

        // 如果是恢复的 session 且有磁盘记录，异步加载完整历史
        if (requestedSessionId && restoredMessages.length === 0) {
            sessionStore.load(sessionId).then((data) => {
                if (data && data.messages.length > 0) {
                    session.messages = data.messages;
                    console.log(`[web] Session ${sessionId} restored from disk (${data.messages.length} messages)`);
                    // 通知前端会话已恢复
                    if (ws.readyState === WebSocket.OPEN) {
                        ws.send(
                            JSON.stringify({
                                type: "session_restored",
                                sessionId,
                                messageCount: data.messages.length,
                            }),
                        );
                    }
                }
            }).catch((err) => {
                console.error(`[web] Failed to restore session ${sessionId}:`, err);
            });
        }

        ws.on("close", () => {
            console.log(`WebSocket disconnected: ${sessionId}`);
            // 断开时持久化会话到磁盘，然后从内存中移除
            const existing = sessions.get(sessionId);
            if (existing && existing.ws === ws) {
                if (existing.messages.length > 0) {
                    sessionStore.save(sessionId, existing.messages).catch((err) => {
                        console.error(`[web] Failed to persist session ${sessionId}:`, err);
                    });
                }
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
        handler(message, session, tools, modelClient, sessionStore)
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

    // REST API: OCR — 使用视觉模型从图片中提取文字
    app.post("/api/ocr", async (req, res) => {
        const { images } = req.body as { images: string[] };

        if (!images || !Array.isArray(images) || images.length === 0) {
            res.status(400).json({ error: "Missing 'images' array" });
            return;
        }

        try {
            const client = getVisionClient();
            const text = await extractImageText({
                modelClient: client,
                imageBase64: images,
            });
            res.json({ text });
        } catch (err) {
            console.error("[web] OCR error:", err);
            res.status(500).json({
                error: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // REST API: 获取会话历史（用于前端恢复对话）
    app.get("/api/session/:id", async (req, res) => {
        const { id } = req.params;

        // 先从内存中查找
        const memSession = sessions.get(id);
        if (memSession && memSession.messages.length > 0) {
            res.json({
                sessionId: id,
                messages: extractDisplayMessages(memSession.messages),
            });
            return;
        }

        // 从磁盘加载
        try {
            const data = await sessionStore.load(id);
            if (data) {
                res.json({
                    sessionId: id,
                    messages: extractDisplayMessages(data.messages),
                    updatedAt: data.updatedAt,
                });
            } else {
                res.status(404).json({ error: "Session not found" });
            }
        } catch (err) {
            res.status(500).json({
                error: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // REST API: 列出所有已保存的会话（用于侧边栏）
    app.get("/api/sessions", async (_req, res) => {
        try {
            const list = await sessionStore.listSessionsWithMeta();
            res.json({ sessions: list });
        } catch (err) {
            res.status(500).json({
                error: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // REST API: 删除指定会话
    app.delete("/api/session/:id", async (req, res) => {
        const { id } = req.params;
        try {
            await sessionStore.delete(id);
            sessions.delete(id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({
                error: err instanceof Error ? err.message : String(err),
            });
        }
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

/**
 * 从原始对话历史中提取可供前端展示的消息。
 *
 * Agent 模式下 messages 数组包含大量中间步骤（工具调用 JSON、工具执行结果等），
 * 前端只需要展示：用户的原始输入 + 助手的最终回复。
 *
 * 过滤规则：
 *   - assistant 消息：如果是 JSON 且 type="final"，提取 message 字段；
 *     如果是 tool_call 或 ask_confirmation，跳过
 *   - user 消息：如果是工具执行结果（JSON 含 _meta 或 tool_result 特征），跳过；
 *     否则保留为用户原始输入
 */
function extractDisplayMessages(messages: ChatMessage[]): Array<{ role: "user" | "assistant"; content: string }> {
    const result: Array<{ role: "user" | "assistant"; content: string }> = [];

    for (const msg of messages) {
        const content = typeof msg.content === "string" ? msg.content : "";
        if (!content) continue;

        if (msg.role === "assistant") {
            // 尝试解析为 Agent 协议 JSON
            const trimmed = content.trim();
            if (trimmed.startsWith("{")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed.type === "final" && typeof parsed.message === "string") {
                        result.push({ role: "assistant", content: parsed.message });
                        continue;
                    }
                    // tool_call / ask_confirmation → 跳过
                    if (parsed.type === "tool_call" || parsed.type === "ask_confirmation") {
                        continue;
                    }
                } catch {
                    // 不是合法 JSON，当作普通文本
                }
            }
            result.push({ role: "assistant", content });
        } else if (msg.role === "user") {
            const trimmed = content.trim();

            // 过滤工具执行结果（JSON 格式）
            if (trimmed.startsWith("{")) {
                try {
                    const parsed = JSON.parse(trimmed);
                    if (parsed._meta || parsed.tool_result !== undefined) {
                        continue;
                    }
                } catch {
                    // 不是合法 JSON，继续后续检查
                }
            }

            // 过滤工具执行结果（纯文本格式：Tool "xxx" completed/failed）
            if (/^Tool ".+?" (completed successfully|failed)\./.test(trimmed)) {
                continue;
            }

            // 过滤压缩摘要
            if (trimmed.startsWith("[以下是之前对话的压缩摘要")) {
                continue;
            }

            result.push({ role: "user", content });
        }
    }

    return result;
}

async function runAgentLoop(
    userInput: string,
    session: ChatSession,
    tools: Map<string, import("../tools/types.js").Tool>,
    modelClient: ModelClient,
    sessionStore: SessionStore,
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
            maxSteps: 30,
            previousMessages: session.messages,
            approvalMode: "always-allow",
            requestApproval: undefined,
            onMessagesUpdated: async (messages: ChatMessage[]) => {
                session.messages = messages;
                // 异步持久化到磁盘，不阻塞 Agent 循环
                sessionStore.save(session.id, messages).catch((err) => {
                    console.error(`[web] Failed to persist session ${session.id}:`, err);
                });
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
    sessionStore: SessionStore,
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
                sessionStore.save(session.id, messages).catch((err) => {
                    console.error(`[web:direct] Failed to persist session ${session.id}:`, err);
                });
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
