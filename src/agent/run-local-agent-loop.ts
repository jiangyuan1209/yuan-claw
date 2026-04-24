import type { Tool } from "../tools/types";
import type { ChatMessage } from "../memory/types";
import { makeSystemPrompt } from "./prompts";
import {
    AgentResponseSchema,
    normalizeAgentOutput,
    safeJsonParse,
} from "./protocol";

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
    previousMessages?: ChatMessage[];
    onMessagesUpdated?: (messages: ChatMessage[]) => Promise<void> | void;
};

export async function runLocalAgentLoop(params: RunLocalAgentLoopParams) {
    const {
        userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps = 8,
        previousMessages = [],
        onMessagesUpdated,
    } = params;

    const messages: ChatMessage[] = [
        {
            role: "system",
            content: makeSystemPrompt(tools),
        },
        ...previousMessages.filter((m) => m.role !== "system"),
        {
            role: "user",
            content: userInput,
        },
    ];

    if (onMessagesUpdated) {
        await onMessagesUpdated(messages);
    }

    eventBus.emit({ type: "run_start", input: userInput });

    for (let step = 1; step <= maxSteps; step++) {
        let rawText: string;

        try {
            rawText = await modelClient.generate(messages);
            eventBus.emit({ type: "model_raw", text: rawText, step });
        } catch (error) {
            eventBus.emit({
                type: "run_error",
                step,
                stage: "model_generate",
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }

        let action;

        try {
            const rawJson = safeJsonParse(rawText);
            action = AgentResponseSchema.parse(normalizeAgentOutput(rawJson));
        } catch (error) {
            eventBus.emit({
                type: "run_error",
                step,
                stage: "parse_model_output",
                error: error instanceof Error ? error.message : String(error),
            });
            return;
        }

        if (action.type === "final") {
            messages.push({
                role: "assistant",
                content: action.message,
            });

            if (onMessagesUpdated) {
                await onMessagesUpdated(messages);
            }

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
            const errorMessage = `工具不存在: ${action.toolName}`;

            messages.push({
                role: "assistant",
                content: JSON.stringify(action),
            });

            messages.push({
                role: "tool",
                content: JSON.stringify({
                    toolName: action.toolName,
                    success: false,
                    error: errorMessage,
                }),
            });

            if (onMessagesUpdated) {
                await onMessagesUpdated(messages);
            }

            eventBus.emit({
                type: "tool_error",
                toolName: action.toolName,
                error: errorMessage,
                step,
            });

            continue;
        }

        eventBus.emit({
            type: "tool_start",
            toolName: tool.name,
            args: action.args,
            step,
        });

        let result;
        try {
            result = await tool.execute(action.args);
        } catch (error) {
            result = {
                success: false as const,
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

        if (onMessagesUpdated) {
            await onMessagesUpdated(messages);
        }
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