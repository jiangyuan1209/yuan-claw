/**
 * Web 端访问边界校验。
 *
 * Web 服务默认只监听回环地址，但「只监听 localhost」并不等于安全边界：
 *   1. DNS rebinding —— 恶意页面把自己的域名解析到 127.0.0.1，浏览器仍会带上
 *      攻击者的 Host（evil.example）。若不校验 Host，该页面就能以同源身份
 *      驱动本地 Agent（工作区里 shell_exec 是免审批的）。
 *   2. 跨站请求 —— 任意网页都能向 http://127.0.0.1:3000/api/chat 发 POST，
 *      把用户本机变成攻击者的执行环境。校验 Origin / Sec-Fetch-Site 可拒绝
 *      这类非本地来源。
 *
 * 这里只放纯函数，方便离线单测；server.ts 负责把结果接到 HTTP 与 WebSocket。
 */

const WILDCARD_HOSTNAMES = new Set(["0.0.0.0", "::", "[::]"]);

/** 去掉大小写、末尾根点与 IPv6 方括号，便于比较 */
export function normalizeHostname(hostname: string): string {
    return hostname
        .trim()
        .toLowerCase()
        .replace(/\.$/, "")
        .replace(/^\[/, "")
        .replace(/\]$/, "");
}

function isIpv4Loopback(hostname: string): boolean {
    const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
    if (!match) return false;
    const octets = match.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return false;
    return octets[0] === 127;
}

/**
 * 判断 hostname 是否指向本机回环。
 *
 * 接受的写法：localhost、*.localhost（RFC 6761）、127.0.0.0/8、::1。
 * 不能把「以 localhost 结尾的任意域名」（如 localhost.evil.com）当成回环。
 */
export function isLoopbackHostname(hostname: string): boolean {
    const host = normalizeHostname(hostname);
    if (host === "localhost" || host.endsWith(".localhost")) return true;
    if (host === "::1" || host === "0:0:0:0:0:0:0:1") return true;
    return isIpv4Loopback(host);
}

export function isWildcardHostname(hostname: string): boolean {
    return WILDCARD_HOSTNAMES.has(normalizeHostname(hostname));
}

type ParsedAuthority = {
    hostname: string;
    port?: number;
};

/**
 * 解析 Host 头（`example.com:3000`、`127.0.0.1`、`[::1]:3000`）。
 * 解析失败返回 null —— 畸形 Host 一律拒绝，不尝试猜测。
 */
export function parseAuthority(value: string | undefined): ParsedAuthority | null {
    if (typeof value !== "string") return null;

    const trimmed = value.trim();
    if (!trimmed || /[\s/@\\]/.test(trimmed)) return null;

    if (trimmed.startsWith("[")) {
        const closeIndex = trimmed.indexOf("]");
        if (closeIndex < 0) return null;
        const hostname = trimmed.slice(1, closeIndex);
        const rest = trimmed.slice(closeIndex + 1);
        if (!hostname) return null;
        if (rest === "") return { hostname };
        if (!rest.startsWith(":")) return null;
        const port = parsePort(rest.slice(1));
        if (port === null) return null;
        return { hostname, port };
    }

    // 裸 IPv6（没有方括号）按整段主机名处理；Host 头规范要求带方括号，
    // 这里宽松接受，真正的判定仍交给 isLoopbackHostname。
    const colonCount = (trimmed.match(/:/g) ?? []).length;
    if (colonCount > 1) return { hostname: trimmed };

    if (colonCount === 1) {
        const [hostname, portText] = trimmed.split(":");
        const port = parsePort(portText);
        if (!hostname || port === null) return null;
        return { hostname, port };
    }

    return { hostname: trimmed };
}

function parsePort(text: string): number | null {
    if (!/^\d{1,5}$/.test(text)) return null;
    const port = Number(text);
    return port >= 1 && port <= 65535 ? port : null;
}

export type RequestHeaders = {
    host?: string;
    origin?: string;
    /** 浏览器自动附加，见 Fetch Metadata Request Headers 规范 */
    secFetchSite?: string;
};

export type WebGuardOptions = {
    /** 实际监听地址；0.0.0.0 / :: 表示用户显式把服务开放到网络 */
    bindHost: string;
};

export type WebGuardResult =
    | { allowed: true }
    | { allowed: false; reason: string };

/**
 * 判断一条 HTTP / WebSocket 请求是否来自可信的本地来源。
 *
 * 校验顺序：Host（防 DNS rebinding）→ Origin（防跨站请求）→ Sec-Fetch-Site。
 * 非浏览器客户端（curl、脚本）不带 Origin / Sec-Fetch-Site，只要 Host 合法即放行。
 */
export function checkRequestBoundary(
    headers: RequestHeaders,
    options: WebGuardOptions,
): WebGuardResult {
    const authority = parseAuthority(headers.host);
    if (!authority) {
        return { allowed: false, reason: "missing or malformed Host header" };
    }

    const bindHost = normalizeHostname(options.bindHost);
    const requestHost = normalizeHostname(authority.hostname);
    const wildcardBind = isWildcardHostname(bindHost);

    if (!wildcardBind && !isLoopbackHostname(requestHost) && requestHost !== bindHost) {
        return {
            allowed: false,
            reason: `Host ${authority.hostname} is not the local web server`,
        };
    }

    if (headers.origin !== undefined) {
        let origin: URL;
        try {
            origin = new URL(headers.origin);
        } catch {
            return { allowed: false, reason: `malformed Origin: ${headers.origin}` };
        }
        if (origin.protocol !== "http:" && origin.protocol !== "https:") {
            return { allowed: false, reason: `unsupported Origin protocol: ${origin.protocol}` };
        }

        const originHost = normalizeHostname(origin.hostname);
        const sameOrigin = originHost === requestHost;
        const localOrigin = isLoopbackHostname(originHost);
        const bindOrigin = !wildcardBind && originHost === bindHost;

        // 通配绑定下不做 Host 白名单，仍要求 Origin 与请求 Host 同源，
        // 避免任意网页直接跨站驱动服务；同源由用户显式承担。
        if (!sameOrigin && !localOrigin && !bindOrigin) {
            return { allowed: false, reason: `cross-origin request from ${headers.origin}` };
        }
    }

    if (headers.secFetchSite === "cross-site") {
        return { allowed: false, reason: "cross-site browser request" };
    }

    return { allowed: true };
}

/**
 * 决定 Web 服务的监听地址。
 *
 * 默认只监听 127.0.0.1：Web 端没有鉴权，且工作区里 shell_exec 免审批，
 * 绑定到 0.0.0.0 等于把本机 Agent 暴露给整个局域网。需要远程访问时，
 * 用户必须显式设置 YUAN_CLAW_WEB_HOST（并自行承担风险）。
 */
export function resolveBindHost(envValue: string | undefined): {
    host: string;
    exposed: boolean;
} {
    const host = envValue?.trim();
    if (!host) return { host: "127.0.0.1", exposed: false };
    return {
        host,
        // 只要不是回环地址就算「对外暴露」，即使是具体的网卡 IP
        exposed: !isLoopbackHostname(host),
    };
}
