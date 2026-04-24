import { z } from "zod";

const FinalActionSchema = z.object({
    type: z.literal("final"),
    message: z.string(),
});

const ToolCallActionSchema = z.object({
    type: z.literal("tool_call"),
    toolName: z.string().min(1),
    args: z.record(z.string(), z.unknown()).default({}),
});

export const AgentResponseSchema = z.union([
    FinalActionSchema,
    ToolCallActionSchema,
]);

export type AgentResponse = z.infer<typeof AgentResponseSchema>;

function extractJsonFromCodeFence(text: string): string | null {
    const fencedMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
    if (!fencedMatch) {
        return null;
    }

    return fencedMatch[1]?.trim() ?? null;
}

function extractFirstJsonObject(text: string): string | null {
    const start = text.indexOf("{");
    if (start === -1) {
        return null;
    }

    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let i = start; i < text.length; i++) {
        const ch = text[i];

        if (escaped) {
            escaped = false;
            continue;
        }

        if (ch === "\\") {
            escaped = true;
            continue;
        }

        if (ch === '"') {
            inString = !inString;
            continue;
        }

        if (inString) {
            continue;
        }

        if (ch === "{") {
            depth += 1;
            continue;
        }

        if (ch === "}") {
            depth -= 1;
            if (depth === 0) {
                return text.slice(start, i + 1).trim();
            }
        }
    }

    return null;
}

export function safeJsonParse(text: string): unknown {
    if (typeof text !== "string") {
        throw new Error(`Model output is not a string: ${String(text)}`);
    }

    const trimmed = text.trim();

    const candidates = [
        trimmed,
        extractJsonFromCodeFence(trimmed),
        extractFirstJsonObject(trimmed),
    ].filter((value): value is string => Boolean(value));

    let lastError: unknown = null;

    for (const candidate of candidates) {
        try {
            return JSON.parse(candidate);
        } catch (error) {
            lastError = error;
        }
    }

    if (lastError instanceof Error) {
        throw new Error(`Failed to parse model output as JSON: ${lastError.message}`);
    }

    throw new Error("Failed to parse model output as JSON");
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function normalizeAgentOutput(input: unknown): unknown {
    if (!isRecord(input)) {
        return input;
    }

    const type = input.type;
    if (type === "final") {
        return {
            type: "final",
            message:
                typeof input.message === "string"
                    ? input.message
                    : typeof input.content === "string"
                        ? input.content
                        : typeof input.text === "string"
                            ? input.text
                            : "",
        };
    }

    if (type === "tool_call") {
        return {
            type: "tool_call",
            toolName:
                typeof input.toolName === "string"
                    ? input.toolName
                    : typeof input.tool === "string"
                        ? input.tool
                        : "",
            args: isRecord(input.args)
                ? input.args
                : isRecord(input.input)
                    ? input.input
                    : {},
        };
    }

    return input;
}