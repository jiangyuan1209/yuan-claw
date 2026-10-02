import fs from "node:fs";
import { WebSocket } from "ws";
import type { AppConfig } from "../config/load-config.js";

type STTOptions = {
    config: AppConfig;
    model?: string;
};

const WS_URL = "wss://dashscope.aliyuncs.com/api-ws/v1/inference/";

/**
 * Internal representation of a DashScope STT WebSocket session.
 * Returned by _createDashScopeSession and used by both public streaming APIs.
 */
type DashScopeSession = {
    ws: WebSocket;
    timeout: ReturnType<typeof setTimeout>;
    /** Resolves with the final transcription text */
    resultPromise: Promise<string>;
    /** Send a PCM audio chunk to DashScope */
    sendChunk: (chunk: Buffer) => void;
    /** Signal end-of-audio to DashScope (finish-task) */
    finish: () => void;
};

/**
 * Speech-to-Text service using DashScope WebSocket real-time ASR API.
 * Supports both file-based and streaming transcription.
 */
export class STTService {
    private apiKey: string;
    private model: string;

    constructor(options: STTOptions) {
        const apiKey = options.config.MODEL_API_KEY;

        if (!apiKey) {
            throw new Error("Missing MODEL_API_KEY in settings.");
        }

        this.apiKey = apiKey;
        this.model = options.model ?? options.config.STT_MODEL ?? "fun-asr-realtime";
    }

    /**
     * Create a raw DashScope STT WebSocket session.
     * Both public streaming APIs delegate to this method.
     *
     * The returned session includes `sendChunk`, `finish`, and `resultPromise`
     * so callers can drive the session lifecycle externally (e.g. from a WebSocket server).
     */
    private _createDashScopeSession(
        onPartialResult?: (text: string) => void,
        onTaskStarted?: (sendChunk: (chunk: Buffer) => void, finish: () => void) => void,
    ): DashScopeSession {
        const ws = new WebSocket(WS_URL, {
            headers: {
                Authorization: `Bearer ${this.apiKey}`,
            },
        });

        let taskId = "";
        let fullText = "";
        let currentSentenceText = "";
        let taskStarted = false;

        let resolveResult!: (value: string) => void;
        let rejectResult!: (reason: Error) => void;
        const resultPromise = new Promise<string>((resolve, reject) => {
            resolveResult = resolve;
            rejectResult = reject;
        });

        const resetTimeout = () => {
            clearTimeout(timeout);
            timeout = setTimeout(() => {
                rejectResult(new Error("STT transcription timed out"));
                ws.close();
            }, 30000);
        };

        const sendChunk = (chunk: Buffer) => {
            if (ws.readyState === WebSocket.OPEN && taskStarted) {
                ws.send(chunk, { binary: true });
            }
        };

        const finish = () => {
            if (ws.readyState === WebSocket.OPEN && taskStarted) {
                setTimeout(() => {
                    ws.send(JSON.stringify({
                        header: {
                            action: "finish-task",
                            task_id: taskId,
                            streaming: "duplex",
                        },
                        payload: { input: {} },
                    }));
                }, 500);
            }
        };

        let timeout = setTimeout(() => {
            rejectResult(new Error("STT transcription timed out"));
            ws.close();
        }, 30000);

        ws.on("open", () => {
            taskId = "task-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
            ws.send(JSON.stringify({
                header: {
                    action: "run-task",
                    task_id: taskId,
                    streaming: "duplex",
                },
                payload: {
                    task_group: "audio",
                    task: "asr",
                    function: "recognition",
                    model: this.model,
                    parameters: {
                        format: "pcm",
                        sample_rate: 16000,
                        language_hints: ["zh", "en"],
                    },
                    input: {},
                },
            }));
        });

        ws.on("message", (data: Buffer, isBinary: boolean) => {
            if (isBinary) return;

            resetTimeout();

            let msg: Record<string, unknown>;
            try {
                msg = JSON.parse(data.toString());
            } catch {
                return;
            }

            const header = msg.header as Record<string, unknown> | undefined;
            if (!header) return;

            const event = header.event as string;

            switch (event) {
                case "task-started":
                    taskStarted = true;
                    onTaskStarted?.(sendChunk, finish);
                    break;

                case "result-generated":
                    {
                        const payload = msg.payload as Record<string, unknown> | undefined;
                        if (payload) {
                            const output = payload.output as Record<string, unknown> | undefined;
                            if (output) {
                                const sentence = output.sentence as Record<string, unknown> | undefined;
                                if (sentence?.text) {
                                    const text = sentence.text as string;
                                    const endTime = sentence.end_time as number | null | undefined;

                                    currentSentenceText = text;

                                    if (onPartialResult) {
                                        onPartialResult(fullText + currentSentenceText);
                                    }

                                    if (endTime) {
                                        fullText += currentSentenceText;
                                        currentSentenceText = "";
                                    }
                                }
                            }
                        }
                    }
                    break;

                case "task-finished":
                    clearTimeout(timeout);
                    if (currentSentenceText) {
                        fullText += currentSentenceText;
                    }
                    ws.close();
                    resolveResult(fullText.trim());
                    break;

                case "task-failed":
                    {
                        const payload = msg.payload as Record<string, unknown> | undefined;
                        const code = (payload?.code as string) ?? "unknown";
                        const message = (payload?.message as string) ?? "unknown error";
                        clearTimeout(timeout);
                        rejectResult(new Error(`STT task failed: ${code} - ${message}`));
                        ws.close();
                    }
                    break;
            }
        });

        ws.on("error", (err: Error) => {
            clearTimeout(timeout);
            rejectResult(new Error(`WebSocket error: ${err.message}`));
        });

        ws.on("close", () => {
            clearTimeout(timeout);
        });

        return { ws, timeout, resultPromise, sendChunk, finish };
    }

