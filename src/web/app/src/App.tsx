import React, { useRef, useEffect, useState, useCallback } from "react";
import { Layout, Button, Space, Badge, Typography, Tooltip, Switch, Progress } from "antd";
import {
    DeleteOutlined,
    WifiOutlined,
    DisconnectOutlined,
    ReloadOutlined,
    RobotOutlined,
    MessageOutlined,
    BugOutlined,
    MenuFoldOutlined,
    MenuUnfoldOutlined,
    CompressOutlined,
} from "@ant-design/icons";
import { useChat } from "./hooks/useChat";
import { useWorkspaces, useSessions } from "./hooks/useWorkspaces";
import { MessageBubble } from "./components/MessageBubble";
import { InputPanel } from "./components/InputPanel";
import { SessionSidebar } from "./components/SessionSidebar";
import { WorkspaceModal } from "./components/WorkspaceModal";
import type { ChatMessage, Workspace } from "./types";

const { Header, Content } = Layout;
const { Text, Title } = Typography;

function useAutoScroll(dependency: unknown) {
    const containerRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (containerRef.current) {
            const { scrollHeight, clientHeight, scrollTop } = containerRef.current;
            const isNearBottom = scrollHeight - scrollTop - clientHeight < 100;
            if (isNearBottom) {
                containerRef.current.scrollTop = scrollHeight;
            }
        }
    }, [dependency]);

    return containerRef;
}

/** 字符数的紧凑展示：超过一万用「万」为单位，避免进度条旁边挤不下 */
function formatChars(chars: number): string {
    return chars >= 10000 ? `${(chars / 10000).toFixed(1)}万` : String(chars);
}

