import fs from "node:fs/promises";
import { z } from "zod";
import { getUserSettingsPath } from "./config-path.js";

const userSettingsSchema = z.object({
    MODEL_API_KEY: z.string().optional(),
    MODEL_BASE_URL: z.string().optional(),
    MODEL_NAME: z.string().optional(),

    BAIDU_API_KEY: z.string().optional(),
    BAIDU_API_URL: z.string().optional(),

    /** 语音识别（STT）使用的 DashScope 实时 ASR 模型名，缺省为 fun-asr-realtime */
    STT_MODEL: z.string().optional(),
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