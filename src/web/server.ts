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
import { createModelClient } from "../model/client.js";
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

    // In-memory session storage for web
    const sessions = new Map<string, ChatSession>();

    // Track sessions currently running an agent loop to prevent duplicates
    const runningSessions = new Set<string>();

    // WebSocket server for real-time events
    const server = app.listen(process.env.PORT ?? DEFAULT_PORT, () => {
        const port = (server.address() as import("net").AddressInfo).port;
        console.log(`Yuan Claw Web server running at http://localhost:${port}`);
        console.log(`WebSocket endpoint: ws://localhost:${port}/ws`);
    });

    const wss = new WebSocketServer({ server, path: "/ws" });

    wss.on("connection", (ws) => {
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

    // REST API: send a chat message
    app.post("/api/chat", async (req, res) => {
        const { message, sessionId } = req.body as {
            message: string;
            sessionId?: string;
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

        // Run agent loop asynchronously (response already sent)
        runningSessions.add(session.id);
        runAgentLoop(message, session, tools, modelClient)
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

main().catch((error) => {
    console.error("Failed to start web server:", error);
    process.exit(1);
});
