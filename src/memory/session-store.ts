import fs from "node:fs/promises";
import path from "node:path";
import type { SessionData, ChatMessage } from "./types.js";

type SessionStoreOptions = {
    baseDir?: string;
};

export class SessionStore {
    private baseDir: string;

    constructor(options: SessionStoreOptions = {}) {
        this.baseDir = path.resolve(options.baseDir ?? ".sessions");
    }

    private getSessionPath(sessionId: string) {
        return path.join(this.baseDir, `${sessionId}.json`);
    }

    async load(sessionId: string): Promise<SessionData | null> {
        try {
            const filePath = this.getSessionPath(sessionId);
            const raw = await fs.readFile(filePath, "utf8");
            return JSON.parse(raw) as SessionData;
        } catch {
            return null;
        }
    }

    async save(sessionId: string, messages: ChatMessage[]) {
        await fs.mkdir(this.baseDir, { recursive: true });

        const data: SessionData = {
            sessionId,
            messages,
            updatedAt: new Date().toISOString(),
        };

        const filePath = this.getSessionPath(sessionId);
        await fs.writeFile(filePath, JSON.stringify(data, null, 2), "utf8");
    }
}