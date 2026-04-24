export function getHelpText(): string {
    return `
my-agent - local CLI coding agent

Usage:
  npm run dev -- [options] "your task"
  npm run start -- [options] "your task"

Options:
  --session <id>        Use a persistent session id
  --workspace <path>    Set workspace root
  --max-steps <n>       Limit agent loop steps
  --model <name>        Override model name
  --json                Output events as JSON lines
  --quiet               Reduce console output
  --help, -h            Show help

Examples:
  npm run dev -- "read package.json"
  npm run dev -- --session demo "what do you know about this project?"
  npm run dev -- --max-steps 4 "show git diff and summarize changes"
  npm run dev -- --json "read tsconfig.json"
`.trim();
}