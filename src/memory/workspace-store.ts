import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { getUserWorkspacesPath } from "../config/config-path.js";
import type { Workspace } from "./types.js";

type WorkspaceStoreOptions = {
    /** 工作区元数据文件路径，缺省为 ~/.yuan-claw/workspaces.json */
    filePath?: string;
};

type WorkspaceFile = {
    workspaces: Workspace[];
};

/**
 * 工作区元数据的持久化存储。
 *
 * 所有工作区保存在单个 JSON 文件里（工作区数量少、写入频率低），
 * 每次写操作都是「读全量 → 改 → 写全量」，避免维护索引与数据的一致性。
 */
export class WorkspaceStore {
    private filePath: string;

    constructor(options: WorkspaceStoreOptions = {}) {
        this.filePath = options.filePath ?? getUserWorkspacesPath();
    }

    private async readAll(): Promise<Workspace[]> {
        try {
            const text = await fs.readFile(this.filePath, "utf8");
            const parsed = JSON.parse(text) as WorkspaceFile;
            return Array.isArray(parsed.workspaces) ? parsed.workspaces : [];
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            if (message.includes("ENOENT")) {
                return [];
            }
            throw error;
        }
    }

    private async writeAll(workspaces: Workspace[]): Promise<void> {
        await fs.mkdir(path.dirname(this.filePath), { recursive: true });
        const data: WorkspaceFile = { workspaces };
        await fs.writeFile(this.filePath, JSON.stringify(data, null, 2), "utf8");
    }

    async list(): Promise<Workspace[]> {
        const workspaces = await this.readAll();
        return workspaces.sort(
            (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
    }

    async get(id: string): Promise<Workspace | null> {
        const workspaces = await this.readAll();
        return workspaces.find((w) => w.id === id) ?? null;
    }

    async create(input: {
        name: string;
        directories: string[];
        primaryDir: string;
    }): Promise<Workspace> {
        const directories = input.directories.map((d) => path.resolve(d));
        const primaryDir = path.resolve(input.primaryDir);

        if (!directories.includes(primaryDir)) {
            throw new Error(`主目录 ${primaryDir} 不在所选目录列表中`);
        }

        const workspace: Workspace = {
            id: crypto.randomUUID(),
            name: input.name.trim() || path.basename(primaryDir),
            directories,
            primaryDir,
            createdAt: new Date().toISOString(),
        };

        const workspaces = await this.readAll();
        workspaces.push(workspace);
        await this.writeAll(workspaces);
        return workspace;
    }

    async delete(id: string): Promise<void> {
        const workspaces = await this.readAll();
        const next = workspaces.filter((w) => w.id !== id);
        if (next.length !== workspaces.length) {
            await this.writeAll(next);
        }
    }
}
