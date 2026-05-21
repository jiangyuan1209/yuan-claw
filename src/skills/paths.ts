import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export function getYuanClawHomeDir(): string {
    return path.join(os.homedir(), ".yuan-claw");
}

export function getSkillsDir(): string {
    return path.join(getYuanClawHomeDir(), "skills");
}

export async function ensureSkillsDir(): Promise<string> {
    const dir = getSkillsDir();
    await fs.mkdir(dir, { recursive: true });
    return dir;
}