const App: React.FC = () => {
    const {
        messages,
        isProcessing,
        isStreaming,
        currentAssistantMsg,
        connected,
        sessionId,
        mode,
        setMode,
        debug,
        setDebug,
        currentWorkspace,
        historyChars,
        compressionThreshold,
        isCompressing,
        compressCurrentSession,
        sendMessage,
        clearMessages,
        switchSession,
        newSessionInWorkspace,
        reconnect,
    } = useChat();

    const { workspaces, createWorkspace, deleteWorkspace } = useWorkspaces();
    const { sessions, loading: sessionsLoading, refresh: refreshSessions, remove: removeSession } =
        useSessions();

    const scrollRef = useAutoScroll([messages, currentAssistantMsg]);
    const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
    const [workspaceModalOpen, setWorkspaceModalOpen] = useState(false);

    // 会话切换、或一轮对话跑完后刷新侧边栏（预览、消息数、归属可能都变了）
    useEffect(() => {
        refreshSessions();
    }, [refreshSessions, sessionId, isProcessing]);

    const handleCreateWorkspace = useCallback(
        async (input: { name: string; directories: string[]; primaryDir: string }) => {
            const workspace: Workspace | null = await createWorkspace(input);
            // 新建工作区后直接进入它下面的一个新对话，省去再点一次「+」
            if (workspace) {
                await newSessionInWorkspace(workspace.id);
                refreshSessions();
            }
            return workspace;
        },
        [createWorkspace, newSessionInWorkspace, refreshSessions],
    );

    const handleDeleteWorkspace = useCallback(
        async (workspaceId: string) => {
            await deleteWorkspace(workspaceId);
            refreshSessions();
        },
        [deleteWorkspace, refreshSessions],
    );

    const usagePercent = Math.min(
        100,
        Math.round((historyChars / compressionThreshold) * 1000) / 10,
    );

    const allItems: ChatMessage[] = [
        ...messages,
        ...(currentAssistantMsg ? [currentAssistantMsg] : []),
    ];

    return (
        <Layout style={{ height: "100vh", display: "flex", flexDirection: "row" }}>
            {/* 工作区 / 历史对话侧边栏 */}
            <SessionSidebar
                activeSessionId={sessionId}
                sessions={sessions}
                workspaces={workspaces}
                loading={sessionsLoading}
                collapsed={sidebarCollapsed}
                onSelectSession={switchSession}
                onNewSessionInWorkspace={newSessionInWorkspace}
                onCreateWorkspace={() => setWorkspaceModalOpen(true)}
                onDeleteSession={removeSession}
                onDeleteWorkspace={handleDeleteWorkspace}
            />

            {/* 主内容区 */}
            <Layout style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
                <Header
                    style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        background: "#fff",
                        borderBottom: "1px solid #f0f0f0",
                        padding: "0 24px",
                        height: 56,
                    }}
                >
                    <Space>
                        <Button
                            type="text"
                            icon={sidebarCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
                            onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                            style={{ fontSize: 16 }}
                        />
                        <Title level={4} style={{ margin: 0 }}>
                            🦞 Yuan Claw AI
                        </Title>
                        {currentWorkspace && (
                            <Tooltip title={`主目录：${currentWorkspace.primaryDir}`}>
                                <Text type="secondary" style={{ fontSize: 12 }}>
                                    / {currentWorkspace.name}
                                </Text>
                            </Tooltip>
                        )}
                    </Space>
                    <Space>
                        {/* 历史对话字符占用：接近阈值时会自动触发 LLM 压缩，也可手动压缩 */}
                        <Tooltip
                            title={`当前历史 ${historyChars.toLocaleString()} 字符 / 自动压缩阈值 ${compressionThreshold.toLocaleString()} 字符`}
                        >
                            <Space size={4} style={{ minWidth: 170 }}>
                                <Text type="secondary" style={{ fontSize: 12, whiteSpace: "nowrap" }}>
                                    {formatChars(historyChars)} / {formatChars(compressionThreshold)}
                                </Text>
                                <Progress
                                    percent={usagePercent}
                                    size="small"
                                    showInfo={false}
                                    style={{ width: 90, margin: 0 }}
                                    status={usagePercent >= 90 ? "exception" : "normal"}
                                />
                            </Space>
                        </Tooltip>
                        <Tooltip title="手动压缩历史对话：把较早的消息压成摘要，保留最近若干条原文">
                            <Button
                                size="small"
                                icon={<CompressOutlined />}
                                onClick={compressCurrentSession}
                                loading={isCompressing}
                                disabled={!sessionId || isProcessing || historyChars === 0}
                            >
                                压缩历史
                            </Button>
                        </Tooltip>
                        <Tooltip title={mode === "agent" ? "Agent 模式（工具调用）" : "直连模式（流式输出）"}>
                            <Space size={4}>
                                {mode === "agent" ? (
                                    <RobotOutlined style={{ color: "#1677ff", fontSize: 16 }} />
                                ) : (
                                    <MessageOutlined style={{ color: "#ff7a45", fontSize: 16 }} />
                                )}
                                <Switch
                                    size="small"
                                    checked={mode === "direct"}
                                    onChange={(checked) => setMode(checked ? "direct" : "agent")}
                                    disabled={isProcessing}
                                />
                            </Space>
                        </Tooltip>
                        {mode === "agent" && (
                            <Tooltip title={debug ? "Debug 模式已开启（显示中间步骤）" : "开启 Debug 模式"}>
                                <Button
                                    size="small"
                                    type={debug ? "primary" : "default"}
                                    icon={<BugOutlined />}
                                    onClick={() => setDebug(!debug)}
                                    style={debug ? { background: "#faad14", borderColor: "#faad14" } : {}}
                                >
                                    Debug
                                </Button>
                            </Tooltip>
                        )}
                        <Tooltip title={connected ? "已连接" : "未连接"}>
                            <Badge dot={connected} color={connected ? "green" : "red"}>
                                {connected ? (
                                    <WifiOutlined style={{ color: "#52c41a" }} />
                                ) : (
                                    <DisconnectOutlined style={{ color: "#ff4d4f" }} />
                                )}
                            </Badge>
                        </Tooltip>
                        {!connected && (
                            <Button size="small" icon={<ReloadOutlined />} onClick={() => reconnect()}>
                                重连
                            </Button>
                        )}
                        <Button
                            size="small"
                            danger
                            icon={<DeleteOutlined />}
                            onClick={clearMessages}
                            disabled={messages.length === 0}
                        >
                            清空
                        </Button>
                    </Space>
                </Header>

                <Content
                    style={{
                        flex: 1,
                        overflow: "hidden",
                        display: "flex",
                        flexDirection: "column",
                        background: "#f5f5f5",
                    }}
                >
                    <div
                        ref={scrollRef}
                        style={{
                            flex: 1,
                            overflowY: "auto",
                            padding: "16px 24px",
                        }}
                    >
                        {allItems.length === 0 ? (
                            <div
                                style={{
                                    display: "flex",
                                    justifyContent: "center",
                                    alignItems: "center",
                                    height: "100%",
                                    color: "#999",
                                    fontSize: 16,
                                }}
                            >
                                <Text type="secondary">
                                    {currentWorkspace
                                        ? "开始对话吧，我会帮你完成任务 🚀"
                                        : "先创建一个工作区，再在工作区下新建对话 🚀"}
                                </Text>
                            </div>
                        ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                                {allItems.map((msg) => (
                                    <MessageBubble
                                        key={msg.id}
                                        message={msg}
                                        isTyping={
                                            msg.id === currentAssistantMsg?.id &&
                                            !msg.content &&
                                            isProcessing
                                        }
                                        isStreaming={
                                            msg.id === currentAssistantMsg?.id &&
                                            isStreaming
                                        }
                                        debug={debug}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <InputPanel
                        onSend={sendMessage}
                        isProcessing={isProcessing}
                        connected={connected}
                        workspace={currentWorkspace}
                        onSelectWorkspace={() => setWorkspaceModalOpen(true)}
                        placeholder={
                            !currentWorkspace
                                ? "请先选择或创建一个工作区..."
                                : mode === "direct"
                                  ? "直连模式 — 输入问题，流式回答... (Enter 发送)"
                                  : `输入你的问题，默认在 ${currentWorkspace.primaryDir} 下读写... (Enter 发送)`
                        }
                    />
                </Content>
            </Layout>

            <WorkspaceModal
                open={workspaceModalOpen}
                onClose={() => setWorkspaceModalOpen(false)}
                onCreate={handleCreateWorkspace}
            />
        </Layout>
    );
};

export default App;
