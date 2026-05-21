import { loadSkills } from "./registry.js";
import { matchSkills } from "./match.js";
import { buildSkillsPrompt } from "./prompt.js";
import type { Skill } from "./types.js";

export class SkillsRuntime {
    private skills: Skill[] = [];

    async reload(): Promise<void> {
        this.skills = await loadSkills();
    }

    list(): Skill[] {
        return this.skills;
    }

    match(input: string): Skill[] {
        return matchSkills(input, this.skills).matched;
    }

    buildPromptForInput(input: string): string {
        const matched = this.match(input);
        return buildSkillsPrompt(matched);
    }
}