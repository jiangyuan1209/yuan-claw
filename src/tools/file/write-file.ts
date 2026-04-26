import fs from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import type { Tool } from "../types.js";
import { resolveSafePath } from "../../security/path-guards.js";

const WriteFileInputSchema = z.object({
    path: z.string().min(1),
    content: z.string(),
});

type CreateWriteFileToolOptions = {
    workspaceRoot: string;
};

export function createWriteFileTool(
    options: CreateWriteFileToolOptions
): Tool {
    return {
        name: "write_file",
        description: "Write a UTF-8 text file inside the workspace",
        riskLevel: "confirm",
        inputSchema: WriteFileInputSchema,
        async execute(rawArgs) {
            try {
                const args = WriteFileInputSchema.parse(rawArgs);
                const fullPath = resolveSafePath(options.workspaceRoot, args.path);

                await fs.mkdir(path.dirname(fullPath), { recursive: true });
                await fs.writeFile(fullPath, args.content, "utf8");

                return {
                    success: true,
                    output: {
                        path: args.path,
                        bytes: Buffer.byteLength(args.content, "utf8"),
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