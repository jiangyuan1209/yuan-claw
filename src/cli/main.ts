#!/usr/bin/env node
import "dotenv/config";
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { initGlobalProxy } from "../lib/initGlobalProxy.js";
import type { ChatMessage } from "../memory/types.js";
import { parseCliArgs } from "./parse-args.js";
import { getHelpText } from "./help.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createConsoleEventBus } from "../events/event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
import type { ApprovalDecision } from "../agent/read-approval.js";
import { createModelClient } from "../model/client.js";
import { ensureUserConfigInitialized } from "../config/init-user-config.js";
import { loadAppConfig } from "../config/load-config.js";
import { startRepl } from "./repl.js";

async function requestApprovalFromConsole(
    message: string,
): Promise<ApprovalDecision> {
    const rl = readline.createInterface({ input, output });

    try {
        while (true) {
            console.log(message);
            console.log("");
            console.log("请选择：");
            console.log("  1) 不允许");
            console.log("  2) 允许");
            console.log("  3) 总是允许");
            console.log("");

            const answer = (await rl.question("输入 1/2/3: "))
                .trim()
                .toLowerCase();

            console.log("");

            if (answer === "1" || answer === "n" || answer === "no") {
                return "deny";
            }

            if (answer === "2" || answer === "y" || answer === "yes") {
                return "allow-once";
            }

            if (
                answer === "3" ||
                answer === "a" ||
                answer === "always" ||
                answer === "always-allow"
            ) {
                return "allow-always";
            }

            console.log("无效输入，请输入 1、2 或 3。\n");
        }
    } finally {
        rl.close();
    }
}

async function main() {
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

    const result = await runLocalAgentLoop({
        userInput: args.userInput,
        modelClient,
        tools,
        eventBus,
        maxSteps: args.maxSteps ?? 30,
        previousMessages: previousSession?.messages ?? [],
        approvalMode: "ask",
        requestApproval: requestApprovalFromConsole,
        onMessagesUpdated: args.sessionId
            ? async (messages: ChatMessage[]) => {
                await sessionStore.save(args.sessionId!, messages);
            }
            : undefined,
    });

    if (!args.quiet) {
        console.log(result.finalMessage);
    }
}

main().catch((error) => {
    console.error(error);
    process.exit(1);
});