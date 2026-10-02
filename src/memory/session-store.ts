import fs from "node:fs/promises";
import path from "node:path";
import type { SessionData, ChatMessage } from "./types.js";

type SessionStoreOptions = {
    baseDir?: string;
};

export class SessionStore {
    private baseDir: string;

    constructor(options: SessionStoreOptions = {}) {
        this.baseDir = options.baseDir ?? path.resolve(".sessions");
    }

    private getFilePath(sessionId: string) {
        return path.join(this.baseDir, `${sessionId}.json`);
    }

    async load(sessionId: string): Promise<SessionData | null> {
        try {
            const filePath = this.getFilePath(sessionId);
            const text = await fs.readFile(filePath, "utf8");
            return JSON.parse(text) as SessionData;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) {
                return null;
            }
            throw error;
        }
    }

    /**
     * 保存完整对话历史到磁盘。
     *
     * 不再在保存时做激进截断——运行时通过 compressHistoryIfNeeded
     * 在发送给 LLM 前进行智能压缩（超过 100,000 字符时调用 LLM 压缩）。
     * 持久化时保留完整消息，确保会话恢复后不丢失上下文。
     *
     * 仅过滤掉 system 消息（每次调用 LLM 时会重新构建）。
     */
    async save(sessionId: string, messages: ChatMessage[]): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });

        const persistedMessages = messages.filter((m) => m.role !== "system");

        const data: SessionData = {
            sessionId,
            messages: persistedMessages,
            updatedAt: new Date().toISOString(),
        };

        const filePath = this.getFilePath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    }

    /** 列出所有已保存的 session ID */
    async listSessions(): Promise<string[]> {
        try {
            const files = await fs.readdir(this.baseDir);
            return files
                .filter((f) => f.endsWith(".json"))
                .map((f) => f.replace(".json", ""));
        } catch {
            return [];
        }
    }

    /** 列出所有 session 及其摘要信息（用于前端侧边栏展示） */
    async listSessionsWithMeta(): Promise<SessionMeta[]> {
        const ids = await this.listSessions();
        const results: SessionMeta[] = [];

        for (const id of ids) {
            try {
                const data = await this.load(id);
                if (!data || data.messages.length === 0) continue;

                // 取第一条真正的用户输入作为预览（跳过工具结果 JSON）
                const firstUserMsg = data.messages.find((m) => {
                    if (m.role !== "user") return false;
                    const content = typeof m.content === "string" ? m.content.trim() : "";
                    // 跳过 JSON 格式的工具结果
                    if (content.startsWith("{")) {
                        try {
                            const parsed = JSON.parse(content);
                            if (parsed._meta || parsed.tool_result !== undefined) return false;
                        } catch {
                            // 不是合法 JSON，当作用户输入
                        }
                    }
                    return content.length > 0;
                });

                const preview = firstUserMsg
                    ? (typeof firstUserMsg.content === "string"
                        ? firstUserMsg.content
                        : "[图片消息]"
                      ).slice(0, 80)
                    : "(空对话)";

                results.push({
                    sessionId: id,
                    updatedAt: data.updatedAt,
                    messageCount: data.messages.length,
                    preview,
                });
            } catch {
                // 跳过无法读取的 session 文件
            }
        }

        // 按更新时间倒序排列（最近的在前）
        results.sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
        return results;
    }

    /** 删除指定 session */
    async delete(sessionId: string): Promise<void> {
        try {
            await fs.unlink(this.getFilePath(sessionId));
        } catch {
            // 文件不存在则忽略
        }
    }
}

export type SessionMeta = {
    sessionId: string;
    updatedAt: string;
    messageCount: number;
    preview: string;
};