import OpenAI from "openai";
import type { ChatMessage } from "../../memory/types.js";

type CreateOpenAICompatibleClientOptions = {
    model?: string;
};

export function createOpenAICompatibleClient(
    options: CreateOpenAICompatibleClientOptions = {}
) {
    const apiKey = process.env.MODEL_API_KEY ?? process.env.OPENAI_API_KEY;
    const baseURL = process.env.MODEL_BASE_URL ?? process.env.OPENAI_BASE_URL;
    const model =
        options.model ??
        process.env.MODEL_NAME ??
        process.env.OPENAI_MODEL ??
        "gpt-4o-mini";

    if (!apiKey) {
        throw new Error(
            "Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables."
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