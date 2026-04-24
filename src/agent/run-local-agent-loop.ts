import { buildSystemPrompt } from "./system-prompt.js";
import {
    prepareMessagesForModel,
    serializeToolMessage,
    trimMessages,
} from "./message-utils.js";

export type AgentRole = "system" | "user" | "assistant" | "tool";

export interface ChatMessage {
    role: AgentRole;
    content: string;
}

export interface ToolDefinition {
    name: string;
    description?: string;
    inputSchema?: Record<string, unknown>;
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
    createMessage(input: {
        messages: ChatMessage[];
    }): Promise<{
        content: string;
    }>;
}

export interface RunLocalAgentLoopParams {
    userInput: string;
    model: ModelClient;
    tools: ToolDefinition[];
    previousMessages?: ChatMessage[];
    maxSteps?: number;
    onEvent?: (event: {
        type:
            | "run_start"
            | "step_start"
            | "model_raw"
            | "tool_start"
            | "tool_end"
            | "assistant"
            | "warning"
            | "error"
            | "run_end";
        [key: string]: unknown;
    }) => void;
    onMessagesUpdated?: (messages: ChatMessage[]) => void;
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
        model,
        tools,
        previousMessages = [],
        maxSteps = 8,
        onEvent,
        onMessagesUpdated,
    } = params;

    const toolMap = new Map(tools.map((tool) => [tool.name, tool]));
    const systemPrompt = buildSystemPrompt({ tools });

    let messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...removeDuplicateSystemMessages(previousMessages),
        { role: "user", content: userInput },
    ];

    messages = normalizeMessages(messages);
    persistMessages(messages, onMessagesUpdated);

    onEvent?.({
        type: "run_start",
        userInput,
        toolCount: tools.length,
    });

    for (let step = 1; step <= maxSteps; step++) {
        onEvent?.({
            type: "step_start",
            step,
        });

        const modelMessages = prepareMessagesForModel(messages, {
            maxMessages: 24,
            maxTotalChars: 24_000,
            preserveRecentMessages: 8,
            preserveSystemMessages: true,
            compactToolMessages: true,
        });

        let rawModelContent = "";
        try {
            const response = await model.createMessage({
                messages: modelMessages,
            });
            rawModelContent = String(response.content ?? "").trim();
        } catch (error) {
            const message = formatErrorMessage("Model request failed", error);

            onEvent?.({
                type: "error",
                step,
                error: message,
            });

            const finalMessage =
                `模型请求失败：${message}\n\n` +
                `请检查 API Key、Base URL、模型名称，或稍后重试。`;

            messages.push({
                role: "assistant",
                content: finalMessage,
            });

            persistMessages(messages, onMessagesUpdated);

            onEvent?.({
                type: "run_end",
                step,
                status: "model_error",
            });

            return {
                finalMessage,
                messages,
                steps: step,
            };
        }

        onEvent?.({
            type: "model_raw",
            step,
            content: rawModelContent,
        });

        const parsed = parseAgentProtocol(rawModelContent);

        if (!parsed.ok) {
            const finalMessage =
                "我无法正确解析模型输出为协议 JSON。\n\n" +
                "请重试，或优化 system prompt 以强制输出合法 JSON。";

            onEvent?.({
                type: "warning",
                step,
                reason: "invalid_protocol",
                raw: rawModelContent,
            });

            messages.push({
                role: "assistant",
                content: finalMessage,
            });

            persistMessages(messages, onMessagesUpdated);

            onEvent?.({
                type: "run_end",
                step,
                status: "invalid_protocol",
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

            persistMessages(messages, onMessagesUpdated);

            onEvent?.({
                type: "assistant",
                step,
                message: finalMessage,
            });

            onEvent?.({
                type: "run_end",
                step,
                status: "completed",
            });

            return {
                finalMessage,
                messages,
                steps: step,
            };
        }

        if (parsed.value.type === "tool_call") {
            const { toolName, args } = parsed.value;
            const tool = toolMap.get(toolName);

            if (!tool) {
                const toolError = {
                    success: false,
                    error: `Unknown tool: ${toolName}`,
                    availableTools: tools.map((t) => t.name),
                };

                onEvent?.({
                    type: "warning",
                    step,
                    reason: "unknown_tool",
                    toolName,
                });

                messages.push({
                    role: "assistant",
                    content: JSON.stringify(parsed.value),
                });

                messages.push({
                    role: "tool",
                    content: serializeToolMessage(toolError),
                });

                persistMessages(messages, onMessagesUpdated);
                continue;
            }

            onEvent?.({
                type: "tool_start",
                step,
                toolName,
                args,
            });

            let toolResult: unknown;
            try {
                toolResult = await tool.execute(args);
            } catch (error) {
                toolResult = {
                    success: false,
                    error: formatErrorMessage(
                        `Tool execution failed for "${toolName}"`,
                        error,
                    ),
                };

                onEvent?.({
                    type: "error",
                    step,
                    toolName,
                    error: toolResult,
                });
            }

            onEvent?.({
                type: "tool_end",
                step,
                toolName,
                result: toolResult,
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

            persistMessages(messages, onMessagesUpdated);
            continue;
        }
    }

    const finalMessage =
        `已达到最大执行步数（${maxSteps}），任务提前停止。\n\n` +
        `你可以让模型缩小任务范围，或者提高 maxSteps 后重试。`;

    messages.push({
        role: "assistant",
        content: finalMessage,
    });

    persistMessages(messages, onMessagesUpdated);

    onEvent?.({
        type: "warning",
        reason: "max_steps_reached",
        maxSteps,
    });

    onEvent?.({
        type: "run_end",
        status: "max_steps_reached",
    });

    return {
        finalMessage,
        messages,
        steps: maxSteps,
    };
}

function persistMessages(
    messages: ChatMessage[],
    onMessagesUpdated?: (messages: ChatMessage[]) => void,
): void {
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

    onMessagesUpdated(next);
}

function normalizeMessages(messages: ChatMessage[]): ChatMessage[] {
    const result: ChatMessage[] = [];
    let systemSeen = false;

    for (const msg of messages) {
        if (msg.role === "system") {
            if (systemSeen) continue;
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