import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../types.js";
import { resolveSafePath } from "../../security/path-guards.js";

const ListFilesInputSchema = z.object({
    path: z.string().default("."),
    recursive: z.boolean().default(false),
    maxEntries: z.number().int().positive().max(1000).default(200),
});

type CreateListFilesToolOptions = {
    workspaceRoot: string;
};

export function createListFilesTool(
    options: CreateListFilesToolOptions
): Tool {
    return {
        name: "list_files",
        description: "List files and directories inside the workspace",
        riskLevel: "safe",
        inputSchema: ListFilesInputSchema,
        async execute(rawArgs: unknown) {
            try {
                const args = ListFilesInputSchema.parse(rawArgs);
                const basePath = resolveSafePath(options.workspaceRoot, args.path);

                const results: string[] = [];

                async function walk(currentPath: string) {
                    const dirents = await fs.readdir(currentPath, { withFileTypes: true });

                    for (const dirent of dirents) {
                        if (results.length >= args.maxEntries) return;

                        const full = path.join(currentPath, dirent.name);
                        const rel = path.relative(options.workspaceRoot, full) || ".";

                        results.push(dirent.isDirectory() ? `${rel}/` : rel);

                        if (args.recursive && dirent.isDirectory()) {
                            await walk(full);
                        }
                    }
                }

                await walk(basePath);

                return {
                    success: true,
                    output: {
                        path: args.path,
                        entries: results,
                        truncated: results.length >= args.maxEntries,
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