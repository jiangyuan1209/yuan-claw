export type AgentEvent =
    | { type: "session_init"; sessionId: string }
    | { type: "run_start"; input: string }
    | { type: "model_raw"; text: string; step: number }
    | { type: "tool_start"; toolName: string; args: unknown; step: number }
    | {
          type: "tool_end";
          toolName: string;
          success: boolean;
          result: unknown;
          step: number;
      }
    | { type: "tool_error"; toolName: string; error: string; step: number }
    | { type: "assistant"; message: string }
    | {
          type: "run_error";
          step: number;
          stage: string;
          error: string;
      }
    | { type: "run_end"; reason: string; step: number };

export type ChatMessage = {
    id: string;
    role: "user" | "assistant";
    content: string;
    timestamp: number;
    toolEvents?: ToolEvent[];
};

export type ToolEvent = {
    toolName: string;
    status: "running" | "success" | "error";
    args?: unknown;
    result?: unknown;
    error?: string;
};
