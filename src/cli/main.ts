import "dotenv/config";
import type { ChatMessage } from "../memory/types.js";
import { parseCliArgs } from "./parse-args.js";
import { getHelpText } from "./help.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createConsoleEventBus } from "../events/event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
import { createModelClient } from "../model/client.js";

async function main() {
    const args = parseCliArgs(process.argv.slice(2));

    if (args.help) {
        console.log(getHelpText());
        return;
    }

    if (!args.userInput) {
        console.error(getHelpText());
        process.exit(1);
    }

    const workspaceRoot = resolveWorkspaceRoot(args.workspace ?? process.cwd());
    const tools = createToolRegistry({ workspaceRoot });
    const sessionStore = new SessionStore();
    const eventBus = createConsoleEventBus({
        json: args.json,
        quiet: args.quiet,
    });

    const previousSession = args.sessionId
        ? await sessionStore.load(args.sessionId)
        : null;

    const modelClient = createModelClient({
        model: args.model,
    });

    await runLocalAgentLoop({
        userInput: args.userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps: args.maxSteps ?? 8,
        previousMessages: previousSession?.messages ?? [],
        onMessagesUpdated: args.sessionId
            ? async (messages: ChatMessage[]) => {
                await sessionStore.save(args.sessionId!, messages);
            }
            : undefined,
    });
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});