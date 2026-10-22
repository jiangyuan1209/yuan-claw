import os from "node:os";
import path from "node:path";

export const MY_AGENT_DIR_NAME = ".yuan-claw";

export function getUserConfigDir(): string {
    return path.join(os.homedir(), MY_AGENT_DIR_NAME);
}

export function getUserSettingsPath(): string {
    return path.join(getUserConfigDir(), "settings.json");
}

/** 对话历史的绝对存储目录（不随启动目录变化） */
export function getUserHistoryDir(): string {
    return path.join(getUserConfigDir(), "history");
}

/** 工作区元数据的存储文件 */
export function getUserWorkspacesPath(): string {
    return path.join(getUserConfigDir(), "workspaces.json");
}