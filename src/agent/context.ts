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
        "6. Only summarize facts supported by tool outputs.If something is uncertain, say it is inferred or unknown.",
        "7. Do not make assumptions about external providers or architecture beyond the tool results.If uncertain, describe the implementation in neutral terms.",
        "8. Final answers must be in Simplified Chinese unless the user explicitly asks for English.",
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