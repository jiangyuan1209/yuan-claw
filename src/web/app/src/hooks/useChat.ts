import { useState, useCallback, useRef } from "react";
import { message as antdMessage } from "antd";
import type { AgentEvent, ChatMessage, ChatMode, DebugEvent, ToolEvent } from "../types";
import { useWebSocket } from "./useWebSocket";

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

    // Keep modeRef in sync with mode state
    const updateMode = useCallback((newMode: ChatMode) => {
        setMode(newMode);
        modeRef.current = newMode;
    }, []);

    const handleEvent = useCallback((event: AgentEvent) => {
        switch (event.type) {
            case "session_init":
                sessionIdRef.current = event.sessionId;
                break;

            case "run_start":
                setIsProcessing(true);
                currentToolEvents.current.clear();
                currentDebugEvents.current = [];
                // Create a placeholder assistant message
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

            case "streaming_token": {
                if (event.done) {
                    setIsStreaming(false);
                    break;
                }
                setIsStreaming(true);
                // Append token to the current assistant message content
                setCurrentAssistantMsg((prev) => {
                    if (!prev) return prev;
                    return {
                        ...prev,
                        content: prev.content + event.text,
                    };
                });
                break;
            }

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
                    return null;
                });
                break;

            case "run_end":
                setIsProcessing(false);
                setIsStreaming(false);
                break;

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

    const sendMessage = useCallback(
        (content: string) => {
            if (!content.trim() || isProcessing) return;

            const userMsg: ChatMessage = {
                id: `user-${Date.now()}`,
                role: "user",
                content: content.trim(),
                timestamp: Date.now(),
            };
            setMessages((prev) => [...prev, userMsg]);

            // Send via HTTP POST (agent loop runs async, events come via WS)
            fetch("/api/chat", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    message: content.trim(),
                    sessionId: sessionIdRef.current,
                    mode: modeRef.current,
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
