import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { Tool } from "../types";
import { validateShellCommand } from "../../security/shell-policy";

const execFileAsync = promisify(execFile);

const ShellExecInputSchema = z.object({
    command: z.string().min(1),
    timeoutMs: z.number().int().positive().max(20000).default(10000),
});

type CreateShellExecToolOptions = {
    workspaceRoot: string;
};

export function createShellExecTool(
    options: CreateShellExecToolOptions
): Tool {
    return {
        name: "shell_exec",
        description: "Execute a shell command in the workspace with safety policy",
        inputSchema: ShellExecInputSchema,
        async execute(rawArgs) {
            try {
                const args = ShellExecInputSchema.parse(rawArgs);
                validateShellCommand(args.command);

                const { stdout, stderr } = await execFileAsync("sh", ["-lc", args.command], {
                    cwd: options.workspaceRoot,
                    timeout: args.timeoutMs,
                    maxBuffer: 1024 * 1024,
                });

                return {
                    success: true,
                    output: {
                        stdout,
                        stderr,
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