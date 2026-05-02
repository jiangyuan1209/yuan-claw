import os from "node:os";
import path from "node:path";

export const MY_AGENT_DIR_NAME = ".yuan-agent";

export function getUserConfigDir(): string {
    return path.join(os.homedir(), MY_AGENT_DIR_NAME);
}

export function getUserSettingsPath(): string {
    return path.join(getUserConfigDir(), "settings.json");
}