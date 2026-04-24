import { createOpenAICompatibleClient } from "./providers/openai-compatible.js";

export function createModelClient() {
    const baseURL = process.env.MODEL_BASE_URL;
    const apiKey = process.env.MODEL_API_KEY;
    const model = process.env.MODEL_NAME;

    if (!baseURL) {
        throw new Error("Missing MODEL_BASE_URL");
    }

    if (!apiKey) {
        throw new Error("Missing MODEL_API_KEY");
    }

    if (!model) {
        throw new Error("Missing MODEL_NAME");
    }

    return createOpenAICompatibleClient({
        baseURL,
        apiKey,
        model,
    });
}