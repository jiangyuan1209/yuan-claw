import type { AppConfig } from "../config/load-config.js";
import type { Tool } from "./types.js";

import { createReadFileTool } from "./file/read-file.js";
import { createWriteFileTool } from "./file/write-file.js";
import { createListFilesTool } from "./file/list-files.js";
import { createGrepTextTool } from "./file/grep-text.js";

import { createShellExecTool } from "./shell/shell-exec.js";

import { createGitStatusTool } from "./git/git-status.js";
import { createGitDiffTool } from "./git/git-diff.js";

import {
    createHttpFetchTool,
    createWebSearchTool,
    createExtractReadableTextTool,
    createBraveSearchProvider,
} from "./web/index.js";

type CreateToolRegistryOptions = {
    workspaceRoot: string;
    config?: AppConfig;
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
        createExtractReadableTextTool(),
    ];

    const config = options.config ?? {};

    const braveApiKey =
        config.BRAVE_SEARCH_API_KEY ??
        config.BRAVE_API_KEY ??
        process.env.BRAVE_SEARCH_API_KEY ??
        process.env.BRAVE_API_KEY;

    if (braveApiKey) {
        tools.push(
            createWebSearchTool({
                provider: createBraveSearchProvider({
                    apiKey: braveApiKey,
                }),
            })
        );
        console.warn("[tools] web_search enabled via Brave Search API");
    } else {
        console.warn(
            "[tools] web_search disabled: set BRAVE_SEARCH_API_KEY or BRAVE_API_KEY"
        );
    }

    return new Map(tools.map((tool) => [tool.name, tool]));
}

export function getToolsFromRegistry(registry: Map<string, Tool>): Tool[] {
    return Array.from(registry.values());
}