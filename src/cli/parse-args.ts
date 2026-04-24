export type ParsedCliArgs = {
    sessionId?: string;
    workspace?: string;
    userInput: string;
};

export function parseCliArgs(argv: string[]): ParsedCliArgs {
    let sessionId: string | undefined;
    let workspace: string | undefined;
    const rest: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const token = argv[i];

        if (token === "--session") {
            sessionId = argv[i + 1];
            i++;
            continue;
        }

        if (token === "--workspace") {
            workspace = argv[i + 1];
            i++;
            continue;
        }

        rest.push(token);
    }

    return {
        sessionId,
        workspace,
        userInput: rest.join(" ").trim(),
    };
}