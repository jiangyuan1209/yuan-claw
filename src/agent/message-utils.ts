import type { ChatMessage } from "../memory/types.js";

type TrimMessagesOptions = {
    maxMessages?: number;
    maxContentChars?: number;
};

export function truncateText(text: string, maxChars: number): string {
    if (text.length <= maxChars) {
        return text;
    }
    return `${text.slice(0, maxChars)}\n...[truncated]`;
}

export function trimMessages(
    messages: ChatMessage[],
    options: TrimMessagesOptions = {}
): ChatMessage[] {
    const maxMessages = options.maxMessages ?? 24;
    const maxContentChars = options.maxContentChars ?? 12000;

    const systemMessages = messages.filter((m) => m.role === "system").slice(-1);
    const otherMessages = messages.filter((m) => m.role !== "system");

    const trimmedOthers = otherMessages.slice(-maxMessages).map((m) => ({
        ...m,
        content: truncateText(m.content, maxContentChars),
    }));

    return [...systemMessages, ...trimmedOthers];
}

export function compactToolResult(
    toolName: string,
    result: unknown,
    maxChars = 4000
): string {
    let serialized: string;

    try {
        serialized = JSON.stringify(
            {
                toolName,
                result,
            },
            null,
            2
        );
    } catch {
        serialized = JSON.stringify({
            toolName,
            result: String(result),
        });
    }

    return truncateText(serialized, maxChars);
}

export function compactAssistantToolCall(
    toolName: string,
    args: unknown,
    maxChars = 2000
): string {
    let serialized: string;

    try {
        serialized = JSON.stringify(
            {
                type: "tool_call",
                toolName,
                args,
            },
            null,
            2
        );
    } catch {
        serialized = JSON.stringify({
            type: "tool_call",
            toolName,
            args: String(args),
        });
    }

    return truncateText(serialized, maxChars);
}