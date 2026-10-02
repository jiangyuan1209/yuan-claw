/**
 * 测试历史对话压缩机制
 *
 * 运行方式：npx tsx src/agent/__tests__/test-compress-history.ts
 *
 * 测试内容：
 *   1. 短对话（< 100k 字符）不触发压缩
 *   2. 长对话（> 100k 字符）触发 LLM 压缩
 *   3. 压缩后保留最近 6 条消息原文
 *   4. 压缩失败时降级处理
 */

import { compressHistoryIfNeeded } from "../compress-history.js";
import type { ChatMessage } from "../../memory/types.js";

// 模拟 ModelClient
function createMockModelClient(response: string, shouldFail = false) {
    let callCount = 0;
    return {
        generate: async (messages: ChatMessage[]): Promise<string> => {
            callCount++;
            if (shouldFail) {
                throw new Error("Mock: model unavailable");
            }
            console.log(`  [Mock LLM] 收到 ${messages.length} 条消息，正在压缩...`);
            return response;
        },
        getCallCount: () => callCount,
    };
}

// 生成指定字符数的填充文本
function generateFiller(chars: number): string {
    const base = "这是一段用于测试的对话内容，包含一些技术讨论和代码片段。";
    let result = "";
    while (result.length < chars) {
        result += base;
    }
    return result.slice(0, chars);
}

// 生成长对话历史
function generateLongHistory(totalChars: number): ChatMessage[] {
    const messages: ChatMessage[] = [];
    const perMessage = 5000; // 每条消息约 5000 字符
    const count = Math.ceil(totalChars / perMessage);

    for (let i = 0; i < count; i++) {
        if (i % 2 === 0) {
            messages.push({
                role: "user",
                content: `[用户消息 #${i}] ${generateFiller(perMessage)}`,
            });
        } else {
            messages.push({
                role: "assistant",
                content: `[助手回复 #${i}] ${generateFiller(perMessage)}`,
            });
        }
    }
    return messages;
}

function countChars(messages: ChatMessage[]): number {
    return messages.reduce((sum, m) => {
        if (typeof m.content === "string") return sum + m.content.length;
        return sum;
    }, 0);
}

async function test1_shortHistory_noCompression() {
    console.log("\n=== 测试 1: 短对话不触发压缩 ===");

    const messages: ChatMessage[] = [
        { role: "user", content: "你好" },
        { role: "assistant", content: "你好！有什么可以帮助你的？" },
        { role: "user", content: "帮我写一个排序算法" },
        { role: "assistant", content: "好的，这是一个快速排序的实现..." },
    ];

    const mockClient = createMockModelClient("compressed");
    const result = await compressHistoryIfNeeded(messages, mockClient);

    console.log(`  输入: ${messages.length} 条消息, ${countChars(messages)} 字符`);
    console.log(`  输出: ${result.length} 条消息, ${countChars(result)} 字符`);
    console.log(`  LLM 调用次数: ${mockClient.getCallCount()}`);

    const pass = result === messages && mockClient.getCallCount() === 0;
    console.log(`  结果: ${pass ? "✅ PASS" : "❌ FAIL"} — 短对话未触发压缩`);
    return pass;
}

async function test2_longHistory_triggersCompression() {
    console.log("\n=== 测试 2: 长对话触发 LLM 压缩 ===");

    const messages = generateLongHistory(120_000); // 120k 字符，超过 100k 阈值
    const compressedSummary = `## 对话摘要

### 用户目标
用户请求帮助编写排序算法和讨论技术方案。

### 关键上下文
- 讨论了快速排序、归并排序等多种排序算法
- 涉及 TypeScript 和 Python 两种语言实现

### 已完成的操作
1. 实现了快速排序算法
2. 对比了不同排序算法的时间复杂度

### 重要结论与决策
- 选择快速排序作为默认实现
- 对于大数据量建议使用归并排序

### 当前状态
排序算法讨论完毕，等待用户下一个问题。`;

    const mockClient = createMockModelClient(compressedSummary);
    const result = await compressHistoryIfNeeded(messages, mockClient);

    const inputChars = countChars(messages);
    const outputChars = countChars(result);

    console.log(`  输入: ${messages.length} 条消息, ${inputChars.toLocaleString()} 字符`);
    console.log(`  输出: ${result.length} 条消息, ${outputChars.toLocaleString()} 字符`);
    console.log(`  LLM 调用次数: ${mockClient.getCallCount()}`);
    console.log(`  压缩率: ${((1 - outputChars / inputChars) * 100).toFixed(1)}%`);

    // 验证：LLM 被调用了，输出消息数 = 1(摘要) + 6(最近消息) = 7
    const pass =
        mockClient.getCallCount() === 1 &&
        result.length === 7 &&
        outputChars < inputChars;
    console.log(`  结果: ${pass ? "✅ PASS" : "❌ FAIL"} — 长对话触发压缩，保留最近 6 条`);

    // 打印压缩后的消息结构
    console.log(`  压缩后消息结构:`);
    result.forEach((m, i) => {
        const preview = typeof m.content === "string"
            ? m.content.slice(0, 60).replace(/\n/g, "\\n")
            : "[multimodal]";
        console.log(`    [${i}] ${m.role}: ${preview}...`);
    });

    return pass;
}

