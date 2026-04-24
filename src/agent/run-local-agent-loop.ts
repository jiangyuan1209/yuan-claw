import type { ChatMessage } from "../memory/types.js";
import type { AgentEvent, EventBus } from "../events/event-bus.js";
import { buildSystemPrompt } from "./system-prompt.js";
import {
    prepareMessagesForModel,
    serializeToolMessage,
    trimMessages,
} from "./message-utils.js";

export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: unknown;
    execute: (args: Record<string, unknown>) => Promise<unknown>;
}

export interface AgentProtocolToolCall {
    type: "tool_call";
    toolName: string;
    args: Record<string, unknown>;
}

export interface AgentProtocolFinal {
    type: "final";
    message: string;
}

export type AgentProtocolMessage =
    | AgentProtocolToolCall
    | AgentProtocolFinal;

export interface ModelClient {
    generate(messages: ChatMessage[]): Promise<string>;
}

export interface RunLocalAgentLoopParams {
    userInput: string;
    modelClient: ModelClient;
    tools: Map<string, ToolDefinition>;
    eventBus?: EventBus;
    previousMessages?: ChatMessage[];
    maxSteps?: number;
    onMessagesUpdated?: (messages: ChatMessage[]) => void | Promise<void>;
}

export interface RunLocalAgentLoopResult {
    finalMessage: string;
    messages: ChatMessage[];
    steps: number;
}

export async function runLocalAgentLoop(
    params: RunLocalAgentLoopParams,
): Promise<RunLocalAgentLoopResult> {
    const {
        userInput,
        modelClient,
        tools,
        eventBus,
        previousMessages = [],
        maxSteps = 8,
        onMessagesUpdated,
    } = params;

    const emit = (event: AgentEvent) => {
        eventBus?.emit(event);
    };

    const toolMap = tools;
    const systemPrompt = buildSystemPrompt({
        tools: Array.from(toolMap.values()),
    });

    let messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...removeDuplicateSystemMessages(previousMessages),
        { role: "user", content: userInput },
    ];

    messages = normalizeMessages(messages);
    await persistMessages(messages, onMessagesUpdated);

    emit({
        type: "run_start",
        input: userInput,
    });

    for (let step = 1; step <= maxSteps; step++) {
        const modelMessages = prepareMessagesForModel(messages, {
            maxMessages: 24,
            maxTotalChars: 24_000,
            preserveRecentMessages: 8,
            preserveSystemMessages: true,
            compactToolMessages: true,
        });

        let rawModelContent = "";

        try {
            rawModelContent = String(
                await modelClient.generate(modelMessages),
            ).trim();
        } catch (error) {
            const message = formatErrorMessage("Model request failed", error);

            emit({
                type: "run_error",
                step,
                stage: "model_generate",
                error: message,
            });

            const finalMessage =
                `模型请求失败：${message}\n\n` +
                `请检查 API Key、Base URL、模型名称，或稍后重试。`;

            messages.push({
                role: "assistant",
                content: finalMessage,
            });

            await persistMessages(messages, onMessagesUpdated);

            emit({
                type: "run_end",
                reason: "model_error",
                step,
            });

            return {
                finalMessage,
                messages,
                steps: step,
            };
        }

        emit({
            type: "model_raw",
            step,
            text: rawModelContent,
        });

        const parsed = parseAgentProtocol(rawModelContent);

        if (!parsed.ok) {
            const parseError = parsed.error;

            emit({
                type: "run_error",
                step,
                stage: "protocol_parse",
                error: `${parseError}. Raw output: ${rawModelContent}`,
            });

            const finalMessage =
                "我无法正确解析模型输出为协议 JSON。\n\n" +
                "请重试，或优化 system prompt 以强制输出合法 JSON。";

            messages.push({
                role: "assistant",
                content: finalMessage,
            });

            await persistMessages(messages, onMessagesUpdated);

            emit({
                type: "run_end",
                reason: "invalid_protocol",
                step,
            });

            return {
                finalMessage,
                messages,
                steps: step,
            };
        }

        if (parsed.value.type === "final") {
            const finalMessage = parsed.value.message;

            messages.push({
                role: "assistant",
                content: finalMessage,
            });

            await persistMessages(messages, onMessagesUpdated);

            emit({
                type: "assistant",
                message: finalMessage,
            });

            emit({
                type: "run_end",
                reason: "completed",
                step,
            });

            return {
                finalMessage,
                messages,
                steps: step,
            };
        }

        const { toolName, args } = parsed.value;
        const tool = toolMap.get(toolName);

        if (!tool) {
            const errorMessage = `Unknown tool: ${toolName}. Available tools: ${Array.from(
                toolMap.keys(),
            ).join(", ")}`;

            emit({
                type: "tool_error",
                toolName,
                error: errorMessage,
                step,
            });

            messages.push({
                role: "assistant",
                content: JSON.stringify(parsed.value),
            });

            messages.push({
                role: "tool",
                content: serializeToolMessage({
                    success: false,
                    error: errorMessage,
                    availableTools: Array.from(toolMap.keys()),
                }),
            });

            await persistMessages(messages, onMessagesUpdated);
            continue;
        }

        emit({
            type: "tool_start",
            toolName,
            args,
            step,
        });

        let toolResult: unknown;
        let toolSuccess = true;

        try {
            toolResult = await tool.execute(args);
        } catch (error) {
            toolSuccess = false;

            const errorMessage = formatErrorMessage(
                `Tool execution failed for "${toolName}"`,
                error,
            );

            emit({
                type: "tool_error",
                toolName,
                error: errorMessage,
                step,
            });

            toolResult = {
                success: false,
                error: errorMessage,
            };
        }

        emit({
            type: "tool_end",
            toolName,
            success: toolSuccess,
            result: toolResult,
            step,
        });

        messages.push({
            role: "assistant",
            content: JSON.stringify(parsed.value),
        });

        messages.push({
            role: "tool",
            content: serializeToolMessage(toolResult),
        });

        messages = trimMessages(messages, {
            maxMessages: 30,
            maxTotalChars: 30_000,
            preserveRecentMessages: 10,
            preserveSystemMessages: true,
            compactToolMessages: true,
        });

        await persistMessages(messages, onMessagesUpdated);
    }

    const finalMessage =
        `已达到最大执行步数（${maxSteps}），任务提前停止。\n\n` +
        `你可以让模型缩小任务范围，或者提高 maxSteps 后重试。`;

    messages.push({
        role: "assistant",
        content: finalMessage,
    });

    await persistMessages(messages, onMessagesUpdated);

    emit({
        type: "assistant",
        message: finalMessage,
    });

    emit({
        type: "run_end",
        reason: "max_steps_reached",
        step: maxSteps,
    });

    return {
        finalMessage,
        messages,
        steps: maxSteps,
    };
}

