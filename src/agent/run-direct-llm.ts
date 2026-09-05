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
    previousMessages?: ChatMessage[];
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
