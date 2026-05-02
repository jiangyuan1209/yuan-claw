import { ProxyAgent, setGlobalDispatcher } from "undici";
import type { AppConfig } from "../config/load-config.js";

let proxyInitialized = false;

function resolveProxyUrl(config?: AppConfig): string | undefined {
    return (
        config?.HTTPS_PROXY ||
        config?.HTTP_PROXY ||
        config?.https_proxy ||
        config?.http_proxy ||
        process.env.HTTPS_PROXY ||
        process.env.HTTP_PROXY ||
        process.env.https_proxy ||
        process.env.http_proxy
    );
}

function maskProxyForLog(proxyUrl: string): string {
    try {
        const url = new URL(proxyUrl);

        if (url.username || url.password) {
            url.username = url.username ? "***" : "";
            url.password = url.password ? "***" : "";
        }

        return url.toString();
    } catch {
        return proxyUrl;
    }
}

/**
 * 初始化 Node/undici 全局代理。
 *
 * 优先级：
 * 1. 传入的 config
 * 2. process.env
 */
export function initGlobalProxy(config?: AppConfig): void {
    if (proxyInitialized) {
        return;
    }

    const proxyUrl = resolveProxyUrl(config);

    if (!proxyUrl) {
        console.log("[proxy] not configured, using direct connection");
        proxyInitialized = true;
        return;
    }

    try {
        setGlobalDispatcher(new ProxyAgent(proxyUrl));
        proxyInitialized = true;
        console.log(`[proxy] using ${maskProxyForLog(proxyUrl)}`);
    } catch (error) {
        console.error("[proxy] failed to initialize global proxy:", error);
        throw error;
    }
}