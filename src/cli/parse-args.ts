export type CliArgs = {
    userInput: string;
    sessionId?: string;
    workspace?: string;
    maxSteps?: number;
    model?: string;
    json: boolean;
    quiet: boolean;
    help: boolean;
};

export function parseCliArgs(argv: string[]): CliArgs {
    let sessionId: string | undefined;
    let workspace: string | undefined;
    let maxSteps: number | undefined;
    let model: string | undefined;
    let json = false;
    let quiet = false;
    let help = false;

    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === "--session" || arg === "--session-id") {
            sessionId = argv[++i];
            continue;
        }

        if (arg.startsWith("--session=")) {
            sessionId = arg.slice("--session=".length);
            continue;
        }

        if (arg.startsWith("--session-id=")) {
            sessionId = arg.slice("--session-id=".length);
            continue;
        }

        if (arg === "--workspace") {
            workspace = argv[++i];
            continue;
        }

        if (arg.startsWith("--workspace=")) {
            workspace = arg.slice("--workspace=".length);
            continue;
        }

        if (arg === "--max-steps") {
            const value = argv[++i];
            maxSteps = value ? Number(value) : undefined;
            continue;
        }

        if (arg.startsWith("--max-steps=")) {
            maxSteps = Number(arg.slice("--max-steps=".length));
            continue;
        }

        if (arg === "--model") {
            model = argv[++i];
            continue;
        }

        if (arg.startsWith("--model=")) {
            model = arg.slice("--model=".length);
            continue;
        }

        if (arg === "--json") {
            json = true;
            continue;
        }

        if (arg === "--quiet") {
            quiet = true;
            continue;
        }

        if (arg === "--help" || arg === "-h") {
            help = true;
            continue;
        }

        positional.push(arg);
    }

    return {
        userInput: positional.join(" ").trim(),
        sessionId,
        workspace,
        maxSteps:
            typeof maxSteps === "number" && Number.isFinite(maxSteps)
                ? maxSteps
                : undefined,
        model,
        json,
        quiet,
        help,
    };
}