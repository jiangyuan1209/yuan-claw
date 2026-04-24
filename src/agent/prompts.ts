import type { Tool } from "../tools/types.js";

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
        "If you need repository status, use git_status.",
        "If you need concrete code changes, use git_diff.",
        "If you need file contents, use read_file.",
        "Do not infer exact filenames, renames, code edits, or configuration details unless they appear in tool output or prior messages.",
        "When tool output is incomplete or truncated, explicitly say the information may be incomplete.",
        "Distinguish observed facts from tentative inferences.",
        "Only make claims supported by tool outputs or prior messages.",
        "Final answers must be in Simplified Chinese unless the user explicitly asks for another language.",
        "",
        "Available tools:",
        buildToolsPrompt(tools),
    ].join("\n");
}