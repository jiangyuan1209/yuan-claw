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
    generate(messages: ChatMessage[]): Promise<string>;
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

export async function runLocalAgentLoop({
                                            userInput,
                                            modelClient,
                                            tools,
                                            eventBus,
                                            maxSteps = 8,
                                            previousMessages = [],
                                            onMessagesUpdated,
                                        }: RunLocalAgentLoopParams): Promise<void> {
    let messages: ChatMessage[] = [
        {
            role: "system",
            content: makeSystemPrompt(tools),
        },
        ...previousMessages.filter((message) => message.role !== "system"),
        {
            role: "user",
            content: userInput,
        },
    ];

    messages = trimMessages(messages, {
        maxMessages: 24,
        maxContentChars: 12000,
    });

    if (onMessagesUpdated) {
        await onMessagesUpdated(messages);
    }

    eventBus.emit({
        type: "run_start",
        input: userInput,
    });

    let lastToolCallKey: string | null = null;
    let repeatedToolCallCount = 0;

    for (let step = 1; step <= maxSteps; step++) {
        try {
            const rawText = await modelClient.generate(messages);

            eventBus.emit({
                type: "model_raw",
                text: rawText,
                step,
            });

            const parsed = safeJsonParse(rawText);
            const normalized = normalizeAgentOutput(parsed);
            const action = AgentResponseSchema.parse(normalized);

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

            if (action.type === "tool_call") {
                const tool = tools.get(action.toolName);

                messages.push({
                    role: "assistant",
                    content: compactAssistantToolCall(action.toolName, action.args),
                });

                const currentToolCallKey = JSON.stringify({
                    toolName: action.toolName,
                    args: action.args,
                });

                if (currentToolCallKey === lastToolCallKey) {
                    repeatedToolCallCount += 1;
                } else {
                    repeatedToolCallCount = 0;
                    lastToolCallKey = currentToolCallKey;
                }

                if (repeatedToolCallCount >= 1) {
                    const duplicateMessage =
                        "检测到重复的工具调用（同一工具且参数相同）。请基于已有结果继续分析，或改用其他工具。";

                    messages.push({
                        role: "tool",
                        content: compactToolResult(action.toolName, {
                            success: false,
                            error: duplicateMessage,
                            duplicate: true,
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
                        error: duplicateMessage,
                        step,
                    });

                    continue;
                }

                if (!tool) {
                    const errorMessage = `Unknown tool: ${action.toolName}`;

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
                    toolName: action.toolName,
                    args: action.args,
                    step,
                });

                try {
                    const result = await tool.execute(action.args);

                    messages.push({
                        role: "tool",
                        content: compactToolResult(action.toolName, result),
                    });

                    messages = trimMessages(messages, {
                        maxMessages: 24,
                        maxContentChars: 12000,
                    });

                    if (onMessagesUpdated) {
                        await onMessagesUpdated(messages);
                    }

                    eventBus.emit({
                        type: "tool_end",
                        toolName: action.toolName,
                        success: Boolean(result?.success),
                        result,
                        step,
                    });
                } catch (error) {
                    const errorMessage =
                        error instanceof Error ? error.message : String(error);

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
                }

                continue;
            }

            eventBus.emit({
                type: "run_error",
                step,
                stage: "protocol",
                error: "Unsupported action type returned by model",
            });
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            eventBus.emit({
                type: "run_error",
                step,
                stage: "model_or_parse",
                error: errorMessage,
            });

            messages.push({
                role: "assistant",
                content: `模型输出解析失败：${errorMessage}`,
            });

            messages = trimMessages(messages, {
                maxMessages: 24,
                maxContentChars: 12000,
            });

            if (onMessagesUpdated) {
                await onMessagesUpdated(messages);
            }
        }
    }

    const maxStepsMessage = `已达到最大步骤数限制（${maxSteps}），任务结束。`;

    messages.push({
        role: "assistant",
        content: maxStepsMessage,
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
        message: maxStepsMessage,
    });

    eventBus.emit({
        type: "run_end",
        reason: "max_steps",
        step: maxSteps,
    });
}