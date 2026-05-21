import fs from "node:fs/promises";
import path from "node:path";
import { discoverSkillDirs } from "./discover.js";
import { parseSkillFile } from "./parse.js";
import type { Skill } from "./types.js";

function normalizeTags(input: unknown): string[] {
    if (!Array.isArray(input)) return [];
    return input
        .filter((x): x is string => typeof x === "string")
        .map((x) => x.trim())
        .filter(Boolean);
}

function fallbackNameFromDir(dir: string): string {
    return path.basename(dir);
}

export async function loadSkills(): Promise<Skill[]> {
    const discovered = await discoverSkillDirs();
    const skills: Skill[] = [];

    for (const item of discovered) {
        try {
            const raw = await fs.readFile(item.skillFile, "utf8");
            const { meta, body } = parseSkillFile(raw);

            const name = (meta.name?.trim() || fallbackNameFromDir(item.dir)).trim();
            const description = (meta.description?.trim() || "").trim();

            skills.push({
                name,
                description,
                license: meta.license?.trim(),
                version: meta.version?.trim(),
                tags: normalizeTags(meta.tags),
                dir: item.dir,
                skillFile: item.skillFile,
                body,
                raw,
            });
        } catch {
            // ignore invalid skill files
        }
    }

    skills.sort((a, b) => a.name.localeCompare(b.name));
    return skills;
}