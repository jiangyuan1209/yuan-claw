import { useEffect, useRef, useState, useCallback } from "react";
import type { AgentEvent } from "../types";

type UseWebSocketOptions = {
    onEvent: (event: AgentEvent) => void;
    onConnected?: () => void;
    onDisconnected?: () => void;
};

export function useWebSocket(options: UseWebSocketOptions) {
    const { onEvent, onConnected, onDisconnected } = options;
    const wsRef = useRef<WebSocket | null>(null);
    const [connected, setConnected] = useState(false);
    const [sessionId, setSessionId] = useState<string | null>(null);
    const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const connect = useCallback(() => {
        // Close any existing connection before creating a new one
        const existing = wsRef.current;
        if (existing) {
            existing.onclose = null; // prevent reconnection loop
            existing.close();
            wsRef.current = null;
        }

        // Determine WebSocket URL

        // Determine WebSocket URL
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
            // Auto-reconnect after 2 seconds
            reconnectTimerRef.current = setTimeout(connect, 2000);
        };

        ws.onerror = () => {
            ws.close();
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data) as AgentEvent & { sessionId?: string };
                if (data.type === "session_init" && data.sessionId) {
                    setSessionId(data.sessionId);
                }
                onEvent(data as AgentEvent);
            } catch {
                console.warn("Failed to parse WebSocket message:", event.data);
            }
        };
    }, [onEvent, onConnected, onDisconnected]);

    useEffect(() => {
        connect();
        return () => {
            if (reconnectTimerRef.current) {
                clearTimeout(reconnectTimerRef.current);
            }
            wsRef.current?.close();
        };
    }, [connect]);

    const send = useCallback((data: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    return { connected, sessionId, send, reconnect: connect };
}
