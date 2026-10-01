import test from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { once } from "node:events";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createPreviewServer } from "../scripts/preview/server.mjs";

async function listen(t, server) {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  });
  return `http://127.0.0.1:${server.address().port}`;
}

async function fixture(t, handler, options = {}) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "gata-preview-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  await fs.writeFile(path.join(root, "index.html"), "<h1>Local build</h1>");
  await fs.writeFile(path.join(root, ".env"), "private");
  await fs.mkdir(path.join(root, "assets"));
  await fs.writeFile(path.join(root, "assets", "font.ttf"), "font");
  const upstream = await listen(t, http.createServer(handler));
  const server = createPreviewServer({ root: root + path.sep, apiOrigin: upstream, ...options });
  return { origin: await listen(t, server), upstream };
}

test("preview serves local build and fonts without exposing private files or calling the API", async t => {
  let calls = 0;
  const { origin } = await fixture(t, (_req, res) => { calls++; res.end(); });
  const response = await fetch(origin);
  assert.equal(await response.text(), "<h1>Local build</h1>");
  assert.match(response.headers.get("cache-control"), /no-store/);
  const font = await fetch(`${origin}/assets/font.ttf`);
  assert.equal(font.headers.get("content-type"), "font/ttf");
  for (const pathname of ["/.env", "/package.json", "/server/server.mjs", "/src/%2e%2e/.env"]) {
    assert.equal((await fetch(origin + pathname)).status, 404, pathname);
  }
  assert.equal(calls, 0);
});

test("preview proxies API path, query, method, bearer and body while preserving errors", async t => {
  let received;
  const { origin, upstream } = await fixture(t, async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    received = { url: req.url, method: req.method, headers: req.headers, body: Buffer.concat(chunks).toString() };
    res.writeHead(409, { "Content-Type": "application/json", "Retry-After": "5" });
    res.end('{"error":{"code":"CONFLICT"}}');
  });
  const response = await fetch(`${origin}/api/teams/t1?locale=ru`, {
    method: "PATCH", headers: { Authorization: "Bearer test-session", "Content-Type": "application/json", Cookie: "unrelated=private", Origin: origin },
    body: '{"name":"Команда"}',
  });
  assert.equal(response.status, 409);
  assert.deepEqual(await response.json(), { error: { code: "CONFLICT" } });
  assert.equal(response.headers.get("retry-after"), "5");
  assert.equal(received.url, "/api/teams/t1?locale=ru");
  assert.equal(received.method, "PATCH");
  assert.equal(received.body, '{"name":"Команда"}');
  assert.equal(received.headers.authorization, "Bearer test-session");
  assert.equal(received.headers.host, new URL(upstream).host);
  assert.equal(received.headers.cookie, undefined);
  assert.equal(received.headers.origin, undefined);
});

test("preview rejects foreign origins and hosts before forwarding to production", async t => {
  let calls = 0;
  const { origin } = await fixture(t, (_req, res) => { calls++; res.end(); });
  for (const headers of [{ Origin: "https://unrelated.example" }, { Host: "unrelated.example" }, { "Sec-Fetch-Site": "cross-site" }]) {
    // fetch normalizes Host; use raw HTTP to exercise the server's boundary.
    const status = await new Promise((resolve, reject) => {
      http.get(`${origin}/api/season`, { headers }, response => {
        response.resume();
        response.on("end", () => resolve(response.statusCode));
      }).on("error", reject);
    });
    assert.equal(status, 403, JSON.stringify(headers));
  }
  assert.equal(calls, 0);
});

test("preview never follows an upstream redirect carrying the user's bearer token", async t => {
  let calls = 0;
  const { origin } = await fixture(t, (req, res) => {
    calls++;
    res.writeHead(302, { Location: "/api/other" });
    res.end();
  });
  const response = await fetch(`${origin}/api/season`, { headers: { Authorization: "Bearer test-session" } });
  assert.equal(response.status, 502);
  assert.equal(response.headers.get("location"), null);
  assert.equal(calls, 1);
});

test("preview reports an unavailable upstream without leaking connection details", async t => {
  const { origin } = await fixture(t, req => req.socket.destroy());
  const response = await fetch(`${origin}/api/season`);
  assert.equal(response.status, 502);
  assert.deepEqual(await response.json(), { error: "Production API is unavailable." });
});

test("preview times out a stalled upstream", async t => {
  const { origin } = await fixture(t, () => {}, { timeoutMs: 30 });
  const response = await fetch(`${origin}/api/season`);
  assert.equal(response.status, 504);
});

test("preview keeps HEAD responses bodyless and refuses static writes", async t => {
  const { origin } = await fixture(t, (_req, res) => { res.writeHead(204); res.end(); });
  const head = await fetch(origin, { method: "HEAD" });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), "");
  assert.equal((await fetch(origin, { method: "POST", body: "overwrite" })).status, 405);
  assert.equal(await (await fetch(origin)).text(), "<h1>Local build</h1>");
});

test("preview accepts only credential-free HTTPS origins or HTTP loopback for local tests", () => {
  for (const apiOrigin of ["http://production.example", "https://user:secret@example.com", "https://example.com/api", "https://example.com?key=secret", "file:///tmp/api"]) {
    assert.throws(() => createPreviewServer({ root: "/tmp", apiOrigin }), /origin/i);
  }
});
