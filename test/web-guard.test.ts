/**
 * Web 端访问边界校验的离线单测。
 *
 * 背景：Web 服务没有鉴权，工作区里的 shell_exec 还是免审批的。
 * 默认只监听回环地址并不构成安全边界 —— DNS rebinding 与跨站请求都能
 * 从浏览器侧打到本机。这里固定住 Host / Origin / Sec-Fetch-Site 的判定规则，
 * 防止后续改动把边界悄悄放松。
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import {
    checkRequestBoundary,
    isLoopbackHostname,
    isWildcardHostname,
    parseAuthority,
    resolveBindHost,
} from "../src/security/web-guard.js";

const LOOPBACK = { bindHost: "127.0.0.1" };

function allowed(
    headers: Parameters<typeof checkRequestBoundary>[0],
    options = LOOPBACK,
): boolean {
    return checkRequestBoundary(headers, options).allowed;
}

// ─── 地址判定 ────────────────────────────────────────────────────

test("isLoopbackHostname：只认 localhost、127/8 与 ::1", () => {
    for (const host of [
        "localhost",
        "LOCALHOST",
        "localhost.",
        "app.localhost",
        "127.0.0.1",
        "127.1.2.3",
        "::1",
        "[::1]",
    ]) {
        assert.equal(isLoopbackHostname(host), true, `${host} 应视为回环`);
    }

    for (const host of [
        "localhost.evil.com",
        "evil-localhost.com",
        "10.0.0.1",
        "192.168.1.5",
        "169.254.169.254",
        "128.0.0.1",
        "127.0.0.256",
        "0.0.0.0",
        "::",
        "",
    ]) {
        assert.equal(isLoopbackHostname(host), false, `${host} 不应视为回环`);
    }
});

test("isWildcardHostname：识别 0.0.0.0 / :: / [::]", () => {
    assert.equal(isWildcardHostname("0.0.0.0"), true);
    assert.equal(isWildcardHostname(" :: "), true);
    assert.equal(isWildcardHostname("[::]"), true);
    assert.equal(isWildcardHostname("127.0.0.1"), false);
});

test("parseAuthority：解析带端口、IPv6 与畸形输入", () => {
    assert.deepEqual(parseAuthority("localhost:3000"), {
        hostname: "localhost",
        port: 3000,
    });
    assert.deepEqual(parseAuthority("127.0.0.1:3000"), {
        hostname: "127.0.0.1",
        port: 3000,
    });
    assert.deepEqual(parseAuthority("[::1]:3000"), {
        hostname: "::1",
        port: 3000,
    });
    assert.deepEqual(parseAuthority("[::1]"), { hostname: "::1" });
    assert.deepEqual(parseAuthority("::1"), { hostname: "::1" });
    assert.deepEqual(parseAuthority("localhost"), { hostname: "localhost" });

    for (const bad of [
        undefined,
        "",
        "   ",
        "localhost:",
        "localhost:0",
        "localhost:70000",
        "localhost:abc",
        "user@host:3000",
        "a/b:3000",
        "[::1",
    ]) {
        assert.equal(parseAuthority(bad), null, `${String(bad)} 应解析失败`);
    }
});

// ─── Host 校验：DNS rebinding ───────────────────────────────────

test("Host 不是本机地址时拒绝（DNS rebinding 防护）", () => {
    const verdict = checkRequestBoundary({ host: "evil.example:3000" }, LOOPBACK);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /Host/);
});

test("缺少或畸形的 Host 一律拒绝", () => {
    assert.equal(allowed({}), false);
    assert.equal(allowed({ host: "localhost:bad" }), false);
});

test("本机 Host 放行，非浏览器客户端（无 Origin）可用", () => {
    assert.equal(allowed({ host: "localhost:3000" }), true);
    assert.equal(allowed({ host: "127.0.0.1:3000" }), true);
    assert.equal(allowed({ host: "[::1]:3000" }), true);
});

test("绑定具体网卡时只接受该地址与回环地址", () => {
    const options = { bindHost: "192.168.1.5" };
    assert.equal(allowed({ host: "192.168.1.5:3000" }, options), true);
    assert.equal(allowed({ host: "127.0.0.1:3000" }, options), true);
    assert.equal(allowed({ host: "evil.example:3000" }, options), false);
});

// ─── Origin 校验：跨站请求 ──────────────────────────────────────

test("同源 Origin 放行", () => {
    assert.equal(
        allowed({
            host: "localhost:3000",
            origin: "http://localhost:3000",
        }),
        true,
    );
    assert.equal(
        allowed({
            host: "127.0.0.1:3000",
            origin: "http://127.0.0.1:3000",
        }),
        true,
    );
});

test("Vite 开发代理（回环但不同端口）放行", () => {
    assert.equal(
        allowed({
            host: "localhost:3000",
            origin: "http://localhost:5173",
        }),
        true,
    );
});

test("外部 Origin 拒绝", () => {
    const verdict = checkRequestBoundary(
        { host: "localhost:3000", origin: "https://evil.example" },
        LOOPBACK,
    );
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /cross-origin/);
});

test("畸形或非 http(s) 的 Origin 拒绝", () => {
    assert.equal(
        allowed({ host: "localhost:3000", origin: "null" }),
        false,
    );
    assert.equal(
        allowed({ host: "localhost:3000", origin: "file:///etc/passwd" }),
        false,
    );
});

test("Sec-Fetch-Site: cross-site 拒绝，同源/同站放行", () => {
    assert.equal(
        allowed({
            host: "localhost:3000",
            secFetchSite: "cross-site",
        }),
        false,
    );
    assert.equal(
        allowed({
            host: "localhost:3000",
            secFetchSite: "same-origin",
        }),
        true,
    );
    assert.equal(
        allowed({
            host: "localhost:3000",
            secFetchSite: "same-site",
        }),
        true,
    );
});

// ─── 监听地址选择 ──────────────────────────────────────────────

test("resolveBindHost：默认只监听回环，显式 env 才对外", () => {
    assert.deepEqual(resolveBindHost(undefined), {
        host: "127.0.0.1",
        exposed: false,
    });
    assert.deepEqual(resolveBindHost("  "), {
        host: "127.0.0.1",
        exposed: false,
    });
    assert.deepEqual(resolveBindHost("localhost"), {
        host: "localhost",
        exposed: false,
    });
    assert.deepEqual(resolveBindHost("0.0.0.0"), {
        host: "0.0.0.0",
        exposed: true,
    });
    assert.deepEqual(resolveBindHost("192.168.1.5"), {
        host: "192.168.1.5",
        exposed: true,
    });
});
