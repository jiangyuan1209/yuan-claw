import { EventEmitter } from "node:events";
import type { ToolResult } from "./types.js";

export type AgentEvent =
    | { type: "run_start"; runId: string }
    | { type: "assistant_delta"; runId: string; text: string }
    | { type: "assistant_final"; runId: string; text: string }
    | { type: "tool_start"; runId: string; toolName: string; args: unknown }
    | { type: "tool_end"; runId: string; toolName: string; result: ToolResult }
    | { type: "run_end"; runId: string }
    | { type: "run_error"; runId: string; error: string };

class AgentEventBus extends EventEmitter {
    emitEvent(event: AgentEvent) {
        this.emit("event", event);
    }

    onEvent(listener: (event: AgentEvent) => void) {
        this.on("event", listener);
    }
}

export const eventBus = new AgentEventBus();