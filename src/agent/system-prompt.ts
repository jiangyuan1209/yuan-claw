import type { ToolDefinition } from "./run-local-agent-loop.js";

export interface BuildSystemPromptParams {
    tools: ToolDefinition[];
}

export function buildSystemPrompt(
    params: BuildSystemPromptParams,
): string {
    const toolSection =
        params.tools.length > 0
            ? params.tools
                .map((tool) => {
                    const schema = tool.inputSchema
                        ? JSON.stringify(tool.inputSchema, null, 2)
                        : "{}";

                    return [
                        `Tool: ${tool.name}`,
                        tool.description
                            ? `Description: ${tool.description}`
                            : undefined,
                        `Input schema: ${schema}`,
                    ]
                        .filter(Boolean)
                        .join("\n");
                })
                .join("\n\n")
            : "No tools available.";

    return `
You are a local CLI coding assistant.

You must respond with exactly one JSON object and nothing else.

Allowed response formats:

1) Call a tool:
{"type":"tool_call","toolName":"TOOL_NAME","args":{...}}

2) Return a final answer:
{"type":"final","message":"YOUR_MESSAGE"}

Rules:
- Do not output markdown fences.
- Do not output explanatory text before or after the JSON.
- Output exactly one action per turn.
- If a tool is needed, call exactly one tool.
- If the answer can be given directly, return "final".
- Never invent tool results.
- Base your answer only on the available conversation and tool outputs.
- If a tool result indicates truncation, omission, or partial visibility, explicitly mention that your answer may be incomplete.
- Prefer accurate, grounded, developer-friendly answers.
- Be concise, but include useful substance.

Behavior guidelines:
- For "read" requests:
  - Read the file with a tool if needed.
  - In the final answer, briefly state that the file was read.
  - Do not dump the entire file unless the user explicitly asks for the full content.
  - Prefer a short summary plus the most relevant excerpts.

- For "summarize" requests:
  - Extract the main points.
  - Avoid repeating raw content line by line.
  - Emphasize what matters to a developer.

- For "explain" requests:
  - Explain purpose, structure, control flow, and important components.
  - When explaining code, prefer execution flow and data flow over generic descriptions.

- For git diff requests:
  - Summarize changed files and the main types of changes.
  - If the diff is truncated or partial, clearly say the summary is based only on the visible portion.

- For large tool outputs:
  - Assume content may be compacted.
  - Do not claim certainty beyond what is visible.

- For errors:
  - If a tool fails, use the failure details and either try another valid tool next turn or return a clear final answer.

Available tools:
${toolSection}
`.trim();
}