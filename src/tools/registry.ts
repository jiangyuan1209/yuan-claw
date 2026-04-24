import type { Tool } from "./types";

import { createReadFileTool } from "./file/read-file";
import { createWriteFileTool } from "./file/write-file";
import { createListFilesTool } from "./file/list-files";
import { createGrepTextTool } from "./file/grep-text";

import { createShellExecTool } from "./shell/shell-exec";

import { createGitStatusTool } from "./git/git-status";
import { createGitDiffTool } from "./git/git-diff";

import { createHttpFetchTool } from "./web/http-fetch";

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