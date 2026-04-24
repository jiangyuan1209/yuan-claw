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

        const persistedMessages = trimMessages(
            messages.filter((m) => m.role !== "system"),
            {
                maxMessages: 24,
                maxContentChars: 8000,
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