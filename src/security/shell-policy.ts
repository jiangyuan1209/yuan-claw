import path from "node:path";

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
    "python3",
    "python",
    "pip3",
    "pip",
    "pdftotext",
    "qpdf",
    "pandoc",
    "which",
];

export type ShellPolicyOptions = {
    /**
     * 受信任上下文（如工作区）：用户已授权该目录下的读写与命令执行，
     * 因此跳过命令白名单校验，直接放行 curl 等未列入白名单的命令。
     * 无论是否受信任，危险命令黑名单（rm -rf /、sudo 等）始终强制执行。
     */
    trusted?: boolean;
};

export function validateShellCommand(
    command: string,
    options: ShellPolicyOptions = {},
) {
    const trimmed = command.trim();

    if (!trimmed) {
        throw new Error("Shell command cannot be empty");
    }

    for (const pattern of DEFAULT_DENY_PATTERNS) {
        if (pattern.test(trimmed)) {
            throw new Error(`Shell command denied by policy: ${trimmed}`);
        }
    }

    // 工作区等受信任上下文已获用户授权，不再用白名单限制可执行的命令。
    if (options.trusted) {
        return;
    }

    const firstToken = trimmed.split(/\s+/)[0];

    // Also allow absolute paths ending with known commands (e.g. /usr/bin/python3)
    const commandName = firstToken.includes(path.sep)
        ? path.basename(firstToken)
        : firstToken;

    if (!DEFAULT_ALLOW_PREFIXES.includes(commandName)) {
        throw new Error(
            `Shell command not allowed by policy. Command prefix: ${firstToken}`
        );
    }
}