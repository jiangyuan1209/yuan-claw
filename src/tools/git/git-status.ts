import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { Tool } from "../types.js";

const execFileAsync = promisify(execFile);

type CreateGitStatusToolOptions = {
    workspaceRoot: string;
};

export function createGitStatusTool(
    options: CreateGitStatusToolOptions
): Tool {
    return {
        name: "git_status",
        description: "Get git repository status in the workspace",
        riskLevel: "safe",
        async execute(rawArgs: unknown) {
            try {
                const { stdout: branchStdout } = await execFileAsync(
                    "git",
                    ["branch", "--show-current"],
                    {
                        cwd: options.workspaceRoot,
                        timeout: 10000,
                        maxBuffer: 1024 * 1024,
                    }
                );

                const { stdout, stderr } = await execFileAsync(
                    "git",
                    ["status", "--short", "--branch"],
                    {
                        cwd: options.workspaceRoot,
                        timeout: 10000,
                        maxBuffer: 1024 * 1024,
                    }
                );

                const lines = stdout
                    .split(/\r?\n/)
                    .map((line) => line.trimEnd())
                    .filter(Boolean);

                return {
                    success: true,
                    output: {
                        branch: branchStdout.trim() || null,
                        summary: stdout,
                        stderr,
                        lines,
                        dirty: lines.some((line) => !line.startsWith("##")),
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