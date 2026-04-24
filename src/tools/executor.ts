import crypto from "node:crypto";
import { toolRegistry } from "./registry.js";
import type { ToolResult } from "../core/types.js";

export async function executeTool(input: {
    toolName: string;
    args: Record<string, unknown>;
}): Promise<ToolResult> {
    const tool = toolRegistry.get(input.toolName);

    if (!tool) {
        return {
            toolCallId: crypto.randomUUID(),
            toolName: input.toolName,
            success: false,
            content: `Tool not found: ${input.toolName}`,
            error: "TOOL_NOT_FOUND",
        };
    }

    try {
        return await tool.execute(input.args);
    } catch (error) {
        return {
            toolCallId: crypto.randomUUID(),
            toolName: input.toolName,
            success: false,
            content: error instanceof Error ? error.message : String(error),
            error: "TOOL_EXECUTION_FAILED",
        };
    }
}