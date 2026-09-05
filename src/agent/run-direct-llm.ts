import type { ChatMessage } from "../memory/types.js";
import type { EventBus } from "../events/event-bus.js";

/**
 * Model client interface for direct LLM mode.
 * Requires streaming support via generateStream.
 */
export type StreamingModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
    generateStream: (messages: ChatMessage[]) => AsyncIterable<string>;
};

export type RunDirectLLMParams = {
    userInput: string;
    modelClient: StreamingModelClient;
    eventBus: EventBus;
    /**
     * 对话记忆：传入之前轮次的历史消息。
     * 与 Agent 模式相同，CLI REPL / Web session 会将跨轮次的对话历史传入，
     * 使 LLM 能看到之前的问答上下文，实现跨轮次的对话记忆。
     *
     * 注意：直连模式没有多步骤记忆（单次 LLM 调用，无循环），
     * 仅有跨轮次的对话记忆（通过 previousMessages 实现）。
     */
    previousMessages?: ChatMessage[];
    /**
     * 对话记忆持久化回调：流式输出完成后调用，
     * 将本次问答（user + assistant）追加到调用方的存储中。
     */
    onMessagesUpdated?: (messages: ChatMessage[]) => Promise<void>;
};

/**
 * Direct LLM mode — bypasses the agent/tool-calling loop entirely.
 * Sends the user's message directly to the LLM with streaming output.
 * No system prompt, no tool definitions, no JSON parsing.
 */
export async function runDirectLLM(
    params: RunDirectLLMParams,
): Promise<{ finalMessage: string }> {
    const {
        userInput,
        modelClient,
        eventBus,
        previousMessages = [],
        onMessagesUpdated,
    } = params;

    eventBus.emit({
        type: "run_start",
        input: userInput,
    });

    // Build conversation history — no system prompt for direct mode.
    // Filter out old system messages from previous agent-mode turns.
    const historyMessages = previousMessages.filter(
        (msg) => msg.role !== "system",
    );

    /**
     * 直连模式的消息构建：[...历史对话, 本次用户输入]
     *
     * 与 Agent 模式的区别：
     *   - 没有 system prompt（不注入工具列表和技能描述）
     *   - 没有多步骤记忆（单次 LLM 调用，不存在步骤间的上下文累积）
     *   - 仅有对话记忆：通过 historyMessages 携带之前轮次的问答历史
     *
     * 流式输出完成后，assistant 回复会被追加到 messages 数组并持久化，
     * 供下一轮对话作为 historyMessages 使用。
     */
    const messages: ChatMessage[] = [
        ...historyMessages,
        { role: "user", content: userInput },
    ];

    try {
        let fullResponse = "";

        const stream = modelClient.generateStream(messages);

        for await (const chunk of stream) {
            fullResponse += chunk;
            eventBus.emit({
                type: "streaming_token",
                text: chunk,
                done: false,
            });
        }

        // Signal streaming is done
        eventBus.emit({
            type: "streaming_token",
            text: "",
            done: true,
        });

        if (!fullResponse.trim()) {
            throw new Error("Model returned empty content.");
        }

        // Record the assistant's response in conversation history
        messages.push({ role: "assistant", content: fullResponse });

        if (onMessagesUpdated) {
            await onMessagesUpdated(messages);
        }

        // Emit the final assistant message event
        eventBus.emit({
            type: "assistant",
            message: fullResponse,
        });

        eventBus.emit({
            type: "run_end",
            reason: "final",
            step: 1,
        });

        return { finalMessage: fullResponse };
    } catch (error) {
        const errorMessage =
            error instanceof Error ? error.message : String(error);

        eventBus.emit({
            type: "run_error",
            step: 1,
            stage: "model_generate",
            error: errorMessage,
        });

        throw error;
    }
}
