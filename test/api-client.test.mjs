import test from "node:test";
import assert from "node:assert/strict";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { API_ERROR, ApiError, createApiClient, errorText } from "../src/core/api.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";

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
    [403, API_ERROR.FORBIDDEN],
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

test("a 403 is a refusal: the session is not reported dead", async () => {
  let notified = 0;
  const client = clientWith(async () => jsonResponse(403, { error: { code: "CURRENT_PASSWORD_WRONG", params: {}, message: "x" } }), {
    onUnauthorized: () => { notified += 1; },
  });
  await assert.rejects(() => client.request("/api/auth/profile", { method: "PATCH" }),
    (error) => error.kind === API_ERROR.FORBIDDEN && error.code === "CURRENT_PASSWORD_WRONG");
  assert.equal(notified, 0);
});

test("no connection and a timeout are told in the page's language", () => {
  setDictionaries({ en: { "request.offline": "No connection", "request.timeout": "Too slow" }, ru: {} });
  assert.equal(errorText(new ApiError(API_ERROR.OFFLINE, { message: "Failed to fetch" })), "No connection");
  assert.equal(errorText(new ApiError(API_ERROR.TIMEOUT, { message: "The operation was aborted" })), "Too slow");
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

test("503 MAINTENANCE is its own kind and is reported once", async () => {
  const seen = [];
  const client = clientWith(async () => jsonResponse(503, { error: { code: "MAINTENANCE", params: {}, message: "maintenance" } }), {
    onMaintenance: (error) => seen.push(error),
  });
  await assert.rejects(() => client.request("/api/teams"), (error) => error.kind === API_ERROR.MAINTENANCE);
  assert.equal(seen.length, 1);
});

test("any other 503 stays a plain HTTP error", async () => {
  let called = false;
  const client = clientWith(async () => jsonResponse(503, {}), { onMaintenance: () => { called = true; } });
  await assert.rejects(() => client.request("/api/teams"), (error) => error.kind === API_ERROR.HTTP);
  assert.equal(called, false);
});

test("a failing maintenance hook does not replace the maintenance error", async () => {
  const client = clientWith(async () => jsonResponse(503, { error: { code: "MAINTENANCE", params: {}, message: "maintenance" } }), {
    onMaintenance: () => { throw new Error("hook failed"); },
  });
  await assert.rejects(
    () => client.request("/api/teams"),
    (error) => {
      assert.ok(error instanceof ApiError);
      assert.equal(error.kind, API_ERROR.MAINTENANCE);
      return true;
    },
  );
});

// Stage 13, decision 23 (07a): a 401 names the token its request went with, so the session can tell whose it was.
test("a 401 tells the hook the token its request was sent with, not the one stored when it comes back", async () => {
  let stored = "old";
  let answer = null;
  const seen = [];
  const client = createApiClient({
    getToken: () => stored,
    fetchFn: () => new Promise((resolve) => { answer = resolve; }),
    onUnauthorized: (error, sent) => seen.push([error.kind, sent]),
  });
  const request = client.request("/api/teams");
  stored = "new";
  answer(jsonResponse(401, { error: "Not authorized." }));
  await assert.rejects(request, (error) => error.kind === API_ERROR.UNAUTHORIZED);
  assert.deepEqual(seen, [[API_ERROR.UNAUTHORIZED, { token: "old" }]]);
});

// The page's own client (src/core/api-client.mjs) over a fake browser: the token is in localStorage, as the page keeps it.
const fakeApi = installFakeApi();
const { apiRequest, setOnUnauthorized } = await import("../src/core/api-client.mjs");
const { state } = await import("../src/core/state.mjs");
const TOKEN = "gata-league-auth-token";
const NOT_AUTHORIZED = { error: { code: "NOT_AUTHORIZED", params: {}, message: "Not authorized." } };

test("a 401 for a request sent before a new sign-in leaves the new session signed in", async () => {
  const ended = [];
  setOnUnauthorized((user) => ended.push(user.id));
  fakeApi.reset();
  fakeApi.items.set(TOKEN, "old");
  state.auth.currentUser = { id: "u1", login: "first" };
  fakeApi.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  const gate = fakeApi.hold("GET /api/teams");
  const late = apiRequest("/api/teams");
  // The coach signs in again (or as someone else) while the old request is on its way.
  fakeApi.items.set(TOKEN, "new");
  state.auth.currentUser = { id: "u2", login: "second" };
  gate.release();
  await assert.rejects(late, (error) => error.kind === API_ERROR.UNAUTHORIZED, "the caller still hears its own refusal");
  assert.equal(fakeApi.items.get(TOKEN), "new", "the new token stays");
  assert.equal(state.auth.currentUser?.id, "u2", "the new coach stays signed in");
  assert.deepEqual(ended, [], "nobody is signed out");
  assert.equal(fakeApi.calls[0].headers.Authorization, "Bearer old", "the request went as the old session");
  fakeApi.assertAnswered();
});

test("a 401 for the current token signs out once, as before", async () => {
  const ended = [];
  setOnUnauthorized((user) => ended.push(user.id));
  fakeApi.reset();
  fakeApi.items.set(TOKEN, "tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
  fakeApi.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  fakeApi.reply("GET /api/games", 401, NOT_AUTHORIZED);
  const both = await Promise.allSettled([apiRequest("/api/teams"), apiRequest("/api/games")]);
  assert.deepEqual(both.map((result) => result.reason?.kind), [API_ERROR.UNAUTHORIZED, API_ERROR.UNAUTHORIZED]);
  assert.equal(fakeApi.items.has(TOKEN), false, "no token");
  assert.equal(state.auth.currentUser, null, "no coach");
  assert.deepEqual(ended, ["u1"], "the app told once, of the coach whose session it was");
  // A guest's 401 (no one signed in) tells nobody.
  fakeApi.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  await assert.rejects(apiRequest("/api/teams"));
  assert.deepEqual(ended, ["u1"]);
  fakeApi.assertAnswered();
});
