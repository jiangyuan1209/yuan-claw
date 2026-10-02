import { useRef, useState, useCallback } from "react";

/** Target sample rate for STT (DashScope requires 16kHz mono PCM s16le) */
const TARGET_SAMPLE_RATE = 16000;

/**
 * useAudioRecorder — Captures microphone audio from the browser.
 *
 * Uses Web Audio API (AudioContext + ScriptProcessorNode) to capture audio,
 * downsamples to 16kHz mono, converts to 16-bit PCM, and calls onChunk
 * with each audio buffer for transmission over WebSocket.
 *
 * Returns controls to start/stop recording and the current recording state.
 */
export function useAudioRecorder(onChunk: (pcmData: ArrayBuffer) => void) {
    const [isRecording, setIsRecording] = useState(false);
    const audioContextRef = useRef<AudioContext | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const streamRef = useRef<MediaStream | null>(null);

    /**
     * Linear interpolation downsampling from browser sample rate to 16kHz.
     * Converts Float32 samples to 16-bit signed integer PCM.
     */
    const downsampleAndConvert = useCallback(
        (buffer: AudioBuffer, targetRate: number): ArrayBuffer => {
            const sourceRate = buffer.sampleRate;
            const inputData = buffer.getChannelData(0); // Mono

            if (sourceRate === targetRate) {
                // No resampling needed, just convert to Int16
                const pcm16 = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    const s = Math.max(-1, Math.min(1, inputData[i]!));
                    pcm16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
                }
                return pcm16.buffer;
            }

            // Linear interpolation resampling
            const ratio = sourceRate / targetRate;
            const newLength = Math.round(inputData.length / ratio);
            const result = new Int16Array(newLength);

            for (let i = 0; i < newLength; i++) {
                const srcIndex = i * ratio;
                const srcIndexFloor = Math.floor(srcIndex);
                const srcIndexCeil = Math.min(srcIndexFloor + 1, inputData.length - 1);
                const frac = srcIndex - srcIndexFloor;

                const sample =
                    inputData[srcIndexFloor]! * (1 - frac) +
                    inputData[srcIndexCeil]! * frac;
                const clamped = Math.max(-1, Math.min(1, sample));
                result[i] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
            }

            return result.buffer;
        },
        [],
    );

    const startRecording = useCallback(async () => {
        if (isRecording) return;

        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    channelCount: 1,
                    echoCancellation: true,
                    noiseSuppression: true,
                },
            });
            streamRef.current = stream;

            // Create AudioContext at the browser's native sample rate
            const audioContext = new AudioContext({ sampleRate: undefined });
            audioContextRef.current = audioContext;

            const source = audioContext.createMediaStreamSource(stream);

            // ScriptProcessorNode for real-time audio processing
            // bufferSize 4096 gives ~93ms chunks at 44.1kHz, ~170ms at 24kHz
            const processor = audioContext.createScriptProcessor(4096, 1, 1);
            processorRef.current = processor;

            processor.onaudioprocess = (e) => {
                const inputBuffer = e.inputBuffer;
                const pcmData = downsampleAndConvert(inputBuffer, TARGET_SAMPLE_RATE);
                onChunk(pcmData);
            };

            source.connect(processor);
            processor.connect(audioContext.destination);

            setIsRecording(true);
        } catch (err) {
            console.error("Failed to start recording:", err);
            throw err;
        }
    }, [isRecording, onChunk, downsampleAndConvert]);

    const stopRecording = useCallback(() => {
        if (!isRecording) return;

        // Disconnect and stop processor
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current.onaudioprocess = null;
            processorRef.current = null;
        }

        // Close audio context
        if (audioContextRef.current) {
            audioContextRef.current.close().catch(() => {});
            audioContextRef.current = null;
        }

        // Stop microphone stream
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((track) => track.stop());
            streamRef.current = null;
        }

        setIsRecording(false);
    }, [isRecording]);

    return { isRecording, startRecording, stopRecording };
}
