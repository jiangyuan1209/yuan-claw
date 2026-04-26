import { z } from "zod";

export type ToolRiskLevel = "safe" | "confirm" | "dangerous";

export type ToolResult =
    | { success: true; output: unknown }
    | { success: false; error: string };

export type Tool = {
    name: string;
    description: string;
    inputSchema?: z.ZodTypeAny;
    riskLevel?: ToolRiskLevel;
    execute: (args: Record<string, unknown>) => Promise<ToolResult>;
};