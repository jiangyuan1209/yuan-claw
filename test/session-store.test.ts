/**
 * SessionStore 的离线单测，重点覆盖 sessionId 的路径穿越边界。
 *
 * sessionId 来自 WebSocket 查询参数与 REST 路由参数，是外部输入；
 * 存储层会把它拼成 `<historyDir>/<id>.json`，因此必须保证非法 id
 * 既不能读出目录外的文件，也不能在目录外创建/删除文件。
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { SessionStore, isValidSessionId } from "../src/memory/session-store.js";

async function makeStore() {
    const parent = await fs.mkdtemp(path.join(os.tmpdir(), "yuan-claw-session-"));
    const baseDir = path.join(parent, "history");
    return { parent, baseDir, store: new SessionStore({ baseDir }) };
}

test("isValidSessionId：只接受单段安全文件名", () => {
    for (const ok of [
        crypto.randomUUID(),
        "abc",
        "a-b_c.1",
        "0",
    ]) {
        assert.equal(isValidSessionId(ok), true, `${ok} 应合法`);
    }

    for (const bad of [
        "",
        ".",
        "..",
        "../escape",
        "..\\escape",
        "a/b",
        "a\\b",
        "-leading",
        ".hidden",
        "with space",
        "nul\0byte",
        "x".repeat(129),
        undefined,
        null,
        42,
    ]) {
        assert.equal(isValidSessionId(bad), false, `${String(bad)} 应非法`);
    }
});

test("save / load / delete：合法 id 正常往返", async () => {
    const { store, baseDir } = await makeStore();
    const id = crypto.randomUUID();

    await store.save(id, [{ role: "user", content: "hello" }], "ws-1");
    const loaded = await store.load(id);
    assert.equal(loaded?.sessionId, id);
    assert.equal(loaded?.workspaceId, "ws-1");
    assert.equal(loaded?.messages.length, 1);

    const filePath = path.join(baseDir, `${id}.json`);
    assert.equal(
        JSON.parse(await fs.readFile(filePath, "utf8")).messages[0].content,
        "hello",
    );

    await store.delete(id);
    assert.equal(await store.load(id), null);
});

test("save：非法 id 抛错且不会在历史目录外落盘", async () => {
    const { parent, store } = await makeStore();
    const outside = path.join(parent, "escaped.json");

    await assert.rejects(
        store.save("../escaped", [{ role: "user", content: "x" }]),
        /Invalid session id/,
    );
    await assert.rejects(
        store.save("../../escaped", [{ role: "user", content: "x" }]),
        /Invalid session id/,
    );

    await assert.rejects(fs.access(outside));
});

test("load：非法 id 一律当作不存在，不读取目录外文件", async () => {
    const { parent, store } = await makeStore();
    const outside = path.join(parent, "secret.json");
    await fs.writeFile(
        outside,
        JSON.stringify({ sessionId: "secret", messages: [] }),
        "utf8",
    );

    assert.equal(await store.load("../secret"), null);
    assert.equal(await store.load("..%2Fsecret"), null);
});

test("delete：非法 id 不会删除目录外的文件", async () => {
    const { parent, store } = await makeStore();
    const victim = path.join(parent, "victim.json");
    await fs.writeFile(victim, "{}", "utf8");

    await store.delete("../victim");
    await store.delete("../victim");

    assert.equal(await fs.readFile(victim, "utf8"), "{}");
});

test("createSession：非法 id 不创建空会话文件", async () => {
    const { store } = await makeStore();

    await assert.rejects(store.createSession("../bad", "ws-1"), /Invalid session id/);
    assert.equal(await store.load("../bad"), null);
});
