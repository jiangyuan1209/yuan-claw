import OpenAI from "openai";
import type { ChatMessage } from "../../memory/types.js";
import type { AppConfig } from "../../config/load-config.js";

type CreateOpenAICompatibleClientOptions = {
    model?: string;
    config?: AppConfig;
};

export function createOpenAICompatibleClient(
    options: CreateOpenAICompatibleClientOptions = {}
) {
    const config = options.config ?? {};

    const apiKey = config.MODEL_API_KEY

    const baseURL = config.MODEL_BASE_URL

    const model = config.MODEL_NAME ?? "gpt-4o-mini"

    if (!apiKey) {
        throw new Error(
            "Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables or ~/.my-agent/settings.json."
        );
    }

    const client = new OpenAI({
        apiKey,
        baseURL,
    });

    return {
        async generate(messages: ChatMessage[]): Promise<string> {
            const response = await client.chat.completions.create({
                model,
                messages: messages.map((message) => ({
                    role: message.role === "tool" ? "user" : message.role,
                    content: message.content,
                })),
                temperature: 0,
            });

            const text = response.choices[0]?.message?.content;

            if (typeof text !== "string" || !text.trim()) {
                throw new Error("Model returned empty content.");
            }

            return text;
        },
    };
}