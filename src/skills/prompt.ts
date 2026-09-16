import type { Skill } from "./types.js";

export function buildSkillsPrompt(skills: Skill[]): string {
    if (!skills.length) return "";

    const parts = skills.map((skill) => {
        const lines: string[] = [];

        lines.push(`Skill Name: ${skill.name}`);
        lines.push(`Skill Directory: ${skill.dir}`);
        if (skill.description) lines.push(`Description: ${skill.description}`);
        if (skill.tags.length) lines.push(`Tags: ${skill.tags.join(", ")}`);
        if (skill.license) lines.push(`License: ${skill.license}`);
        lines.push("");
        lines.push(`NOTE: Scripts and resources referenced in this skill are located relative to the skill directory above. Use absolute paths (e.g., ${skill.dir}/scripts/xxx.py) when executing them.`);
        lines.push("");
        lines.push("[SKILL CONTENT BEGIN]");
        lines.push(skill.body);
        lines.push("[SKILL CONTENT END]");

        return lines.join("\n");
    });

    return [
        "You have access to the following local skills.",
        "Use them when they are relevant to the user's request.",
        "If a skill contains procedures, best practices, or tool suggestions, follow them.",
        "",
        ...parts,
    ].join("\n");
}