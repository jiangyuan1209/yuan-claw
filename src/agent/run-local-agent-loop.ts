import type { Tool } from "../tools/types.js";
import type { ChatMessage } from "../memory/types.js";
import type { EventBus } from "../events/event-bus.js";
import { makeSystemPrompt } from "./prompts.js";
import {
    AgentResponseSchema,
    normalizeAgentOutput,
    safeJsonParse,
} from "./protocol.js";
import {
    trimMessages,
    compactToolResult,
    compactAssistantToolCall,
} from "./message-utils.js";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
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

    let messages: ChatMessage[] = trimMessages(
        [
            {
                role: "system",
                content: makeSystemPrompt(tools),
            },
            ...previousMessages.filter((m) => m.role !== "system"),
            {
                role: "user",
                content: userInput,
            },
        ],
        {
            maxMessages: 24,
            maxContentChars: 12000,
        }
    );

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

            messages = trimMessages(messages, {
                maxMessages: 24,
                maxContentChars: 12000,
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
                content: compactAssistantToolCall(action.toolName, action.args),
            });

            messages.push({
                role: "tool",
                content: compactToolResult(action.toolName, {
                    success: false,
                    error: errorMessage,
                }),
            });

            messages = trimMessages(messages, {
                maxMessages: 24,
                maxContentChars: 12000,
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
            content: compactAssistantToolCall(tool.name, action.args),
        });

        messages.push({
            role: "tool",
            content: compactToolResult(tool.name, result),
        });

        messages = trimMessages(messages, {
            maxMessages: 24,
            maxContentChars: 12000,
        });

        if (onMessagesUpdated) {
            await onMessagesUpdated(messages);
        }
    }

    const stopMessage = "已达到最大执行步数限制，任务已停止。";

    messages.push({
        role: "assistant",
        content: stopMessage,
    });

    messages = trimMessages(messages, {
        maxMessages: 24,
        maxContentChars: 12000,
    });

    if (onMessagesUpdated) {
        await onMessagesUpdated(messages);
    }

    eventBus.emit({
        type: "assistant",
        message: stopMessage,
    });

    eventBus.emit({
        type: "run_end",
        reason: "max_steps",
        step: maxSteps,
    });
}