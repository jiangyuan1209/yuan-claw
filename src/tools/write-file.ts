import crypto from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { toolRegistry } from "./registry.js";

const schema = z.object({
    path: z.string().min(1),
    content: z.string(),
});

toolRegistry.register({
    definition: {
        name: "write_file",
        description: "Write UTF-8 text content to a local file.",
        schema: {
            type: "object",
            properties: {
                path: { type: "string" },
                content: { type: "string" },
            },
            required: ["path", "content"],
            additionalProperties: false,
        },
    },

    async execute(args) {
        const parsed = schema.parse(args);
        await fs.writeFile(parsed.path, parsed.content, "utf8");

        return {
            toolCallId: crypto.randomUUID(),
            toolName: "write_file",
            success: true,
            content: `File written successfully: ${parsed.path}`,
            data: { path: parsed.path },
        };
    },
});