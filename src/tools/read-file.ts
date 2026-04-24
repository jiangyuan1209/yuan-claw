import crypto from "node:crypto";
import fs from "node:fs/promises";
import { z } from "zod";
import { toolRegistry } from "./registry.js";

const schema = z.object({
    path: z.string().min(1),
});

toolRegistry.register({
    definition: {
        name: "read_file",
        description: "Read a UTF-8 text file from the local filesystem.",
        schema: {
            type: "object",
            properties: {
                path: { type: "string" },
            },
            required: ["path"],
            additionalProperties: false,
        },
    },

    async execute(args) {
        const parsed = schema.parse(args);
        const content = await fs.readFile(parsed.path, "utf8");

        return {
            toolCallId: crypto.randomUUID(),
            toolName: "read_file",
            success: true,
            content,
            data: { path: parsed.path },
        };
    },
});