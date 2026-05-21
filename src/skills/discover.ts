import fs from "node:fs/promises";
import path from "node:path";
import { ensureSkillsDir } from "./paths.js";

export interface SkillDirEntry {
    dir: string;
    skillFile: string;
}

export async function discoverSkillDirs(): Promise<SkillDirEntry[]> {
    const skillsDir = await ensureSkillsDir();
    const entries = await fs.readdir(skillsDir, { withFileTypes: true });
    const result: SkillDirEntry[] = [];

    for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const dir = path.join(skillsDir, entry.name);
        const skillFile = path.join(dir, "SKILL.md");

        try {
            const stat = await fs.stat(skillFile);
            if (stat.isFile()) {
                result.push({ dir, skillFile });
            }
        } catch {
            // ignore dirs without SKILL.md
        }
    }

    return result;
}