import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import crypto from "node:crypto";
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
    config: AppConfig;
};

export async function startRepl(options: StartReplOptions) {
    const rl = readline.createInterface({ input, output });
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

    async function requestApproval(message: string): Promise<ApprovalDecision> {
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
    }

    console.log("Welcome to my-agent!");
    console.log("Type /help for commands, /exit to quit.");
    console.log("Approval mode is shown in the prompt: [ask] or [always].\n");

    while (true) {
        let line: string;

        try {
            const promptLabel = approvalMode === "always-allow"
                ? "my-agent[always]> "
                : "my-agent[ask]> ";

            line = await rl.question(promptLabel);
        } catch {
            console.log("\nBye!");
            break;
        }

        const userInput = line.trim();

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
  /clear   Clear current session history
  /save    Save current session
  /reset   Reset approval mode to ask
  /status  Show current session status
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
            continue;
        }

        const eventBus = createConsoleEventBus({
            json: options.json,
            quiet: options.quiet,
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

    rl.close();
}