import type { ChatMessage } from "../../memory/types.js";

export type OpenAICompatibleClientOptions = {
    baseURL: string;
    apiKey: string;
    model: string;
};

export type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

export function createOpenAICompatibleClient(
    options: OpenAICompatibleClientOptions
): ModelClient {
    return {
        async generate(messages: ChatMessage[]) {
            const response = await fetch(`${options.baseURL}/chat/completions`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${options.apiKey}`,
                },
                body: JSON.stringify({
                    model: options.model,
                    temperature: 0.2,
                    response_format: { type: "json_object" },
                    messages: messages.map((m) => ({
                        role: m.role === "tool" ? "assistant" : m.role,
                        content: m.content,
                    })),
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                throw new Error(
                    `Model API error: ${response.status} ${response.statusText}\n${text}`
                );
            }

            const data = await response.json();

            const content = data?.choices?.[0]?.message?.content;
            if (typeof content !== "string" || !content.trim()) {
                throw new Error("Model API returned empty content");
            }

            return content;
        },
    };
}