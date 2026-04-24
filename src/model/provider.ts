import OpenAI from "openai";
import { z } from "zod";
import type { ModelAction } from "../core/types.js";
import { loadConfig } from "../config.js";

const config = loadConfig();

const client = new OpenAI({
    apiKey: config.model.apiKey,
    baseURL: config.model.baseURL,
});

const modelActionSchema = z.union([
    z.object({
        type: z.literal("final"),
        message: z.string(),
    }),
    z.object({
        type: z.literal("tool_call"),
        toolName: z.string(),
        args: z.record(z.unknown()),
    }),
]);

export async function decideNextAction(
    messages: Array<{ role: string; content: string }>
): Promise<ModelAction> {
    const response = await client.chat.completions.create({
        model: config.model.model,
        temperature: 0,
        response_format: { type: "json_object" },
        messages: messages as Array<{
            role: "system" | "user" | "assistant";
            content: string;
        }>,
    });

    const text = response.choices[0]?.message?.content ?? "{}";
    const parsedJson = JSON.parse(text);
    return modelActionSchema.parse(parsedJson);
}