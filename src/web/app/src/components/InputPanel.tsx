import React, { useState, useCallback, useRef } from "react";
import { Button, Typography, Tag, message, theme } from "antd";
import { Sender } from "@ant-design/x";
import {
    AudioOutlined,
    StopOutlined,
    LoadingOutlined,
} from "@ant-design/icons";
import { useAudioRecorder } from "../hooks/useAudioRecorder";
import { useAudioSTT } from "../hooks/useAudioSTT";

const { Text } = Typography;

interface InputPanelProps {
    /** 用户发送消息时触发 */
    onSend: (text: string) => void;
    /** LLM 是否正在生成回答 */
    isProcessing: boolean;
    /** WebSocket 是否已连接 */
    connected: boolean;
    /** 输入框的占位提示 */
    placeholder?: string;
}

/**
 * InputPanel — 语音 + 手动输入合一的输入组件。
 *
 * 语音识别（浏览器麦克风）：
 *   1. 点击话筒按钮开始录音 → 请求麦克风权限，输入框实时展示「已有文字 + 中间识别结果」
 *   2. 再次点击话筒按钮停止录音 → 收到最终识别文本
 *   3. 最终文本追加到录音前已有文字之后（不覆盖、不自动发送），用户可继续手动编辑
 *   4. 点击输入框的发送按钮（或 Enter）才真正发送
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
    // 输入框内容：既承载手动输入，也承载录音结束后的识别结果（可编辑）
    const [inputValue, setInputValue] = useState("");

    // 始终指向最新的输入框内容，供录音开始时快照使用（避免闭包捕获过时值）
    const inputRef = useRef(inputValue);
    inputRef.current = inputValue;
    // 开始录音那一刻输入框已有的文字，录音结果会追加到它后面而非覆盖
    const preRecordTextRef = useRef("");

    // STT 产出最终文本时，追加到录音前已有文字之后，供用户编辑，不直接发送
    const handleSTTFinal = useCallback((text: string) => {
        const trimmed = text.trim();
        if (trimmed) {
            setInputValue(preRecordTextRef.current + trimmed);
        } else {
            // 用微任务延迟，避免 antd message 与 React 渲染冲突
            setTimeout(() => {
                message.warning("未检测到语音，请重试");
            }, 0);
        }
    }, []);

    // STT hook 管理 /ws/audio WebSocket
    const stt = useAudioSTT({ onFinal: handleSTTFinal });

    // 录音产生 PCM 块时的回调：转发给 STT
    const handleAudioChunk = useCallback(
        (pcmData: ArrayBuffer) => {
            stt.sendAudio(pcmData);
        },
        [stt],
    );

    // 录音 hook 采集麦克风输入
    const recorder = useAudioRecorder(handleAudioChunk);

    const isVoiceRecording = recorder.isRecording;

    // 始终调用最新的 onSend，避免闭包捕获过时的函数引用
    const onSendRef = useRef(onSend);
    onSendRef.current = onSend;

    // ─── 录音控制 ─────────────────────────────────────────

    const handleStartRecording = useCallback(async () => {
        try {
            // 快照当前输入框文字，录音结果将追加到其后
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
        // 结束 STT 会话（触发最终识别结果 → 通过 onFinal 追加到输入框）
        stt.stop();
    }, [recorder, stt]);

    // ─── 发送 ─────────────────────────────────────────────

    const handleSend = useCallback(() => {
        const trimmed = inputValue.trim();
        if (trimmed && !isProcessing) {
            onSendRef.current(trimmed);
            setInputValue("");
        }
    }, [inputValue, isProcessing]);

    // 录音进行中时，输入框实时展示「已有文字 + 中间识别结果」；停止后展示可编辑的最终结果
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
        >
            {/* 话筒录音控制 */}
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
                {isVoiceRecording && (
                    <Tag color="red" icon={<LoadingOutlined />}>
                        录音中...
                    </Tag>
                )}
            </div>

            {/* 输入框（带发送按钮）：可手动输入，也承载可编辑的识别结果 */}
            <Sender
                value={senderValue}
                onChange={setInputValue}
                onSubmit={handleSend}
                placeholder={
                    placeholder ??
                    "点击话筒录音，停止后可在此修改识别内容，或直接输入文字，再点发送"
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
