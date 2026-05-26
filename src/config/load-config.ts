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

    BAIDU_API_KEY: z.string().optional(),

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
    return await loadSettingsFile();
}