    /**
     * Transcribe audio in real-time streaming mode.
     * Audio chunks are sent as they arrive from the recorder.
     * Returns a promise that resolves with the final transcription.
     */
    async transcribeStreaming(
        onReady: (sendChunk: (chunk: Buffer) => void, finish: () => void) => void,
        onPartialResult?: (text: string) => void,
    ): Promise<string> {
        const session = this._createDashScopeSession(onPartialResult, (sendChunk, finish) => {
            onReady(sendChunk, finish);
        });
        return session.resultPromise;
    }

    /**
     * Create a streaming STT session with externally-controllable lifecycle.
     *
     * Unlike `transcribeStreaming` which provides sendChunk/finish via a callback,
     * this method returns them directly so a WebSocket server can call them
     * as messages arrive from a browser client.
     *
     * Usage:
     *   const session = sttService.createStreamingSession(onPartial);
     *   // later, when DashScope task has started:
     *   session.sendChunk(audioBuffer);
     *   session.finish();
     *   const text = await session.resultPromise;
     */
    createStreamingSession(
        onPartialResult?: (text: string) => void,
    ): {
        sendChunk: (chunk: Buffer) => void;
        finish: () => void;
        resultPromise: Promise<string>;
    } {
        let capturedSendChunk: ((chunk: Buffer) => void) | null = null;
        let capturedFinish: (() => void) | null = null;

        const session = this._createDashScopeSession(onPartialResult, (sendChunk, finish) => {
            capturedSendChunk = sendChunk;
            capturedFinish = finish;
        });

        return {
            sendChunk: (chunk: Buffer) => capturedSendChunk?.(chunk),
            finish: () => capturedFinish?.(),
            resultPromise: session.resultPromise,
        };
    }

