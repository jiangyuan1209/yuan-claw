import type { AppConfig } from "../config/load-config.js";
import { createOpenAICompatibleClient } from "./providers/openai-compatible.js";

type CreateModelClientOptions = {
    model?: string;
    config?: AppConfig;
};

export function createModelClient(options: CreateModelClientOptions = {}) {
    return createOpenAICompatibleClient({
        model: options.model,
        config: options.config,
    });
}