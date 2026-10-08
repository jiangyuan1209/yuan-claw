import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { SSEClientTransport } from "@modelcontextprotocol/sdk/client/sse.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

import type { Tool, ToolResult, ToolRiskLevel } from "../types.js";
import type { AppConfig, McpServerConfig } from "../../config/load-config.js";

/**
 * MCP 接入层
 * ============
 *
 * yuan-claw 的工具体系是「JSON 提示词驱动」的：所有工具都写进 system prompt
 * （只渲染 name / riskLevel / description），大模型据此输出
 * {"type":"tool_call","toolName":"...","args":{...}}，再由 Agent 循环调用
 * tool.execute(args)。
 *
 * 因此接入一个 MCP 服务端只需要三步（对应 Python 参考实现 graph5.py 里的
 * MultiServerMCPClient.get_tools()）：
 *   1. 连接 MCP 服务端（SSE / streamable-http 传输）；
 *   2. 调用 tools/list 拉取远程工具清单；
 *   3. 把每个远程工具包装成本地 Tool —— execute 内部转成 tools/call。
 *
 * 由于 system prompt 不会渲染 zod 的 inputSchema，这里把 MCP 工具的 JSON
 * Schema 参数说明拼接进 description，好让大模型知道该传哪些参数。
 */

/** tools/list 返回的单个工具定义类型（直接取自 SDK，避免结构不一致）。 */
type McpToolDefinition = Awaited<ReturnType<Client["listTools"]>>["tools"][number];

/** 一个已成功连接的 MCP 服务端及其暴露的本地工具。 */
type ConnectedServer = {
    name: string;
    client: Client;
    tools: Tool[];
};

/** loadMcpTools 的结果：聚合后的工具集 + 关闭所有连接的函数。 */
export type McpConnection = {
    tools: Tool[];
    close: () => Promise<void>;
};

/**
 * 把 MCP 工具的 JSON Schema 参数渲染成一行中文说明，拼进 description。
 * 例：`参数: city (string, 必填): 城市名称，必须是英文格式`
 */
function renderParams(inputSchema: McpToolDefinition["inputSchema"]): string {
    const properties = inputSchema?.properties ?? {};
    const required = new Set(inputSchema?.required ?? []);
    const entries = Object.entries(properties);

    if (entries.length === 0) {
        return "";
    }

    const parts = entries.map(([key, rawSchema]) => {
        const schema = rawSchema as Record<string, unknown>;
        const type = typeof schema.type === "string" ? schema.type : "any";
        const description =
            typeof schema.description === "string" ? schema.description : "";
        const requirement = required.has(key) ? "必填" : "可选";
        return `${key} (${type}, ${requirement})${description ? `: ${description}` : ""}`;
    });

    return `参数: ${parts.join("; ")}`;
}

/**
 * 依据 MCP 工具的 annotations 推断风险级别，复用 yuan-claw 的审批机制：
 * - destructiveHint=true → dangerous（调用前需确认）
 * - 其余（含只读 readOnlyHint）→ safe
 */
function riskFromAnnotations(
    annotations: McpToolDefinition["annotations"],
): ToolRiskLevel {
    if (annotations?.destructiveHint) {
        return "dangerous";
    }
    return "safe";
}

/** 从 tools/call 返回的 content 数组里抽取文本内容。 */
function extractText(content: unknown): string {
    if (!Array.isArray(content)) {
        return "";
    }

    return content
        .map((item) => {
            if (
                item &&
                typeof item === "object" &&
                (item as { type?: unknown }).type === "text" &&
                typeof (item as { text?: unknown }).text === "string"
            ) {
                return (item as { text: string }).text;
            }
            return "";
        })
        .filter((text) => text.length > 0)
        .join("\n");
}

/** 把一个 MCP 远程工具包装成 yuan-claw 本地 Tool。 */
function createMcpTool(client: Client, mcpTool: McpToolDefinition): Tool {
    const paramDoc = renderParams(mcpTool.inputSchema);
    const baseDescription = mcpTool.description ?? "";
    const description = [baseDescription, paramDoc]
        .filter((part) => part.length > 0)
        .join(" ");

    return {
        name: mcpTool.name,
        description,
        riskLevel: riskFromAnnotations(mcpTool.annotations),
        async execute(rawArgs: Record<string, unknown>): Promise<ToolResult> {
            try {
                const result = await client.callTool({
                    name: mcpTool.name,
                    arguments: rawArgs ?? {},
                });

                const text = extractText(result.content);
                const structured = (result as { structuredContent?: unknown })
                    .structuredContent;

                if (result.isError === true) {
                    return {
                        success: false,
                        error: text || `MCP tool "${mcpTool.name}" returned an error.`,
                    };
                }

                return {
                    success: true,
                    output: structured ?? text,
                };
            } catch (error) {
                return {
                    success: false,
                    error: error instanceof Error ? error.message : String(error),
                };
            }
        },
    };
}

/** 连接单个 MCP 服务端并拉取其工具清单。 */
async function connectServer(config: McpServerConfig): Promise<ConnectedServer> {
    const client = new Client(
        { name: "yuan-claw", version: "1.0.0" },
        { capabilities: {} },
    );

    const url = new URL(config.url);
    const transport =
        config.transport === "streamable-http"
            ? new StreamableHTTPClientTransport(url)
            : new SSEClientTransport(url);

    await client.connect(transport);

    const { tools } = await client.listTools();

    return {
        name: config.name,
        client,
        tools: tools.map((tool) => createMcpTool(client, tool)),
    };
}

/**
 * 并发连接所有配置的 MCP 服务端。
 * 单个服务端连接失败不会中断整体启动，只打印一条告警（与 graph5.py 中
 * 注释掉失效远程服务的容错思路一致）。
 */
export async function loadMcpTools(
    servers: McpServerConfig[],
): Promise<McpConnection> {
    const results = await Promise.allSettled(servers.map(connectServer));

    const tools: Tool[] = [];
    const clients: Client[] = [];

    results.forEach((result, index) => {
        const config = servers[index];

        if (result.status === "fulfilled") {
            tools.push(...result.value.tools);
            clients.push(result.value.client);
            console.warn(
                `[mcp] connected "${config.name}" (${result.value.tools.length} tools) -> ${config.url}`,
            );
        } else {
            const message =
                result.reason instanceof Error
                    ? result.reason.message
                    : String(result.reason);
            console.warn(
                `[mcp] failed to connect "${config.name}" (${config.url}): ${message}`,
            );
        }
    });

    return {
        tools,
        async close() {
            await Promise.allSettled(clients.map((client) => client.close()));
        },
    };
}

/**
 * 读取配置里的 MCP_SERVERS，连接并把远程工具注册进 Agent 的工具表。
 *
 * 直接原地修改传入的 registry（createToolRegistry 返回的 Map），返回一个
 * close 函数用于在进程退出前断开 SSE 连接 —— 否则打开的 socket 会让
 * Node 事件循环无法自然退出（CLI 单次执行会挂住）。
 *
 * 与已有本地工具重名的 MCP 工具会被跳过，保证本地工具优先。
 */
export async function registerMcpTools(
    registry: Map<string, Tool>,
    config?: AppConfig,
): Promise<() => Promise<void>> {
    const servers = config?.MCP_SERVERS ?? [];

    if (servers.length === 0) {
        return async () => {};
    }

    const { tools, close } = await loadMcpTools(servers);

    for (const tool of tools) {
        if (registry.has(tool.name)) {
            console.warn(`[mcp] tool "${tool.name}" skipped: name already registered`);
            continue;
        }
        registry.set(tool.name, tool);
    }

    return close;
}
