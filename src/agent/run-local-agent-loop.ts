import type { ChatMessage } from "../memory/types.js";
import type { Tool } from "../tools/types.js";
import type { EventBus } from "../events/event-bus.js";
import { buildSystemPrompt } from "./build-system-prompt.js";
import { parseAgentResponse } from "./parse-agent-response.js";
import type { ApprovalDecision } from "./read-approval.js";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

export type ApprovalMode = "ask" | "always-allow";

export type RunLocalAgentLoopParams = {
    userInput: string;
    modelClient: ModelClient;
    tools: Map<string, Tool>;
    eventBus: EventBus;
    maxSteps?: number;
    previousMessages?: ChatMessage[];
    onMessagesUpdated?: (messages: ChatMessage[]) => Promise<void>;
    approvalMode?: ApprovalMode;
    requestApproval?: (message: string) => Promise<ApprovalDecision>;
};

function stringifyForModel(value: unknown): string {
    try {
        return JSON.stringify(value);
    } catch {
        return String(value);
    }
}

function trimText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }

    return `${text.slice(0, maxChars)}\n...[truncated]`;
}

function formatToolResultForModel(result: unknown, maxChars = 12000): string {
    return trimText(stringifyForModel(result), maxChars);
}

async function persistMessages(
    messages: ChatMessage[],
    onMessagesUpdated?: (messages: ChatMessage[]) => Promise<void>,
): Promise<void> {
    if (onMessagesUpdated) {
        await onMessagesUpdated(messages);
    }
}

