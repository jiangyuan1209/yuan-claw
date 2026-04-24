import fs from "node:fs/promises";
import { z } from "zod";
import type { Tool } from "../types";
import { resolveSafePath } from "../../security/path-guards";

const ReadFileInputSchema = z.object({
    path: z.string().min(1),
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
        inputSchema: ReadFileInputSchema,
        async execute(rawArgs) {
            try {
                const args = ReadFileInputSchema.parse(rawArgs);
                const fullPath = resolveSafePath(options.workspaceRoot, args.path);
                const content = await fs.readFile(fullPath, "utf8");

                return {
                    success: true,
                    output: {
                        path: args.path,
                        content,
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