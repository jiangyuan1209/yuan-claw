#!/usr/bin/env node
import express from "express";
import { WebSocketServer, WebSocket } from "ws";
import path from "node:path";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

import { createToolRegistry, createWorkspaceBoundTools } from "../tools/registry.js";
import { registerMcpTools } from "../tools/mcp/mcp-client.js";
import { SessionStore } from "../memory/session-store.js";
import { WorkspaceStore } from "../memory/workspace-store.js";
import { countMessagesChars } from "../memory/message-chars.js";
import { createWebEventBusBroadcast } from "../events/web-event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
import { runDirectLLM } from "../agent/run-direct-llm.js";
import { compressHistory, COMPRESSION_THRESHOLD } from "../agent/compress-history.js";
import { createModelClient } from "../model/client.js";
import { extractImageText } from "../agent/extract-image-text.js";
import { STTService } from "../lib/stt.js";
import { AudioSTTBridge } from "./audio-stt-bridge.js";
import { ensureUserConfigInitialized } from "../config/init-user-config.js";
import { loadAppConfig } from "../config/load-config.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import type { ChatMessage, Workspace } from "../memory/types.js";
import type { Tool } from "../tools/types.js";
import type { AgentEvent } from "../events/event-bus.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_PORT = 3000;

/**
 * Web 端对话不设实际的轮次上限：Agent 单次任务可以连续调用工具直到给出最终回答。
 * 保留一个有限值只是为了在模型陷入死循环时最终能终止。
 */
const WEB_MAX_STEPS = 9999;

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
     * 注意：session 是内存级别的，服务重启后由磁盘记录（~/.yuan-claw/history）恢复。
     */
    messages: ChatMessage[];
    ws: WebSocket | null;
    /**
     * 对话所属的工作区。Web 模式下对话必须在工作区下创建，
     * 因此正常流程中此字段总是有值；为 null 说明是历史遗留的未关联会话。
     */
    workspace: Workspace | null;
};

/** 向仍处于打开状态的 WebSocket 发送一条 JSON 消息 */
function sendJson(ws: WebSocket | null, payload: Record<string, unknown>): void {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
    }
}

