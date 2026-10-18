/**
 * 多智能体（协调者 + 只读专家）离线测试
 * ============================================================
 * 不依赖真实 LLM / 网络：用一个「按消息内容路由」的假 modelClient 精确编排
 * 协调者与专家的每一步决策，从而确定性地验证委派行为。
 *
 * 运行：
 *   node --import tsx --test test/subagent.test.ts
 * ============================================================
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { runLocalAgentLoop } from "../src/agent/run-local-agent-loop.js";
import type { AgentEvent, EventBus } from "../src/events/event-bus.js";
import type { Tool, ToolResult } from "../src/tools/types.js";
import type { ChatMessage } from "../src/memory/types.js";

// ---- 工具桩：记录每个工具被执行的次数 ------------------------------------
function makeTools(executed: string[]) {
    const t = (name: string, riskLevel: Tool["riskLevel"], output: unknown): Tool => ({
        name,
        description: `fake ${name}`,
        riskLevel,
        async execute(): Promise<ToolResult> {
            executed.push(name);
            return { success: true, output };
        },
    });
    return new Map<string, Tool>([
        ["read_file", t("read_file", "safe", { content: "hello" })],
        ["list_files", t("list_files", "safe", { files: [] })],
        ["grep_text", t("grep_text", "safe", { matches: [] })],
        ["write_file", t("write_file", "confirm", { path: "x" })],
        ["shell_exec", t("shell_exec", "dangerous", { stdout: "" })],
    ]);
}

function makeBus(events: AgentEvent[]): EventBus {
    return {
        emit: (e) => events.push(e),
        showProcessing() {},
        hideProcessing() {},
    };
}

// ---- 按 system prompt 内容判断当前是哪个 agent，按已有 assistant 数判断第几步 ----
type Role = "planner" | "specialist" | "coordinator";
function roleOf(messages: ChatMessage[]): Role {
    const sys = String(messages[0]?.content ?? "");
    if (sys.includes("任务规划助手")) return "planner";
    // 只在专家的身份句上匹配；协调者的工具清单里也会出现「子智能体」字样，不能用它判断。
    if (sys.includes("你是 Yuan-Claw 的一个子智能体")) return "specialist";
    return "coordinator";
}
const stepOf = (m: ChatMessage[]) => m.filter((x) => x.role === "assistant").length;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * 构造一个脚本化的假模型：
 * - planner：返回「不选任何技能」的合法规划 JSON（跳过真实规划调用）。
 * - coordinator：第 0 步发出给定的委派 tool_call，之后收尾为 final。
 * - specialist：可选地先尝试被禁工具（应被过滤为 Unknown tool），再用 read_file，最后 final。
 *   onEnter/onLeave 用于并发度计量。
 */
function makeModel(opts: {
    coordinatorFirstCall: Record<string, unknown>;
    coordinatorFinal: string;
    specialistTriesForbidden?: string[];
    specialistFinal?: string;
    onEnter?: () => void;
    onLeave?: () => void;
    specialistDelayMs?: number;
}) {
    let specialistTurnSeen = 0;
    return {
        async generate(messages: ChatMessage[]): Promise<string> {
            const role = roleOf(messages);
            const step = stepOf(messages);

            if (role === "planner") {
                return JSON.stringify({
                    taskAnalysis: "t",
                    selectedSkills: [],
                    needsTools: true,
                    plan: "p",
                });
            }

            if (role === "specialist") {
                const forbidden = opts.specialistTriesForbidden ?? [];
                if (step === 0) opts.onEnter?.();
                if (step < forbidden.length) {
                    if (step === 0 && opts.specialistDelayMs) await sleep(opts.specialistDelayMs);
                    return JSON.stringify({
                        type: "tool_call",
                        toolName: forbidden[step],
                        args: {},
                    });
                }
                // 用一次只读工具，然后收尾
                if (step === forbidden.length) {
                    if (forbidden.length === 0 && opts.specialistDelayMs) {
                        await sleep(opts.specialistDelayMs);
                    }
                    specialistTurnSeen += 1;
                    return JSON.stringify({
                        type: "tool_call",
                        toolName: "read_file",
                        args: { path: `f${specialistTurnSeen}` },
                    });
                }
                opts.onLeave?.();
                return JSON.stringify({
                    type: "final",
                    message: opts.specialistFinal ?? "专家结论：已完成只读调研",
                });
            }

            // coordinator
            if (step === 0) return JSON.stringify(opts.coordinatorFirstCall);
            return JSON.stringify({ type: "final", message: opts.coordinatorFinal });
        },
    };
}

