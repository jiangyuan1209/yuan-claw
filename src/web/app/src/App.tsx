import React, { useRef, useEffect, useState } from "react";
import { Layout, Button, Space, Badge, Typography, Tooltip } from "antd";
import { Sender } from "@ant-design/x";
import {
    DeleteOutlined,
    WifiOutlined,
    DisconnectOutlined,
    ReloadOutlined,
} from "@ant-design/icons";
import { useChat } from "./hooks/useChat";
import { MessageBubble } from "./components/MessageBubble";
import type { ChatMessage } from "./types";

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

const App: React.FC = () => {
    const {
        messages,
        isProcessing,
        currentAssistantMsg,
        connected,
        sendMessage,
        clearMessages,
        reconnect,
    } = useChat();

    const scrollRef = useAutoScroll([messages, currentAssistantMsg]);
    const [inputValue, setInputValue] = useState("");

    const handleSend = () => {
        if (inputValue.trim()) {
            sendMessage(inputValue);
            setInputValue("");
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const allItems: ChatMessage[] = [
        ...messages,
        ...(currentAssistantMsg ? [currentAssistantMsg] : []),
    ];

    return (
        <Layout style={{ height: "100vh", display: "flex", flexDirection: "column" }}>
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
                    <Title level={4} style={{ margin: 0 }}>
                        🦞 Yuan Claw AI
                    </Title>
                </Space>
                <Space>
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
                        <Button size="small" icon={<ReloadOutlined />} onClick={reconnect}>
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
                                开始对话吧，我会帮你完成任务 🚀
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
                                />
                            ))}
                        </div>
                    )}
                </div>

                <div
                    style={{
                        padding: "12px 24px",
                        background: "#fff",
                        borderTop: "1px solid #f0f0f0",
                    }}
                >
                    <Sender
                        value={inputValue}
                        onChange={setInputValue}
                        onSubmit={handleSend}
                        onKeyDown={handleKeyDown}
                        placeholder="输入你的问题... (Enter 发送, Shift+Enter 换行)"
                        loading={isProcessing}
                        disabled={!connected}
                        submitType={undefined}
                        autoSize={{ minRows: 1, maxRows: 6 }}
                    />
                </div>
            </Content>
        </Layout>
    );
};

export default App;
