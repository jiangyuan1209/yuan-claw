import fs from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "../types.js";
import { resolveSafePath } from "../../security/path-guards.js";

const ReadFileInputSchema = z.object({
    path: z.string().min(1),
    maxChars: z.number().int().positive().max(50000).default(12000),
});

type CreateReadFileToolOptions = {
    workspaceRoot: string;
};

export function createReadFileTool(
    options: CreateReadFileToolOptions
): Tool {
    return {
        name: "read_file",
        description: "Read a UTF-8 text file from the workspace",
        riskLevel: "safe",
        inputSchema: ReadFileInputSchema,
        async execute(rawArgs) {
            try {
                const args = ReadFileInputSchema.parse(rawArgs);
                const fullPath = resolveSafePath(options.workspaceRoot, args.path);
                const content = await fs.readFile(fullPath, "utf8");
                const sliced = content.slice(0, args.maxChars);

                return {
                    success: true,
                    output: {
                        path: args.path,
                        content: sliced,
                        truncated: content.length > sliced.length,
                        totalChars: content.length,
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