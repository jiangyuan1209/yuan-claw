import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "../types";

const execFileAsync = promisify(execFile);

const GitDiffInputSchema = z.object({
    cached: z.boolean().default(false),
    path: z.string().optional(),
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
        inputSchema: GitDiffInputSchema,
        async execute(rawArgs) {
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

                return {
                    success: true,
                    output: {
                        cached: args.cached,
                        path: args.path ?? null,
                        diff: stdout,
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