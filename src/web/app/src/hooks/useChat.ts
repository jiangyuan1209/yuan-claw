import { useState, useCallback, useRef } from "react";
import { message as antdMessage } from "antd";
import type { AgentEvent, ChatMessage, ChatMode, DebugEvent, ToolEvent } from "../types";
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
 *
 * 本 Hook 职责：
 *   1. 管理消息列表（messages）、处理状态（isProcessing）、流式状态（isStreaming）
 *   2. 管理聊天模式（agent/direct）和 Debug 模式
 *   3. 通过 useWebSocket 接收服务端事件，按事件类型更新 UI 状态
 *   4. 通过 REST POST 发送用户消息
 */

export function useChat() {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isStreaming, setIsStreaming] = useState(false);
    const [currentAssistantMsg, setCurrentAssistantMsg] = useState<ChatMessage | null>(null);
    const [mode, setMode] = useState<ChatMode>("agent");
    const [debug, setDebug] = useState(false);
    const currentToolEvents = useRef<Map<string, ToolEvent>>(new Map());
    const currentDebugEvents = useRef<DebugEvent[]>([]);
    const sessionIdRef = useRef<string | null>(null);
    const modeRef = useRef<ChatMode>("agent");

    // 用 ref 保存 mode 的最新值，确保在 sendMessage 的闭包中能读到最新模式
    const updateMode = useCallback((newMode: ChatMode) => {
        setMode(newMode);
        modeRef.current = newMode;
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

    const { connected, sessionId, reconnect } = useWebSocket({
        onEvent: handleEvent,
        onConnected: handleConnected,
        onDisconnected: handleDisconnected,
    });

    /**
     * 发送用户消息。
     *
     * 通信流程：
     *   1. 将用户消息添加到消息列表（前端立即显示）
     *   2. 通过 HTTP POST /api/chat 发送到后端，请求体携带 message、sessionId 和 mode
     *   3. 后端收到后立即返回 { sessionId }，然后在异步启动 Agent 循环
     *   4. Agent 循环运行过程中产生的事件通过 WebSocket 推送回来，由 handleEvent 处理
     *
     * 注意：消息通过 REST 发送，事件通过 WebSocket 接收，两者是分离的。
     */
    const sendMessage = useCallback(
        (content: string) => {
            if (!content.trim() || isProcessing) return;

            // 先在 UI 上显示用户消息
            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: "user",
                content: content.trim(),
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, userMsg]);

            // 通过 REST POST 发送到后端。
            // 服务端收到后立即响应（不等待 Agent 循环完成），
            // Agent 循环在后台异步运行，事件通过 WebSocket 推送。
            fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content.trim(),
                    sessionId: sessionIdRef.current, // 关联 WebSocket 会话
                    mode: modeRef.current,            // "agent" 或 "direct"
                }),
            }).catch((err) => {
                antdMessage.error(`发送失败: ${err.message}`);
                setIsProcessing(false);
            });
        },
        [isProcessing],
    );

    const clearMessages = useCallback(() => {
        setMessages([]);
        setCurrentAssistantMsg(null);
        currentToolEvents.current.clear();
        currentDebugEvents.current = [];
    }, []);

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
        sendMessage,
        clearMessages,
        reconnect,
    };
}
