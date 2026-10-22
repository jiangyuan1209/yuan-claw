import React from "react";
import { Button, Typography, Empty, Popconfirm, Spin, Tooltip, theme } from "antd";
import {
    PlusOutlined,
    DeleteOutlined,
    MessageOutlined,
    FolderOutlined,
    AppstoreOutlined,
} from "@ant-design/icons";
import type { SessionMeta, Workspace } from "../types";

const { Text } = Typography;

interface SessionSidebarProps {
    /** 当前活跃的 sessionId */
    activeSessionId: string | null;
    /** 全部历史对话（含 workspaceId，用于分组） */
    sessions: SessionMeta[];
    /** 全部工作区 */
    workspaces: Workspace[];
    loading: boolean;
    /** 侧边栏是否展开 */
    collapsed: boolean;
    onSelectSession: (sessionId: string) => void;
    /** 在某个工作区下新建对话 */
    onNewSessionInWorkspace: (workspaceId: string) => void;
    onCreateWorkspace: () => void;
    onDeleteSession: (sessionId: string) => void;
    onDeleteWorkspace: (workspaceId: string) => void;
}

function formatTime(isoString: string): string {
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    const diffHour = Math.floor(diffMs / 3600000);
    const diffDay = Math.floor(diffMs / 86400000);

    if (diffMin < 1) return "刚刚";
    if (diffMin < 60) return `${diffMin} 分钟前`;
    if (diffHour < 24) return `${diffHour} 小时前`;
    if (diffDay < 7) return `${diffDay} 天前`;
    return date.toLocaleDateString("zh-CN", { month: "short", day: "numeric" });
}

/**
 * SessionSidebar — 按工作区分组的历史对话侧边栏。
 *
 * 对话必须在工作区下创建，因此侧边栏的主体是「工作区 → 其下对话」的两级结构，
 * 每个工作区右侧的 + 按钮用于在该工作区下新建对话。
 * 没有工作区归属的历史对话（迁移自旧版本）单独归到末尾一组，只能查看不能继续。
 */
