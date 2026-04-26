import type { AgentResponse } from "./protocol.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseAgentResponse(raw: string): AgentResponse {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        throw new Error("Agent response is not valid JSON.");
    }

    if (!isPlainObject(parsed)) {
        throw new Error("Agent response must be a JSON object.");
    }

    const type = parsed.type;

    if (type === "tool_call") {
        if (typeof parsed.toolName !== "string" || parsed.toolName.trim() === "") {
            throw new Error('tool_call response must include a non-empty string field "toolName".');
        }

        if (!isPlainObject(parsed.args)) {
            throw new Error('tool_call response must include an object field "args".');
        }

        return {
            type: "tool_call",
            toolName: parsed.toolName,
            args: parsed.args,
        };
    }

    if (type === "final") {
        if (typeof parsed.message !== "string") {
            throw new Error('final response must include a string field "message".');
        }

        return {
            type: "final",
            message: parsed.message,
        };
    }

    if (type === "ask_confirmation") {
        if (typeof parsed.message !== "string" || parsed.message.trim() === "") {
            throw new Error('ask_confirmation response must include a non-empty string field "message".');
        }

        return {
            type: "ask_confirmation",
            message: parsed.message,
        };
    }

    throw new Error(`Unsupported agent response type: ${String(type)}`);
}