import OpenAI from "openai";
import type { ChatMessage } from "../../memory/types.js";
import type { AppConfig } from "../../config/load-config.js";

type CreateOpenAICompatibleClientOptions = {
    model?: string;
    config?: AppConfig;
};

export function createOpenAICompatibleClient(
    options: CreateOpenAICompatibleClientOptions = {}
) {
    const config = options.config ?? {};

    const apiKey = config.MODEL_API_KEY

    const baseURL = config.MODEL_BASE_URL

    const model = config.MODEL_NAME ?? "gpt-4o-mini"

    if (!apiKey) {
        throw new Error(
            "Missing MODEL_API_KEY / OPENAI_API_KEY in environment variables or ~/.my-agent/settings.json."
        );
    }

    const client = new OpenAI({
        apiKey,
        baseURL,
    });

    return {
        async generate(messages: ChatMessage[]): Promise<string> {
            // ============================================================
            // JSON Prompting 模式（当前实现）
            // ============================================================
            // Agent 的"工具调用"完全由 Prompt 驱动：
            // 1. System Prompt 中要求 "输出严格 JSON"
            // 2. 定义协议: {"type":"tool_call","toolName":"xxx","args":{}}
            // 3. 在 runLocalAgentLoop 中用 parseAgentResponse 本地解析
            // 4. 不传 tools 参数，LLM 不知道有哪些工具可用（通过 Prompt 告知）
            //
            // 优势：兼容所有 LLM（包括不支持 Function Calling 的模型）
            // 劣势：依赖 LLM 遵循指令的能力，格式可能出错
            // ============================================================

            // ── 如果是 Function Calling 模式，代码应改为下方注释所示 ──
            // const response = await client.chat.completions.create({
            //     model,
            //     messages: messages.map((message) => ({
            //         role: message.role === "tool" ? "tool" : message.role,
            //         content: message.content,
            //         tool_call_id: message.toolCallId,  // 关联 tool_call 和 result
            //     })),
            //     tools: [                              // ← 声明可用工具
            //         {
            //             type: "function",
            //             function: {
            //                 name: "read_file",
            //                 description: "Read a UTF-8 text file",
            //                 parameters: {
            //                     type: "object",
            //                     properties: {
            //                         path: { type: "string", description: "File path" },
            //                     },
            //                     required: ["path"],
            //                 },
            //             },
            //         },
            //     ],
            //     tool_choice: "auto",                  // ← LLM 自主决定是否调用工具
            //     temperature: 0,
            // });
            //
            // const choice = response.choices[0];
            // if (choice.message.tool_calls?.length) {
            //     // Function Calling 模式：LLM 返回 tool_calls 结构
            //     return JSON.stringify({
            //         type: "tool_call",
            //         toolName: choice.message.tool_calls[0].function.name,
            //         args: JSON.parse(choice.message.tool_calls[0].function.arguments),
            //     });
            // }
            // return choice.message.content ?? "";
            // ────────────────────────────────────────────────────────────

            const response = await client.chat.completions.create({
                model,
                messages: messages.map((message) => ({
                    role: message.role === "tool" ? "user" : message.role,
                    content: message.content,
                })),
                temperature: 0,
            });

            const text = response.choices[0]?.message?.content;

            if (typeof text !== "string" || !text.trim()) {
                throw new Error("Model returned empty content.");
            }

            return text;
        },
    };
}