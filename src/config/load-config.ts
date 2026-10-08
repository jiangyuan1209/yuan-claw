import fs from "node:fs/promises";
import { z } from "zod";
import { getUserSettingsPath } from "./config-path.js";

/**
 * 单个 MCP 服务端的连接配置。
 *
 * - name: 仅用于日志展示，标识这是哪个 MCP 服务。
 * - url: MCP 服务端地址。SSE 传输通常以 /sse 结尾（如 Spring AI MCP: http://localhost:8086/sse）。
 * - transport: 传输协议，缺省为 "sse"。新版 MCP 服务端可用 "streamable-http"。
 */
const mcpServerSchema = z.object({
    name: z.string(),
    url: z.string(),
    transport: z.enum(["sse", "streamable-http"]).optional(),
});

export type McpServerConfig = z.infer<typeof mcpServerSchema>;

const userSettingsSchema = z.object({
    MODEL_API_KEY: z.string().optional(),
    MODEL_BASE_URL: z.string().optional(),
    MODEL_NAME: z.string().optional(),

    BAIDU_API_KEY: z.string().optional(),
    BAIDU_API_URL: z.string().optional(),

    /** 视觉模型名称，用于图片 OCR 文字识别，缺省为 qwen-vl-plus */
    VISION_MODEL: z.string().optional(),

    /** 语音识别（STT）使用的 DashScope 实时 ASR 模型名，缺省为 fun-asr-realtime */
    STT_MODEL: z.string().optional(),

    /**
     * 要接入的 MCP 服务端列表。启动时会连接这些服务端、拉取其工具清单，
     * 并把每个远程工具包装成本地 Tool 注册进 Agent 的工具表。
     * 未配置或为空数组时，不接入任何 MCP 服务。
     */
    MCP_SERVERS: z.array(mcpServerSchema).optional(),
});

export type AppConfig = z.infer<typeof userSettingsSchema>;

async function loadSettingsFile(): Promise<AppConfig> {
    const settingsPath = getUserSettingsPath();

    try {
        const raw = await fs.readFile(settingsPath, "utf-8");
        const json = JSON.parse(raw);
        return userSettingsSchema.parse(json);
    } catch {
        return {};
    }
}

export async function loadAppConfig(): Promise<AppConfig> {
    return await loadSettingsFile();
}