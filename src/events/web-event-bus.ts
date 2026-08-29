import type { AgentEvent, EventBus } from "./event-bus.js";
import { WebSocket } from "ws";
import type { WebSocket as WSWebSocket } from "ws";

/**
 * Create a WebSocket-backed EventBus that broadcasts events to connected clients.
 * The `ws` parameter is a single WebSocket for one client connection.
 * For broadcast to multiple clients, use `createWebEventBusBroadcast()`.
 */
export function createWebEventBus(ws: WSWebSocket): EventBus {
    function sendEvent(event: AgentEvent) {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(event));
        }
    }

    return {
        emit(event: AgentEvent) {
            sendEvent(event);
        },

        showProcessing() {
            // No-op in web mode — the frontend shows its own loading state
        },

        hideProcessing() {
            // No-op in web mode
        },
    };
}

/**
 * Create a broadcast EventBus that sends events to multiple WebSocket clients.
 */
export function createWebEventBusBroadcast(
    clients: Set<WSWebSocket>,
): EventBus {
    function broadcast(event: AgentEvent) {
        const data = JSON.stringify(event);
        for (const ws of clients) {
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(data);
            }
        }
    }

    return {
        emit(event: AgentEvent) {
            broadcast(event);
        },

        showProcessing() {
            // No-op in web mode
        },

        hideProcessing() {
            // No-op in web mode
        },
    };
}
