import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import crypto from "node:crypto";
import type { ChatMessage } from "../memory/types.js";
import { resolveWorkspaceRoot } from "../security/path-guards.js";
import { createToolRegistry } from "../tools/registry.js";
import { SessionStore } from "../memory/session-store.js";
import { createConsoleEventBus } from "../events/event-bus.js";
import { runLocalAgentLoop } from "../agent/run-local-agent-loop.js";
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

    console.log("Welcome to my-agent!");
    console.log("Type /help for commands, /exit to quit.\n");

    while (true) {
        let line: string;

        try {
            line = await rl.question("my-agent> ");
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
  /help   Show help
  /exit   Exit
  /quit   Exit
  /clear  Clear current session history
  /save   Save current session
`);
            continue;
        }

        if (userInput === "/clear") {
            messages = [];
            console.log("Session history cleared.");
            continue;
        }

        if (userInput === "/save") {
            await sessionStore.save(sessionId, messages);
            console.log(`Session saved: ${sessionId}`);
            continue;
        }

        const eventBus = createConsoleEventBus({
            json: options.json,
            quiet: options.quiet,
        });

        try {
            const finalMessage = await runLocalAgentLoop({
                userInput,
                modelClient,
                tools,
                eventBus,
                maxSteps: options.maxSteps ?? 30,
                previousMessages: messages,
                onMessagesUpdated: async (updatedMessages: ChatMessage[]) => {
                    messages = updatedMessages;
                },
            });

            if (!options.quiet) {
                console.log(finalMessage);
            }
        } catch (error) {
            console.error(error);
        }
    }

    rl.close();
}