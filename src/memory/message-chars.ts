import type { ChatMessage } from "./types.js";

/**
 * 计算一组消息的总字符数。
 *
 * 用途有两处，必须口径一致：
 *   - 运行时判断是否需要压缩历史（compressHistoryIfNeeded）
 *   - 前端进度条展示当前对话占用（session-store / session_stats 事件）
 *
 * 图片内容无法用字符衡量，按固定 500 字符估算。
 */
export function countMessagesChars(messages: ChatMessage[]): number {
    let total = 0;
    for (const msg of messages) {
        if (typeof msg.content === "string") {
            total += msg.content.length;
        } else if (Array.isArray(msg.content)) {
            for (const part of msg.content) {
                if (part.type === "text") {
                    total += part.text.length;
                }
                if (part.type === "image_url") {
                    total += 500;
                }
            }
        }
    }
    return total;
}
