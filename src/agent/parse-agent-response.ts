/**
 * 解析 Agent 响应
 * ============================================================
 * JSON Prompting 模式：
 *   LLM 输出: {"type":"tool_call","toolName":"read_file","args":{...}}
 *   本地用 JSON.parse + 字段校验 解析
 *
 * Function Calling 模式（无需此解析器）：
 *   LLM 返回 response.choices[0].message.tool_calls
 *   SDK 已保证格式，直接提取即可：
 *   const toolCall = choice.message.tool_calls[0];
 *   return {
 *       type: "tool_call",
 *       toolName: toolCall.function.name,
 *       args: JSON.parse(toolCall.function.arguments),
 *   };
 * ============================================================
 */
import type { AgentResponse } from "./protocol.js";

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * 从可能包含多个 JSON 对象或杂项文本的字符串中提取第一个完整的 JSON 对象。
 *
 * 使用大括号匹配算法，同时正确处理：
 * - 字符串内的转义字符（如 \" 和 \\）
 * - 字符串内的嵌套大括号
 *
 * 返回第一个完整 JSON 对象的字符串，提取失败时返回 null。
 */
function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf("{");
    if (start === -1) return null;

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\" && inString) {
            escaped = true;
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) continue;

        if (ch === "{") depth++;
        else if (ch === "}") {
            depth--;
            if (depth === 0) {
                return text.slice(start, i + 1);
            }
        }
    }

    return null;
}

export function parseAgentResponse(raw: string): AgentResponse {
    let parsed: unknown;

    try {
        parsed = JSON.parse(raw);
    } catch {
        // JSON.parse 失败 — 可能是 LLM 返回了多个 JSON 对象或在 JSON 外包含了其他文本。
        // 尝试提取第一个完整的 JSON 对象作为降级处理。
        const extracted = extractFirstJsonObject(raw);
        if (extracted) {
            try {
                parsed = JSON.parse(extracted);
            } catch {
                throw new Error("Agent response is not valid JSON.");
            }
        } else {
            throw new Error("Agent response is not valid JSON.");
        }
    }

    if (!isPlainObject(parsed)) {
        throw new Error("Agent response must be a JSON object.");
    }

    const type = parsed.type;

    if (type === "tool_call") {
        if (typeof parsed.toolName !== "string" || parsed.toolName.trim() === "") {
            throw new Error('tool_call response must include a non-empty string field "toolName".');
        }

        if (!isPlainObject(parsed.args)) {
            throw new Error('tool_call response must include an object field "args".');
        }

        return {
            type: "tool_call",
            toolName: parsed.toolName,
            args: parsed.args,
        };
    }

    if (type === "final") {
        if (typeof parsed.message !== "string") {
            throw new Error('final response must include a string field "message".');
        }

        return {
            type: "final",
            message: parsed.message,
        };
    }

    if (type === "ask_confirmation") {
        if (typeof parsed.message !== "string" || parsed.message.trim() === "") {
            throw new Error('ask_confirmation response must include a non-empty string field "message".');
        }

        return {
            type: "ask_confirmation",
            message: parsed.message,
        };
    }

    throw new Error(`Unsupported agent response type: ${String(type)}`);
}