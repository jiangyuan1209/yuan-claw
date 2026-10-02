import { useRef, useState, useCallback, useEffect } from "react";
import type { AudioSTTEvent } from "../types";

/**
 * useAudioSTT — 管理与后端 /ws/audio 的 WebSocket 连接，实现语音转文字（STT）。
 *
 * 仅支持「浏览器麦克风」采集模式，流程如下：
 *   1. 连接 ws://host/ws/audio
 *   2. 发送 { type: "start" } → 服务端创建 DashScope STT 会话
 *   3. 收到 { type: "ready" } → 服务端已就绪，可接收音频
 *   4. 将录音产生的二进制 PCM 块（16kHz 单声道 s16le）持续发送过去
 *   5. 收到 { type: "partial", text } → 实时中间识别结果
 *   6. 用户停止录音时发送 { type: "stop" }
 *   7. 收到 { type: "final", text } → 完整识别结果，触发 onFinal 回调
 *
 * 返回：partialText（实时文本）、finalText、isReady、error，以及
 *      start()、sendAudio()、stop()、reset() 等控制方法。
 */
export function useAudioSTT(options?: { onFinal?: (text: string) => void }) {
    const wsRef = useRef<WebSocket | null>(null);
    const [partialText, setPartialText] = useState("");
    const [finalText, setFinalText] = useState("");
    const [isReady, setIsReady] = useState(false);
    const [isConnected, setIsConnected] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // 用 ref 保存回调，避免 onmessage 闭包捕获过时的函数引用
    const onFinalRef = useRef(options?.onFinal);
    onFinalRef.current = options?.onFinal;

    /** 建立到 /ws/audio 的 WebSocket 连接 */
    const connect = useCallback(() => {
        return new Promise<void>((resolve, reject) => {
            // 关闭已有连接
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }

            const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
            const wsUrl = `${protocol}//${window.location.host}/ws/audio`;
            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setIsConnected(true);
                setError(null);
                resolve();
            };

            ws.onclose = () => {
                setIsConnected(false);
                setIsReady(false);
                wsRef.current = null;
            };

            ws.onerror = () => {
                setError("WebSocket connection failed");
                ws.close();
                reject(new Error("WebSocket connection failed"));
            };

            ws.onmessage = (event) => {
                // 服务端不应发来二进制消息
                if (event.data instanceof Blob) return;

                try {
                    const msg = JSON.parse(event.data) as AudioSTTEvent;
                    switch (msg.type) {
                        case "ready":
                            setIsReady(true);
                            break;

                        case "partial":
                            setPartialText(msg.text);
                            break;

                        case "final":
                            setFinalText(msg.text);
                            setIsReady(false);
                            onFinalRef.current?.(msg.text);
                            break;

                        case "error":
                            setError(msg.error);
                            setIsReady(false);
                            break;
                    }
                } catch {
                    console.warn("Failed to parse audio STT message:", event.data);
                }
            };
        });
    }, []);

    /**
     * 发送 { type: "start" } 开启一次 STT 会话（浏览器麦克风模式）。
     */
    const start = useCallback(async () => {
        setPartialText("");
        setFinalText("");
        setError(null);
        setIsReady(false);

        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
            await connect();
        }

        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "start" }));
        }
    }, [connect]);

    /** 发送二进制 PCM 音频数据到服务端 */
    const sendAudio = useCallback((data: ArrayBuffer) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(data);
        }
    }, []);

    /** 发送 { type: "stop" } 结束本次 STT 会话 */
    const stop = useCallback(() => {
        setIsReady(false);
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: "stop" }));
        }
    }, []);

    /** 重置识别状态，为下一次录音做准备 */
    const reset = useCallback(() => {
        setPartialText("");
        setFinalText("");
        setError(null);
        setIsReady(false);
    }, []);

    /** 组件卸载时清理连接 */
    useEffect(() => {
        return () => {
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
            }
        };
    }, []);

    return {
        partialText,
        finalText,
        isReady,
        isConnected,
        error,
        start,
        sendAudio,
        stop,
        reset,
        disconnect: () => {
            if (wsRef.current) {
                wsRef.current.onclose = null;
                wsRef.current.close();
                wsRef.current = null;
            }
        },
    };
}
