import crypto from "node:crypto";
import type { AgentMessage, AgentRun, AgentSession } from "../core/types.js";

const sessions = new Map<string, AgentSession>();
const runs = new Map<string, AgentRun>();
const messages = new Map<string, AgentMessage[]>();

export function getOrCreateSession(sessionId: string): AgentSession {
    const existing = sessions.get(sessionId);
    if (existing) {
        existing.updatedAt = Date.now();
        return existing;
    }

    const session: AgentSession = {
        sessionId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        cwd: process.cwd(),
    };

    sessions.set(sessionId, session);
    messages.set(sessionId, []);
    return session;
}

export function createRun(sessionId: string, userInput: string): AgentRun {
    const run: AgentRun = {
        runId: crypto.randomUUID(),
        sessionId,
        userInput,
        status: "queued",
        createdAt: Date.now(),
    };
    runs.set(run.runId, run);
    return run;
}

export function updateRun(
    runId: string,
    patch: Partial<AgentRun>
): AgentRun | undefined {
    const run = runs.get(runId);
    if (!run) return;
    Object.assign(run, patch);
    return run;
}

export function getRun(runId: string): AgentRun | undefined {
    return runs.get(runId);
}

export function appendMessage(
    msg: Omit<AgentMessage, "id" | "createdAt">
): AgentMessage {
    const full: AgentMessage = {
        ...msg,
        id: crypto.randomUUID(),
        createdAt: Date.now(),
    };

    const list = messages.get(msg.sessionId) ?? [];
    list.push(full);
    messages.set(msg.sessionId, list);
    return full;
}

export function getRecentMessages(
    sessionId: string,
    limit = 12
): AgentMessage[] {
    const list = messages.get(sessionId) ?? [];
    return list.slice(-limit);
}