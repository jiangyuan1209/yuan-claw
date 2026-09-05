import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentEvent } from "../types";

/**
 * useWebSocket — 管理与后端 WebSocket 服务的长连接。
 *
 * 通信架构说明：
 *   前端与后端通过 REST + WebSocket 混合模式通信。
 *   - 发送用户消息：通过 HTTP POST /api/chat（见 useChat.ts），服务端立即响应。
 *   - 接收实时事件：通过 WebSocket /ws，服务端在 Agent 循环运行过程中，
 *     将 model_raw、tool_start、tool_end、assistant、streaming_token 等事件
 *     以 JSON 格式逐条推送给前端。
 *
 * 本 Hook 职责：
 *   1. 建立并维护 WebSocket 长连接（自动重连）
 *   2. 接收服务端推送的 AgentEvent，回调给 onEvent 处理
 *   3. 连接建立后从 session_init 事件中提取 sessionId，用于后续 REST 请求关联会话
 */

type UseWebSocketOptions = {
    /** 收到服务端事件时的回调，由 useChat 注入处理逻辑 */
    onEvent: (event: AgentEvent) => void;
    /** 连接成功时的回调 */
    onConnected?: () => void;
    /** 连接断开时的回调 */
    onDisconnected?: () => void;
};

export function useWebSocket(options: UseWebSocketOptions) {
    const { onEvent, onConnected, onDisconnected } = options;
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    /** 服务端在连接建立时分配的会话 ID，用于 POST /api/chat 关联会话 */
    const [sessionId, setSessionId] = useState<string | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
        // 关闭已有连接，防止重复连接
        const existing = wsRef.current;
        if (existing) {
            existing.onclose = null; // 置空 onclose 避免触发重连循环
            existing.close();
            wsRef.current = null;
        }

        // 根据当前页面协议自动选择 ws:// 或 wss://
        const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnected(true);
            onConnected?.();
        };

        ws.onclose = () => {
            setConnected(false);
            wsRef.current = null;
            onDisconnected?.();
            // 断线后 2 秒自动重连
            reconnectTimerRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
            ws.close();
        };

        /**
         * 接收服务端推送的消息。
         * 服务端通过 WebSocket 广播 AgentEvent（JSON 格式），
         * 前端解析后分发给 onEvent 回调处理。
         * 首条消息为 session_init，携带本次连接的 sessionId。
         */
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as AgentEvent & { sessionId?: string };
                // session_init 是连接后服务端推送的第一条事件，提取 sessionId 保存
                if (data.type === "session_init" && data.sessionId) {
                    setSessionId(data.sessionId);
                }
                onEvent(data as AgentEvent);
            } catch {
                console.warn("Failed to parse WebSocket message:", event.data);
            }
        };
    }, [onEvent, onConnected, onDisconnected]);

    // 组件挂载时建立连接，卸载时清理
    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
            wsRef.current?.close();
        };
    }, [connect]);

    /** 向服务端发送消息（当前未使用，消息通过 REST POST 发送） */
    const send = useCallback((data: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    return { connected, sessionId, send, reconnect: connect };
}
