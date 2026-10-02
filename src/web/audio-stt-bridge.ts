import type { WebSocket as WSWebSocket } from "ws";
import type { STTService } from "../lib/stt.js";

type BrowserAudioSession = {
    sttSession: ReturnType<STTService["createStreamingSession"]>;
    browserWs: WSWebSocket;
};

/**
 * AudioSTTBridge 将浏览器采集的音频流桥接到 DashScope 实时语音识别（STT）。
 *
 * 仅支持「浏览器麦克风」采集模式，协议如下：
 *   浏览器 → 服务端：{ type: "start" }
 *   服务端 → 浏览器：{ type: "ready" }
 *   浏览器 → 服务端：二进制 PCM 音频块（16kHz、单声道、s16le）
 *   服务端 → 浏览器：{ type: "partial", text: "..." }（实时中间结果）
 *   浏览器 → 服务端：{ type: "stop" }
 *   服务端 → 浏览器：{ type: "final", text: "..." }（最终识别结果）
 *
 * 每个浏览器 WebSocket 连接对应一个独立的 STT 会话，
 * 通过 sessions Map 支持多个并发会话。
 */
export class AudioSTTBridge {
    private sttService: STTService;
    private sessions = new Map<string, BrowserAudioSession>();

    constructor(sttService: STTService) {
        this.sttService = sttService;
    }

    /**
     * 开启一个由浏览器端采集音频驱动的 STT 会话。
     * DashScope 就绪后向浏览器发送 { type: "ready" }，此后浏览器可推送音频块。
     */
    startSession(sessionId: string, browserWs: WSWebSocket): void {
        // 清理该 ID 已存在的会话
        void this.endSession(sessionId);

        const sttSession = this.sttService.createStreamingSession(
            // onPartialResult：将中间识别结果转发给浏览器
            (partialText: string) => {
                if (browserWs.readyState === 1 /* OPEN */) {
                    browserWs.send(JSON.stringify({ type: "partial", text: partialText }));
                }
            },
        );

        this.sessions.set(sessionId, { sttSession, browserWs });

        // 通知浏览器已可以接收音频块
        if (browserWs.readyState === 1 /* OPEN */) {
            browserWs.send(JSON.stringify({ type: "ready" }));
        }
    }

    /**
     * 将浏览器发来的二进制音频块转发给 DashScope STT。
     */
    sendChunk(sessionId: string, chunk: Buffer): void {
        const session = this.sessions.get(sessionId);
        if (session) {
            session.sttSession.sendChunk(chunk);
        }
    }

    /**
     * 结束会话：通知 DashScope 音频发送完毕，等待最终识别结果，
     * 并以 { type: "final", text: "..." } 回传给浏览器。
     */
    async endSession(sessionId: string): Promise<void> {
        const session = this.sessions.get(sessionId);
        if (!session) return;

        this.sessions.delete(sessionId);

        // 告诉 DashScope 音频已发送完毕
        session.sttSession.finish();

        try {
            const finalText = await session.sttSession.resultPromise;
            if (session.browserWs.readyState === 1 /* OPEN */) {
                session.browserWs.send(JSON.stringify({ type: "final", text: finalText }));
            }
        } catch (err) {
            if (session.browserWs.readyState === 1 /* OPEN */) {
                session.browserWs.send(
                    JSON.stringify({
                        type: "error",
                        error: err instanceof Error ? err.message : String(err),
                    }),
                );
            }
        }
    }

    /**
     * 不等待最终结果直接清理会话（例如 WebSocket 断开时）。
     */
    removeSession(sessionId: string): void {
        this.sessions.delete(sessionId);
    }
}
