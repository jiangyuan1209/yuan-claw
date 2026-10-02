import React, { useEffect, useRef } from "react";
import { Tag, Tooltip, Typography, Avatar, Collapse, Image } from "antd";
import { CheckCircleOutlined, LoadingOutlined, CloseCircleOutlined, CodeOutlined, PaperClipOutlined } from "@ant-design/icons";
import { Bubble } from "@ant-design/x";
import type { ChatMessage, DebugEvent, ToolEvent } from "../types";

const { Text } = Typography;

// Inject blinking cursor keyframes once
const CURSOR_STYLE_ID = "yuan-claw-cursor-blink";
function useCursorStyle() {
    const injected = useRef(false);
    useEffect(() => {
        if (injected.current) return;
        injected.current = true;
        if (document.getElementById(CURSOR_STYLE_ID)) return;
        const style = document.createElement("style");
        style.id = CURSOR_STYLE_ID;
        style.textContent = `
            @keyframes cursor-blink {
                0%, 100% { opacity: 1; }
                50% { opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }, []);
}

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

function DebugEventsPanel({ events }: { events: DebugEvent[] }) {
    if (!events.length) return null;

    const items = events.map((event) => ({
        key: String(event.step),
        label: (
            <span>
                <CodeOutlined style={{ marginRight: 6 }} />
                Step {event.step} — 模型原始输出
            </span>
        ),
        children: (
            <pre
                style={{
                    margin: 0,
                    fontSize: 12,
                    lineHeight: 1.5,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    maxHeight: 300,
                    overflowY: "auto",
                    background: "#f6f8fa",
                    padding: 8,
                    borderRadius: 4,
                }}
            >
                {event.text}
            </pre>
        ),
    }));

    return (
        <Collapse
            size="small"
            style={{
                marginBottom: 8,
                background: "#fffbe6",
                borderColor: "#ffe58f",
            }}
            items={items}
        />
    );
}

interface MessageBubbleProps {
    message: ChatMessage;
    isTyping?: boolean;
    isStreaming?: boolean;
    debug?: boolean;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    message,
    isTyping = false,
    isStreaming = false,
    debug = false,
}) => {
    useCursorStyle();
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
            {debug && message.debugEvents && message.debugEvents.length > 0 && (
                <DebugEventsPanel events={message.debugEvents} />
            )}
            {message.toolEvents && message.toolEvents.length > 0 && (
                <ToolEventsBar events={message.toolEvents} />
            )}
            {/* 图片预览（仅用户消息） */}
            {isUser && message.imagePreviews && message.imagePreviews.length > 0 && (
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginBottom: 8 }}>
                    <Image.PreviewGroup>
                        {message.imagePreviews.map((url, i) => (
                            <Image
                                key={i}
                                src={url}
                                width={80}
                                height={80}
                                style={{ objectFit: "cover", borderRadius: 6 }}
                            />
                        ))}
                    </Image.PreviewGroup>
                </div>
            )}
            <Typography>
                {message.content ? (
                    <Text style={{ whiteSpace: "pre-wrap", lineHeight: 1.6 }}>
                        {message.content}
                        {isStreaming && (
                            <span
                                style={{
                                    display: "inline-block",
                                    width: 2,
                                    height: "1em",
                                    background: isUser ? "#fff" : "#1677ff",
                                    marginLeft: 2,
                                    verticalAlign: "text-bottom",
                                    animation: "cursor-blink 1s step-end infinite",
                                }}
                            />
                        )}
                    </Text>
                ) : isTyping ? (
                    <Text type="secondary">
                        <LoadingOutlined /> 正在思考...
                    </Text>
                ) : null}
            </Typography>
            {/* 附件文字（仅用户消息） */}
            {isUser && message.attachmentText && (
                <div
                    style={{
                        marginTop: 8,
                        padding: 8,
                        background: isUser ? "rgba(255,255,255,0.15)" : "#f6f8fa",
                        borderRadius: 6,
                        borderLeft: `3px solid ${isUser ? "rgba(255,255,255,0.4)" : "#d9d9d9"}`,
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", marginBottom: 4 }}>
                        <PaperClipOutlined style={{ marginRight: 4, fontSize: 12 }} />
                        <Text
                            style={{
                                fontSize: 12,
                                color: isUser ? "rgba(255,255,255,0.75)" : "#8c8c8c",
                            }}
                        >
                            附件识别文字
                        </Text>
                    </div>
                    <pre
                        style={{
                            margin: 0,
                            whiteSpace: "pre-wrap",
                            wordBreak: "break-word",
                            fontSize: 12,
                            lineHeight: 1.5,
                            color: isUser ? "rgba(255,255,255,0.9)" : "#595959",
                            fontFamily: "inherit",
                            maxHeight: 200,
                            overflowY: "auto",
                        }}
                    >
                        {message.attachmentText}
                    </pre>
                </div>
            )}
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
