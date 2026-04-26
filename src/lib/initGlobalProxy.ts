import { ProxyAgent, setGlobalDispatcher } from "undici";

let proxyInitialized = false;

function resolveProxyUrl(): string | undefined {
    return (
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
 * 作用：
 * - 让全局 fetch / undici 请求走环境变量指定的代理
 * - 适用于 Brave、Tavily、Firecrawl 等基于 fetch 的请求
 *
 * 支持环境变量：
 * - HTTPS_PROXY
 * - HTTP_PROXY
 * - https_proxy
 * - http_proxy
 *
 * 用法：
 * ```ts
 * import { initGlobalProxy } from "./lib/initGlobalProxy";
 * initGlobalProxy();
 * ```
 */
export function initGlobalProxy(): void {
    if (proxyInitialized) {
        return;
    }

    const proxyUrl = resolveProxyUrl();

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