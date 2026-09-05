import type { ChatMessage } from "../memory/types.js";
import type { Tool } from "../tools/types.js";
import type { EventBus } from "../events/event-bus.js";
import { buildSystemPrompt } from "./build-system-prompt.js";
import { parseAgentResponse } from "./parse-agent-response.js";
import type { ApprovalDecision } from "./read-approval.js";
import { SkillsRuntime } from "../skills/runtime.js";
import fs from "node:fs/promises";
import path from "node:path";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

export type ApprovalMode = "ask" | "always-allow";

export type RunLocalAgentLoopParams = {
    userInput: string;
    modelClient: ModelClient;
    tools: Map<string, Tool>;
    eventBus: EventBus;
    /**
     * ===== Agent 多步骤记忆的上限 =====
     *
     * Agent 循环最多执行的步数。每一步包括：调 LLM → 解析响应 → 执行工具 → 将结果追加到 messages。
     * 超过此限制后循环终止并抛出错误（reason: "max_steps_exceeded"）。
     *
     * 默认值 8（函数签名处），但实际调用方均覆盖为 30：
     *   - CLI REPL: maxSteps = options.maxSteps ?? 30（可通过 --max-steps 覆盖）
     *   - CLI 单次: maxSteps = args.maxSteps ?? 30
     *   - Web 服务端: maxSteps = 30（硬编码）
     *
     * 注意：这是单次用户任务内的步骤上限，不是跨轮次的对话记忆限制。
     * 跨轮次的对话记忆通过 previousMessages 传入，目前无轮次大小限制。
     */
    maxSteps?: number;
    /**
     * 对话记忆：传入之前轮次的历史消息。
     * CLI REPL 中为跨轮次累积的 messages 数组，Web 端为 session.messages。
     * 这样 LLM 能看到之前的对话上下文，实现跨轮次的对话记忆。
     */
    previousMessages?: ChatMessage[];
    /**
     * 对话记忆持久化回调：每次 messages 数组更新时调用，
     * 用于将最新的消息历史写回到调用方的存储中（REPL 的变量 / Web 的 session）。
     */
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

/**
 * ===== 单条工具结果的长度限制 =====
 *
 * 工具执行结果在注入 messages 前会被截断到 maxChars 个字符（默认 12000），
 * 防止单次工具输出过大占满 LLM 上下文窗口。
 * 这是对"单条消息内容"的长度限制，不影响消息条数。
 */
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

    // Track script files created by write_file for cleanup after loop ends.
    // Only scripts that were BOTH created AND executed are cleaned up.
    // Value=true means the script was executed (intermediate tool), value=false means created but not run (user's output).
    const SCRIPT_EXTENSIONS = new Set([".py", ".sh", ".bash", ".rb", ".pl"]);
    const createdFiles = new Map<string, boolean>();

    eventBus.emit({
        type: "run_start",
        input: userInput,
    });

    // Load and match skills based on user input
    const skillsRuntime = new SkillsRuntime();
    await skillsRuntime.reload();
    const skillsPrompt = skillsRuntime.buildPromptForInput(userInput);

    const historyMessages = previousMessages.filter(
        (message) => message.role !== "system",
    );

    /**
     * ===== 多步骤记忆（Agent 模式特有） =====
     *
     * messages 数组是整个 Agent 循环的"记忆核心"。
     * 初始内容：[system prompt, ...历史对话, 本次用户输入]
     *
     * 在后续的 for 循环中，每一步都会往这个数组追加新消息：
     *   - LLM 的原始输出（assistant）
     *   - 工具执行结果（user 角色，携带 tool result）
     *   - 解析错误的纠正提示
     *   - 确认请求的用户回复
     *
     * 每次调用 modelClient.generate(messages) 时，LLM 都能看到完整的 messages 数组，
     * 因此它"记得"之前每一步做了什么、工具返回了什么、用户说了什么。
     * 这就是 Agent 单次多步骤任务的记忆机制。
     *
     * ===== 轮次大小限制 =====
     *
     * 多步骤上限：由 maxSteps 控制（见参数注释），超出后循环终止。
     * 对话记忆上限：⚠️ 当前无限制！previousMessages 的全部历史都会注入 messages，
     *   然后整体发给 LLM。长时间对话可能导致超出 LLM 上下文窗口。
     *   trimMessages / prepareMessagesForModel 函数已实现截断逻辑，
     *   但仅在 SessionStore.save() 持久化到磁盘时使用，未在发给 LLM 前调用。
     */
    const messages: ChatMessage[] = [
        {
            role: "system",
            content: buildSystemPrompt(Array.from(tools.values()), skillsPrompt),
        },
        ...historyMessages,
        {
            role: "user",
            content: userInput,
        },
    ];

    await persistMessages(messages, onMessagesUpdated);

    try {
        // Agent 多步骤循环：每步调 LLM → 解析 → 执行工具 → 追加结果到 messages。
        // 循环上限为 maxSteps 步，超出后抛出错误。
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

                // Track script files created by write_file for later cleanup
                if (response.toolName === "write_file" && result.success) {
                    const output = result.output as { path?: string } | undefined;
                    if (output?.path) {
                        const ext = path.extname(output.path).toLowerCase();
                        if (SCRIPT_EXTENSIONS.has(ext)) {
                            createdFiles.set(output.path, false); // created but not yet executed
                        }
                    }
                }

                // Mark script as executed if shell_exec references a tracked script
                if (response.toolName === "shell_exec" && result.success) {
                    const args = response.args as { command?: string } | undefined;
                    if (args?.command) {
                        for (const [filePath] of createdFiles) {
                            const fileName = path.basename(filePath);
                            if (args.command.includes(fileName)) {
                                createdFiles.set(filePath, true);
                            }
                        }
                    }
                }

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
    } finally {
        // Clean up script files that were created AND executed during the loop
        for (const [filePath, wasExecuted] of createdFiles) {
            if (wasExecuted) {
                try {
                    await fs.unlink(filePath);
                } catch {
                    // Ignore deletion errors (file may not exist or already deleted)
                }
            }
        }
    }

    eventBus.emit({
        type: "run_end",
        reason: "max_steps_exceeded",
        step: maxSteps,
    });

    throw new Error(`Agent loop exceeded maximum number of steps (${maxSteps}).`);
}