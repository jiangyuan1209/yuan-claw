import { z } from "zod";
import type { Tool, ToolResult } from "../types.js";

const HttpFetchInputSchema = z.object({
    url: z.string().url(),
});

type CreateHttpFetchToolOptions = {
    timeoutMs?: number;
    userAgent?: string;
};

export function createHttpFetchTool(
    options: CreateHttpFetchToolOptions = {}
): Tool {
    const timeoutMs = options.timeoutMs ?? 15000;
    const userAgent =
        options.userAgent ??
        "Mozilla/5.0 (compatible; XSimpleHttpFetch/1.0)";

    return {
        name: "http_fetch",
        description:
            "Fetch a URL and return status, headers, final URL, and response text",
        riskLevel: "safe",
        inputSchema: HttpFetchInputSchema,
        async execute(rawArgs): Promise<ToolResult> {
            const controller = new AbortController();
            const timer = setTimeout(() => controller.abort(), timeoutMs);

            try {
                const args = HttpFetchInputSchema.parse(rawArgs);

                const response = await fetch(args.url, {
                    method: "GET",
                    redirect: "follow",
                    headers: {
                        "User-Agent": userAgent,
                        Accept:
                            "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.7",
                    },
                    signal: controller.signal,
                });

                const text = await response.text();
                const headers = Object.fromEntries(response.headers.entries());

                return {
                    success: true,
                    output: {
                        url: args.url,
                        finalUrl: response.url,
                        ok: response.ok,
                        status: response.status,
                        statusText: response.statusText,
                        headers,
                        contentType: response.headers.get("content-type") ?? "",
                        text,
                    },
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            } finally {
                clearTimeout(timer);
            }
        },
    };
}