export type ChatMessage = {
    role: "system" | "user" | "assistant" | "tool";
    content: string;
};

export type SessionData = {
    sessionId: string;
    messages: ChatMessage[];
    updatedAt: string;
};