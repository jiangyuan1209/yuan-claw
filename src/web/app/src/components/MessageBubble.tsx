import React from "react";
import { Tag, Tooltip, Typography, Avatar } from "antd";
import { CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined } from "@ant-design/icons";
import { Bubble } from "@ant-design/x";
import type { ChatMessage, ToolEvent } from "../types";

const { Text } = Typography;

function ToolStatusBadge({ event }: { event: ToolEvent }) {
    const icon =
        event.status === "running" ? (
            <LoadingOutlined />
        ) : event.status === "success" ? (
            <CheckCircleOutlined style={{ color: "#52c41a" }} />
        ) : (
            <CloseCircleOutlined style={{ color: "#ff4d4f" }} />
        );

    return (
        <Tooltip
            title={
                <div style={{ maxWidth: 300 }}>
                    <div><strong>{event.toolName}</strong></div>
                    {event.args != null && (
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                            {JSON.stringify(event.args).slice(0, 200)}
                        </div>
                    )}
                    {event.error && (
                        <div style={{ marginTop: 4, color: "#ff4d4f" }}>
                            {event.error.slice(0, 200)}
                        </div>
                    )}
                    {event.result != null && event.status === "success" && (
                        <div style={{ marginTop: 4, fontSize: 12, opacity: 0.8 }}>
                            {JSON.stringify(event.result).slice(0, 200)}
                        </div>
                    )}
                </div>
            }
        >
            <Tag
                icon={icon}
                color={
                    event.status === "running"
                        ? "processing"
                        : event.status === "success"
                          ? "success"
                          : "error"
                }
                style={{ margin: 2, cursor: "pointer" }}
            >
                {event.toolName}
            </Tag>
        </Tooltip>
    );
}

function ToolEventsBar({ events }: { events: ToolEvent[] }) {
    if (!events.length) return null;

    return (
        <div
            style={{
                display: "flex",
                flexWrap: "wrap",
                gap: 4,
                marginBottom: events.some((e) => e.status === "running") ? 8 : 0,
                padding: "4px 0",
            }}
        >
            {events.map((event, i) => (
                <ToolStatusBadge key={`${event.toolName}-${i}`} event={event} />
            ))}
        </div>
    );
}

interface MessageBubbleProps {
    message: ChatMessage;
    isTyping?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    isTyping = false,
}) => {
    const isUser = message.role === "user";

    const avatarEl = (
        <Avatar
            style={{
                background: isUser ? "#1677ff" : "#ff7a45",
                fontSize: 18,
            }}
        >
            {isUser ? "👤" : "🦞"}
        </Avatar>
    );

    const content = (
        <div>
            {message.toolEvents && message.toolEvents.length > 0 && (
                <ToolEventsBar events={message.toolEvents} />
            )}
            <Typography>
                {message.content ? (
                    <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {message.content}
                    </Text>
                ) : isTyping ? (
                    <Text type="secondary">
                        <LoadingOutlined /> 正在思考...
                    </Text>
                ) : null}
            </Typography>
        </div>
    );

    return (
        <Bubble
            placement={isUser ? "end" : "start"}
            content={content}
            avatar={avatarEl}
            variant={isUser ? "shadow" : "borderless"}
            styles={{
                content: {
                    maxWidth: isUser ? "70%" : "85%",
                    borderRadius: 12,
                    ...(isUser
                        ? { background: "#1677ff", color: "#fff" }
                        : {}),
                },
            }}
        />
    );
};
