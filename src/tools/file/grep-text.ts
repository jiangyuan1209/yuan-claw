import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../types.js";
import { resolveSafePath } from "../../security/path-guards.js";

const GrepTextInputSchema = z.object({
    query: z.string().min(1),
    path: z.string().default("."),
    maxResults: z.number().int().positive().max(200).default(50),
    caseSensitive: z.boolean().default(false),
});

type CreateGrepTextToolOptions = {
    workspaceRoot: string;
};

export function createGrepTextTool(
    options: CreateGrepTextToolOptions
): Tool {
    return {
        name: "grep_text",
        description: "Search text in files under the workspace",
        inputSchema: GrepTextInputSchema,
        async execute(rawArgs: unknown) {
            try {
                const args = GrepTextInputSchema.parse(rawArgs);
                const basePath = resolveSafePath(options.workspaceRoot, args.path);

                const matches: Array<{
                    file: string;
                    line: number;
                    text: string;
                }> = [];

                async function walk(currentPath: string) {
                    const dirents = await fs.readdir(currentPath, { withFileTypes: true });

                    for (const dirent of dirents) {
                        if (matches.length >= args.maxResults) return;

                        const full = path.join(currentPath, dirent.name);

                        if (dirent.isDirectory()) {
                            if (
                                dirent.name === "node_modules" ||
                                dirent.name === ".git" ||
                                dirent.name === "dist"
                            ) {
                                continue;
                            }
                            await walk(full);
                            continue;
                        }

                        if (!dirent.isFile()) continue;

                        let content: string;
                        try {
                            content = await fs.readFile(full, "utf8");
                        } catch {
                            continue;
                        }

                        const lines = content.split(/\r?\n/);
                        const query = args.caseSensitive
                            ? args.query
                            : args.query.toLowerCase();

                        for (let i = 0; i < lines.length; i++) {
                            const lineText = lines[i];
                            const target = args.caseSensitive
                                ? lineText
                                : lineText.toLowerCase();

                            if (target.includes(query)) {
                                matches.push({
                                    file: path.relative(options.workspaceRoot, full),
                                    line: i + 1,
                                    text: lineText,
                                });

                                if (matches.length >= args.maxResults) return;
                            }
                        }
                    }
                }

                await walk(basePath);

                return {
                    success: true,
                    output: {
                        query: args.query,
                        matches,
                        truncated: matches.length >= args.maxResults,
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