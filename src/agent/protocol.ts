import { z } from "zod";

export const FinalSchema = z.object({
    type: z.literal("final"),
    message: z.string(),
});

export const ToolCallSchema = z.object({
    type: z.literal("tool_call"),
    toolName: z.string().min(1),
    args: z.record(z.any()).default({}),
});

export const AgentResponseSchema = z.union([FinalSchema, ToolCallSchema]);

export type FinalResponse = z.infer<typeof FinalSchema>;
export type ToolCallResponse = z.infer<typeof ToolCallSchema>;
export type AgentResponse = z.infer<typeof AgentResponseSchema>;

export function normalizeAgentOutput(raw: any): AgentResponse | unknown {
    if (raw?.type === "tool_call") {
        return {
            type: "tool_call" as const,
            toolName: raw.toolName ?? raw.tool ?? raw.name ?? "",
            args: raw.args ?? raw.input ?? {},
        };
    }

    if (raw?.type === "final") {
        return {
            type: "final" as const,
            message: raw.message ?? raw.text ?? raw.content ?? "",
        };
    }

    return raw;
}

export function safeJsonParse(text: string): unknown {
    const trimmed = text.trim();
    const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);

    if (fenced) {
        return JSON.parse(fenced[1]);
    }

    return JSON.parse(trimmed);
}