import fs from "node:fs/promises";
import { z } from "zod";
import { getUserSettingsPath } from "./config-path.js";

const userSettingsSchema = z.object({
    MODEL_API_KEY: z.string().optional(),
    MODEL_BASE_URL: z.string().optional(),
    MODEL_NAME: z.string().optional(),

    OPENAI_API_KEY: z.string().optional(),
    OPENAI_BASE_URL: z.string().optional(),
    OPENAI_MODEL: z.string().optional(),

    BRAVE_SEARCH_API_KEY: z.string().optional(),
    BRAVE_API_KEY: z.string().optional(),

    HTTP_PROXY: z.string().optional(),
    HTTPS_PROXY: z.string().optional(),
    http_proxy: z.string().optional(),
    https_proxy: z.string().optional(),
});

export type AppConfig = z.infer<typeof userSettingsSchema>;

async function loadSettingsFile(): Promise<AppConfig> {
    const settingsPath = getUserSettingsPath();

    try {
        const raw = await fs.readFile(settingsPath, "utf-8");
        const json = JSON.parse(raw);
        return userSettingsSchema.parse(json);
    } catch {
        return {};
    }
}

export async function loadAppConfig(): Promise<AppConfig> {
    const fileConfig = await loadSettingsFile();

    return {
        ...fileConfig,

        MODEL_API_KEY: process.env.MODEL_API_KEY ?? fileConfig.MODEL_API_KEY,
        MODEL_BASE_URL: process.env.MODEL_BASE_URL ?? fileConfig.MODEL_BASE_URL,
        MODEL_NAME: process.env.MODEL_NAME ?? fileConfig.MODEL_NAME,

        OPENAI_API_KEY: process.env.OPENAI_API_KEY ?? fileConfig.OPENAI_API_KEY,
        OPENAI_BASE_URL: process.env.OPENAI_BASE_URL ?? fileConfig.OPENAI_BASE_URL,
        OPENAI_MODEL: process.env.OPENAI_MODEL ?? fileConfig.OPENAI_MODEL,

        BRAVE_SEARCH_API_KEY:
            process.env.BRAVE_SEARCH_API_KEY ?? fileConfig.BRAVE_SEARCH_API_KEY,
        BRAVE_API_KEY: process.env.BRAVE_API_KEY ?? fileConfig.BRAVE_API_KEY,

        HTTP_PROXY: process.env.HTTP_PROXY ?? fileConfig.HTTP_PROXY,
        HTTPS_PROXY: process.env.HTTPS_PROXY ?? fileConfig.HTTPS_PROXY,
        http_proxy: process.env.http_proxy ?? fileConfig.http_proxy,
        https_proxy: process.env.https_proxy ?? fileConfig.https_proxy,
    };
}