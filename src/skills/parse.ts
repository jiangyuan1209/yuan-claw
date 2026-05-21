import matter from "gray-matter";
import type { SkillFrontmatter } from "./types.js";

export function parseSkillFile(content: string): {
    meta: SkillFrontmatter;
    body: string;
} {
    const parsed = matter(content);

    return {
        meta: (parsed.data ?? {}) as SkillFrontmatter,
        body: parsed.content.trim(),
    };
}