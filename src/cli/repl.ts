import crypto from "node:crypto";
import { multiline, select, isCancel } from "@clack/prompts";
import type { ChatMessage } from "../memory/types.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createConsoleEventBus } from "../events/event-bus.js";
import {
    runLocalAgentLoop,
    type ApprovalMode,
} from "../agent/run-local-agent-loop.js";
import type { ApprovalDecision } from "../agent/read-approval.js";
import { createModelClient } from "../model/client.js";
import type { AppConfig } from "../config/load-config.js";

type StartReplOptions = {
    workspace?: string;
    model?: string;
    json?: boolean;
    quiet?: boolean;
    maxSteps?: number;
    debug?: boolean;
    config: AppConfig;
};

function approvalLabel(decision: ApprovalDecision): string {
    const labels: Record<ApprovalDecision, string> = {
        deny: "不允许",
        "allow-once": "允许",
        "allow-always": "总是允许",
    };
    return labels[decision];
}

export async function startRepl(options: StartReplOptions) {
    const sessionStore = new SessionStore();
    const sessionId = crypto.randomUUID();

    const workspaceRoot = resolveWorkspaceRoot(options.workspace ?? process.cwd());
    const tools = createToolRegistry({
        workspaceRoot,
        config: options.config,
    });

    const modelClient = createModelClient({
        model: options.model,
        config: options.config,
    });

    let messages: ChatMessage[] = [];
    let approvalMode: ApprovalMode = "ask";
    let debugMode = options.debug ?? false;

    async function requestApproval(message: string): Promise<ApprovalDecision> {
        const result = await select<ApprovalDecision>({
            message,
            options: [
                { value: "deny", label: "不允许", hint: "拒绝这次操作" },
                { value: "allow-once", label: "允许", hint: "仅允许这一次" },
                {
                    value: "allow-always",
                    label: "总是允许",
                    hint: "当前会话后续 confirm / dangerous 操作自动允许",
                },
            ],
        });

        if (isCancel(result)) {
            console.log("已取消，本次按不允许处理。");
            return "deny";
        }

        console.log(`已选择：${approvalLabel(result)}\n`);
        return result;
    }

    console.log("Welcome to Yuan Claw!");
    console.log("Type /help for commands, /exit to quit.");
    console.log("Approval mode is shown in the prompt: [ask] or [always].\n");

    /**
     * Read user input using @clack/prompts multiline.
     * Handles paste correctly with proper display.
     */
    async function readUserInput(prompt: string): Promise<string | null> {
        const result = await multiline({
            message: prompt,
        });

        if (isCancel(result)) {
            console.log("\nBye!");
            process.exit(0);
        }

        const text = typeof result === "string" ? result.trim() : null;
        return text || null;
    }

    while (true) {
        let userInput: string | null;

        try {
            const promptLabel =
                approvalMode === "always-allow"
                    ? "yuan-claw[always]> "
                    : "yuan-claw[ask]> ";

            userInput = await readUserInput(promptLabel);
        } catch {
            console.log("\nBye!");
            break;
        }

        if (!userInput) {
            continue;
        }

        if (userInput === "/exit" || userInput === "/quit") {
            console.log("Bye!");
            break;
        }

        if (userInput === "/help") {
            console.log(`
Commands:
  /help    Show help
  /exit    Exit
  /quit    Exit
  /clear   Clear current session history and reset approval mode
  /save    Save current session
  /reset   Reset approval mode to ask
  /status  Show current session status
  /debug   Toggle debug mode (show/hide intermediate steps)
`);
            continue;
        }

        if (userInput === "/clear") {
            messages = [];
            approvalMode = "ask";
            console.log("Session history cleared. Approval mode reset to ask.");
            continue;
        }

        if (userInput === "/save") {
            await sessionStore.save(sessionId, messages);
            console.log(`Session saved: ${sessionId}`);
            continue;
        }

        if (userInput === "/reset") {
            approvalMode = "ask";
            console.log("Approval mode reset to ask.");
            continue;
        }

        if (userInput === "/status") {
            console.log(`sessionId: ${sessionId}`);
            console.log(`approvalMode: ${approvalMode}`);
            console.log(`messageCount: ${messages.length}`);
            console.log(`debugMode: ${debugMode}`);
            continue;
        }

        if (userInput === "/debug") {
            debugMode = !debugMode;
            console.log(`Debug mode ${debugMode ? "enabled" : "disabled"}.`);
            continue;
        }

        const eventBus = createConsoleEventBus({
            json: options.json,
            quiet: options.quiet,
            debug: debugMode,
        });

        try {
            const result = await runLocalAgentLoop({
                userInput,
                modelClient,
                tools,
                eventBus,
                maxSteps: options.maxSteps ?? 30,
                previousMessages: messages,
                approvalMode,
                requestApproval,
                onMessagesUpdated: async (updatedMessages: ChatMessage[]) => {
                    messages = updatedMessages;
                },
            });

            approvalMode = result.approvalMode;

            if (!options.quiet) {
                console.log(result.finalMessage);
            }
        } catch (error) {
            console.error(error);
        }
    }
}
