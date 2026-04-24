import type { ChatMessage } from "../memory/types.js";

type JsonLike =
    | null
    | boolean
    | number
    | string
    | JsonLike[]
    | { [key: string]: JsonLike };

export interface TruncateTextOptions {
    maxChars?: number;
    headChars?: number;
    tailChars?: number;
    marker?: string;
}

export interface CompactValueOptions {
    maxStringChars?: number;
    maxArrayItems?: number;
    maxObjectKeys?: number;
    maxDepth?: number;
}

export interface TrimMessagesOptions {
    maxMessages?: number;
    maxTotalChars?: number;
    preserveSystemMessages?: boolean;
    preserveRecentMessages?: number;
    compactToolMessages?: boolean;
}

const DEFAULT_TEXT_MAX_CHARS = 4_000;
const DEFAULT_TEXT_HEAD_CHARS = 2_500;
const DEFAULT_TEXT_TAIL_CHARS = 1_000;
const DEFAULT_TEXT_MARKER = "\n...[truncated]...\n";

const DEFAULT_VALUE_MAX_STRING_CHARS = 4_000;
const DEFAULT_VALUE_MAX_ARRAY_ITEMS = 20;
const DEFAULT_VALUE_MAX_OBJECT_KEYS = 40;
const DEFAULT_VALUE_MAX_DEPTH = 6;

const DEFAULT_MAX_MESSAGES = 24;
const DEFAULT_MAX_TOTAL_CHARS = 24_000;
const DEFAULT_PRESERVE_RECENT_MESSAGES = 8;

export function truncateText(
    text: string,
    options: TruncateTextOptions = {},
): {
    text: string;
    truncated: boolean;
    totalChars: number;
    returnedChars: number;
} {
    const maxChars = options.maxChars ?? DEFAULT_TEXT_MAX_CHARS;
    const headChars = options.headChars ?? DEFAULT_TEXT_HEAD_CHARS;
    const tailChars = options.tailChars ?? DEFAULT_TEXT_TAIL_CHARS;
    const marker = options.marker ?? DEFAULT_TEXT_MARKER;

    const totalChars = text.length;
    if (totalChars <= maxChars) {
        return {
            text,
            truncated: false,
            totalChars,
            returnedChars: totalChars,
        };
    }

    const safeHead = Math.max(0, headChars);
    const safeTail = Math.max(0, tailChars);

    let next = text.slice(0, safeHead) + marker;
    if (safeTail > 0) {
        next += text.slice(-safeTail);
    }

    if (next.length > maxChars) {
        next = next.slice(0, maxChars);
    }

    return {
        text: next,
        truncated: true,
        totalChars,
        returnedChars: next.length,
    };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

function compactValueInternal(
    value: unknown,
    options: Required<CompactValueOptions>,
    depth: number,
): JsonLike {
    if (value == null) {
        return null;
    }

    if (
        typeof value === "boolean" ||
        typeof value === "number" ||
        typeof value === "string"
    ) {
        if (typeof value === "string") {
            const truncated = truncateText(value, {
                maxChars: options.maxStringChars,
            });
            return truncated.text;
        }
        return value;
    }

    if (depth >= options.maxDepth) {
        return "[MaxDepthExceeded]";
    }

    if (Array.isArray(value)) {
        const items = value
            .slice(0, options.maxArrayItems)
            .map((item) => compactValueInternal(item, options, depth + 1));

        if (value.length > options.maxArrayItems) {
            items.push(
                `[... ${value.length - options.maxArrayItems} more items omitted]`,
            );
        }

        return items;
    }

    if (isPlainObject(value)) {
        const entries = Object.entries(value);
        const limitedEntries = entries.slice(0, options.maxObjectKeys);

        const result: Record<string, JsonLike> = {};
        for (const [key, val] of limitedEntries) {
            result[key] = compactValueInternal(val, options, depth + 1);
        }

        if (entries.length > options.maxObjectKeys) {
            result.__omittedKeys = entries.length - options.maxObjectKeys;
        }

        return result;
    }

    return String(value);
}

export function compactValue(
    value: unknown,
    options: CompactValueOptions = {},
): JsonLike {
    return compactValueInternal(
        value,
        {
            maxStringChars:
                options.maxStringChars ?? DEFAULT_VALUE_MAX_STRING_CHARS,
            maxArrayItems:
                options.maxArrayItems ?? DEFAULT_VALUE_MAX_ARRAY_ITEMS,
            maxObjectKeys:
                options.maxObjectKeys ?? DEFAULT_VALUE_MAX_OBJECT_KEYS,
            maxDepth: options.maxDepth ?? DEFAULT_VALUE_MAX_DEPTH,
        },
        0,
    );
}

export function compactToolResult(
    result: unknown,
    options: CompactValueOptions = {},
): JsonLike {
    return compactValue(result, options);
}

export function compactAssistantToolCall(content: string): string {
    const truncated = truncateText(content, {
        maxChars: 800,
        headChars: 600,
        tailChars: 120,
    });

    return truncated.truncated
        ? `[assistant tool call summary]\n${truncated.text}`
        : content;
}

function estimateMessageChars(message: ChatMessage): number {
    const content =
        typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content ?? "");
    return content.length + message.role.length;
}

