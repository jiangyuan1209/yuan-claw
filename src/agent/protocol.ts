/**
 * 自定义 JSON Prompting 协议
 * ============================================================
 * Function Calling 模式下，LLM 会返回标准化的 tool_calls 结构，
 * 无需自定义协议。这里定义的是 JSON Prompting 的响应格式。
 *
 * Function Calling 返回结构（无需自定义）:
 * {
 *   "tool_calls": [{
 *     "id": "call_xxx",
 *     "type": "function",
 *     "function": {
 *       "name": "read_file",
 *       "arguments": "{\"path\":\"package.json\"}"
 *     }
 *   }]
 * }
 * ============================================================
 */
export type ToolCallAgentResponse = {
    type: "tool_call";
    toolName: string;
    args: Record<string, unknown>;
};

export type FinalAgentResponse = {
    type: "final";
    message: string;
};

export type AskConfirmationAgentResponse = {
    type: "ask_confirmation";
    message: string;
};

export type AgentResponse =
    | ToolCallAgentResponse
    | FinalAgentResponse
    | AskConfirmationAgentResponse;