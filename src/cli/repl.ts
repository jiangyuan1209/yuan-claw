import { stdin as input, stdout as output } from "node:process";
import { execSync } from "node:child_process";
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

    console.log("Welcome to Yuan Claw!");
    console.log("Type /help for commands, /exit to quit.");
    console.log("Approval mode is shown in the prompt: [ask] or [always].\n");

    // Disable any existing readline state and terminal echo
    if (input.isTTY) {
        try {
            execSync("stty -echo", { stdio: "inherit" });
        } catch {
            // stty not available
        }
        input.setRawMode(true);
    }
    input.resume();

    // Restore echo on exit
    process.on("exit", () => {
        if (input.isTTY) {
            try {
                execSync("stty echo", { stdio: "inherit" });
            } catch {}
        }
    });
    input.removeAllListeners("data");

    /**
     * Custom raw mode input handler.
     * - Echo: all characters (including paste content) are written to output
     * - Backspace: removes last character with cursor movement
     * - Enter: submits the entire buffer (preserving newlines from paste)
     * - Ctrl+C: exits
     */
    function readUserInput(prompt: string): Promise<string | null> {
        return new Promise<string | null>((resolve) => {
            let buffer = "";

            if (input.isTTY) {
                input.setRawMode(true);
            }
            input.resume();

            output.write(prompt);

            const cleanup = () => {
                input.off("data", onData);
                if (input.isTTY) {
                    input.setRawMode(false);
                }
            };

            const onData = (data: Buffer) => {
                const rawText = data.toString("utf8");

                // Ctrl+C
                if (rawText === "\u0003") {
                    cleanup();
                    output.write("\nBye!\n");
                    process.exit(0);
                    return;
                }

                // Handle Enter
                if (rawText === "\r" || rawText === "\n") {
                    cleanup();
                    output.write("\n");
                    resolve(buffer.trim() || null);
                    return;
                }

                // Backspace (DEL or BS)
                if (rawText === "\x7f" || rawText === "\b") {
                    if (buffer.length > 0) {
                        const lastChar = buffer[buffer.length - 1];
                        buffer = buffer.slice(0, -1);
                        const cols = [...lastChar].length;
                        // Move cursor left, clear to end, move back
                        output.write(
                            `\x1b[${cols}D` +
                                " ".repeat(cols) +
                                `\x1b[${cols}D`,
                        );
                    }
                    return;
                }

                // Skip control characters (escape sequences, etc.)
                if (rawText.length > 0 && rawText.charCodeAt(0) < 0x20 && rawText !== "\t") {
                    return;
                }

                // Normalize line endings for echo and buffer
                const text = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");

                // Echo and buffer all other content
                output.write(text);
                buffer += text;
            };

            input.on("data", onData);
        });
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
}
