const DEFAULT_DENY_PATTERNS = [
    /\brm\s+-rf\s+\//i,
    /\bsudo\b/i,
    /\bshutdown\b/i,
    /\breboot\b/i,
    /\bmkfs\b/i,
    /\bdd\b/i,
    />\s*\/dev\//i,
];

const DEFAULT_ALLOW_PREFIXES = [
    "ls",
    "pwd",
    "cat",
    "echo",
    "find",
    "grep",
    "head",
    "tail",
    "wc",
    "sort",
    "uniq",
    "npm",
    "node",
    "git",
];

export function validateShellCommand(command: string) {
    const trimmed = command.trim();

    if (!trimmed) {
        throw new Error("Shell command cannot be empty");
    }

    for (const pattern of DEFAULT_DENY_PATTERNS) {
        if (pattern.test(trimmed)) {
            throw new Error(`Shell command denied by policy: ${trimmed}`);
        }
    }

    const firstToken = trimmed.split(/\s+/)[0];

    if (!DEFAULT_ALLOW_PREFIXES.includes(firstToken)) {
        throw new Error(
            `Shell command not allowed by policy. Command prefix: ${firstToken}`
        );
    }
}