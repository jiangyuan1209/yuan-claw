import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "../types.js";

const execFileAsync = promisify(execFile);

const GitDiffInputSchema = z.object({
    cached: z.boolean().default(false),
    path: z.string().optional(),
    maxChars: z.number().int().positive().max(50000).default(12000),
});

type CreateGitDiffToolOptions = {
    workspaceRoot: string;
};

export function createGitDiffTool(
    options: CreateGitDiffToolOptions
): Tool {
    return {
        name: "git_diff",
        description: "Get git diff in the workspace",
        riskLevel: "safe",
        inputSchema: GitDiffInputSchema,
        async execute(rawArgs : unknown) {
            try {
                const args = GitDiffInputSchema.parse(rawArgs);

                const gitArgs = ["diff"];
                if (args.cached) {
                    gitArgs.push("--cached");
                }
                if (args.path) {
                    gitArgs.push("--", args.path);
                }

                const { stdout, stderr } = await execFileAsync("git", gitArgs, {
                    cwd: options.workspaceRoot,
                    timeout: 10000,
                    maxBuffer: 1024 * 1024,
                });

                const diff = stdout.slice(0, args.maxChars);

                return {
                    success: true,
                    output: {
                        cached: args.cached,
                        path: args.path ?? null,
                        diff,
                        truncated: stdout.length > diff.length,
                        totalChars: stdout.length,
                        returnedChars: diff.length,
                        stderr,
                        empty: stdout.trim().length === 0,
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