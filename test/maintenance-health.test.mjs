import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";

// A flag that cannot be parsed still means maintenance, and reads as unplanned.
// The file and the env var must be in place before the server modules load: the
// default reader is built, and the path fixed, when maintenance.mjs is imported.
const flagFile = path.join(os.tmpdir(), `gata-broken-flag-${randomUUID()}.json`);
await fs.writeFile(flagFile, "{broken");
process.env.MAINTENANCE_FILE = flagFile;

// The reader warns once about a broken flag, and takes console.warn as it is
// when the reader is created, so the stub has to be up while the modules load.
const warnings = [];
const originalWarn = console.warn;
console.warn = (...args) => warnings.push(args.join(" "));
let handleAuthRoutes;
let pool;
try {
  ({ handleAuthRoutes } = await import("../server/routes/auth.mjs"));
  ({ pool } = await import("../server/db/pool.mjs"));
} finally {
  console.warn = originalWarn;
}

function fakeResponse() {
  return {
    headers: {}, status: 0, body: null,
    setHeader(name, value) { this.headers[name] = value; },
    writeHead(status, headers = {}) { this.status = status; Object.assign(this.headers, headers); },
    end(body) { this.body = body; },
  };
}

test("health reports a flag that is up, without the reader's internal fields", async () => {
  const original = pool.query;
  pool.query = async () => ({ rows: [{ "?column?": 1 }] });
  try {
    const response = fakeResponse();
    const request = { method: "GET", headers: {}, socket: { remoteAddress: "172.18.0.2" } };
    const url = new URL("http://localhost/api/health");
    assert.equal(await handleAuthRoutes(request, response, url), true);
    assert.equal(response.status, 200);
    assert.deepEqual(JSON.parse(String(response.body)), {
      ok: true,
      maintenance: { kind: "unplanned", startsAt: null, endsAt: null },
    });
    assert.equal(warnings.length, 1);
    assert.match(warnings[0], /^\[maintenance\]/);
  } finally {
    pool.query = original;
    await fs.rm(flagFile, { force: true });
  }
});
