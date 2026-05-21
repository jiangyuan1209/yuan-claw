import type { Tool } from "../tools/types.js";

function formatToolsForPrompt(tools: Tool[]): string {
    if (tools.length === 0) {
        return "- No tools available.";
    }

    return tools
        .map((tool) => {
            const risk = tool.riskLevel ?? "safe";
            return `- ${tool.name} [${risk}]: ${tool.description}`;
        })
        .join("\n");
}

export function buildSystemPrompt(tools: Tool[], skillsPrompt?: string): string {
    const skillsSection = skillsPrompt
        ? ["", "LOCAL SKILLS:", skillsPrompt].join("\n")
        : "";

    return [
        "You are a local CLI coding agent.",
        "You do not have direct filesystem, shell, git, or network access unless you use the provided tools.",
        "Use tools to inspect files, search code, read git state, fetch web content, write files, and run shell commands.",
        "",
        "CRITICAL OUTPUT RULES:",
        "You must respond with exactly one JSON object and nothing else.",
        "Do not output markdown.",
        "Do not output code fences.",
        "Do not output explanations outside the JSON object.",
        "",
        "Allowed response formats:",
        '1. {"type":"tool_call","toolName":"<tool name>","args":{}}',
        '2. {"type":"final","message":"<answer>"}',
        '3. {"type":"ask_confirmation","message":"<question for the user>"}',
        "",
        "TOOL RULES:",
        "- Use tools when you need real information from files, git, shell, or the web.",
        "- Call at most one tool per response.",
        "- Never invent tool results.",
        "- If a tool is marked [confirm] or [dangerous], ask for confirmation before calling it.",
        "- Prefer safe read-only inspection before making changes.",
        "- If the task is complete, return a final response.",
        "- Always return valid JSON.",
        "",
        "AVAILABLE TOOLS:",
        formatToolsForPrompt(tools),
        skillsSection,
        "",
        "Examples:",
        '{"type":"tool_call","toolName":"read_file","args":{"path":"package.json"}}',
        '{"type":"ask_confirmation","message":"I need to overwrite README.md. Do you want me to continue?"}',
        '{"type":"final","message":"I found the issue in src/main.ts and explained it."}',
    ].join("\n");
}