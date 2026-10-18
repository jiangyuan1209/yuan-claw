import type { EventBus } from "../events/event-bus.js";
import type { Tool, ToolResult } from "../tools/types.js";
import type {
    ApprovalMode,
    RunLocalAgentLoopParams,
} from "./run-local-agent-loop.js";

/**
 * 多智能体：单层「协调者 + 专家」子智能体
 * ============================================================
 * 模仿 OpenClaw 的协作模型：主协调者（depth=0 的 Agent 循环）在遇到需要大量
 * 检索/阅读/探索的子任务时，调用委派工具把任务交给只读的子智能体（专家）。
 * 专家拥有独立的上下文（全新的 messages），跑完后只把提炼后的结论作为工具结果
 * 回传给协调者——协调者看不到专家的中间步骤，从而保护自己的上下文不被撑爆。
 *
 * 提供两个委派工具：
 * - `spawn_agent`：委派**单个**专家，串行执行。
 * - `spawn_agents`：一次委派**多个**专家，用 Promise.all **并发**执行（编排层
 *   fan-out/fan-in，即业界「范式二」）。并行度由协调者显式决定，不依赖模型在
 *   一条消息里吐多个 tool_call，因此无需改动「每步一个工具」的核心循环协议。
 *
 * 关键约束（与 OpenClaw 一致）：
 * - **单层**：专家的工具集里不含 spawn_agent / spawn_agents，无法再往下委派
 *   （深度上限 = 1）。
 * - **只读**：专家仅获得 riskLevel 为 safe 的工具，不能写文件 / 执行命令，
 *   因此子循环无需接入审批链路。
 *
 * 依赖注入：本模块只在类型层面依赖 run-local-agent-loop（`import type`，编译后
 * 被擦除），真正的 `runLocalAgentLoop` 由调用方通过 deps.runLoop 注入，避免运行
 * 时的循环依赖。
 * ============================================================
 */

export const SPAWN_AGENT_TOOL_NAME = "spawn_agent";
export const SPAWN_AGENTS_TOOL_NAME = "spawn_agents";

/** 委派类工具名集合，用于从专家工具集中排除，硬保证单层。 */
const SPAWN_TOOL_NAMES = new Set([SPAWN_AGENT_TOOL_NAME, SPAWN_AGENTS_TOOL_NAME]);

/** 子智能体单次任务的步数上限，比协调者更紧，防止 runaway。 */
const DEFAULT_SUBAGENT_MAX_STEPS = 15;

/** `spawn_agents` 单批并发上限，防止协调者一次拉起过多子循环。 */
const MAX_PARALLEL_SUBAGENTS = 5;

const DEFAULT_ROLE = "通用研究助手";

type RunLoopFn = (
    params: RunLocalAgentLoopParams,
) => Promise<{ finalMessage: string; approvalMode: ApprovalMode }>;

type CreateSpawnAgentToolDeps = {
    /** 注入的 Agent 循环执行函数（即 runLocalAgentLoop 本身）。 */
    runLoop: RunLoopFn;
    /** 子智能体复用协调者的模型客户端。 */
    modelClient: RunLocalAgentLoopParams["modelClient"];
    /** 协调者的事件总线，用于上报 subagent_start / subagent_end。 */
    parentEventBus: EventBus;
    /** 协调者的完整工具表，用于筛选出只读子集交给专家。 */
    allTools: Map<string, Tool>;
    /** 当前深度（协调者为 0），子智能体将以 depth+1 运行。 */
    depth: number;
    /** 可覆盖的子智能体步数上限。 */
    maxSteps?: number;
};

/** 单个子智能体的执行结果（成功或失败），用于 fan-in 汇总。 */
type SubagentOutcome = {
    agent: string;
    task: string;
    success: boolean;
    result?: string;
    error?: string;
};

/**
 * 选出可交给只读专家的工具：riskLevel 为 safe（缺省视为 safe），且排除
 * spawn_agent / spawn_agents 本身（保证单层，专家不能再委派）。
 */
