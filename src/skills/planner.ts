import type { ChatMessage } from "../memory/types.js";
import type { Tool } from "../tools/types.js";
import type { Skill, PlanResult } from "./types.js";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

/**
 * ===== Skill 元数据摘要 =====
 *
 * 为规划提示词生成 skill 的简短描述（仅 name + description + tags），
 * 不包含 skill body 的完整内容，保持规划调用的上下文轻量。
 */
export function buildSkillSummary(skills: Skill[]): string {
    if (skills.length === 0) {
        return "（暂无可用技能）";
    }

    return skills
        .map((skill) => {
            const parts = [`- ${skill.name}`];
            if (skill.description) {
                parts.push(`: ${skill.description}`);
            }
            if (skill.tags.length > 0) {
                parts.push(` (标签: ${skill.tags.join(", ")})`);
            }
            return parts.join("");
        })
        .join("\n");
}

/**
 * ===== 工具摘要 =====
 *
 * 为规划提示词生成工具的简短描述（name + risk level + description）。
 */
function buildToolSummary(tools: Tool[]): string {
    if (tools.length === 0) {
        return "（暂无可用工具）";
    }

    return tools
        .map((tool) => {
            const risk = tool.riskLevel ?? "safe";
            return `- ${tool.name} [${risk}]: ${tool.description}`;
        })
        .join("\n");
}

/**
 * ===== 构建规划提示词 =====
 *
 * 规划提示词的目标：让 LLM 分析用户意图，从可用 skill 中选择需要加载的 skill。
 * 工具列表也展示给 LLM，帮助它理解 agent 的能力边界，从而更好地选择 skill。
 * 但工具选择不在规划阶段决定——所有工具在主循环中始终可用，由 LLM 逐步决定。
 */
export function buildPlannerPrompt(
    userInput: string,
    tools: Tool[],
    skills: Skill[],
): string {
    return [
        "你是一个任务规划助手。根据用户的输入，分析任务意图，并从可用的技能中选择需要加载的技能。",
        "",
        "说明：",
        "- 技能（Skills）是领域知识和操作规程，加载后会指导 Agent 如何完成特定类型的任务。",
        "- 工具（Tools）是 Agent 的执行能力，始终可用，无需在此阶段选择。",
        "- 你只需要决定哪些技能的完整内容需要加载到 Agent 的系统提示词中。",
        "- 如果没有技能与任务相关，selectedSkills 返回空数组即可。",
        "",
        "## 用户输入",
        userInput,
        "",
        "## 可用工具（仅供参考，无需选择）",
        buildToolSummary(tools),
        "",
        "## 可用技能（请从中选择需要加载的）",
        buildSkillSummary(skills),
        "",
        "请分析用户意图并返回严格的 JSON 格式，不要输出任何其他内容：",
        "{",
        '  "taskAnalysis": "对用户任务的简短分析",',
        '  "selectedSkills": ["需要加载的技能名称，不需要则为空数组"],',
        '  "needsTools": true,',
        '  "plan": "执行计划的简短描述"',
        "}",
    ].join("\n");
}

/**
 * ===== 解析规划响应 =====
 *
 * 尝试从 LLM 的原始输出中提取并解析 JSON。
 * 支持三种情况：
 * 1. 纯 JSON 输出
 * 2. JSON 被 markdown 代码块包裹
 * 3. JSON 嵌在其他文本中（正则提取第一个 {...} 块）
 *
 * 解析失败时返回 null。
 */
export function parsePlanResponse(raw: string): PlanResult | null {
    const trimmed = raw.trim();

    // 尝试直接解析
    try {
        const parsed = JSON.parse(trimmed);
        if (isValidPlanResult(parsed)) {
            return parsed;
        }
    } catch {
        // 继续尝试其他方式
    }

    // 尝试提取 markdown 代码块中的 JSON
    const codeBlockMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
    if (codeBlockMatch) {
        try {
            const parsed = JSON.parse(codeBlockMatch[1].trim());
            if (isValidPlanResult(parsed)) {
                return parsed;
            }
        } catch {
            // 继续尝试
        }
    }

    // 尝试提取第一个 {...} 块
    const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
        try {
            const parsed = JSON.parse(jsonMatch[0]);
            if (isValidPlanResult(parsed)) {
                return parsed;
            }
        } catch {
            // 最终失败
        }
    }

    return null;
}

function isValidPlanResult(obj: unknown): obj is PlanResult {
    if (typeof obj !== "object" || obj === null) return false;
    const record = obj as Record<string, unknown>;
    return (
        typeof record.taskAnalysis === "string" &&
        Array.isArray(record.selectedSkills) &&
        record.selectedSkills.every((s) => typeof s === "string") &&
        typeof record.needsTools === "boolean" &&
        typeof record.plan === "string"
    );
}

/**
 * ===== 超时包装器 =====
 *
 * 给 Promise 加一个超时限制，防止 LLM API 调用无限阻塞。
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
    return new Promise<T>((resolve, reject) => {
        const timer = setTimeout(() => {
            reject(new Error(`${label} timed out after ${timeoutMs}ms`));
        }, timeoutMs);

        promise.then(
            (result) => {
                clearTimeout(timer);
                resolve(result);
            },
            (error) => {
                clearTimeout(timer);
                reject(error);
            },
        );
    });
}

/**
 * ===== 执行规划 =====
 *
 * 调用 LLM 进行任务规划，分析用户输入并选择需要加载的 skill。
 * 规划失败时返回 null，由调用方决定降级策略。
 *
 * 带 30 秒超时保护，防止 LLM API 调用无限阻塞。
 */
export async function planTask(
    userInput: string,
    tools: Tool[],
    skills: Skill[],
    modelClient: ModelClient,
    timeoutMs = 30000,
): Promise<PlanResult | null> {
    if (skills.length === 0) {
        return null;
    }

    const planMessages: ChatMessage[] = [
        {
            role: "system",
            content: buildPlannerPrompt(userInput, tools, skills),
        },
        {
            role: "user",
            content: userInput,
        },
    ];

    console.error(`[planner] 开始规划调用 (${skills.length} 个 skill, 超时 ${timeoutMs}ms)...`);
    const startTime = Date.now();

    const rawResponse = await withTimeout(
        modelClient.generate(planMessages),
        timeoutMs,
        "Skill planning LLM call",
    );

    const elapsed = Date.now() - startTime;
    console.error(`[planner] 规划调用完成 (${elapsed}ms), 响应长度: ${rawResponse.length} 字符`);

    const result = parsePlanResponse(rawResponse);
    if (!result) {
        console.error(`[planner] 警告: 规划响应解析失败, 原始内容前 200 字符: ${rawResponse.slice(0, 200)}`);
    } else {
        console.error(`[planner] 规划结果: 选中 ${result.selectedSkills.length} 个 skill [${result.selectedSkills.join(", ")}]`);
    }

    return result;
}
