import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const session = await import("../src/data/session.mjs");
const { state } = await import("../src/core/state.mjs");
const { setOnUnauthorized } = await import("../src/core/api-client.mjs");

// Wired as app.js wires it, so a 401 that reached the hook would be heard twice.
setOnUnauthorized(session.sessionEnded);
let heard = 0;
session.onSessionChange(() => { heard += 1; });
const TOKEN = "gata-league-auth-token";
const ME = { user: { id: "u1", login: "coach", telegram: "@coach", isAdmin: false, preferences: { themeMode: "dark" } } };
const TEAMS = { teams: [{ id: "t1", name: "Wardens" }] };
const NOT_AUTHORIZED = { error: { code: "NOT_AUTHORIZED", params: {}, message: "x" } };
function fresh(token = "tok") {
  api.reset();
  if (token) api.items.set(TOKEN, token);
  state.auth.currentUser = null;
  heard = 0;
}

test("no token is a guest, asked of nobody, and the app hears it once", async () => {
  fresh(null);
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.calls.length, 0);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("a token brings the coach, their settings and their teams together", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 200, TEAMS);
  assert.equal(await session.loadSession(), "signed-in");
  assert.deepEqual(api.calls.map((call) => call.key).sort(), ["GET /api/auth/me", "GET /api/teams"]);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  assert.deepEqual(state.myTeams.items.map((team) => team.id), ["t1"]);
  assert.equal(state.myTeams.loaded, true);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

// What the server really answers for a dead token: /me is 200 with no user
// (server/routes/auth.mjs), only /api/teams is a 401. The api-client's 401 hook
// stays quiet while no one is signed in, so the token is the session's to wipe.
test("a dead token leaves a guest without it, and the app hears it once", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, { user: null });
  api.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(state.auth.currentUser, null);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("/me saying no one is enough, whatever became of the teams", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, { user: null });
  api.fail("GET /api/teams");
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("a session that dies between the two answers is a guest too", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(state.auth.currentUser, null);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("no network at start keeps the token: the next load signs the coach back in", async () => {
  fresh();
  api.fail("GET /api/auth/me");
  api.fail("GET /api/teams");
  assert.equal(await session.loadSession(), "offline");
  assert.equal(api.items.get(TOKEN), "tok");
  assert.equal(state.auth.currentUser, null);
  assert.equal(heard, 1);
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 200, TEAMS);
  assert.equal(await session.loadSession(), "signed-in");
  assert.equal(state.auth.currentUser.id, "u1");
  assert.deepEqual(api.unanswered, []);
});

test("signing in keeps the token and asks /me for the settings the login answer lacks", async () => {
  fresh(null);
  api.reply("POST /api/auth/login", 200, { token: "new", user: { id: "u1", login: "coach" } });
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 200, TEAMS);
  await session.signIn({ login: "coach", password: "secret" });
  assert.equal(api.items.get(TOKEN), "new");
  assert.deepEqual(api.calls[0].body, { login: "coach", password: "secret" });
  assert.equal(api.calls.find((call) => call.key === "GET /api/auth/me").headers.Authorization, "Bearer new");
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("registering signs the new coach in the same way", async () => {
  fresh(null);
  api.reply("POST /api/auth/register", 201, { token: "fresh", user: { id: "u2", login: "rookie" } });
  api.reply("GET /api/auth/me", 200, { user: { id: "u2", login: "rookie", preferences: {} } });
  api.reply("GET /api/teams", 200, { teams: [] });
  await session.register({ login: "rookie", password: "secret", telegram: "@rookie" });
  assert.equal(api.items.get(TOKEN), "fresh");
  assert.deepEqual(api.calls[0].body, { login: "rookie", password: "secret", telegram: "@rookie" });
  assert.equal(state.auth.currentUser.id, "u2");
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("a wrong password is the screen's to show and changes nothing", async () => {
  fresh(null);
  api.reply("POST /api/auth/login", 401, { error: { code: "WRONG_LOGIN_OR_PASSWORD", params: {}, message: "x" } });
  await assert.rejects(session.signIn({ login: "coach", password: "nope" }), (error) => error.code === "WRONG_LOGIN_OR_PASSWORD");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(heard, 0);
  assert.deepEqual(api.unanswered, []);
});

test("signing out forgets the coach even when the server cannot be reached", async () => {
  fresh();
  state.auth.currentUser = ME.user;
  state.myTeams.items = [{ id: "t1" }];
  api.fail("POST /api/auth/logout");
  await session.signOut();
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(state.auth.currentUser, null);
  assert.deepEqual(state.myTeams.items, []);
  assert.equal(state.games.loaded, false);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});

test("a session that dies mid-use resets every slice of the coach", () => {
  fresh();
  state.season.loaded = true;
  state.admin.loaded = true;
  session.sessionEnded();
  assert.equal(state.season.loaded, false);
  assert.equal(state.admin.loaded, false);
  assert.equal(heard, 1);
  assert.deepEqual(api.unanswered, []);
});