function selectSubagentTools(allTools: Map<string, Tool>): Map<string, Tool> {
    const subset = new Map<string, Tool>();
    for (const [name, tool] of allTools) {
        if (SPAWN_TOOL_NAMES.has(name)) {
            continue;
        }
        const risk = tool.riskLevel ?? "safe";
        if (risk === "safe") {
            subset.set(name, tool);
        }
    }
    return subset;
}

/**
 * 子智能体使用一个静默事件总线：内部步骤不外泄到主 UI，避免与协调者的输出
 * 混淆（协调者只通过 subagent_start / subagent_end 与工具结果感知专家）。
 */
function createSilentEventBus(): EventBus {
    return {
        emit() {},
        showProcessing() {},
        hideProcessing() {},
    };
}

function truncate(text: string, max: number): string {
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function normalizeRole(role: unknown): string {
    return typeof role === "string" && role.trim() ? role.trim() : DEFAULT_ROLE;
}

/**
 * 运行单个只读子智能体，并向协调者的事件总线上报 start/end。
 * 无论成功失败都返回一个 SubagentOutcome（不抛出），便于并发时统一 fan-in。
 */
async function runSubagent(
    deps: CreateSpawnAgentToolDeps,
    subagentTools: Map<string, Tool>,
    subagentMaxSteps: number,
    task: string,
    role: string,
): Promise<SubagentOutcome> {
    const shortTask = truncate(task, 200);

    deps.parentEventBus.emit({
        type: "subagent_start",
        agent: role,
        task: shortTask,
    });

    try {
        const result = await deps.runLoop({
            userInput: task,
            modelClient: deps.modelClient,
            tools: subagentTools,
            eventBus: createSilentEventBus(),
            maxSteps: subagentMaxSteps,
            // 专家从零开始，不继承协调者的对话历史（这正是上下文隔离的意义）。
            previousMessages: [],
            depth: deps.depth + 1,
            agentRole: role,
            // 硬保证单层：专家不再获得 spawn_agent / spawn_agents。
            enableSubagents: false,
        });

        deps.parentEventBus.emit({
            type: "subagent_end",
            agent: role,
            success: true,
            result: truncate(result.finalMessage, 300),
        });

        return {
            agent: role,
            task: shortTask,
            success: true,
            result: result.finalMessage,
        };
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        deps.parentEventBus.emit({
            type: "subagent_end",
            agent: role,
            success: false,
            error: message,
        });
        return {
            agent: role,
            task: shortTask,
            success: false,
            error: message,
        };
    }
}

/**
 * ===== spawn_agent：委派单个只读子智能体（串行） =====
 */
export function createSpawnAgentTool(deps: CreateSpawnAgentToolDeps): Tool {
    const subagentTools = selectSubagentTools(deps.allTools);
    const subagentMaxSteps = deps.maxSteps ?? DEFAULT_SUBAGENT_MAX_STEPS;

    return {
        name: SPAWN_AGENT_TOOL_NAME,
        // 委派本身无副作用（专家只读），故为 safe，无需确认。
        riskLevel: "safe",
        description:
            "委派一个只读子智能体（专家）独立完成一个子任务，适合需要大量检索/阅读/探索的工作。" +
            "子智能体拥有独立上下文，只回传提炼后的结论，不会污染你的对话历史。" +
            "参数: task (string, 必填): 交给子智能体的完整、自包含的子任务描述——它看不到你们的对话历史，必须把必要背景写清楚; " +
            'role (string, 可选): 子智能体的角色定位，如 "代码检索专家"、"依赖调研专家"，缺省为通用研究助手。',
        async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
            const args = rawArgs as { task?: unknown; role?: unknown };

            const task = typeof args.task === "string" ? args.task.trim() : "";
            if (!task) {
                return {
                    success: false,
                    error: 'spawn_agent 需要非空的字符串参数 "task"。',
                };
            }

            if (subagentTools.size === 0) {
                return {
                    success: false,
                    error: "没有可供子智能体使用的只读工具，无法委派。",
                };
            }

            const role = normalizeRole(args.role);
            const outcome = await runSubagent(
                deps,
                subagentTools,
                subagentMaxSteps,
                task,
                role,
            );

            if (!outcome.success) {
                return {
                    success: false,
                    error: `子智能体[${role}]执行失败: ${outcome.error}`,
                };
            }

            return {
                success: true,
                output: {
                    agent: outcome.agent,
                    task: outcome.task,
                    result: outcome.result,
                },
            };
        },
    };
}