async function main() {
    // Initialize config (same as CLI does)
    await ensureUserConfigInitialized();
    const config = await loadAppConfig();

    const app = express();
    app.use(express.json({ limit: "10mb" }));

    // 未关联工作区时工具的兜底根目录（当前启动目录）
    const workspaceRoot = resolveWorkspaceRoot(process.cwd());

    // Shared resources (same as CLI)
    const baseTools = createToolRegistry({ workspaceRoot, config });
    // 接入配置的 MCP 服务端。Web 服务是长驻进程，MCP 连接在整个生命周期内保持，
    // 因此这里不主动 close（进程退出时由操作系统回收 socket）。
    await registerMcpTools(baseTools, config);
    const modelClient = createModelClient({ config });
    const sessionStore = new SessionStore();
    const workspaceStore = new WorkspaceStore();

    /**
     * 按主目录缓存工具表。
     *
     * 只有与目录绑定的工具（读写文件、shell、git）需要按工作区主目录重建，
     * MCP 与联网工具与目录无关，直接复用基础注册表——否则每建一个工作区
     * 都会重新拉起一套 MCP 子进程连接。
     */
    const toolsByRoot = new Map<string, Map<string, Tool>>();
    function getToolsForRoot(root: string): Map<string, Tool> {
        let cached = toolsByRoot.get(root);
        if (!cached) {
            cached = new Map(baseTools);
            // 工作区已获用户授权（免确认），shell_exec 以 trusted 模式重建，
            // 跳过命令白名单，允许 curl 等命令直接执行（危险命令黑名单仍生效）。
            for (const tool of createWorkspaceBoundTools(root, { trusted: true })) {
                cached.set(tool.name, tool);
            }
            toolsByRoot.set(root, cached);
        }
        return cached;
    }

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
        let restoredWorkspace: Workspace | null = null;

        if (requestedSessionId) {
            sessionId = requestedSessionId;
            // 尝试从内存中恢复
            const existingSession = sessions.get(sessionId);
            if (existingSession) {
                restoredMessages = existingSession.messages;
                restoredWorkspace = existingSession.workspace;
            }
        } else {
            sessionId = crypto.randomUUID();
        }

        const session: ChatSession = {
            id: sessionId,
            messages: restoredMessages,
            ws,
            workspace: restoredWorkspace,
        };
        sessions.set(sessionId, session);

        console.log(`WebSocket connected: ${sessionId}${requestedSessionId ? " (restored)" : ""}`);

        // Send session ID to client, along with whether this is a restored session
        sendJson(ws, {
            type: "session_init",
            sessionId,
            workspaceId: restoredWorkspace?.id ?? null,
            restored: restoredMessages.length > 0,
        });

        /**
         * 指定了 sessionId 时，把该会话的完整历史、所属工作区与字符占用回传前端。
         *
         * 内存命中（同一标签页重连）时消息已在 session 里，但工作区归属可能还没解析，
         * 因此统一走一次「补齐工作区 → 推送 session_restored」，保证前端总能拿到工作区。
         * 空会话（刚在工作区下点「+」创建、还没发过消息）同样要推送，否则前端不知道主目录。
         */
        if (requestedSessionId) {
            (async () => {
                if (!session.workspace) {
                    const data = await sessionStore.load(sessionId);
                    if (data) {
                        if (session.messages.length === 0 && data.messages.length > 0) {
                            session.messages = data.messages;
                            console.log(`[web] Session ${sessionId} restored from disk (${data.messages.length} messages)`);
                        }
                        if (data.workspaceId) {
                            session.workspace = await workspaceStore.get(data.workspaceId);
                        }
                    }
                }

                sendJson(ws, {
                    type: "session_restored",
                    sessionId,
                    messageCount: session.messages.length,
                    charCount: countMessagesChars(session.messages),
                    compressionThreshold: COMPRESSION_THRESHOLD,
                    workspace: session.workspace,
                });
            })().catch((err) => {
                console.error(`[web] Failed to restore session ${sessionId}:`, err);
            });
        }

        ws.on("close", () => {
            console.log(`WebSocket disconnected: ${sessionId}`);
            // 断开时持久化会话到磁盘，然后从内存中移除
            const existing = sessions.get(sessionId);
            if (existing && existing.ws === ws) {
                if (existing.messages.length > 0) {
                    sessionStore.save(sessionId, existing.messages, existing.workspace?.id).catch((err) => {
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

    /**
     * 解析会话所属的工作区：优先用内存里的，其次回落到磁盘记录。
     * 历史遗留的会话（迁移自旧的 .sessions 目录）没有工作区，返回 null。
     */
    async function resolveSessionWorkspace(session: ChatSession): Promise<Workspace | null> {
        if (session.workspace) return session.workspace;

        const data = await sessionStore.load(session.id);
        if (!data?.workspaceId) return null;

        const workspace = await workspaceStore.get(data.workspaceId);
        session.workspace = workspace;
        return workspace;
    }

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

        const session = sessionId ? sessions.get(sessionId) : undefined;
        if (!session) {
            res.status(400).json({ error: "会话不存在，请在工作区下新建对话" });
            return;
        }

        // 对话必须在工作区下创建：没有工作区就无法确定默认读写目录与授权范围
        let workspace: Workspace | null = null;
        try {
            workspace = await resolveSessionWorkspace(session);
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
            return;
        }

        if (!workspace) {
            res.status(400).json({
                error: "该对话未关联工作区，请在工作区下新建对话后再发送消息",
            });
            return;
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
        handler(message, session, getToolsForRoot(workspace.primaryDir), modelClient, sessionStore)
            .finally(() => {
                runningSessions.delete(session.id);
            })
            .catch((err) => {
                console.error("Agent loop error:", err);
                if (session.ws) {
                    sendJson(session.ws, {
                        type: "run_error",
                        step: 0,
                        stage: "model_generate" as const,
                        error: err instanceof Error ? err.message : String(err),
                    });
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
                charCount: countMessagesChars(memSession.messages),
                compressionThreshold: COMPRESSION_THRESHOLD,
                workspace: memSession.workspace,
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
                    charCount: countMessagesChars(data.messages),
                    compressionThreshold: COMPRESSION_THRESHOLD,
                    workspace: data.workspaceId
                        ? await workspaceStore.get(data.workspaceId)
                        : null,
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

    // REST API: 手动压缩指定会话的历史对话
    app.post("/api/session/:id/compress", async (req, res) => {
        const { id } = req.params;

        if (runningSessions.has(id)) {
            res.status(429).json({ error: "对话正在进行中，请结束后再压缩" });
            return;
        }

        try {
            // 内存中的消息比磁盘更新（运行中会实时写盘，但仍以内存为准）
            const memSession = sessions.get(id);
            const diskData = memSession ? null : await sessionStore.load(id);
            const messages = memSession?.messages ?? diskData?.messages;

            if (!messages) {
                res.status(404).json({ error: "Session not found" });
                return;
            }

            const before = countMessagesChars(messages);
            const compressed = await compressHistory(messages, modelClient);
            const after = countMessagesChars(compressed);

            const workspaceId = memSession?.workspace?.id ?? diskData?.workspaceId;
            await sessionStore.save(id, compressed, workspaceId);
            if (memSession) {
                memSession.messages = compressed;
                sendJson(memSession.ws, {
                    type: "session_stats",
                    sessionId: id,
                    charCount: after,
                    messageCount: compressed.length,
                    compressionThreshold: COMPRESSION_THRESHOLD,
                });
            }

            res.json({
                sessionId: id,
                charCountBefore: before,
                charCountAfter: after,
                messageCount: compressed.length,
                compressionThreshold: COMPRESSION_THRESHOLD,
            });
        } catch (err) {
            console.error(`[web] Failed to compress session ${id}:`, err);
            res.status(500).json({
                error: err instanceof Error ? err.message : String(err),
            });
        }
    });

    // REST API: 列出所有工作区
    app.get("/api/workspaces", async (_req, res) => {
        try {
            res.json({
                workspaces: await workspaceStore.list(),
                compressionThreshold: COMPRESSION_THRESHOLD,
            });
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });

    // REST API: 创建工作区（选择一个或多个目录，并指定其中一个为主目录）
    app.post("/api/workspaces", async (req, res) => {
        const { name, directories, primaryDir } = req.body as {
            name?: string;
            directories?: string[];
            primaryDir?: string;
        };

        if (!Array.isArray(directories) || directories.length === 0) {
            res.status(400).json({ error: "请至少选择一个目录" });
            return;
        }
        if (!primaryDir || typeof primaryDir !== "string") {
            res.status(400).json({ error: "请指定主目录" });
            return;
        }

        try {
            for (const dir of directories) {
                const stat = await fsp.stat(dir);
                if (!stat.isDirectory()) {
                    res.status(400).json({ error: `${dir} 不是目录` });
                    return;
                }
            }

            const workspace = await workspaceStore.create({
                name: typeof name === "string" ? name : "",
                directories,
                primaryDir,
            });
            res.json({ workspace });
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });

    // REST API: 删除工作区（连同其下的所有对话）
    app.delete("/api/workspace/:id", async (req, res) => {
        const { id } = req.params;
        try {
            const all = await sessionStore.listSessionsWithMeta();
            for (const meta of all) {
                if (meta.workspaceId !== id) continue;
                await sessionStore.delete(meta.sessionId);
                sessions.delete(meta.sessionId);
            }
            await workspaceStore.delete(id);
            res.json({ success: true });
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });

    // REST API: 在指定工作区下新建一个对话
    app.post("/api/workspace/:id/session", async (req, res) => {
        const { id } = req.params;
        try {
            const workspace = await workspaceStore.get(id);
            if (!workspace) {
                res.status(404).json({ error: "工作区不存在" });
                return;
            }

            const newSessionId = crypto.randomUUID();
            // 立即落盘，把「对话 → 工作区」的归属关系持久化，
            // 后续 WebSocket 恢复与 /api/chat 都据此解析主目录与授权范围。
            await sessionStore.createSession(newSessionId, workspace.id);
            res.json({ sessionId: newSessionId, workspace });
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
        }
    });

    /**
     * REST API: 浏览服务器本地目录，供前端创建工作区时选择目录。
     *
     * 浏览器的 <input type="file" webkitdirectory> 拿不到绝对路径，
     * 只能由服务端提供目录列表。默认从用户主目录开始。
     */
    app.get("/api/fs/dirs", async (req, res) => {
        const requested = typeof req.query.path === "string" ? req.query.path : "";
        const target = path.resolve(requested || os.homedir());

        try {
            const stat = await fsp.stat(target);
            if (!stat.isDirectory()) {
                res.status(400).json({ error: `${target} 不是目录` });
                return;
            }

            const names = await fsp.readdir(target);
            const entries: Array<{ name: string; path: string }> = [];
            for (const name of names.sort((a, b) => a.localeCompare(b, "zh-CN"))) {
                try {
                    const childStat = await fsp.stat(path.join(target, name));
                    if (childStat.isDirectory()) {
                        entries.push({ name, path: path.join(target, name) });
                    }
                } catch {
                    // 无权限或失效的软链接：跳过
                }
            }

            const parent = path.dirname(target);
            res.json({
                path: target,
                parent: parent === target ? null : parent,
                entries,
            });
        } catch (err) {
            res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
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

/**
 * 会话消息落盘 + 向前端推送最新的字符占用。
 *
 * 写盘是 fire-and-forget：Agent 循环每一步都会触发一次持久化，
 * 同步等待会显著拖慢循环，而丢失最后一次写入的代价可以接受。
 * session_stats 让前端的进度条在长任务执行过程中也能实时更新。
 */
function persistSession(
    session: ChatSession,
    sessionStore: SessionStore,
    messages: ChatMessage[],
): void {
    session.messages = messages;

    sessionStore.save(session.id, messages, session.workspace?.id).catch((err) => {
        console.error(`[web] Failed to persist session ${session.id}:`, err);
    });

    sendJson(session.ws, {
        type: "session_stats",
        sessionId: session.id,
        charCount: countMessagesChars(messages),
        messageCount: messages.length,
        compressionThreshold: COMPRESSION_THRESHOLD,
    });
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
    sendJson(session.ws, { type: "run_start", input: userInput });

    try {
        const result = await runLocalAgentLoop({
            userInput,
            modelClient,
            tools,
            eventBus,
            maxSteps: WEB_MAX_STEPS,
            previousMessages: session.messages,
            approvalMode: "always-allow",
            requestApproval: undefined,
            workspace: session.workspace
                ? {
                      name: session.workspace.name,
                      primaryDir: session.workspace.primaryDir,
                      directories: session.workspace.directories,
                  }
                : undefined,
            onMessagesUpdated: async (messages: ChatMessage[]) => {
                persistSession(session, sessionStore, messages);
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
    sendJson(session.ws, { type: "run_start", input: userInput });

    try {
        const result = await runDirectLLM({
            userInput,
            modelClient,
            eventBus,
            previousMessages: session.messages,
            onMessagesUpdated: async (messages: ChatMessage[]) => {
                persistSession(session, sessionStore, messages);
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
