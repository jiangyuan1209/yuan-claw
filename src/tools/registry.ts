import type { Tool } from "./types.js";

import { createReadFileTool } from "./file/read-file.js";
import { createWriteFileTool } from "./file/write-file.js";
import { createListFilesTool } from "./file/list-files.js";
import { createGrepTextTool } from "./file/grep-text.js";

import { createShellExecTool } from "./shell/shell-exec.js";

import { createGitStatusTool } from "./git/git-status.js";
import { createGitDiffTool } from "./git/git-diff.js";

import { createHttpFetchTool } from "./web/http-fetch.js";

type CreateToolRegistryOptions = {
    workspaceRoot: string;
};

export function createToolRegistry(
    options: CreateToolRegistryOptions
): Map<string, Tool> {
    const tools: Tool[] = [
        createReadFileTool({ workspaceRoot: options.workspaceRoot }),
        createWriteFileTool({ workspaceRoot: options.workspaceRoot }),
        createListFilesTool({ workspaceRoot: options.workspaceRoot }),
        createGrepTextTool({ workspaceRoot: options.workspaceRoot }),
        createShellExecTool({ workspaceRoot: options.workspaceRoot }),
        createGitStatusTool({ workspaceRoot: options.workspaceRoot }),
        createGitDiffTool({ workspaceRoot: options.workspaceRoot }),
        createHttpFetchTool(),
    ];

    return new Map(tools.map((tool) => [tool.name, tool]));
}

export function getToolsFromRegistry(registry: Map<string, Tool>): Tool[] {
    return Array.from(registry.values());
}