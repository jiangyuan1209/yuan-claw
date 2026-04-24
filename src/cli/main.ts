import "dotenv/config";
import { parseCliArgs } from "./parse-args";
import { resolveWorkspaceRoot } from "../security/path-guards";
import { createToolRegistry } from "../tools/registry";
import { SessionStore } from "../memory/session-store";
import { createConsoleEventBus } from "../events/event-bus";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop";
import { createModelClient } from "../model/client";

async function main() {
    const args = parseCliArgs(process.argv.slice(2));

    if (!args.userInput) {
        console.error(
            'Usage: npm run dev -- [--session demo] [--workspace ./path] "your task"'
        );
        process.exit(1);
    }

    const workspaceRoot = resolveWorkspaceRoot(args.workspace ?? process.cwd());
    const tools = createToolRegistry({ workspaceRoot });
    const sessionStore = new SessionStore();
    const eventBus = createConsoleEventBus();

    const previousSession = args.sessionId
        ? await sessionStore.load(args.sessionId)
        : null;

    const modelClient = createModelClient();

    await runLocalAgentLoop({
        userInput: args.userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps: 10,
        previousMessages: previousSession?.messages ?? [],
        onMessagesUpdated: args.sessionId
            ? async (messages) => {
                await sessionStore.save(args.sessionId!, messages);
            }
            : undefined,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});