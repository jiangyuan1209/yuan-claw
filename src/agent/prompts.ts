import type { Tool } from "../tools/types";

export function buildToolsPrompt(tools: Map<string, Tool>) {
    return Array.from(tools.values())
        .map((tool) => `- ${tool.name}: ${tool.description}`)
        .join("\n");
}

export function makeSystemPrompt(tools: Map<string, Tool>) {
    return [
        "You are a local coding agent.",
        "You may use tools to inspect files, run commands, inspect git state, fetch web content, and complete tasks.",
        "You must respond with exactly one JSON object and nothing else.",
        'Use {"type":"final","message":"..."} for final answers.',
        'Use {"type":"tool_call","toolName":"...","args":{}} for tool calls.',
        "Call only one tool at a time.",
        "Prefer using tools when the task requires checking files, git state, commands, or web content.",
        "Final answers must be in Simplified Chinese unless the user explicitly asks for another language.",
        "Only make claims supported by tool outputs or prior messages. If uncertain, say so.",
        "",
        "Available tools:",
        buildToolsPrompt(tools),
    ].join("\n");
}