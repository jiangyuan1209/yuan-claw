#!/usr/bin/env node
import "dotenv/config";
import { select, cancel, isCancel } from "@clack/prompts";
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
    const result = await select<ApprovalDecision>({
        message,
        options: [
            {
                value: "deny",
                label: "不允许",
                hint: "拒绝这次操作",
            },
            {
                value: "allow-once",
                label: "允许",
                hint: "仅允许这一次",
            },
            {
                value: "allow-always",
                label: "总是允许",
                hint: "仅当前本次运行/会话有效",
            },
        ],
    });

    if (isCancel(result)) {
        cancel("已取消，本次按不允许处理。");
        console.log("");
        return "deny";
    }

    console.log("");
    return result;
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