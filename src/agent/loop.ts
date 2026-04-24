import { appendMessage, updateRun } from "./session.js";
import { buildModelMessages } from "./context.js";
import { decideNextAction } from "../model/provider.js";
import { executeTool } from "../tools/executor.js";
import { eventBus } from "../core/events.js";
import { shapeFinalOutput } from "./output.js";

export async function runLocalAgentLoop(params: {
    sessionId: string;
    runId: string;
    userText: string;
    maxSteps?: number;
}) {
    const maxSteps = params.maxSteps ?? 10;

    updateRun(params.runId, {
        status: "running",
        startedAt: Date.now(),
    });

    eventBus.emitEvent({
        type: "run_start",
        runId: params.runId,
    });

    await appendMessage({
        sessionId: params.sessionId,
        runId: params.runId,
        role: "user",
        content: params.userText,
    });

    try {
        for (let step = 1; step <= maxSteps; step++) {
            const messages = buildModelMessages(params.sessionId);
            const action = await decideNextAction(messages);

            if (action.type === "final") {
                const finalText = shapeFinalOutput(action.message);

                await appendMessage({
                    sessionId: params.sessionId,
                    runId: params.runId,
                    role: "assistant",
                    content: finalText,
                });

                eventBus.emitEvent({
                    type: "assistant_final",
                    runId: params.runId,
                    text: finalText,
                });

                updateRun(params.runId, {
                    status: "completed",
                    endedAt: Date.now(),
                });

                eventBus.emitEvent({
                    type: "run_end",
                    runId: params.runId,
                });

                return {
                    ok: true,
                    finalText,
                };
            }

            if (action.type === "tool_call") {
                eventBus.emitEvent({
                    type: "tool_start",
                    runId: params.runId,
                    toolName: action.toolName,
                    args: action.args,
                });

                const result = await executeTool({
                    toolName: action.toolName,
                    args: action.args,
                });

                await appendMessage({
                    sessionId: params.sessionId,
                    runId: params.runId,
                    role: "tool",
                    toolName: action.toolName,
                    content: result.content,
                    metadata: {
                        success: result.success,
                        data: result.data,
                        error: result.error,
                    },
                });

                eventBus.emitEvent({
                    type: "tool_end",
                    runId: params.runId,
                    toolName: action.toolName,
                    result,
                });

                continue;
            }
        }

        throw new Error("Max steps exceeded");
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);

        updateRun(params.runId, {
            status: "failed",
            endedAt: Date.now(),
            error: message,
        });

        eventBus.emitEvent({
            type: "run_error",
            runId: params.runId,
            error: message,
        });

        return {
            ok: false,
            error: message,
        };
    }
}