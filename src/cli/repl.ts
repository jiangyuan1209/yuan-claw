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

function approvalLabel(decision: ApprovalDecision): string {
    switch (decision) {
        case "deny":
            return "不允许";
        case "allow-once":
            return "允许";
        case "allow-always":
            return "总是允许";
    }
}

function printApprovalMenu(message: string, selectedIndex: number) {
    const options = [
        { label: "不允许", hint: "拒绝这次操作" },
        { label: "允许", hint: "仅允许这一次" },
        { label: "总是允许", hint: "当前会话后续 confirm / dangerous 操作自动允许" },
    ];

    output.write(`\n${message}\n\n`);
    output.write("使用 ↑ / ↓ 切换，Enter 确认，Ctrl+C 拒绝\n\n");

    for (let i = 0; i < options.length; i += 1) {
        const prefix = i === selectedIndex ? "❯" : " ";
        output.write(`${prefix} ${options[i].label}  ${options[i].hint}\n`);
    }

    output.write("\n");
}

async function selectApprovalWithArrows(
    message: string,
): Promise<ApprovalDecision> {
    const values: ApprovalDecision[] = ["deny", "allow-once", "allow-always"];
    let selectedIndex = 1;

    return await new Promise<ApprovalDecision>((resolve) => {
        const cleanup = () => {
            input.off("data", onData);
            if (input.isTTY) {
                input.setRawMode(false);
            }
        };

        const onData = (buffer: Buffer) => {
            const key = buffer.toString("utf8");

            if (key === "\u0003") {
                cleanup();
                output.write("\n");
                resolve("deny");
                return;
            }

            if (key === "\r" || key === "\n") {
                const result = values[selectedIndex];
                cleanup();
                output.write(`已选择：${approvalLabel(result)}\n\n`);
                resolve(result);
                return;
            }

            if (key === "\u001b[A") {
                selectedIndex =
                    selectedIndex === 0 ? values.length - 1 : selectedIndex - 1;
                printApprovalMenu(message, selectedIndex);
                return;
            }

            if (key === "\u001b[B") {
                selectedIndex =
                    selectedIndex === values.length - 1 ? 0 : selectedIndex + 1;
                printApprovalMenu(message, selectedIndex);
            }
        };

        if (output.isTTY) {
            output.write("\x1b[2K\r");
        }

        if (input.isTTY) {
            input.setRawMode(true);
        }

        input.resume();
        input.on("data", onData);

        printApprovalMenu(message, selectedIndex);
    });
}

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
        const result = await selectApprovalWithArrows(message);
        console.log("");
        return result;
    }

    console.log("Welcome to Yuan Agent!");
    console.log("Type /help for commands, /exit to quit.");
    console.log("Approval mode is shown in the prompt: [ask] or [always].\n");

    while (true) {
        let line: string;

        try {
            const promptLabel =
                approvalMode === "always-allow"
                    ? "yuan-agent[always]> "
                    : "yuan-agent[ask]> ";

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
  /clear   Clear current session history and reset approval mode
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