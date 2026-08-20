import test from "node:test";
import assert from "node:assert/strict";

import { API_ERROR, ApiError, createApiClient } from "../src/core/api.mjs";

function jsonResponse(status, body) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function clientWith(fetchFn, options = {}) {
  return createApiClient({ fetchFn, getToken: () => "token-123", ...options });
}

test("a successful request returns the payload and sends the token", async () => {
  let seen = null;
  const client = clientWith(async (path, init) => {
    seen = { path, init };
    return jsonResponse(200, { teams: [] });
  });

  const payload = await client.request("/api/teams");
  assert.deepEqual(payload, { teams: [] });
  assert.equal(seen.path, "/api/teams");
  assert.equal(seen.init.headers.Authorization, "Bearer token-123");
  assert.equal(seen.init.headers["Content-Type"], "application/json");
});

test("no token, no Authorization header", async () => {
  let seen = null;
  const client = createApiClient({
    getToken: () => "",
    fetchFn: async (path, init) => { seen = init; return jsonResponse(200, {}); },
  });
  await client.request("/api/health");
  assert.equal(seen.headers.Authorization, undefined);
});

test("a dropped connection is offline, not a mystery error", async () => {
  const client = clientWith(async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(
    () => client.request("/api/teams"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, API_ERROR.OFFLINE);
      return true;
    },
  );
});

test("an aborted request is a timeout", async () => {
  const client = clientWith(async () => {
    throw Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
  });
  await assert.rejects(
    () => client.request("/api/teams"),
    (error) => error.kind === API_ERROR.TIMEOUT,
  );
});

test("statuses map to the kinds the roster store branches on", async () => {
  const cases = [
    [401, API_ERROR.UNAUTHORIZED],
    [403, API_ERROR.UNAUTHORIZED],
    [409, API_ERROR.CONFLICT],
    [422, API_ERROR.INVALID],
    [404, API_ERROR.HTTP],
    [500, API_ERROR.HTTP],
  ];
  for (const [status, kind] of cases) {
    const client = clientWith(async () => jsonResponse(status, { error: "nope" }));
    await assert.rejects(
      () => client.request("/api/teams"),
      (error) => {
        assert.equal(error.kind, kind, `status ${status}`);
        assert.equal(error.status, status);
        return true;
      },
    );
  }
});

test("a 422 carries the violations the interface has to render", async () => {
  const violations = [{ code: "ROSTER_MIN_PLAYERS", params: { min: 7, count: 3 } }];
  const client = clientWith(async () => jsonResponse(422, { error: "invalid roster", violations }));
  await assert.rejects(
    () => client.request("/api/teams", { method: "POST" }),
    (error) => {
      assert.equal(error.kind, API_ERROR.INVALID);
      assert.deepEqual(error.violations, violations);
      return true;
    },
  );
});

test("a 401 notifies once so the session can be cleared in one place", async () => {
  let notified = 0;
  const client = clientWith(async () => jsonResponse(401, { error: "Not authorized." }), {
    onUnauthorized: () => { notified += 1; },
  });
  await assert.rejects(() => client.request("/api/teams"));
  assert.equal(notified, 1);
});

test("a non-JSON body still produces a usable error", async () => {
  const client = clientWith(async () => ({
    ok: false,
    status: 502,
    json: async () => { throw new SyntaxError("Unexpected token <"); },
  }));
  await assert.rejects(
    () => client.request("/api/teams"),
    (error) => {
      assert.equal(error.kind, API_ERROR.HTTP);
      assert.match(error.message, /502/);
      return true;
    },
  );
});
