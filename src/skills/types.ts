export interface SkillFrontmatter {
    name?: string;
    description?: string;
    license?: string;
    version?: string;
    tags?: string[];
}

export interface Skill {
    name: string;
    description: string;
    license?: string;
    version?: string;
    tags: string[];
    dir: string;
    skillFile: string;
    body: string;
    raw: string;
}

export interface SkillMatchResult {
    matched: Skill[];
    reason?: string;
}