async function persistMessages(
    messages: ChatMessage[],
    onMessagesUpdated?: (messages: ChatMessage[]) => void | Promise<void>,
): Promise<void> {
    if (!onMessagesUpdated) {
        return;
    }

    const next = trimMessages(messages, {
        maxMessages: 30,
        maxTotalChars: 30_000,
        preserveRecentMessages: 10,
        preserveSystemMessages: true,
        compactToolMessages: true,
    });

    await onMessagesUpdated(next);
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    let systemSeen = false;

    for (const msg of messages) {
        if (msg.role === "system") {
            if (systemSeen) {
                continue;
            }
            systemSeen = true;
        }

        result.push({
            role: msg.role,
            content:
                typeof msg.content === "string"
                    ? msg.content
                    : JSON.stringify(msg.content),
        });
    }

    return result;
}

function removeDuplicateSystemMessages(
    messages: ChatMessage[],
): ChatMessage[] {
    return messages.filter((msg) => msg.role !== "system");
}

function parseAgentProtocol(
    raw: string,
):
    | { ok: true; value: AgentProtocolMessage }
    | { ok: false; error: string } {
    const candidates = extractJsonCandidates(raw);

    for (const candidate of candidates) {
        try {
            const parsed = JSON.parse(candidate);

            if (
                parsed &&
                typeof parsed === "object" &&
                parsed.type === "final" &&
                typeof parsed.message === "string"
            ) {
                return {
                    ok: true,
                    value: parsed as AgentProtocolFinal,
                };
            }

            if (
                parsed &&
                typeof parsed === "object" &&
                parsed.type === "tool_call" &&
                typeof parsed.toolName === "string" &&
                parsed.args &&
                typeof parsed.args === "object"
            ) {
                return {
                    ok: true,
                    value: parsed as AgentProtocolToolCall,
                };
            }
        } catch {
            // try next candidate
        }
    }

    return {
        ok: false,
        error: "No valid protocol JSON found",
    };
}

function extractJsonCandidates(raw: string): string[] {
    const trimmed = raw.trim();
    const candidates = new Set<string>();

    candidates.add(trimmed);

    const codeBlockMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (codeBlockMatch?.[1]) {
        candidates.add(codeBlockMatch[1].trim());
    }

    const firstBrace = trimmed.indexOf("{");
    const lastBrace = trimmed.lastIndexOf("}");
    if (firstBrace >= 0 && lastBrace > firstBrace) {
        candidates.add(trimmed.slice(firstBrace, lastBrace + 1));
    }

    return [...candidates];
}

function formatErrorMessage(prefix: string, error: unknown): string {
    if (error instanceof Error) {
        return `${prefix}: ${error.message}`;
    }
    return `${prefix}: ${String(error)}`;
}