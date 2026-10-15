import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// Point the default gate at a file that does not exist before anything loads it.
process.env.MAINTENANCE_FILE = path.join(os.tmpdir(), `gata-no-flag-${randomUUID()}.json`);

const { createMaintenanceGate } = await import("../server/http/maintenance.mjs");
const { handleAuthRoutes } = await import("../server/routes/auth.mjs");
const { pool } = await import("../server/db/pool.mjs");

function fakeResponse() {
  return {
    headers: {}, status: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body) { this.body = body; },
  };
}
const request = (remoteAddress, headers = {}) => ({ method: "GET", headers, socket: { remoteAddress } });
const url = (pathname) => new URL(`http://localhost${pathname}`);
const flagged = { current: async () => ({ kind: "planned", startsAt: null, endsAt: null }) };
const page = async () => Buffer.from("<!doctype html><title>maintenance</title>");

test("a page request gets 503 and the maintenance page, uncached", async () => {
  const gate = createMaintenanceGate({ reader: flagged, loadPage: page });
  const response = fakeResponse();
  assert.equal(await gate(request("172.18.0.2"), response, url("/")), true);
  assert.equal(response.status, 503);
  assert.match(response.headers["Content-Type"], /text\/html/);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Retry-After"], "120");
  assert.match(String(response.body), /maintenance/);
});

test("a maintenance page that cannot be read still gets 503, in plain text", async () => {
  const failing = async () => { throw Object.assign(new Error("ENOENT: no such file"), { code: "ENOENT" }); };
  const gate = createMaintenanceGate({ reader: flagged, loadPage: failing });
  const response = fakeResponse();
  const logged = [];
  const originalError = console.error;
  console.error = (...args) => logged.push(args.join(" "));
  try {
    assert.equal(await gate(request("172.18.0.2"), response, url("/")), true);
  } finally {
    console.error = originalError;
  }
  assert.equal(response.status, 503);
  assert.match(response.headers["Content-Type"], /^text\/plain/);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.headers["Retry-After"], "120");
  assert.equal(String(response.body), "Gata League: maintenance in progress. Please try again shortly.\n");
  assert.equal(logged.length, 1);
  assert.match(logged[0], /^\[maintenance\]/);
});

test("an API request gets 503 MAINTENANCE", async () => {
  const gate = createMaintenanceGate({ reader: flagged, loadPage: page });
  const response = fakeResponse();
  assert.equal(await gate(request("172.18.0.2"), response, url("/api/teams")), true);
  assert.equal(response.status, 503);
  assert.equal(JSON.parse(String(response.body)).error.code, "MAINTENANCE");
});

test("a forwarded-for header does not make a public request local", async () => {
  const gate = createMaintenanceGate({ reader: flagged, loadPage: page });
  const response = fakeResponse();
  assert.equal(await gate(request("172.18.0.2", { "x-forwarded-for": "127.0.0.1" }), response, url("/")), true);
  assert.equal(response.status, 503);
});

test("loopback and an absent flag are let through untouched", async () => {
  const response = fakeResponse();
  assert.equal(await createMaintenanceGate({ reader: flagged, loadPage: page })(request("127.0.0.1"), response, url("/")), false);
  assert.equal(await createMaintenanceGate({ reader: { current: async () => null }, loadPage: page })(request("172.18.0.2"), response, url("/")), false);
  assert.equal(response.status, 0);
});

test("health answers 200 and says whether maintenance is on", async () => {
  const original = pool.query;
  pool.query = async () => ({ rows: [{ "?column?": 1 }] });
  try {
    const response = fakeResponse();
    assert.equal(await handleAuthRoutes(request("172.18.0.2"), response, url("/api/health")), true);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(String(response.body)), { ok: true, maintenance: null });
  } finally {
    pool.query = original;
  }
});
