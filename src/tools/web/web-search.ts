import { z } from "zod";
import type { Tool, ToolResult } from "../types.js";

export type WebSearchResult = {
    title: string;
    url: string;
    snippet?: string;
    source?: string;
};

export type WebSearchProvider = (
    query: string,
    count: number
) => Promise<WebSearchResult[]>;

const WebSearchInputSchema = z.object({
    query: z.string().min(1),
    count: z.number().int().min(1).max(10).default(5),
});

type CreateWebSearchToolOptions = {
    provider: WebSearchProvider;
};

export function createWebSearchTool(
    options: CreateWebSearchToolOptions
): Tool {
    return {
        name: "web_search",
        description:
            "Search the web and return relevant results with title, url, and snippet",
        riskLevel: "safe",
        inputSchema: WebSearchInputSchema,
        async execute(rawArgs): Promise<ToolResult> {
            try {
                const args = WebSearchInputSchema.parse(rawArgs);
                const results = await options.provider(args.query, args.count);

                return {
                    success: true,
                    output: {
                        query: args.query,
                        count: args.count,
                        results,
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