export async function runLocalAgentLoop(
    params: RunLocalAgentLoopParams,
): Promise<{ finalMessage: string; approvalMode: ApprovalMode }> {
    const {
        userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps = 8,
        previousMessages = [],
        onMessagesUpdated,
        requestApproval,
    } = params;

    let approvalMode: ApprovalMode = params.approvalMode ?? "ask";
    let allowOneHighRiskToolCall = approvalMode === "always-allow";

    eventBus.emit({
        type: "run_start",
        input: userInput,
    });

    const historyMessages = previousMessages.filter(
        (message) => message.role !== "system",
    );

    const messages: ChatMessage[] = [
        {
            role: "system",
            content: buildSystemPrompt(Array.from(tools.values())),
        },
        ...historyMessages,
        {
            role: "user",
            content: userInput,
        },
    ];

    await persistMessages(messages, onMessagesUpdated);

    for (let step = 1; step <= maxSteps; step += 1) {
        let rawOutput: string;

        try {
            rawOutput = await modelClient.generate(messages);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            eventBus.emit({
                type: "run_error",
                step,
                stage: "model_generate",
                error: errorMessage,
            });

            throw error;
        }

        eventBus.emit({
            type: "model_raw",
            text: rawOutput,
            step,
        });

        messages.push({
            role: "assistant",
            content: rawOutput,
        });
        await persistMessages(messages, onMessagesUpdated);

        let response: ReturnType<typeof parseAgentResponse>;
        try {
            response = parseAgentResponse(rawOutput);
        } catch (error) {
            const errorMessage =
                error instanceof Error ? error.message : String(error);

            eventBus.emit({
                type: "run_error",
                step,
                stage: "parse_agent_response",
                error: errorMessage,
            });

            messages.push({
                role: "user",
                content: [
                    "Your previous response could not be parsed.",
                    `Parse error: ${errorMessage}`,
                    "You must respond with exactly one valid JSON object.",
                    'Allowed formats:',
                    '- {"type":"tool_call","toolName":"<tool>","args":{}}',
                    '- {"type":"final","message":"<answer>"}',
                    '- {"type":"ask_confirmation","message":"<question>"}',
                ].join("\n"),
            });

            await persistMessages(messages, onMessagesUpdated);
            continue;
        }

        if (response.type === "final") {
            eventBus.emit({
                type: "assistant",
                message: response.message,
            });

            eventBus.emit({
                type: "run_end",
                reason: "final",
                step,
            });

            return {
                finalMessage: response.message,
                approvalMode,
            };
        }

        if (response.type === "ask_confirmation") {
            let decision: ApprovalDecision;

            try {
                if (approvalMode === "always-allow") {
                    decision = "allow-once";
                } else if (requestApproval) {
                    decision = await requestApproval(response.message);
                } else {
                    decision = "deny";
                }
            } catch (error) {
                const errorMessage =
                    error instanceof Error ? error.message : String(error);

                eventBus.emit({
                    type: "run_error",
                    step,
                    stage: "confirmation",
                    error: errorMessage,
                });

                throw error;
            }

            if (decision === "allow-always") {
                approvalMode = "always-allow";
                allowOneHighRiskToolCall = true;
                console.log(
                    "已启用“总是允许”模式，本会话后续 confirm / dangerous 操作将自动执行。输入 /reset 可恢复逐次确认。\n"
                );
            } else if (decision === "allow-once") {
                allowOneHighRiskToolCall = true;
            } else {
                allowOneHighRiskToolCall = false;
            }

            messages.push({
                role: "user",
                content:
                    decision === "deny"
                        ? `The user denied your request: ${response.message}. Do not perform that action. Offer a safer alternative or stop.`
                        : decision === "allow-always"
                            ? `The user approved your request and enabled always-allow mode for this session: ${response.message}`
                            : `The user approved your request: ${response.message}`,
            });

            await persistMessages(messages, onMessagesUpdated);
            continue;
        }

        if (response.type === "tool_call") {
            const tool = tools.get(response.toolName);

            if (!tool) {
                const errorMessage = `Unknown tool "${response.toolName}".`;

                eventBus.emit({
                    type: "tool_error",
                    toolName: response.toolName,
                    error: errorMessage,
                    step,
                });

                messages.push({
                    role: "user",
                    content: [
                        `Tool execution failed: ${errorMessage}`,
                        "Use only the available tools listed in the system prompt.",
                    ].join("\n"),
                });

                await persistMessages(messages, onMessagesUpdated);
                continue;
            }

            const needsConfirmation =
                tool.riskLevel === "confirm" || tool.riskLevel === "dangerous";

            if (
                needsConfirmation &&
                approvalMode !== "always-allow" &&
                !allowOneHighRiskToolCall
            ) {
                const errorMessage = `Tool "${tool.name}" requires confirmation before execution. Ask for confirmation first.`;

                eventBus.emit({
                    type: "tool_error",
                    toolName: response.toolName,
                    error: errorMessage,
                    step,
                });

                messages.push({
                    role: "user",
                    content: [
                        errorMessage,
                        "Do not execute this tool yet.",
                        "Ask the user for confirmation first.",
                    ].join("\n"),
                });

                await persistMessages(messages, onMessagesUpdated);
                continue;
            }

            eventBus.emit({
                type: "tool_start",
                toolName: response.toolName,
                args: response.args,
                step,
            });

            let result;
            try {
                result = await tool.execute(response.args);

                if (needsConfirmation && approvalMode !== "always-allow") {
                    allowOneHighRiskToolCall = false;
                }
            } catch (error) {
                if (needsConfirmation && approvalMode !== "always-allow") {
                    allowOneHighRiskToolCall = false;
                }

                const errorMessage =
                    error instanceof Error ? error.message : String(error);

                eventBus.emit({
                    type: "tool_error",
                    toolName: response.toolName,
                    error: errorMessage,
                    step,
                });

                messages.push({
                    role: "user",
                    content: [
                        `Tool "${response.toolName}" crashed.`,
                        `Error: ${errorMessage}`,
                        "Revise your plan. You may call another tool or return a final response.",
                    ].join("\n"),
                });

                await persistMessages(messages, onMessagesUpdated);
                continue;
            }

            eventBus.emit({
                type: "tool_end",
                toolName: response.toolName,
                success: result.success,
                result: result.success ? result.output : result.error,
                step,
            });

            if (result.success) {
                messages.push({
                    role: "user",
                    content: [
                        `Tool "${response.toolName}" completed successfully.`,
                        `Result: ${formatToolResultForModel(result.output)}`,
                        "Continue the task. If it is complete, return a final response.",
                    ].join("\n"),
                });

                await persistMessages(messages, onMessagesUpdated);
                continue;
            }

            messages.push({
                role: "user",
                content: [
                    `Tool "${response.toolName}" failed.`,
                    `Error: ${result.error}`,
                    "Revise your plan. You may call another tool or return a final response.",
                ].join("\n"),
            });

            await persistMessages(messages, onMessagesUpdated);
            continue;
        }
    }

    eventBus.emit({
        type: "run_end",
        reason: "max_steps_exceeded",
        step: maxSteps,
    });

    throw new Error(`Agent loop exceeded maximum number of steps (${maxSteps}).`);
}