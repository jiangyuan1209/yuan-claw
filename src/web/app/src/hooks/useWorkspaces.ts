import { useState, useCallback, useEffect } from "react";
import { message as antdMessage } from "antd";
import type { SessionMeta, Workspace } from "../types";

/**
 * useWorkspaces — 工作区列表的读取与增删。
 *
 * 工作区决定了对话的默认读写目录与授权范围，侧边栏按工作区分组展示对话，
 * 输入框旁的工作区按钮也依赖这份列表，因此在 App 层统一持有。
 */
export function useWorkspaces() {
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/workspaces");
            if (res.ok) {
                const data = (await res.json()) as { workspaces: Workspace[] };
                setWorkspaces(data.workspaces);
            }
        } catch {
            // 静默失败：侧边栏保持上一次的数据
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const createWorkspace = useCallback(
        async (input: {
            name: string;
            directories: string[];
            primaryDir: string;
        }): Promise<Workspace | null> => {
            try {
                const res = await fetch("/api/workspaces", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(input),
                });
                const data = await res.json();
                if (!res.ok) {
                    throw new Error(data.error || "创建工作区失败");
                }
                setWorkspaces((prev) => [data.workspace as Workspace, ...prev]);
                return data.workspace as Workspace;
            } catch (err) {
                antdMessage.error(
                    `创建工作区失败: ${err instanceof Error ? err.message : "未知错误"}`,
                );
                return null;
            }
        },
        [],
    );

    const deleteWorkspace = useCallback(async (id: string) => {
        try {
            const res = await fetch(`/api/workspace/${id}`, { method: "DELETE" });
            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: "删除失败" }));
                throw new Error(data.error || "删除失败");
            }
            setWorkspaces((prev) => prev.filter((w) => w.id !== id));
        } catch (err) {
            antdMessage.error(
                `删除工作区失败: ${err instanceof Error ? err.message : "未知错误"}`,
            );
        }
    }, []);

    return { workspaces, loading, refresh, createWorkspace, deleteWorkspace };
}

/**
 * useSessions — 历史对话列表（侧边栏数据源）。
 *
 * 服务端返回的每条记录都带 workspaceId，由侧边栏按工作区分组渲染。
 */
export function useSessions() {
    const [sessions, setSessions] = useState<SessionMeta[]>([]);
    const [loading, setLoading] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch("/api/sessions");
            if (res.ok) {
                const data = (await res.json()) as { sessions: SessionMeta[] };
                setSessions(data.sessions);
            }
        } catch {
            // 静默失败
        } finally {
            setLoading(false);
        }
    }, []);

    const remove = useCallback(async (sessionId: string) => {
        try {
            await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
            setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        } catch {
            // 静默失败
        }
    }, []);

    return { sessions, loading, refresh, remove };
}
