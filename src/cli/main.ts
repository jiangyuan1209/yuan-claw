import "../tools/shell.js";
import "../tools/read-file.js";
import "../tools/write-file.js";

import { createRun, getOrCreateSession } from "../agent/session.js";
import { sessionQueue } from "../agent/queue.js";
import { runLocalAgentLoop } from "../agent/loop.js";
import { eventBus } from "../core/events.js";
import { loadConfig } from "../config.js";

async function main() {
    const config = loadConfig();
    const userText = process.argv.slice(2).join(" ").trim();

    if (!userText) {
        console.log('Usage: npm run dev -- "read package.json and summarize it"');
        process.exit(1);
    }

    const sessionId = config.agent.sessionId;
    getOrCreateSession(sessionId);

    const run = createRun(sessionId, userText);

    eventBus.onEvent((event) => {
        switch (event.type) {
            case "run_start":
                console.log(`\n[run_start] ${event.runId}`);
                break;
            case "tool_start":
                console.log(`\n[tool_start] ${event.toolName}`);
                console.log(JSON.stringify(event.args, null, 2));
                break;
            case "tool_end":
                console.log(`\n[tool_end] ${event.toolName} success=${event.result.success}`);
                break;
            case "assistant_final":
                console.log(`\n[assistant]\n${event.text}`);
                break;
            case "run_end":
                console.log(`\n[run_end] ${event.runId}`);
                break;
            case "run_error":
                console.error(`\n[run_error] ${event.error}`);
                break;
        }
    });

    await sessionQueue.enqueue(sessionId, async () => {
        await runLocalAgentLoop({
            sessionId,
            runId: run.runId,
            userText,
            maxSteps: config.agent.maxSteps,
        });
    });
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});