export type RunStatus =
    | "queued"
    | "running"
    | "completed"
    | "failed"
    | "aborted"
    | "timeout";

export interface AgentRun {
    runId: string;
    sessionId: string;
    userInput: string;
    status: RunStatus;
    createdAt: number;
    startedAt?: number;
    endedAt?: number;
    error?: string;
}

export interface AgentSession {
    sessionId: string;
    createdAt: number;
    updatedAt: number;
    cwd?: string;
    metadata?: Record<string, unknown>;
}

export type MessageRole = "system" | "user" | "assistant" | "tool";

export interface AgentMessage {
    id: string;
    sessionId: string;
    runId?: string;
    role: MessageRole;
    content: string;
    toolName?: string;
    createdAt: number;
    metadata?: Record<string, unknown>;
}

export interface ToolCall {
    id: string;
    toolName: string;
    args: Record<string, unknown>;
}

export interface ToolResult {
    toolCallId: string;
    toolName: string;
    success: boolean;
    content: string;
    data?: unknown;
    error?: string;
}

export type ModelAction =
    | {
    type: "final";
    message: string;
}
    | {
    type: "tool_call";
    toolName: string;
    args: Record<string, unknown>;
};

export interface ToolDefinition {
    name: string;
    description: string;
    schema: Record<string, unknown>;
}