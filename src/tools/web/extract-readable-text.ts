import { z } from "zod";
import type { Tool, ToolResult } from "../types.js";

const ExtractReadableTextInputSchema = z.object({
    content: z.string().min(1),
    maxChars: z.number().int().positive().max(50000).default(12000),
});

function stripTags(html: string): string {
    return html
        .replace(/<script[\s\S]*?<\/script>/gi, " ")
        .replace(/<style[\s\S]*?<\/style>/gi, " ")
        .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
        .replace(/<\/(p|div|section|article|li|tr|h1|h2|h3|h4|h5|h6)>/gi, "\n")
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, " ")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/\r/g, "")
        .replace(/\n{3,}/g, "\n\n")
        .replace(/[ \t]{2,}/g, " ")
        .trim();
}

export function createExtractReadableTextTool(): Tool {
    return {
        name: "extract_readable_text",
        description: "Extract readable text from HTML or plain text content",
        riskLevel: "safe",
        inputSchema: ExtractReadableTextInputSchema,
        async execute(rawArgs): Promise<ToolResult> {
            try {
                const args = ExtractReadableTextInputSchema.parse(rawArgs);
                const text = stripTags(args.content);
                const sliced = text.slice(0, args.maxChars);

                return {
                    success: true,
                    output: {
                        text: sliced,
                        truncated: text.length > sliced.length,
                        totalChars: text.length,
                        returnedChars: sliced.length,
                    },
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
}