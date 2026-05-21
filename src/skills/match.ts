import type { Skill, SkillMatchResult } from "./types.js";

function tokenize(input: string): string[] {
    return input
        .toLowerCase()
        .split(/[\s,，。.!?！？:：;；"'`“”‘’（）(){}\[\]<>\/\\|+-]+/g)
        .map((x) => x.trim())
        .filter(Boolean);
}

function includesAny(text: string, keywords: string[]): boolean {
    const lower = text.toLowerCase();
    return keywords.some((k) => lower.includes(k.toLowerCase()));
}

export function matchSkills(input: string, skills: Skill[]): SkillMatchResult {
    const q = input.trim().toLowerCase();
    if (!q) return { matched: [] };

    const tokens = tokenize(q);
    const scored: Array<{ skill: Skill; score: number }> = [];

    for (const skill of skills) {
        let score = 0;
        const name = skill.name.toLowerCase();
        const desc = skill.description.toLowerCase();
        const tags = skill.tags.map((t) => t.toLowerCase());

        if (q.includes(name)) score += 10;
        if (tokens.includes(name)) score += 8;

        for (const tag of tags) {
            if (q.includes(tag)) score += 6;
            if (tokens.includes(tag)) score += 4;
        }

        const descKeywords = desc
            .split(/[\s,，。.!?！？:：;；"'`“”‘’（）(){}\[\]<>\/\\|+-]+/g)
            .map((x) => x.trim())
            .filter((x) => x.length >= 3);

        let descHitCount = 0;
        for (const token of tokens) {
            if (descKeywords.includes(token)) {
                descHitCount += 1;
            }
        }
        score += Math.min(descHitCount, 3);

        // 特判：pdf skill
        if (name === "pdf") {
            if (includesAny(q, [".pdf", "pdf", "ocr", "表单", "合并pdf", "拆分pdf", "提取pdf"])) {
                score += 8;
            }
        }

        if (score > 0) {
            scored.push({ skill, score });
        }
    }

    scored.sort((a, b) => b.score - a.score);

    return {
        matched: scored.slice(0, 3).map((x) => x.skill),
        reason: scored.length ? `matched ${scored.length} skill(s)` : undefined,
    };
}