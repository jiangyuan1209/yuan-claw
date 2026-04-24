export type AgentEvent =
    | { type: "run_start"; input: string }
    | { type: "run_end"; reason: string; step?: number }
    | { type: "run_error"; step?: number; stage?: string; error: string }
    | { type: "tool_start"; toolName: string; args: Record<string, unknown>; step?: number }
    | { type: "tool_end"; toolName: string; success: boolean; result: unknown; step?: number }
    | { type: "tool_error"; toolName: string; error: string; step?: number }
    | { type: "assistant"; message: string }
    | { type: "model_raw"; text: string; step?: number };

export type EventBus = {
    emit: (event: AgentEvent) => void;
};

type CreateConsoleEventBusOptions = {
    pretty?: boolean;
};

export function createConsoleEventBus(
    options: CreateConsoleEventBusOptions = {}
): EventBus {
    return {
        emit(event) {
            if (options.pretty ?? true) {
                switch (event.type) {
                    case "run_start":
                        console.log(`\n[run_start] ${event.input}`);
                        break;
                    case "run_end":
                        console.log(`\n[run_end] reason=${event.reason} step=${event.step ?? "-"}`);
                        break;
                    case "run_error":
                        console.log(`\n[run_error] stage=${event.stage ?? "-"} step=${event.step ?? "-"}`);
                        console.log(event.error);
                        break;
                    case "tool_start":
                        console.log(`\n[tool_start] ${event.toolName}`);
                        console.log(JSON.stringify(event.args, null, 2));
                        break;
                    case "tool_end":
                        console.log(`\n[tool_end] ${event.toolName} success=${event.success}`);
                        break;
                    case "tool_error":
                        console.log(`\n[tool_error] ${event.toolName}`);
                        console.log(event.error);
                        break;
                    case "assistant":
                        console.log(`\n[assistant]`);
                        console.log(event.message);
                        break;
                    case "model_raw":
                        console.log(`\n[model_raw] step=${event.step ?? "-"}`);
                        console.log(event.text);
                        break;
                }
            } else {
                console.log(JSON.stringify(event));
            }
        },
    };
}