// ==========================================================================
// 用例 1：spawn_agent 串行委派 + 只读过滤 + 深度上限
// ==========================================================================
test("spawn_agent: 协调者委派单个只读专家，专家拿不到写/执行/再委派工具", async () => {
    const executed: string[] = [];
    const events: AgentEvent[] = [];

    const result = await runLocalAgentLoop({
        userInput: "请调研代码库",
        modelClient: makeModel({
            coordinatorFirstCall: {
                type: "tool_call",
                toolName: "spawn_agent",
                args: { task: "调研 a.ts 的内容", role: "代码检索专家" },
            },
            coordinatorFinal: "协调者汇总：子智能体已完成调研。",
            // 专家先尝试 spawn_agent 与 write_file —— 都应被过滤（Unknown tool）
            specialistTriesForbidden: ["spawn_agent", "write_file"],
            specialistFinal: "专家结论：找到 hello，定位 a.ts:1",
        }),
        tools: makeTools(executed),
        eventBus: makeBus(events),
        maxSteps: 12,
        previousMessages: [],
        depth: 0,
        requestApproval: async () => "deny",
    });

    // (a) 协调者拿到专家的结论并收尾
    assert.equal(result.finalMessage, "协调者汇总：子智能体已完成调研。");

    // (b) 专家的只读工具被执行了恰好一次
    assert.equal(executed.filter((t) => t === "read_file").length, 1);

    // (c) 被禁工具从未真正执行（说明专家工具集被过滤为只读）
    assert.ok(!executed.includes("write_file"), "write_file 泄漏给了专家");
    assert.ok(!executed.includes("shell_exec"), "shell_exec 泄漏给了专家");

    // (d) 委派生命周期事件上报到父总线，且携带角色与提炼结论
    const start = events.find((e) => e.type === "subagent_start") as
        | Extract<AgentEvent, { type: "subagent_start" }>
        | undefined;
    const end = events.find((e) => e.type === "subagent_end") as
        | Extract<AgentEvent, { type: "subagent_end" }>
        | undefined;
    assert.ok(start, "缺少 subagent_start 事件");
    assert.equal(start?.agent, "代码检索专家");
    assert.ok(end, "缺少 subagent_end 事件");
    assert.equal(end?.success, true);
    assert.match(end?.result ?? "", /专家结论/);

    // (e) 深度上限=1：父总线上只应出现 1 次委派工具调用（专家自己的 spawn 尝试没到父总线）
    const spawnStarts = events.filter(
        (e) =>
            e.type === "tool_start" &&
            (e.toolName === "spawn_agent" || e.toolName === "spawn_agents"),
    );
    assert.equal(spawnStarts.length, 1, "深度上限被突破（出现了嵌套委派）");
});

// ==========================================================================
// 用例 2：spawn_agents 并发委派 —— 证明真并行 + fan-in 汇总
// ==========================================================================
test("spawn_agents: 三个独立子任务并发执行（并发度达到 3）并 fan-in 汇总", async () => {
    const executed: string[] = [];
    const events: AgentEvent[] = [];

    let active = 0;
    let maxActive = 0;

    const result = await runLocalAgentLoop({
        userInput: "并发调研 A/B/C",
        modelClient: makeModel({
            coordinatorFirstCall: {
                type: "tool_call",
                toolName: "spawn_agents",
                args: {
                    tasks: [
                        { task: "调研 A", role: "专家A" },
                        { task: "调研 B", role: "专家B" },
                        { task: "调研 C", role: "专家C" },
                    ],
                },
            },
            coordinatorFinal: "协调者汇总：三路并发调研完成。",
            specialistDelayMs: 30, // 制造重叠窗口
            onEnter: () => {
                active += 1;
                maxActive = Math.max(maxActive, active);
            },
            onLeave: () => {
                active -= 1;
            },
        }),
        tools: makeTools(executed),
        eventBus: makeBus(events),
        maxSteps: 12,
        previousMessages: [],
        depth: 0,
        requestApproval: async () => "deny",
    });

    assert.equal(result.finalMessage, "协调者汇总：三路并发调研完成。");

    // 三个专家各跑一次 read_file
    assert.equal(executed.filter((t) => t === "read_file").length, 3);

    // 三对生命周期事件
    assert.equal(events.filter((e) => e.type === "subagent_start").length, 3);
    assert.equal(events.filter((e) => e.type === "subagent_end").length, 3);

    // 并发证据：峰值同时活跃 3 个（若串行只会是 1）
    assert.equal(maxActive, 3, `期望并发度=3，实际=${maxActive}（可能是串行）`);

    // 父总线上只有 1 次 spawn_agents 调用
    const spawnStarts = events.filter(
        (e) =>
            e.type === "tool_start" &&
            (e.toolName === "spawn_agent" || e.toolName === "spawn_agents"),
    );
    assert.equal(spawnStarts.length, 1);
});

// ==========================================================================
// 用例 3：非法入参 —— spawn_agent 缺少 task 时安全返回失败，不拉起子循环
// ==========================================================================
test("spawn_agent: task 为空时返回失败且不委派", async () => {
    const executed: string[] = [];
    const events: AgentEvent[] = [];

    // 协调者第 0 步发出非法 spawn_agent（无 task），第 1 步会看到失败结果并收尾。
    const result = await runLocalAgentLoop({
        userInput: "触发非法委派",
        modelClient: makeModel({
            coordinatorFirstCall: {
                type: "tool_call",
                toolName: "spawn_agent",
                args: {},
            },
            coordinatorFinal: "已处理：委派参数非法。",
        }),
        tools: makeTools(executed),
        eventBus: makeBus(events),
        maxSteps: 12,
        previousMessages: [],
        depth: 0,
        requestApproval: async () => "deny",
    });

    assert.equal(result.finalMessage, "已处理：委派参数非法。");
    // 没有真正拉起专家：无 subagent_start，无只读工具执行
    assert.equal(events.filter((e) => e.type === "subagent_start").length, 0);
    assert.equal(executed.length, 0);
});
