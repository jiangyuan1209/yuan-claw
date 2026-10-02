import React, { useState, useEffect, useCallback } from "react";
import { Button, Typography, Empty, Popconfirm, Spin, theme } from "antd";
import {
    PlusOutlined,
    DeleteOutlined,
    MessageOutlined,
    HistoryOutlined,
} from "@ant-design/icons";

const { Text } = Typography;

export type SessionMeta = {
    sessionId: string;
    updatedAt: string;
    messageCount: number;
    preview: string;
};

interface SessionSidebarProps {
    /** 当前活跃的 sessionId */
    activeSessionId: string | null;
    /** 切换到指定会话 */
    onSelectSession: (sessionId: string) => void;
    /** 新建对话 */
    onNewSession: () => void;
    /** 侧边栏是否展开 */
    collapsed: boolean;
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

export const SessionSidebar: React.FC<SessionSidebarProps> = ({
    activeSessionId,
    onSelectSession,
    onNewSession,
    collapsed,
}) => {
    const { token } = theme.useToken();
    const [sessions, setSessions] = useState<SessionMeta[]>([]);
    const [loading, setLoading] = useState(false);

    const fetchSessions = useCallback(async () => {
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

    useEffect(() => {
        if (!collapsed) {
            fetchSessions();
        }
    }, [collapsed, fetchSessions]);

    const handleDelete = useCallback(
        async (sessionId: string, e: React.MouseEvent) => {
            e.stopPropagation();
            try {
                await fetch(`/api/session/${sessionId}`, { method: "DELETE" });
                setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
            } catch {
                // 静默失败
            }
        },
        [],
    );

    if (collapsed) return null;

    return (
        <div
            style={{
                width: 280,
                height: "100%",
                display: "flex",
                flexDirection: "column",
                background: token.colorBgContainer,
                borderRight: `1px solid ${token.colorBorderSecondary}`,
            }}
        >
            {/* 头部：新建对话按钮 */}
            <div
                style={{
                    padding: "12px 16px",
                    borderBottom: `1px solid ${token.colorBorderSecondary}`,
                }}
            >
                <Button
                    type="primary"
                    icon={<PlusOutlined />}
                    block
                    onClick={onNewSession}
                >
                    新建对话
                </Button>
            </div>

            {/* 标题 */}
            <div
                style={{
                    padding: "12px 16px 8px",
                    display: "flex",
                    alignItems: "center",
                    gap: 6,
                }}
            >
                <HistoryOutlined style={{ color: token.colorTextSecondary }} />
                <Text type="secondary" style={{ fontSize: 12, fontWeight: 500 }}>
                    历史对话 ({sessions.length})
                </Text>
            </div>

            {/* 会话列表 */}
            <div
                style={{
                    flex: 1,
                    overflowY: "auto",
                    padding: "0 8px 8px",
                }}
            >
                {loading ? (
                    <div style={{ textAlign: "center", padding: 24 }}>
                        <Spin size="small" />
                    </div>
                ) : sessions.length === 0 ? (
                    <Empty
                        image={Empty.PRESENTED_IMAGE_SIMPLE}
                        description="暂无历史对话"
                        style={{ marginTop: 40 }}
                    />
                ) : (
                    sessions.map((session) => {
                        const isActive = session.sessionId === activeSessionId;
                        return (
                            <div
                                key={session.sessionId}
                                onClick={() => onSelectSession(session.sessionId)}
                                style={{
                                    padding: "10px 12px",
                                    marginBottom: 4,
                                    borderRadius: 8,
                                    cursor: "pointer",
                                    background: isActive
                                        ? token.colorPrimaryBg
                                        : "transparent",
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
                                            }}
                                        >
                                            <MessageOutlined
                                                style={{ marginRight: 6, fontSize: 11 }}
                                            />
                                            {session.preview}
                                        </Text>
                                        <div
                                            style={{
                                                marginTop: 4,
                                                display: "flex",
                                                gap: 8,
                                                alignItems: "center",
                                            }}
                                        >
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: 11 }}
                                            >
                                                {formatTime(session.updatedAt)}
                                            </Text>
                                            <Text
                                                type="secondary"
                                                style={{ fontSize: 11 }}
                                            >
                                                {session.messageCount} 条消息
                                            </Text>
                                        </div>
                                    </div>
                                    <Popconfirm
                                        title="删除此对话？"
                                        description="删除后无法恢复"
                                        onConfirm={(e) => handleDelete(session.sessionId, e as unknown as React.MouseEvent)}
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
                    })
                )}
            </div>
        </div>
    );
};