    /**
     * Transcribe an audio file (legacy mode).
     */
    transcribe(filePath: string): Promise<string> {
        if (!fs.existsSync(filePath)) {
            throw new Error(`Audio file not found: ${filePath}`);
        }

        return new Promise<string>((resolve, reject) => {
            const ws = new WebSocket(WS_URL, {
                headers: {
                    Authorization: `Bearer ${this.apiKey}`,
                },
            });

            let taskId = "";
            let fullText = "";
            let currentSentenceText = "";
            let audioData: Buffer | null = null;
            let timeout: ReturnType<typeof setTimeout>;

            try {
                audioData = fs.readFileSync(filePath);
                // Strip WAV header if present (44 bytes for standard WAV)
                if (audioData.length > 44 && audioData.subarray(0, 4).toString() === "RIFF") {
                    audioData = audioData.subarray(44);
                }
            } catch (err) {
                reject(new Error(`Failed to read audio file: ${(err as Error).message}`));
                return;
            }

            const resetTimeout = () => {
                clearTimeout(timeout);
                timeout = setTimeout(() => {
                    reject(new Error("STT transcription timed out"));
                    ws.close();
                }, 30000);
            };

            timeout = setTimeout(() => {
                reject(new Error("STT transcription timed out"));
                ws.close();
            }, 30000);

            ws.on("open", () => {
                taskId = "task-" + Date.now() + "-" + Math.random().toString(36).substring(2, 8);
                ws.send(JSON.stringify({
                    header: {
                        action: "run-task",
                        task_id: taskId,
                        streaming: "duplex",
                    },
                    payload: {
                        task_group: "audio",
                        task: "asr",
                        function: "recognition",
                        model: this.model,
                        parameters: {
                            format: "pcm",
                            sample_rate: 16000,
                            language_hints: ["zh", "en"],
                        },
                        input: {},
                    },
                }));
            });

            ws.on("message", (data: Buffer, isBinary: boolean) => {
                if (isBinary) return;

                resetTimeout();

                let msg: Record<string, unknown>;
                try {
                    msg = JSON.parse(data.toString());
                } catch {
                    return;
                }

                const header = msg.header as Record<string, unknown> | undefined;
                if (!header) return;

                const event = header.event as string;

                switch (event) {
                    case "task-started":
                        sendAudioInChunks(ws, taskId, audioData!, 3200);
                        break;

                    case "result-generated":
                        {
                            const payload = msg.payload as Record<string, unknown> | undefined;
                            if (payload) {
                                const output = payload.output as Record<string, unknown> | undefined;
                                if (output) {
                                    const sentence = output.sentence as Record<string, unknown> | undefined;
                                    if (sentence?.text) {
                                        const text = sentence.text as string;
                                        const endTime = sentence.end_time as number | null | undefined;

                                        currentSentenceText = text;

                                        if (endTime) {
                                            fullText += currentSentenceText;
                                            currentSentenceText = "";
                                        }
                                    }
                                }
                            }
                        }
                        break;

                    case "task-finished":
                        clearTimeout(timeout);
                        if (currentSentenceText) {
                            fullText += currentSentenceText;
                        }
                        ws.close();
                        resolve(fullText.trim());
                        break;

                    case "task-failed":
                        {
                            const payload = msg.payload as Record<string, unknown> | undefined;
                            const code = (payload?.code as string) ?? "unknown";
                            const message = (payload?.message as string) ?? "unknown error";
                            clearTimeout(timeout);
                            reject(new Error(`STT task failed: ${code} - ${message}`));
                            ws.close();
                        }
                        break;
                }
            });

            ws.on("error", (err: Error) => {
                clearTimeout(timeout);
                reject(new Error(`WebSocket error: ${err.message}`));
            });

            ws.on("close", () => {
                clearTimeout(timeout);
            });
        });
    }
}

function sendAudioInChunks(
    ws: WebSocket,
    taskId: string,
    data: Buffer,
    chunkSize: number,
): void {
    let offset = 0;

    const sendNext = () => {
        if (offset >= data.length) {
            setTimeout(() => {
                ws.send(JSON.stringify({
                    header: {
                        action: "finish-task",
                        task_id: taskId,
                        streaming: "duplex",
                    },
                    payload: { input: {} },
                }));
            }, 1500);
            return;
        }

        const chunk = data.subarray(offset, offset + chunkSize);
        offset += chunkSize;

        ws.send(chunk, { binary: true });

        setTimeout(sendNext, 100);
    };

    sendNext();
}
