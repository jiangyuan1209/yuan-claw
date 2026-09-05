/**
 * 前后端通信的事件类型定义。
 *
 * 前端与后端的通信采用 REST + WebSocket 混合模式：
 *   - 发送消息：POST /api/chat（一次性请求，服务端立即返回 sessionId）
 *   - 接收事件：WebSocket /ws（长连接，服务端异步推送 Agent 运行过程中的各类事件）
 *
 * 流程：用户发送消息 → 前端 POST 到 /api/chat → 服务端启动 Agent 循环 →
 *       Agent 每产生一个事件就通过 WebSocket 广播给前端 → 前端实时更新 UI。
 */
export type AgentEvent =
    /** WebSocket 连接建立时，服务端推送的第一条事件，携带分配给本次连接的 sessionId */
    | { type: "session_init"; sessionId: string }
    /** Agent 循环开始处理用户输入时触发，input 为用户发送的原始消息 */
    | { type: "run_start"; input: string }
    /**
     * 模型原始输出（Agent 模式下每步 LLM 返回的完整 JSON 文本）。
     * 用于 Debug 模式下展示中间步骤的原始输出，正常模式下前端不显示。
     */
    | { type: "model_raw"; text: string; step: number }
    /** 工具开始执行时触发，toolName 为工具名，args 为调用参数 */
    | { type: "tool_start"; toolName: string; args: unknown; step: number }
    /** 工具执行完成时触发，success 标识是否成功，result 为返回值 */
    | {
          type: "tool_end";
          toolName: string;
          success: boolean;
          result: unknown;
          step: number;
      }
    /** 工具执行出错时触发，error 为错误描述 */
    | { type: "tool_error"; toolName: string; error: string; step: number }
    /** Agent 循环结束时的最终回复消息（Agent 模式下由 parseAgentResponse 解析出的 final 结果） */
    | { type: "assistant"; message: string }
    /**
     * 直连大模型模式下的流式 token 事件。
     * text 为模型每次返回的文本片段，done=true 表示流式输出结束。
     * 前端收到后逐字累加到当前消息内容，实现打字机效果。
     */
    | { type: "streaming_token"; text: string; done: boolean }
    /** Agent 循环运行出错时触发，stage 标识出错阶段，error 为错误信息 */
    | {
          type: "run_error";
          step: number;
          stage: string;
          error: string;
      }
    /** Agent 循环正常结束，reason 为 "final"（得到最终回答）或 "max_steps_exceeded"（超出最大步数） */
    | { type: "run_end"; reason: string; step: number };

/** 聊天模式：agent（工具调用循环）或 direct（直连大模型，流式输出） */
export type ChatMode = "agent" | "direct";

/** Debug 模式下展示的单步模型原始输出 */
export type DebugEvent = {
    step: number;
    text: string;
};

/**
 * 前端消息类型。
 * 注意：这与后端的 ChatMessage（src/memory/types.ts）不同，
 * 前端版本增加了 id、timestamp、toolEvents、debugEvents 等 UI 专用字段。
 */
export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    /** Agent 模式下的工具调用事件列表，用于渲染工具状态标签 */
    toolEvents?: ToolEvent[];
    /** Debug 模式下展示的步骤原始输出列表 */
    debugEvents?: DebugEvent[];
};

/** 单次工具调用的状态记录，前端用于渲染工具执行状态的 Tag 标签 */
export type ToolEvent = {
    toolName: string;
    status: "running" | "success" | "error";
    args?: unknown;
    result?: unknown;
    error?: string;
};
