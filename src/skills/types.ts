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

/**
 * ===== LLM 任务规划结果 =====
 *
 * 由规划 LLM 在 Agent 循环前分析用户输入后返回。
 * - taskAnalysis: 对用户任务的简短分析
 * - selectedSkills: 需要加载完整内容的 skill 名称列表（可为空）
 * - needsTools: 是否需要使用工具（信息性字段，供日志/调试使用）
 * - plan: 执行计划的简短描述，会注入系统提示词引导主循环
 */
export interface PlanResult {
    taskAnalysis: string;
    selectedSkills: string[];
    needsTools: boolean;
    plan: string;
}