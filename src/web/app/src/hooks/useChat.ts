import { useState, useCallback, useRef } from "react";
import { message as antdMessage } from "antd";
import type {
    AgentEvent,
    ChatMessage,
    ChatMode,
    DebugEvent,
    ImageAttachment,
    ToolEvent,
    Workspace,
} from "../types";
import { useWebSocket } from "./useWebSocket";

/**
 * useChat — 前端聊天核心 Hook，负责与后端 Agent 的完整通信流程。
 *
 * ===== 前后端通信架构 =====
 *
 * 前端与后端采用 REST + WebSocket 混合通信模式：
 *
 *   [前端 UI]                                  [Express 后端]
 *       |                                            |
 *       |  (1) POST /api/chat                        |
 *       |  { message, sessionId, mode }              |
 *       | -----------------------------------------> |
 *       |                                            |  (2) 立即响应 { sessionId }
 *       | <----------------------------------------- |
 *       |                                            |
 *       |               (3) 服务端启动 Agent 循环      |
 *       |                  (runLocalAgentLoop 或 runDirectLLM)
 *       |                                            |
 *       |  (4) WebSocket 推送 AgentEvent             |
 *       |  (run_start -> model_raw/tool_*            |
 *       |   streaming_token -> assistant -> run_end) |
 *       | <- - - - - - - - - - - - - - - - - - - - -|
 *       |                                            |
 *   (5) 前端根据事件类型更新 React 状态
 *       实现打字机效果、工具状态标签等
 *
 * 关键设计：
 *   - 发消息用 REST（简单可靠，立即返回），收事件用 WebSocket（实时推送，长连接）
 *   - Agent 循环在服务端异步运行，不阻塞 REST 响应
 *   - 同一个 sessionId 同时只允许一个 Agent 循环运行（防重复提交）
 *   - 对话必须在工作区下创建：切换/新建会话都由工作区驱动，
 *     服务端据会话所属工作区决定默认读写目录与授权范围
 *
 * 本 Hook 职责：
 *   1. 管理消息列表（messages）、处理状态（isProcessing）、流式状态（isStreaming）
 *   2. 管理聊天模式（agent/direct）和 Debug 模式
 *   3. 管理当前会话所属的工作区，以及历史字符占用（进度条 + 手动压缩）
 *   4. 通过 useWebSocket 接收服务端事件，按事件类型更新 UI 状态
 *   5. 通过 REST POST 发送用户消息
 */

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentAssistantMsg, setCurrentAssistantMsg] = useState<ChatMessage | null>(null);
    const [mode, setMode] = useState<ChatMode>("agent");
    const [debug, setDebug] = useState(false);

    /** 当前会话所属的工作区；为 null 表示还没在工作区下创建对话 */
    const [currentWorkspace, setCurrentWorkspace] = useState<Workspace | null>(null);
    /** 当前会话历史占用的字符数，用于进度条 */
    const [historyChars, setHistoryChars] = useState(0);
    /** 自动压缩阈值，由服务端下发，避免前后端各写一份常量 */
    const [compressionThreshold, setCompressionThreshold] = useState(1_000_000);
    const [isCompressing, setIsCompressing] = useState(false);

    const currentToolEvents = useRef<Map<string, ToolEvent>>(new Map());
    const currentDebugEvents = useRef<DebugEvent[]>([]);
    const sessionIdRef = useRef<string | null>(null);
    const modeRef = useRef<ChatMode>("agent");

    // 用 ref 保存 mode 的最新值，确保在 sendMessage 的闭包中能读到最新模式
    const updateMode = useCallback((newMode: ChatMode) => {
        setMode(newMode);
        modeRef.current = newMode;
    }, []);

    /** 清空当前会话的 UI 状态（切换会话 / 新建会话时调用） */
    const resetConversationUi = useCallback(() => {
        setMessages([]);
        setCurrentAssistantMsg(null);
        setIsProcessing(false);
        setIsStreaming(false);
        currentToolEvents.current.clear();
        currentDebugEvents.current = [];
    }, []);

    /**
     * 处理服务端通过 WebSocket 推送的各类 AgentEvent。
     * 每种事件类型对应 Agent 循环中的一个阶段，前端据此更新 UI 状态。
     */
    const handleEvent = useCallback((event: AgentEvent) => {
        switch (event.type) {
            // WebSocket 连接建立时服务端推送，保存 sessionId 用于后续 REST 请求
            case "session_init":
                sessionIdRef.current = event.sessionId;
                break;

            // 会话已就绪：加载历史消息、所属工作区与字符占用
            case "session_restored": {
                const restoredId = event.sessionId;
                setCompressionThreshold(event.compressionThreshold);
                setCurrentWorkspace(event.workspace);

                fetch(`/api/session/${restoredId}`)
                    .then((res) => (res.ok ? res.json() : null))
                    .then((data) => {
                        if (!data || !Array.isArray(data.messages)) return;

                        const restoredMessages: ChatMessage[] = data.messages.map(
                            (m: { role: string; content: string }, i: number) => ({
                                id: `restored-${i}-${Date.now()}`,
                                role: m.role as "user" | "assistant",
                                content: typeof m.content === "string" ? m.content : "",
                                timestamp: Date.now() - (data.messages.length - i) * 1000,
                            }),
                        );
                        setMessages(restoredMessages);
                        setHistoryChars(data.charCount ?? event.charCount);
                        if (restoredMessages.length > 0) {
                            antdMessage.success(`已恢复 ${restoredMessages.length} 条历史消息`);
                        }
                    })
                    .catch((err) => {
                        console.error("Failed to restore session:", err);
                    });
                break;
            }

            // 历史字符占用变化：更新进度条（只接受当前会话的推送）
            case "session_stats":
                if (event.sessionId === sessionIdRef.current) {
                    setHistoryChars(event.charCount);
                    setCompressionThreshold(event.compressionThreshold);
                }
                break;

            // Agent 循环开始：标记正在处理，创建空的助手消息占位符，后续事件会逐步填充它
            case "run_start":
                setIsProcessing(true);
                currentToolEvents.current.clear();
                currentDebugEvents.current = [];
                const assistantMsg: ChatMessage = {
                    id: `assistant-${Date.now()}`,
                    role: "assistant",
                    content: "",
                    timestamp: Date.now(),
                    toolEvents: [],
                    debugEvents: [],
                };
                setCurrentAssistantMsg(assistantMsg);
                break;

            // 模型原始输出：Agent 模式下每步 LLM 返回的完整 JSON，收集到 debugEvents 供 Debug 面板展示
            case "model_raw": {
                const debugEvent: DebugEvent = {
                    step: event.step,
                    text: event.text,
                };
                currentDebugEvents.current = [...currentDebugEvents.current, debugEvent];
                setCurrentAssistantMsg((prev) =>
                    prev
                        ? { ...prev, debugEvents: currentDebugEvents.current }
                        : prev,
                );
                break;
            }

            // 流式 token（直连模式）：模型每次返回的文本片段，累加到当前消息内容实现打字机效果
            case "streaming_token": {
                if (event.done) {
                    // done=true 表示流式输出结束
                    setIsStreaming(false);
                    break;
                }
                setIsStreaming(true);
                // 将文本片段追加到当前助手消息的 content
                setCurrentAssistantMsg((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        content: prev.content + event.text,
                    };
                });
                break;
            }

            // 工具开始执行：记录工具名和参数，状态设为 running
            case "tool_start": {
                const toolEvent: ToolEvent = {
                    toolName: event.toolName,
                    status: "running",
                    args: event.args,
                };
                currentToolEvents.current.set(event.toolName + event.step, toolEvent);
                setCurrentAssistantMsg((prev) =>
                    prev
                        ? {
                              ...prev,
                              toolEvents: Array.from(currentToolEvents.current.values()),
                          }
                        : prev,
                );
                break;
            }

            // 工具执行完成：更新状态为 success/error，记录返回值
            case "tool_end": {
                const key = event.toolName + event.step;
                const existing = currentToolEvents.current.get(key);
                const toolEvent: ToolEvent = {
                    toolName: event.toolName,
                    status: event.success ? "success" : "error",
                    args: existing?.args,
                    result: event.result,
                    error: event.success ? undefined : String(event.result),
                };
                currentToolEvents.current.set(key, toolEvent);
                setCurrentAssistantMsg((prev) =>
                    prev
                        ? {
                              ...prev,
                              toolEvents: Array.from(currentToolEvents.current.values()),
                          }
                        : prev,
                );
                break;
            }

            // 工具执行出错：记录错误信息
            case "tool_error": {
                const key = event.toolName + event.step;
                const existing = currentToolEvents.current.get(key);
                const toolEvent: ToolEvent = {
                    toolName: event.toolName,
                    status: "error",
                    args: existing?.args,
                    error: event.error,
                };
                currentToolEvents.current.set(key, toolEvent);
                setCurrentAssistantMsg((prev) =>
                    prev
                        ? {
                              ...prev,
                              toolEvents: Array.from(currentToolEvents.current.values()),
                          }
                        : prev,
                );
                break;
            }

            // Agent 最终回复：将占位消息固化到消息列表中，清空占位
            case "assistant":
                setCurrentAssistantMsg((prev) => {
                    const msg: ChatMessage = {
                        id: `assistant-${Date.now()}`,
                        role: "assistant",
                        content: event.message,
                        timestamp: Date.now(),
                        toolEvents: prev?.toolEvents ?? [],
                        debugEvents: prev?.debugEvents ?? [],
                    };
                    setMessages((prevMsgs) => [...prevMsgs, msg]);
                    return null; // 清空占位消息
                });
                break;

            // Agent 循环正常结束：重置处理和流式状态
            case "run_end":
                setIsProcessing(false);
                setIsStreaming(false);
                break;

            // Agent 循环出错：重置状态并弹出错误提示
            case "run_error":
                setIsProcessing(false);
                setIsStreaming(false);
                antdMessage.error(`处理出错: ${event.error}`);
                break;
        }
    }, []);

    const handleConnected = useCallback(() => {
        antdMessage.success("已连接到服务器");
    }, []);

    const handleDisconnected = useCallback(() => {
        antdMessage.warning("连接已断开，正在重连...");
    }, []);

    const { connected, sessionId, reconnect, clearSession } = useWebSocket({
        onEvent: handleEvent,
        onConnected: handleConnected,
        onDisconnected: handleDisconnected,
    });

    /**
     * 发送用户消息。
     *
     * 如果有图片附件，先调用 /api/ocr 进行文字识别，
     * 再将识别结果作为附件文字追加到用户文字后面，一起发送到 /api/chat。
     */
    const sendMessage = useCallback(
        async (content: string, images?: ImageAttachment[]) => {
            if (!content.trim() || isProcessing) return;

            if (!sessionIdRef.current) {
                antdMessage.warning("请先在工作区下新建一个对话");
                return;
            }

            let attachmentText = "";
            let imagePreviews: string[] | undefined;

            // 如果有图片，先进行 OCR 识别
            if (images && images.length > 0) {
                setIsProcessing(true);
                imagePreviews = images.map((img) => img.dataUrl);

                try {
                    const ocrRes = await fetch("/api/ocr", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                            images: images.map((img) => img.base64),
                        }),
                    });

                    if (!ocrRes.ok) {
                        const err = await ocrRes.json().catch(() => ({ error: "OCR 请求失败" }));
                        throw new Error(err.error || "OCR 请求失败");
                    }

                    const { text } = (await ocrRes.json()) as { text: string };
                    if (text && text.trim()) {
                        attachmentText = text.trim();
                    } else {
                        antdMessage.warning("图片未识别到文字");
                    }
                } catch (err) {
                    antdMessage.error(`图片识别失败: ${err instanceof Error ? err.message : "未知错误"}`);
                    setIsProcessing(false);
                    return;
                }
            }

            // 组合用户文字 + OCR 附件文字
            let fullMessage = content.trim();
            if (attachmentText) {
                fullMessage += `\n\n---\n[附件: ${images!.length} 张图片的识别文字]\n\n${attachmentText}`;
            }

            // 先在 UI 上显示用户消息（展示原始文字 + 附件信息）
            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: "user",
                content: content.trim(),
                timestamp: Date.now(),
                attachmentText: attachmentText || undefined,
                imagePreviews,
            };
            setMessages((prev) => [...prev, userMsg]);

            // 通过 REST POST 发送到后端
            try {
                const res = await fetch("/api/chat", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        message: fullMessage,
                        sessionId: sessionIdRef.current,
                        mode: modeRef.current,
                    }),
                });

                if (!res.ok) {
                    const err = await res.json().catch(() => ({ error: "发送失败" }));
                    throw new Error(err.error || `发送失败 (${res.status})`);
                }
            } catch (err) {
                antdMessage.error(`发送失败: ${err instanceof Error ? err.message : "未知错误"}`);
                setIsProcessing(false);
            }
        },
        [isProcessing],
    );

    /** 清空当前对话（保留会话与工作区归属，仅清屏） */
    const clearMessages = useCallback(() => {
        resetConversationUi();
        setHistoryChars(0);
        clearSession();
    }, [clearSession, resetConversationUi]);

    /** 切换到指定历史会话，具体内容由服务端推送的 session_restored 填充 */
    const switchSession = useCallback(
        (targetSessionId: string) => {
            resetConversationUi();
            setHistoryChars(0);
            reconnect(targetSessionId);
        },
        [reconnect, resetConversationUi],
    );

    /**
     * 在指定工作区下新建对话。
     *
     * 服务端会立即落盘一条空会话记录（含 workspaceId），
     * 之后重连 WebSocket 时就能解析出该对话所属的工作区。
     */
    const newSessionInWorkspace = useCallback(
        async (workspaceId: string) => {
            try {
                const res = await fetch(`/api/workspace/${workspaceId}/session`, {
                    method: "POST",
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "新建对话失败");
                }

                resetConversationUi();
                setHistoryChars(0);
                setCurrentWorkspace(data.workspace as Workspace);
                sessionIdRef.current = data.sessionId as string;
                reconnect(data.sessionId as string);
            } catch (err) {
                antdMessage.error(`新建对话失败: ${err instanceof Error ? err.message : "未知错误"}`);
            }
        },
        [reconnect, resetConversationUi],
    );

    /**
     * 手动压缩当前会话的历史对话。
     *
     * 后端把较早的消息交给 LLM 压成结构化摘要、只保留最近若干条原文，
     * 压缩后的结果会直接覆盖磁盘上的会话记录，UI 展示的对话内容不变。
     */
    const compressCurrentSession = useCallback(async () => {
        const targetSessionId = sessionIdRef.current;
        if (!targetSessionId) {
            antdMessage.warning("当前没有可压缩的对话");
            return;
        }
        if (isProcessing) {
            antdMessage.warning("对话正在进行中，请结束后再压缩");
            return;
        }

        setIsCompressing(true);
        try {
            const res = await fetch(`/api/session/${targetSessionId}/compress`, {
                method: "POST",
            });
            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.error || "压缩失败");
            }

            setHistoryChars(data.charCountAfter as number);
            setCompressionThreshold(data.compressionThreshold as number);
            antdMessage.success(
                `已压缩：${data.charCountBefore} → ${data.charCountAfter} 字符`,
            );
        } catch (err) {
            antdMessage.error(`压缩失败: ${err instanceof Error ? err.message : "未知错误"}`);
        } finally {
            setIsCompressing(false);
        }
    }, [isProcessing]);

    return {
        messages,
        isProcessing,
        isStreaming,
        currentAssistantMsg,
        connected,
        sessionId,
        mode,
        setMode: updateMode,
        debug,
        setDebug,
        currentWorkspace,
        historyChars,
        compressionThreshold,
        isCompressing,
        compressCurrentSession,
        sendMessage,
        clearMessages,
        switchSession,
        newSessionInWorkspace,
        reconnect,
    };
}
