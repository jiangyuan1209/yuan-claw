import { z } from "zod";

type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
};

type ToolResult =
    | { success: true; output: unknown }
    | { success: false; error: string };

type Tool = {
    name: string;
    description: string;
    inputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

type EventBus = {
    emit: (event: Record<string, unknown>) => void;
};

type RunLocalAgentLoopParams = {
    userInput: string;
    modelClient: ModelClient;
    tools: Map<string, Tool>;
    eventBus: EventBus;
    maxSteps?: number;
};

const FinalSchema = z.object({
    type: z.literal("final"),
    message: z.string(),
});

const ToolCallSchema = z.object({
    type: z.literal("tool_call"),
    toolName: z.string().min(1),
    args: z.record(z.any()).default({}),
});

const AgentResponseSchema = z.union([FinalSchema, ToolCallSchema]);

function normalizeAgentOutput(raw: any) {
    if (raw?.type === "tool_call") {
        return {
            type: "tool_call" as const,
            toolName: raw.toolName ?? raw.tool ?? raw.name ?? "",
            args: raw.args ?? raw.input ?? {},
        };
    }

    if (raw?.type === "final") {
        return {
            type: "final" as const,
            message: raw.message ?? raw.text ?? raw.content ?? "",
        };
    }

    return raw;
}

function safeJsonParse(text: string): unknown {
    const trimmed = text.trim();

    // 去掉 ```json ... ``` 包裹
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
    if (fenced) {
        return JSON.parse(fenced[1]);
    }

    return JSON.parse(trimmed);
}

function buildToolsPrompt(tools: Map<string, Tool>) {
    const lines: string[] = [];

    for (const tool of tools.values()) {
        lines.push(`- ${tool.name}: ${tool.description}`);
    }

    return lines.join("\n");
}

function makeSystemPrompt(tools: Map<string, Tool>) {
    return [
        "You are a local coding agent.",
        "You can either return a final answer or request exactly one tool call.",
        "",
        "You must respond with exactly one JSON object and nothing else.",
        "Do not include markdown fences.",
        "Do not include explanations outside JSON.",
        "",
        "Allowed JSON formats:",
        '{"type":"final","message":"your final response"}',
        '{"type":"tool_call","toolName":"read_file","args":{"path":"package.json"}}',
        "",
        'Rules:',
        '1. If the task needs file reading/writing or shell execution, use a tool.',
        '2. Call only one tool at a time.',
        '3. Use the field name "toolName". Never use "tool".',
        '4. After tool results, decide the next tool call or return a final answer.',
        '5. Do not invent file contents you have not read.',
        '6. Final answers should be in Simplified Chinese unless the user explicitly asks for another language.',
        "",
        "Available tools:",
        buildToolsPrompt(tools),
    ].join("\n");
}

export async function runLocalAgentLoop(params: RunLocalAgentLoopParams) {
    const {
        userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps = 8,
    } = params;

    const messages: ChatMessage[] = [
        {
            role: "system",
            content: makeSystemPrompt(tools),
        },
        {
            role: "user",
            content: userInput,
        },
    ];

    eventBus.emit({
        type: "run_start",
        input: userInput,
    });

    for (let step = 1; step <= maxSteps; step++) {
        eventBus.emit({
            type: "step_start",
            step,
        });

        let rawText: string;

        try {
            rawText = await modelClient.generate(messages);
        } catch (error) {
            eventBus.emit({
                type: "run_error",
                error: error instanceof Error ? error.message : String(error),
                step,
                stage: "model_generate",
            });
            return;
        }

        console.log("\n[model_raw]");
        console.log(rawText);

        let action: z.infer<typeof AgentResponseSchema>;

        try {
            const rawJson = safeJsonParse(rawText);
            const normalized = normalizeAgentOutput(rawJson);
            action = AgentResponseSchema.parse(normalized);
        } catch (error) {
            eventBus.emit({
                type: "run_error",
                error: error instanceof Error ? error.message : String(error),
                step,
                stage: "parse_model_output",
            });
            return;
        }

        if (action.type === "final") {
            eventBus.emit({
                type: "assistant",
                message: action.message,
            });

            eventBus.emit({
                type: "run_end",
                reason: "final",
                step,
            });

            return;
        }

        const tool = tools.get(action.toolName);

        if (!tool) {
            const toolNotFoundMessage = `工具不存在: ${action.toolName}`;

            eventBus.emit({
                type: "tool_error",
                toolName: action.toolName,
                error: toolNotFoundMessage,
                step,
            });

            messages.push({
                role: "assistant",
                content: JSON.stringify(action),
            });

            messages.push({
                role: "tool",
                content: JSON.stringify({
                    toolName: action.toolName,
                    success: false,
                    error: toolNotFoundMessage,
                }),
            });

            continue;
        }

        eventBus.emit({
            type: "tool_start",
            toolName: tool.name,
            args: action.args,
            step,
        });

        let result: ToolResult;

        try {
            result = await tool.execute(action.args);
        } catch (error) {
            result = {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }

        eventBus.emit({
            type: "tool_end",
            toolName: tool.name,
            success: result.success,
            result,
            step,
        });

        messages.push({
            role: "assistant",
            content: JSON.stringify(action),
        });

        messages.push({
            role: "tool",
            content: JSON.stringify({
                toolName: tool.name,
                ...result,
            }),
        });
    }

    eventBus.emit({
        type: "assistant",
        message: "已达到最大执行步数限制，任务已停止。",
    });

    eventBus.emit({
        type: "run_end",
        reason: "max_steps",
        step: maxSteps,
    });
}