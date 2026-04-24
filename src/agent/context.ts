import { getRecentMessages } from "./session.js";
import { toolRegistry } from "../tools/registry.js";

export function buildSystemPrompt(): string {
    const tools = toolRegistry.listDefinitions();

    return [
        "You are a local computer task agent.",
        "Your job is to complete the user's task safely and accurately.",
        "",
        "Rules:",
        "1. You must return valid JSON only.",
        '2. If the task is complete, return: {"type":"final","message":"..."}',
        '3. If you need a tool, return: {"type":"tool_call","toolName":"...","args":{...}}',
        "4. Call at most one tool per turn.",
        "5. Do not pretend a tool was executed if it was not.",
        "6. Prefer observation or file-reading tools before guessing.",
        "",
        "Available tools:",
        JSON.stringify(tools, null, 2),
    ].join("\n");
}

export function buildModelMessages(sessionId: string) {
    const recent = getRecentMessages(sessionId, 12);

    return [
        {
            role: "system",
            content: buildSystemPrompt(),
        },
        ...recent.map((m) => ({
            role: m.role === "tool" ? "user" : m.role,
            content:
                m.role === "tool"
                    ? `Tool result (${m.toolName ?? "unknown"}):\n${m.content}`
                    : m.content,
        })),
    ];
}