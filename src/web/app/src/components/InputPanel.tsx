import React, { useState, useCallback, useRef } from "react";
import { Button, Typography, Tag, message, theme } from "antd";
import { Sender } from "@ant-design/x";
import {
    AudioOutlined,
    StopOutlined,
    LoadingOutlined,
    PictureOutlined,
    CloseCircleFilled,
} from "@ant-design/icons";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useAudioSTT } from "../hooks/useAudioSTT";
import { useImageAttachments } from "../hooks/useImageAttachments";
import type { ImageAttachment } from "../types";

const { Text } = Typography;

interface InputPanelProps {
    /** 用户发送消息时触发，可携带图片附件 */
    onSend: (text: string, images?: ImageAttachment[]) => void;
    /** LLM 是否正在生成回答 */
    isProcessing: boolean;
    /** WebSocket 是否已连接 */
    connected: boolean;
    /** 输入框的占位提示 */
    placeholder?: string;
}

/**
 * InputPanel — 语音 + 图片 + 手动输入合一的输入组件。
 *
 * 语音识别（浏览器麦克风）：
 *   1. 点击话筒按钮开始录音 → 请求麦克风权限，输入框实时展示「已有文字 + 中间识别结果」
 *   2. 再次点击话筒按钮停止录音 → 收到最终识别文本
 *   3. 最终文本追加到录音前已有文字之后（不覆盖、不自动发送），用户可继续手动编辑
 *   4. 点击输入框的发送按钮（或 Enter）才真正发送
 *
 * 图片附件：
 *   1. 点击图片按钮选择图片，或直接粘贴图片（Ctrl+V）
 *   2. 图片以缩略图形式预览在输入框上方，可逐个删除
 *   3. 发送时图片会先经过 OCR 识别，识别文字作为附件追加到消息中
 *
 * 也可直接在输入框中手动输入文字。
 */
