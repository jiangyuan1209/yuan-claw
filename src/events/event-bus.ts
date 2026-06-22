export type AgentEvent =
    | { type: "run_start"; input: string }
    | { type: "model_raw"; text: string; step: number }
    | { type: "tool_start"; toolName: string; args: unknown; step: number }
    | {
    type: "tool_end";
    toolName: string;
    success: boolean;
    result: unknown;
    step: number;
}
    | { type: "tool_error"; toolName: string; error: string; step: number }
    | { type: "assistant"; message: string }
    | {
    type: "run_error";
    step: number;
    stage: "model_generate" | "parse_agent_response" | "confirmation";
    error: string;
}
    | {
    type: "run_end";
    reason: "final" | "max_steps_exceeded";
    step: number;
};

export type EventBus = {
    emit: (event: AgentEvent) => void;
    showProcessing: () => void;
    hideProcessing: () => void;
};

type CreateConsoleEventBusOptions = {
    json?: boolean;
    quiet?: boolean;
    debug?: boolean;
};

function printToolResultPreview(result: unknown) {
    try {
        const preview = JSON.stringify(result, null, 2);
        console.log(
            preview.slice(0, 800) + (preview.length > 800 ? "\n...[truncated]" : "")
        );
    } catch {
        console.log(String(result));
    }
}

let processingTimer: ReturnType<typeof setInterval> | null = null;
let processingDots = 0;

function showProcessing() {
    processingDots = 0;
    process.stdout.write("\n处理中");
    processingTimer = setInterval(() => {
        processingDots = (processingDots + 1) % 4;
        process.stdout.write(`\r处理中${".".repeat(processingDots)}   `);
    }, 400);
}

function hideProcessing() {
    if (processingTimer) {
        clearInterval(processingTimer);
        processingTimer = null;
    }
    // Clear the "处理中..." line
    process.stdout.write("\r" + " ".repeat(20) + "\r");
}

export function createConsoleEventBus(
    options: CreateConsoleEventBusOptions = {},
): EventBus {
    const json = options.json ?? false;
    const quiet = options.quiet ?? false;
    const debug = options.debug ?? false;

    return {
        emit(event) {
            if (json) {
                console.log(JSON.stringify(event));
                return;
            }

            if (quiet || !debug) {
                // Non-debug mode: only show final results and errors
                if (event.type === "assistant") {
                    console.log(event.message);
                }

                if (event.type === "run_error") {
                    console.error(`[run_error] ${event.stage}: ${event.error}`);
                }

                // Show processing indicator on run_start, hide on run_end
                if (event.type === "run_start") {
                    showProcessing();
                }

                if (event.type === "run_end") {
                    hideProcessing();
                }

                return;
            }

            // Debug mode: show all intermediate steps
            switch (event.type) {
                case "run_start":
                    console.log(`\n[run_start] ${event.input}`);
                    break;

                case "model_raw":
                    console.log(`\n[model_raw] step=${event.step}`);
                    console.log(event.text);
                    break;

                case "tool_start":
                    console.log(`\n[tool_start] ${event.toolName}`);
                    console.log(JSON.stringify(event.args, null, 2));
                    break;

                case "tool_end":
                    console.log(`\n[tool_end] ${event.toolName} success=${event.success}`);
                    printToolResultPreview(event.result);
                    break;

                case "tool_error":
                    console.log(`\n[tool_error] ${event.toolName}`);
                    console.log(event.error);
                    break;

                case "assistant":
                    console.log(`\n[assistant]`);
                    console.log(event.message);
                    break;

                case "run_error":
                    console.log(`\n[run_error] stage=${event.stage} step=${event.step}`);
                    console.log(event.error);
                    break;

                case "run_end":
                    console.log(`\n[run_end] reason=${event.reason} step=${event.step}`);
                    break;
            }
        },

        showProcessing,
        hideProcessing,
    };
}