function compactMessage(message: ChatMessage): ChatMessage {
    const content =
        typeof message.content === "string"
            ? message.content
            : JSON.stringify(message.content ?? "");

    if (message.role === "tool") {
        return {
            ...message,
            content: JSON.stringify(compactToolResult(safeJsonParse(content) ?? content)),
        };
    }

    if (message.role === "assistant") {
        return {
            ...message,
            content: compactAssistantToolCall(content),
        };
    }

    if (message.role === "user") {
        const truncated = truncateText(content, {
            maxChars: 2_000,
            headChars: 1_400,
            tailChars: 300,
        });
        return {
            ...message,
            content: truncated.text,
        };
    }

    if (message.role === "system") {
        const truncated = truncateText(content, {
            maxChars: 3_000,
            headChars: 2_400,
            tailChars: 300,
        });
        return {
            ...message,
            content: truncated.text,
        };
    }

    return message;
}

function safeJsonParse(text: string): unknown | null {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}

export function trimMessages(
    messages: ChatMessage[],
    options: TrimMessagesOptions = {},
): ChatMessage[] {
    const maxMessages = options.maxMessages ?? DEFAULT_MAX_MESSAGES;
    const maxTotalChars = options.maxTotalChars ?? DEFAULT_MAX_TOTAL_CHARS;
    const preserveSystemMessages = options.preserveSystemMessages ?? true;
    const preserveRecentMessages =
        options.preserveRecentMessages ?? DEFAULT_PRESERVE_RECENT_MESSAGES;
    const compactToolMessages = options.compactToolMessages ?? true;

    if (messages.length === 0) {
        return [];
    }

    const systemMessages = preserveSystemMessages
        ? messages.filter((m) => m.role === "system")
        : [];

    const nonSystemMessages = preserveSystemMessages
        ? messages.filter((m) => m.role !== "system")
        : [...messages];

    const recent = nonSystemMessages.slice(-preserveRecentMessages);
    const older = nonSystemMessages.slice(
        0,
        Math.max(0, nonSystemMessages.length - preserveRecentMessages),
    );

    const compactedOlder = older.map((message) => {
        if (compactToolMessages || message.role !== "tool") {
            return compactMessage(message);
        }
        return message;
    });

    let result = [...systemMessages, ...compactedOlder, ...recent];

    if (result.length > maxMessages) {
        const preservedSystem = result.filter((m) => m.role === "system");
        const others = result.filter((m) => m.role !== "system");
        result = [...preservedSystem, ...others.slice(-(maxMessages - preservedSystem.length))];
    }

    let totalChars = result.reduce(
        (sum, message) => sum + estimateMessageChars(message),
        0,
    );

    if (totalChars <= maxTotalChars) {
        return result;
    }

    const finalMessages: ChatMessage[] = [];
    const systems = result.filter((m) => m.role === "system");
    const others = result.filter((m) => m.role !== "system");

    for (const msg of systems) {
        finalMessages.push(compactMessage(msg));
    }

    for (const msg of others.slice(-preserveRecentMessages)) {
        finalMessages.push(compactMessage(msg));
    }

    totalChars = finalMessages.reduce(
        (sum, message) => sum + estimateMessageChars(message),
        0,
    );

    if (totalChars <= maxTotalChars) {
        return finalMessages;
    }

    const trimmed: ChatMessage[] = [];
    let running = 0;

    for (const msg of [...systems, ...others].reverse()) {
        const compacted = compactMessage(msg);
        const size = estimateMessageChars(compacted);

        if (running + size > maxTotalChars) {
            continue;
        }

        trimmed.push(compacted);
        running += size;
    }

    return trimmed.reverse();
}

export function prepareMessagesForModel(
    messages: ChatMessage[],
    options: TrimMessagesOptions = {},
): ChatMessage[] {
    return trimMessages(messages, options);
}

export function serializeToolMessage(result: unknown): string {
    const compacted = compactToolResult(result);

    if (compacted && typeof compacted === "object" && !Array.isArray(compacted)) {
        return JSON.stringify(
            {
                ...compacted,
                _meta: {
                    note: "Tool output may be compacted or truncated. If visibility is partial, say so explicitly.",
                },
            },
            null,
            2,
        );
    }

    return JSON.stringify(
        {
            value: compacted,
            _meta: {
                note: "Tool output may be compacted or truncated. If visibility is partial, say so explicitly.",
            },
        },
        null,
        2,
    );
}