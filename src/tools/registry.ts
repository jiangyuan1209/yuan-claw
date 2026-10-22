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
    createBaiduSearchProvider,
} from "./web/index.js";

type CreateToolRegistryOptions = {
    workspaceRoot: string;
    config?: AppConfig;
};

/**
 * 与 workspaceRoot 绑定的工具集。
 *
 * 这些工具在构造时就把工作区根目录固化进了闭包，切换工作区主目录时必须重建；
 * 其余工具（web_search、MCP 工具等）与目录无关，可以在多个工作区之间复用。
 *
 * options.trusted：受信任上下文（如 Web 工作区，用户已授权目录内读写与命令执行），
 * 传给 shell_exec 以跳过命令白名单，允许 curl 等命令直接执行（危险命令黑名单仍生效）。
 */
export function createWorkspaceBoundTools(
    workspaceRoot: string,
    options: { trusted?: boolean } = {},
): Tool[] {
    return [
        createReadFileTool({ workspaceRoot }),
        createWriteFileTool({ workspaceRoot }),
        createListFilesTool({ workspaceRoot }),
        createGrepTextTool({ workspaceRoot }),
        createShellExecTool({ workspaceRoot, trusted: options.trusted }),
        createGitStatusTool({ workspaceRoot }),
        createGitDiffTool({ workspaceRoot }),
    ];
}

export function createToolRegistry(
    options: CreateToolRegistryOptions
): Map<string, Tool> {
    const tools: Tool[] = [
        ...createWorkspaceBoundTools(options.workspaceRoot),
        // createHttpFetchTool(),
        // createExtractReadableTextTool(),
    ];

    const config = options.config ?? {};

    const baiduApiKey = config.BAIDU_API_KEY;
    const baiduApiUrl = config.BAIDU_API_URL;

    if (baiduApiKey) {
        tools.push(
            createWebSearchTool({
                provider: createBaiduSearchProvider({
                    apiKey: baiduApiKey,
                    baseUrl: baiduApiUrl,
                }),
            })
        );
        console.warn("[tools] web_search enabled via Baidu Search API");
    } else {
        console.warn(
            "[tools] web_search disabled: set BAIDU_API_KEY in settings.json"
        );
    }

    return new Map(tools.map((tool) => [tool.name, tool]));
}

export function getToolsFromRegistry(registry: Map<string, Tool>): Tool[] {
    return Array.from(registry.values());
}