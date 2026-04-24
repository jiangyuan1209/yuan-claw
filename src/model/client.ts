import { createOpenAICompatibleClient } from "./providers/openai-compatible.js";

type CreateModelClientOptions = {
    model?: string;
};

export function createModelClient(options: CreateModelClientOptions = {}) {
    return createOpenAICompatibleClient({
        model: options.model,
    });
}