export const SessionSidebar: React.FC<SessionSidebarProps> = ({
    activeSessionId,
    sessions,
    workspaces,
    loading,
    collapsed,
    onSelectSession,
    onNewSessionInWorkspace,
    onCreateWorkspace,
    onDeleteSession,
    onDeleteWorkspace,
}) => {
    const { token } = theme.useToken();

    if (collapsed) return null;

    const renderSession = (session: SessionMeta, canChat: boolean) => {
        const isActive = session.sessionId === activeSessionId;
        return (
            <div
                key={session.sessionId}
                onClick={() => onSelectSession(session.sessionId)}
                style={{
                    padding: "8px 10px",
                    marginBottom: 4,
                    borderRadius: 8,
                    cursor: "pointer",
                    background: isActive ? token.colorPrimaryBg : "transparent",
                    border: isActive
                        ? `1px solid ${token.colorPrimaryBorder}`
                        : "1px solid transparent",
                    transition: "all 0.2s",
                }}
                onMouseEnter={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = token.colorFillTertiary;
                    }
                }}
                onMouseLeave={(e) => {
                    if (!isActive) {
                        e.currentTarget.style.background = "transparent";
                    }
                }}
            >
                <div
                    style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 8,
                    }}
                >
                    <div style={{ flex: 1, minWidth: 0 }}>
                        <Text
                            ellipsis
                            style={{
                                fontSize: 13,
                                fontWeight: isActive ? 500 : 400,
                                display: "block",
                                opacity: canChat ? 1 : 0.6,
                            }}
                        >
                            <MessageOutlined style={{ marginRight: 6, fontSize: 11 }} />
                            {session.preview}
                        </Text>
                        <div
                            style={{ marginTop: 4, display: "flex", gap: 8, alignItems: "center" }}
                        >
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {formatTime(session.updatedAt)}
                            </Text>
                            <Text type="secondary" style={{ fontSize: 11 }}>
                                {session.messageCount} 条
                            </Text>
                        </div>
                    </div>
                    <Popconfirm
                        title="删除此对话？"
                        description="删除后无法恢复"
                        onConfirm={(e) => {
                            e?.stopPropagation();
                            onDeleteSession(session.sessionId);
                        }}
                        onCancel={(e) => e?.stopPropagation()}
                        okText="删除"
                        cancelText="取消"
                    >
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={(e) => e.stopPropagation()}
                            style={{ opacity: 0.5, flexShrink: 0 }}
                        />
                    </Popconfirm>
                </div>
            </div>
        );
    };

    const renderWorkspaceGroup = (workspace: Workspace) => {
        const groupSessions = sessions.filter((s) => s.workspaceId === workspace.id);
        return (
            <div key={workspace.id} style={{ marginBottom: 12 }}>
                <div
                    style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 6,
                        padding: "6px 8px",
                        borderRadius: 6,
                        background: token.colorFillQuaternary,
                    }}
                >
                    <FolderOutlined style={{ color: token.colorPrimary, flexShrink: 0 }} />
                    <Tooltip title={`主目录：${workspace.primaryDir}`}>
                        <Text
                            ellipsis
                            style={{ flex: 1, minWidth: 0, fontSize: 12, fontWeight: 600 }}
                        >
                            {workspace.name}
                        </Text>
                    </Tooltip>
                    <Text type="secondary" style={{ fontSize: 11, flexShrink: 0 }}>
                        {groupSessions.length}
                    </Text>
                    <Tooltip title="在此工作区下新建对话">
                        <Button
                            type="text"
                            size="small"
                            icon={<PlusOutlined />}
                            onClick={() => onNewSessionInWorkspace(workspace.id)}
                            style={{ flexShrink: 0 }}
                        />
                    </Tooltip>
                    <Popconfirm
                        title="删除此工作区？"
                        description="工作区下的所有对话也会一并删除"
                        onConfirm={() => onDeleteWorkspace(workspace.id)}
                        okText="删除"
                        cancelText="取消"
                    >
                        <Button
                            type="text"
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            style={{ opacity: 0.5, flexShrink: 0 }}
                        />
                    </Popconfirm>
                </div>

                <div style={{ padding: "6px 0 0 10px" }}>
                    {groupSessions.length === 0 ? (
                        <Text type="secondary" style={{ fontSize: 11, paddingLeft: 4 }}>
                            暂无对话，点 + 新建
                        </Text>
                    ) : (
                        groupSessions.map((s) => renderSession(s, true))
                    )}
                </div>
            </div>
        );
    };

    const orphanSessions = sessions.filter(
        (s) => !s.workspaceId || !workspaces.some((w) => w.id === s.workspaceId),
    );

    return (
        <div
            style={{
                width: 300,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: token.colorBgContainer,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            {/* 头部：新建工作区 */}
            <div
                style={{
                    padding: "12px 16px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Button type="primary" icon={<PlusOutlined />} block onClick={onCreateWorkspace}>
                    新建工作区
                </Button>
            </div>

            <div
                style={{ padding: "12px 16px 8px", display: "flex", alignItems: "center", gap: 6 }}
            >
                <AppstoreOutlined style={{ color: token.colorTextSecondary }} />
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                    工作区 ({workspaces.length})
                </Text>
            </div>

            <div style={{ flex: 1, overflowY: "auto", padding: "0 8px 8px" }}>
                {loading ? (
                    <div style={{ textAlign: "center", padding: 24 }}>
                        <Spin size="small" />
                    </div>
                ) : workspaces.length === 0 && orphanSessions.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="还没有工作区，先创建一个吧"
                        style={{ marginTop: 40 }}
                    />
                ) : (
                    <>
                        {workspaces.map(renderWorkspaceGroup)}

                        {orphanSessions.length > 0 && (
                            <div style={{ marginBottom: 12 }}>
                                <div
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: 6,
                                        padding: "6px 8px",
                                        borderRadius: 6,
                                        background: token.colorFillQuaternary,
                                    }}
                                >
                                    <Text
                                        ellipsis
                                        style={{ flex: 1, fontSize: 12, fontWeight: 600 }}
                                        type="secondary"
                                    >
                                        未关联工作区
                                    </Text>
                                    <Tooltip title="这些对话来自旧版本，只能查看历史，无法继续对话">
                                        <Text type="secondary" style={{ fontSize: 11 }}>
                                            只读
                                        </Text>
                                    </Tooltip>
                                </div>
                                <div style={{ padding: "6px 0 0 10px" }}>
                                    {orphanSessions.map((s) => renderSession(s, false))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};
