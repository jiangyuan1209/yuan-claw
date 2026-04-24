import { z } from "zod";

export type ToolResult =
    | { success: true; output: unknown }
    | { success: false; error: string };

export type Tool = {
    name: string;
    description: string;
    inputSchema?: z.ZodTypeAny;
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};