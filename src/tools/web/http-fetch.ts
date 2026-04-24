import { z } from "zod";
import type { Tool } from "../types.js";
import { validateUrlByPolicy } from "../../security/network-policy.js";

const HttpFetchInputSchema = z.object({
    url: z.string().min(1),
    method: z.enum(["GET", "POST"]).default("GET"),
    headers: z.record(z.string()).optional(),
    body: z.string().optional(),
    maxChars: z.number().int().positive().max(20000).default(8000),
});

type CreateHttpFetchToolOptions = {};

export function createHttpFetchTool(
    _options: CreateHttpFetchToolOptions = {}
): Tool {
    return {
        name: "http_fetch",
        description: "Fetch a web page or API response over HTTP/HTTPS",
        inputSchema: HttpFetchInputSchema,
        async execute(rawArgs: unknown) {
            try {
                const args = HttpFetchInputSchema.parse(rawArgs);
                const url = validateUrlByPolicy(args.url);

                const response = await fetch(url.toString(), {
                    method: args.method,
                    headers: args.headers,
                    body: args.method === "POST" ? args.body : undefined,
                });

                const contentType = response.headers.get("content-type");
                const text = await response.text();
                const truncatedText = text.slice(0, args.maxChars);

                return {
                    success: true,
                    output: {
                        url: url.toString(),
                        status: response.status,
                        ok: response.ok,
                        contentType,
                        text: truncatedText,
                        truncated: text.length > truncatedText.length,
                        totalChars: text.length,
                        returnedChars: truncatedText.length,
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