async function test3_compressionFailure_fallback() {
    console.log("\n=== 测试 3: 压缩失败时降级处理 ===");

    const messages = generateLongHistory(120_000);
    const mockClient = createMockModelClient("", true); // 模拟 LLM 调用失败

    const result = await compressHistoryIfNeeded(messages, mockClient);

    const inputChars = countChars(messages);
    const outputChars = countChars(result);

    console.log(`  输入: ${messages.length} 条消息, ${inputChars.toLocaleString()} 字符`);
    console.log(`  输出: ${result.length} 条消息, ${outputChars.toLocaleString()} 字符`);
    console.log(`  LLM 调用次数: ${mockClient.getCallCount()}`);

    // 降级：仅保留最近 6 条消息
    const pass = result.length === 6 && outputChars < inputChars;
    console.log(`  结果: ${pass ? "✅ PASS" : "❌ FAIL"} — 压缩失败，降级保留最近 6 条消息`);
    return pass;
}

async function test4_systemMessagesPreserved() {
    console.log("\n=== 测试 4: system 消息不参与压缩 ===");

    const longMessages = generateLongHistory(120_000);
    const messages: ChatMessage[] = [
        { role: "system", content: "你是一个有帮助的助手。" },
        ...longMessages,
    ];

    const mockClient = createMockModelClient("## 对话摘要\n\n压缩后的内容...");
    const result = await compressHistoryIfNeeded(messages, mockClient);

    const hasSystem = result.some((m) => m.role === "system");
    const systemContent = result.find((m) => m.role === "system")?.content;

    console.log(`  输入: ${messages.length} 条消息 (含 1 条 system)`);
    console.log(`  输出: ${result.length} 条消息`);
    console.log(`  system 消息保留: ${hasSystem}`);
    console.log(`  system 内容: ${systemContent}`);

    const pass = hasSystem && systemContent === "你是一个有帮助的助手。";
    console.log(`  结果: ${pass ? "✅ PASS" : "❌ FAIL"} — system 消息被保留`);
    return pass;
}

async function test5_thresholdBoundary() {
    console.log("\n=== 测试 5: 阈值边界（刚好 100k 不压缩，超过则压缩）===");

    // 刚好不超过阈值（考虑消息前缀开销，用 90k 确保安全）
    const atThreshold = generateLongHistory(90_000);
    const actualChars1 = countChars(atThreshold);
    const mockClient1 = createMockModelClient("compressed");
    await compressHistoryIfNeeded(atThreshold, mockClient1);
    const noCompress = mockClient1.getCallCount() === 0;

    // 超过阈值
    const overThreshold = generateLongHistory(110_000);
    const actualChars2 = countChars(overThreshold);
    const mockClient2 = createMockModelClient("compressed");
    await compressHistoryIfNeeded(overThreshold, mockClient2);
    const didCompress = mockClient2.getCallCount() === 1;

    console.log(`  ${actualChars1.toLocaleString()} 字符 (< 100k): LLM 调用 ${mockClient1.getCallCount()} 次 → ${noCompress ? "未压缩 ✅" : "压缩了 ❌"}`);
    console.log(`  ${actualChars2.toLocaleString()} 字符 (> 100k): LLM 调用 ${mockClient2.getCallCount()} 次 → ${didCompress ? "已压缩 ✅" : "未压缩 ❌"}`);

    const pass = noCompress && didCompress;
    console.log(`  结果: ${pass ? "✅ PASS" : "❌ FAIL"} — 阈值判断正确`);
    return pass;
}

// ─── 运行所有测试 ────────────────────────────────────────

async function main() {
    console.log("╔══════════════════════════════════════════════╗");
    console.log("║   历史对话压缩机制 (compress-history) 测试    ║");
    console.log("╚══════════════════════════════════════════════╝");

    const results = [
        await test1_shortHistory_noCompression(),
        await test2_longHistory_triggersCompression(),
        await test3_compressionFailure_fallback(),
        await test4_systemMessagesPreserved(),
        await test5_thresholdBoundary(),
    ];

    const passed = results.filter(Boolean).length;
    const total = results.length;

    console.log("\n══════════════════════════════════════════════");
    console.log(`总计: ${passed}/${total} 通过`);
    console.log("══════════════════════════════════════════════");

    if (passed < total) {
        process.exit(1);
    }
}

main().catch((err) => {
    console.error("测试运行失败:", err);
    process.exit(1);
});
