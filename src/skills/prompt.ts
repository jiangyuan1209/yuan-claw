import type { Skill } from "./types.js";

export function buildSkillsPrompt(skills: Skill[]): string {
    if (!skills.length) return "";

    const parts = skills.map((skill) => {
        const lines: string[] = [];

        lines.push(`技能名称: ${skill.name}`);
        lines.push(`技能目录: ${skill.dir}`);
        if (skill.description) lines.push(`描述: ${skill.description}`);
        if (skill.tags.length) lines.push(`标签: ${skill.tags.join(", ")}`);
        if (skill.license) lines.push(`许可证: ${skill.license}`);
        lines.push("");
        lines.push(`注意: 此技能中引用的脚本和资源位于上述技能目录中。执行时请使用绝对路径（例如 ${skill.dir}/scripts/xxx.py）。`);
        lines.push("");
        lines.push("[技能内容开始]");
        lines.push(skill.body);
        lines.push("[技能内容结束]");

        return lines.join("\n");
    });

    return [
        "你可以使用以下本地技能。",
        "当用户的请求与某个技能相关时，请参考该技能中的内容和指导。",
        "如果技能中包含操作步骤、最佳实践或工具使用建议，请遵循它们。",
        "",
        ...parts,
    ].join("\n");
}