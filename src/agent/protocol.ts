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