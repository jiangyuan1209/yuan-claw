import fs from "node:fs/promises";
import path from "node:path";
import type { SessionData, ChatMessage } from "./types.js";
import { trimMessages } from "../agent/message-utils.js";

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

    async save(sessionId: string, messages: ChatMessage[]): Promise<void> {
        await fs.mkdir(this.baseDir, { recursive: true });

        /**
         * ===== 对话记忆持久化时的截断 =====
         *
         * 这是 trimMessages 在整个项目中唯一被调用的位置。
         * 仅在 /save 命令或 --session 持久化时执行截断，
         * 运行时（REPL/Web 会话中）的对话记忆没有轮次限制。
         *
         * 截断参数：
         *   - maxMessages: 24       → 最多保留 24 条消息
         *   - maxTotalChars: 8000   → 总字符数不超过 8000
         *   - preserveRecentMessages: 6 → 始终保留最近 6 条
         *   - compactToolMessages: true → 压缩旧的工具调用消息
         *
         * 从磁盘重新加载 session 时，拿到的是截断后的历史。
         */
        const persistedMessages = trimMessages(
            messages.filter((m) => m.role !== "system"),
            {
                maxMessages: 24,
                maxTotalChars: 8000,
                preserveRecentMessages: 6,
                preserveSystemMessages: false,
                compactToolMessages: true,
            }
        );

        const data: SessionData = {
            sessionId,
            messages: persistedMessages,
            updatedAt: new Date().toISOString(),
        };

        const filePath = this.getFilePath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    }
}