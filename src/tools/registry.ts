import type { ToolDefinition, ToolResult } from "../core/types.js";

export interface AgentTool {
    definition: ToolDefinition;
    execute(args: Record<string, unknown>): Promise<ToolResult>;
}

export class ToolRegistry {
    private tools = new Map<string, AgentTool>();

    register(tool: AgentTool) {
        this.tools.set(tool.definition.name, tool);
    }

    get(name: string): AgentTool | undefined {
        return this.tools.get(name);
    }

    listDefinitions(): ToolDefinition[] {
        return [...this.tools.values()].map((t) => t.definition);
    }
}

export const toolRegistry = new ToolRegistry();