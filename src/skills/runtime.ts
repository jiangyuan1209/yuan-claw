import type { ChatMessage } from "../memory/types.js";
import type { Tool } from "../tools/types.js";
import type { EventBus } from "../events/event-bus.js";
import { loadSkills } from "./registry.js";
import { matchSkills } from "./match.js";
import { buildSkillsPrompt } from "./prompt.js";
import { planTask } from "./planner.js";
import type { Skill } from "./types.js";

type ModelClient = {
    generate: (messages: ChatMessage[]) => Promise<string>;
};

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

    /**
     * @deprecated 使用 planAndBuildPrompt 代替。保留此方法作为降级备选。
     */
    buildPromptForInput(input: string): string {
        const matched = this.match(input);
        return buildSkillsPrompt(matched);
    }

    /**
     * ===== LLM 规划驱动的 Skill 提示词构建 =====
     *
     * 流程：
     * 1. 调用 planTask() 让 LLM 分析用户输入，选择需要加载的 skill
     * 2. 根据规划结果过滤出选中的 skill
     * 3. 构建包含规划信息和选中 skill 完整内容的提示词
     *
     * 降级策略：
     * - 如果没有 skill 可用 → 返回空字符串
     * - 如果规划调用失败（LLM 异常或 JSON 解析失败）→ 降级为加载所有 skill（最多 3 个）
     * - 如果规划结果中的 skill 名称找不到对应 skill → 跳过不存在的，加载能找到的
     */
    async planAndBuildPrompt(
        userInput: string,
        tools: Tool[],
        modelClient: ModelClient,
        eventBus?: EventBus,
    ): Promise<string> {
        if (this.skills.length === 0) {
            return "";
        }

        let selectedSkillNames: string[] | null = null;
        let planSummary = "";
        let taskAnalysis = "";
        let isFallback = false;

        try {
            const planResult = await planTask(
                userInput,
                tools,
                this.skills,
                modelClient,
            );

            if (planResult) {
                selectedSkillNames = planResult.selectedSkills;
                planSummary = planResult.plan;
                taskAnalysis = planResult.taskAnalysis;
            }
        } catch (error) {
            // 规划调用失败，输出错误日志后降级处理（selectedSkillNames 保持 null）
            isFallback = true;
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`[skills] 规划调用失败，降级加载所有 skill (最多 3 个): ${errorMessage}`);
        }

        // 根据规划结果过滤 skill
        let matchedSkills: Skill[];
        if (selectedSkillNames === null) {
            // 降级：加载所有 skill（最多 3 个）
            isFallback = true;
            matchedSkills = this.skills.slice(0, 3);
            selectedSkillNames = matchedSkills.map((s) => s.name);
            taskAnalysis = taskAnalysis || "规划失败，使用降级策略";
            planSummary = planSummary || "加载默认 skill";
        } else if (selectedSkillNames.length === 0) {
            // 规划明确不需要任何 skill — 仍然发射事件让用户看到
            eventBus?.emit({
                type: "planning",
                selectedSkills: [],
                plan: planSummary,
                taskAnalysis,
                fallback: isFallback,
            });
            return "";
        } else {
            // 按规划结果过滤，保持 skills 数组的原始顺序
            const nameSet = new Set(selectedSkillNames);
            matchedSkills = this.skills.filter((s) => nameSet.has(s.name));
        }

        // 发射规划事件供 debug 模式显示
        eventBus?.emit({
            type: "planning",
            selectedSkills: matchedSkills.map((s) => s.name),
            plan: planSummary,
            taskAnalysis,
            fallback: isFallback,
        });

        const skillsPrompt = buildSkillsPrompt(matchedSkills);

        // 如果有规划信息，将其作为引导前缀注入
        if (planSummary && skillsPrompt) {
            return [
                `任务规划: ${planSummary}`,
                "",
                skillsPrompt,
            ].join("\n");
        }

        return skillsPrompt;
    }
}