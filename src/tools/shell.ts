import crypto from "node:crypto";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import { toolRegistry } from "./registry.js";

const execAsync = promisify(exec);

const schema = z.object({
    command: z.string().min(1),
});

toolRegistry.register({
    definition: {
        name: "shell_exec",
        description: "Execute a shell command on the local machine.",
        schema: {
            type: "object",
            properties: {
                command: { type: "string" },
            },
            required: ["command"],
            additionalProperties: false,
        },
    },

    async execute(args) {
        const parsed = schema.parse(args);
        const { stdout, stderr } = await execAsync(parsed.command, {
            timeout: 15_000,
            maxBuffer: 1024 * 1024,
        });

        const content = [
            stdout ? `STDOUT:\n${stdout}` : "",
            stderr ? `STDERR:\n${stderr}` : "",
        ]
            .filter(Boolean)
            .join("\n\n");

        return {
            toolCallId: crypto.randomUUID(),
            toolName: "shell_exec",
            success: true,
            content: content || "Command executed successfully with no output.",
            data: { stdout, stderr },
        };
    },
});