export const InputPanel: React.FC<InputPanelProps> = ({
    onSend,
    isProcessing,
    connected,
    placeholder,
}) => {
    const { token } = theme.useToken();
    const [inputValue, setInputValue] = useState("");

    const inputRef = useRef(inputValue);
    inputRef.current = inputValue;
    const preRecordTextRef = useRef("");

    // 图片附件
    const imageAttachments = useImageAttachments();
    const fileInputRef = useRef<HTMLInputElement>(null);

    // STT 产出最终文本时，追加到录音前已有文字之后
    const handleSTTFinal = useCallback((text: string) => {
        const trimmed = text.trim();
        if (trimmed) {
            setInputValue(preRecordTextRef.current + trimmed);
        } else {
            setTimeout(() => {
                message.warning("未检测到语音，请重试");
            }, 0);
        }
    }, []);

    const stt = useAudioSTT({ onFinal: handleSTTFinal });

    const handleAudioChunk = useCallback(
        (pcmData: ArrayBuffer) => {
            stt.sendAudio(pcmData);
        },
        [stt],
    );

    const recorder = useAudioRecorder(handleAudioChunk);
    const isVoiceRecording = recorder.isRecording;

    const onSendRef = useRef(onSend);
    onSendRef.current = onSend;

    // ─── 录音控制 ─────────────────────────────────────────

    const handleStartRecording = useCallback(async () => {
        try {
            preRecordTextRef.current = inputRef.current;
            stt.reset();
            await stt.start();
            await recorder.startRecording();
        } catch (err) {
            message.error(
                `无法启动录音: ${err instanceof Error ? err.message : "未知错误"}`,
            );
        }
    }, [stt, recorder]);

    const handleStopRecording = useCallback(() => {
        recorder.stopRecording();
        stt.stop();
    }, [recorder, stt]);

    // ─── 图片控制 ─────────────────────────────────────────

    const handleImageClick = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const handleFileChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
            if (e.target.files && e.target.files.length > 0) {
                imageAttachments.addFiles(e.target.files);
            }
            // 清空 input value，允许再次选择同一文件
            e.target.value = "";
        },
        [imageAttachments],
    );

    const handlePaste = useCallback(
        (e: React.ClipboardEvent) => {
            const clipboardData = e.clipboardData;
            if (!clipboardData) return;

            const items = clipboardData.items;
            const imageFiles: File[] = [];
            for (let i = 0; i < items.length; i++) {
                const item = items[i];
                if (item && item.type.startsWith("image/")) {
                    const file = item.getAsFile();
                    if (file) imageFiles.push(file);
                }
            }

            if (imageFiles.length > 0) {
                e.preventDefault();
                imageAttachments.addFiles(imageFiles);
            }
        },
        [imageAttachments],
    );

    // ─── 发送 ─────────────────────────────────────────────

    const handleSend = useCallback(() => {
        const trimmed = inputValue.trim();
        const hasImages = imageAttachments.images.length > 0;

        // 允许只有图片没有文字，也允许只有文字没有图片
        if ((!trimmed && !hasImages) || isProcessing) return;

        onSendRef.current(trimmed || "请识别这张图片的内容", imageAttachments.images.length > 0 ? imageAttachments.images : undefined);
        setInputValue("");
        imageAttachments.clearImages();
    }, [inputValue, isProcessing, imageAttachments]);

    const senderValue = isVoiceRecording
        ? preRecordTextRef.current + stt.partialText
        : inputValue;

    // ─── 渲染 ──────────────────────────────────────────────

    return (
        <div
            style={{
                padding: "12px 24px",
                background: token.colorBgContainer,
                borderTop: `1px solid ${token.colorBorderSecondary}`,
            }}
            onPaste={handlePaste}
        >
            {/* 隐藏的文件选择器 */}
            <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/gif,image/webp"
                multiple
                style={{ display: "none" }}
                onChange={handleFileChange}
            />

            {/* 话筒录音 + 图片按钮 */}
            <div
                style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 12,
                    padding: "4px 0 12px",
                }}
            >
                {!isVoiceRecording ? (
                    <Button
                        type="primary"
                        size="large"
                        icon={<AudioOutlined style={{ fontSize: 24 }} />}
                        onClick={handleStartRecording}
                        disabled={!connected || isProcessing}
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                        }}
                    />
                ) : (
                    <Button
                        danger
                        type="primary"
                        size="large"
                        icon={<StopOutlined style={{ fontSize: 24 }} />}
                        onClick={handleStopRecording}
                        style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                        }}
                    />
                )}
                <Button
                    size="large"
                    icon={<PictureOutlined style={{ fontSize: 24 }} />}
                    onClick={handleImageClick}
                    disabled={!connected || isProcessing}
                    style={{
                        width: 64,
                        height: 64,
                        borderRadius: "50%",
                    }}
                    title="添加图片（也可粘贴 Ctrl+V）"
                />
                {isVoiceRecording && (
                    <Tag color="red" icon={<LoadingOutlined />}>
                        录音中...
                    </Tag>
                )}
            </div>

            {/* 图片预览区域 */}
            {imageAttachments.images.length > 0 && (
                <div
                    style={{
                        display: "flex",
                        flexWrap: "wrap",
                        gap: 8,
                        padding: "0 0 12px",
                    }}
                >
                    {imageAttachments.images.map((img) => (
                        <div
                            key={img.id}
                            style={{
                                position: "relative",
                                width: 64,
                                height: 64,
                                borderRadius: 8,
                                overflow: "hidden",
                                border: `1px solid ${token.colorBorder}`,
                            }}
                        >
                            <img
                                src={img.dataUrl}
                                alt={img.name || "附件图片"}
                                style={{
                                    width: "100%",
                                    height: "100%",
                                    objectFit: "cover",
                                }}
                            />
                            <CloseCircleFilled
                                onClick={() => imageAttachments.removeImage(img.id)}
                                style={{
                                    position: "absolute",
                                    top: 2,
                                    right: 2,
                                    fontSize: 16,
                                    color: "#ff4d4f",
                                    background: "#fff",
                                    borderRadius: "50%",
                                    cursor: "pointer",
                                }}
                            />
                        </div>
                    ))}
                </div>
            )}

            {/* 图片附件错误提示 */}
            {imageAttachments.error && (
                <Text
                    type="warning"
                    style={{ textAlign: "center", display: "block", marginBottom: 8 }}
                >
                    {imageAttachments.error}
                </Text>
            )}

            {/* 输入框 */}
            <Sender
                value={senderValue}
                onChange={setInputValue}
                onSubmit={handleSend}
                placeholder={
                    placeholder ??
                    "输入文字，或点击图片/粘贴图片添加附件 (Enter 发送)"
                }
                loading={isProcessing}
                disabled={!connected}
                submitType="enter"
                autoSize={{ minRows: 1, maxRows: 6 }}
            />

            {stt.error && (
                <Text
                    type="danger"
                    style={{ textAlign: "center", display: "block", marginTop: 8 }}
                >
                    STT 错误: {stt.error}
                </Text>
            )}
        </div>
    );
};
