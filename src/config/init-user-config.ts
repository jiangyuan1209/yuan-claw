import fs from "node:fs/promises";
import { getUserConfigDir, getUserSettingsPath } from "./config-path.js";

const DEFAULT_SETTINGS = {
    MODEL_API_KEY: "",
    MODEL_BASE_URL: "",
    MODEL_NAME: "gpt-4o-mini",
    OPENAI_API_KEY: "",
    OPENAI_BASE_URL: "",
    OPENAI_MODEL: "",
    BRAVE_SEARCH_API_KEY: "",
    BRAVE_API_KEY: "",
    HTTP_PROXY: "",
    HTTPS_PROXY: "",
};

export async function ensureUserConfigInitialized(): Promise<{
    createdDir: boolean;
    createdSettings: boolean;
    settingsPath: string;
}> {
    const configDir = getUserConfigDir();
    const settingsPath = getUserSettingsPath();

    let createdDir = false;
    let createdSettings = false;

    try {
        await fs.mkdir(configDir, { recursive: true });
        createdDir = true;
    } catch {
        // ignore
    }

    try {
        await fs.access(settingsPath);
    } catch {
        await fs.writeFile(
            settingsPath,
            JSON.stringify(DEFAULT_SETTINGS, null, 2) + "\n",
            "utf-8"
        );
        createdSettings = true;
    }

    return {
        createdDir,
        createdSettings,
        settingsPath,
    };
}