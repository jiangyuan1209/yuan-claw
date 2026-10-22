import fs from "node:fs/promises";
import fsSync from "node:fs";
import path from "node:path";
import { getUserHistoryDir } from "../config/config-path.js";
import { countMessagesChars } from "./message-chars.js";
import type { SessionData, ChatMessage } from "./types.js";

type SessionStoreOptions = {
    baseDir?: string;
};

/** 旧版本的会话目录（相对启动目录），首次运行时迁移到绝对路径下 */
const LEGACY_DIR_NAME = ".sessions";

export class SessionStore {
    private baseDir: string;

    constructor(options: SessionStoreOptions = {}) {
        this.baseDir = options.baseDir ?? getUserHistoryDir();
        this.migrateLegacySessions();
    }

    /**
     * 把旧版本写在 <cwd>/.sessions 下的会话搬到新的绝对路径目录。
     *
     * 逐个文件搬迁、已存在的目标文件一律保留，因此重复启动是幂等的，
     * 也不会覆盖新目录里的数据。会话文件名是 UUID，正常情况不会撞名。
     * 启动期一次性同步操作，文件数量少，不值得为此引入异步初始化流程。
     */
    private migrateLegacySessions(): void {
        const legacyDir = path.resolve(LEGACY_DIR_NAME);
        if (legacyDir === this.baseDir) return;

        try {
            if (!fsSync.existsSync(legacyDir)) return;

            fsSync.mkdirSync(this.baseDir, { recursive: true });
            let moved = 0;
            for (const file of fsSync.readdirSync(legacyDir)) {
                if (!file.endsWith(".json")) continue;
                const dest = path.join(this.baseDir, file);
                if (fsSync.existsSync(dest)) continue;
                fsSync.renameSync(path.join(legacyDir, file), dest);
                moved += 1;
            }
            if (moved > 0) {
                console.log(
                    `[session-store] 已将 ${moved} 个历史会话从 ${legacyDir} 迁移到 ${this.baseDir}`,
                );
            }
        } catch (error) {
            console.warn(
                "[session-store] 历史会话迁移失败（忽略，继续使用新目录）:",
                error instanceof Error ? error.message : String(error),
            );
        }
    }

    private getFilePath(sessionId: string) {
        return path.join(this.baseDir, `${sessionId}.json`);
    }

    async load(sessionId: string): Promise<SessionData | null> {
        try {
            const filePath = this.getFilePath(sessionId);
            const text = await fs.readFile(filePath, "utf8");
            const parsed = JSON.parse(text) as SessionData;
            // 目录里可能混有非会话文件（例如用户自己放的配置），一律当作不存在
            if (!parsed || !Array.isArray(parsed.messages)) {
                return null;
            }
            return parsed;
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) {
                return null;
            }
            throw error;
        }
    }

    /**
     * 创建一个空会话文件，把会话与工作区的归属关系立即落盘。
     *
     * Web 端在工作区下点「+」新建对话时调用，这样后续 WebSocket 恢复、
     * /api/chat 都能直接从磁盘解析出该会话所属的工作区。
     */
    async createSession(sessionId: string, workspaceId: string): Promise<void> {
        await this.save(sessionId, [], workspaceId);
    }

    /**
     * 保存完整对话历史到磁盘。
     *
     * 不再在保存时做激进截断——运行时通过 compressHistoryIfNeeded
     * 在发送给 LLM 前进行智能压缩（超过阈值时调用 LLM 压缩）。
     * 持久化时保留完整消息，确保会话恢复后不丢失上下文。
     *
     * 仅过滤掉 system 消息（每次调用 LLM 时会重新构建）。
     */
    async save(
        sessionId: string,
        messages: ChatMessage[],
        workspaceId?: string,
    ): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });

        const persistedMessages = messages.filter((m) => m.role !== "system");

        const data: SessionData = {
            sessionId,
            messages: persistedMessages,
            updatedAt: new Date().toISOString(),
            ...(workspaceId ? { workspaceId } : {}),
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
                if (!data) continue;

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
                    charCount: countMessagesChars(data.messages),
                    preview,
                    workspaceId: data.workspaceId,
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
    /** 历史对话占用的字符数，用于前端进度条 */
    charCount: number;
    preview: string;
    /** 所属工作区，Web 模式下创建的会话必然有值 */
    workspaceId?: string;
};