/**
 * ===== spawn_agents：并发委派多个只读子智能体（编排层 fan-out/fan-in） =====
 *
 * 协调者一次给出多个彼此独立的子任务，本工具用 Promise.all 并发拉起多个专家，
 * 全部完成后把各自提炼的结论汇总回传。适合「同时调研 A、B、C 三块」这类可并行
 * 且互不依赖的场景；有依赖关系的步骤应改用多次 spawn_agent 串行处理。
 */
export function createSpawnAgentsTool(deps: CreateSpawnAgentToolDeps): Tool {
    const subagentTools = selectSubagentTools(deps.allTools);
    const subagentMaxSteps = deps.maxSteps ?? DEFAULT_SUBAGENT_MAX_STEPS;

    return {
        name: SPAWN_AGENTS_TOOL_NAME,
        riskLevel: "safe",
        description:
            "并发委派多个只读子智能体（专家）同时完成多个彼此独立的子任务，全部完成后汇总回传各自结论。" +
            "适合可并行、互不依赖的调研（如同时排查三个模块）；若子任务之间有先后依赖，请改用 spawn_agent 串行委派。" +
            `单批最多并发 ${MAX_PARALLEL_SUBAGENTS} 个。` +
            "参数: tasks (array, 必填): 每个元素为 {task: string(必填,自包含的子任务描述), role?: string(可选,角色定位)}。",
        async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
            const args = rawArgs as { tasks?: unknown };

            if (!Array.isArray(args.tasks) || args.tasks.length === 0) {
                return {
                    success: false,
                    error: 'spawn_agents 需要非空数组参数 "tasks"，每个元素形如 {task, role?}。',
                };
            }

            // 规范化并校验每一项，过滤掉缺少 task 的非法项。
            const jobs: { task: string; role: string }[] = [];
            for (const item of args.tasks) {
                const record = (item ?? {}) as { task?: unknown; role?: unknown };
                const task =
                    typeof record.task === "string" ? record.task.trim() : "";
                if (task) {
                    jobs.push({ task, role: normalizeRole(record.role) });
                }
            }

            if (jobs.length === 0) {
                return {
                    success: false,
                    error: 'spawn_agents 的 "tasks" 中没有任何包含非空字符串 task 的有效项。',
                };
            }

            if (subagentTools.size === 0) {
                return {
                    success: false,
                    error: "没有可供子智能体使用的只读工具，无法委派。",
                };
            }

            const truncated = jobs.length > MAX_PARALLEL_SUBAGENTS;
            const batch = jobs.slice(0, MAX_PARALLEL_SUBAGENTS);

            // 并发 fan-out；runSubagent 内部已捕获异常，故用 Promise.all 即可。
            const outcomes = await Promise.all(
                batch.map((job) =>
                    runSubagent(
                        deps,
                        subagentTools,
                        subagentMaxSteps,
                        job.task,
                        job.role,
                    ),
                ),
            );

            const succeeded = outcomes.filter((o) => o.success).length;

            // fan-in：委派机制本身已执行完毕，统一以 success:true 回传，逐项状态
            // 放在 results[].success 里交给协调者判断（部分/全部失败都在此体现）。
            return {
                success: true,
                output: {
                    count: outcomes.length,
                    succeeded,
                    failed: outcomes.length - succeeded,
                    ...(truncated
                        ? {
                            note: `提供的任务数超过并发上限 ${MAX_PARALLEL_SUBAGENTS}，仅执行了前 ${MAX_PARALLEL_SUBAGENTS} 个。`,
                        }
                        : {}),
                    results: outcomes,
                },
            };
        },
    };
}
