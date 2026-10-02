/**
 * 多模态消息内容的一部分。
 * 当 ChatMessage.content 为数组时，每个元素是一个 ChatMessageContentPart，
 * 支持文本和图片混合发送给视觉模型（如 OCR 场景）。
 */
export type ChatMessageContentPart =
    | { type: "text"; text: string }
    | { type: "image_url"; image_url: { url: string } };

/**
 * 后端对话记忆的消息类型（供 LLM 使用的标准格式）。
 *
 * 注意：这与前端的 ChatMessage（src/web/app/src/types.ts）不同。
 * 后端版本是纯数据（role + content），用于构建发给 LLM 的 messages 数组；
 * 前端版本增加了 id、timestamp、toolEvents 等 UI 专用字段。
 *
 * role 说明：
 *   - system:    系统提示词（工具列表、行为规则等），每次调用 LLM 时放在 messages[0]
 *   - user:      用户输入，也用于承载工具执行结果（Agent 模式下 tool result 以 user 角色注入）
 *   - assistant: LLM 的回复（Agent 模式下可能是 JSON 格式的工具调用指令）
 *   - tool:      工具执行结果（Function Calling 模式使用，当前 JSON Prompting 模式下不直接用）
 */
export type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string | ChatMessageContentPart[];
};

/**
 * 持久化的会话数据，用于 /save 和 --session 功能。
 * messages 字段存储完整的对话历史，加载后作为 previousMessages 传入 Agent 循环。
 */
export type SessionData = {
    sessionId: string;
    messages: ChatMessage[];
    updatedAt: string;
};