#!/usr/bin/env node
import "dotenv/config";
import { initGlobalProxy } from "../lib/initGlobalProxy.js";
import type { ChatMessage } from "../memory/types.js";
import { parseCliArgs } from "./parse-args.js";
import { getHelpText } from "./help.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createConsoleEventBus } from "../events/event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
import { createModelClient } from "../model/client.js";
import { ensureUserConfigInitialized } from "../config/init-user-config.js";
import { loadAppConfig } from "../config/load-config.js";
import { startRepl } from "./repl.js";

async function runSingleTurn() {
    const args = parseCliArgs(process.argv.slice(2));

    if (args.help) {
        console.log(getHelpText());
        return;
    }

    const initResult = await ensureUserConfigInitialized();
    const config = await loadAppConfig();

    if (initResult.createdSettings) {
        console.log(`Initialized config file at: ${initResult.settingsPath}`);
        console.log("Please edit the file and add your model settings if needed.\n");
    }

    initGlobalProxy(config);

    if (!args.userInput) {
        await startRepl({
            workspace: args.workspace,
            model: args.model,
            json: args.json,
            quiet: args.quiet,
            maxSteps: args.maxSteps,
            config,
        });
        return;
    }

    const workspaceRoot = resolveWorkspaceRoot(args.workspace ?? process.cwd());
    const tools = createToolRegistry({
        workspaceRoot,
        config,
    });
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
        config,
    });

    const finalMessage = await runLocalAgentLoop({
        userInput: args.userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps: args.maxSteps ?? 30,
        previousMessages: previousSession?.messages ?? [],
        onMessagesUpdated: args.sessionId
            ? async (messages: ChatMessage[]) => {
                await sessionStore.save(args.sessionId!, messages);
            }
            : undefined,
    });

    if (!args.quiet) {
        console.log(finalMessage);
    }
}

runSingleTurn().catch((error) => {
    console.error(error);
    process.exit(1);
});