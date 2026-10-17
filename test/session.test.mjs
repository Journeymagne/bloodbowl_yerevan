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
  api.assertAnswered();
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
  api.assertAnswered();
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
  api.assertAnswered();
});

test("/me saying no one is enough, whatever became of the teams", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, { user: null });
  api.fail("GET /api/teams");
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(heard, 1);
  api.assertAnswered();
});

test("a session that dies between the two answers is a guest too", async () => {
  fresh();
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 401, NOT_AUTHORIZED);
  assert.equal(await session.loadSession(), "guest");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(state.auth.currentUser, null);
  assert.equal(heard, 1);
  api.assertAnswered();
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
  api.assertAnswered();
});

const FORBIDDEN = { error: { code: "ADMIN_REQUIRED", params: {}, message: "x" } };
const ABORTED = new DOMException("This operation was aborted", "AbortError");
const KEEPS_THE_TOKEN = {
  "a 403 on /me": () => { api.reply("GET /api/auth/me", 403, FORBIDDEN); api.reply("GET /api/teams", 200, TEAMS); },
  "a 403 on the teams": () => { api.reply("GET /api/auth/me", 200, ME); api.reply("GET /api/teams", 403, FORBIDDEN); },
  "the teams lost on the way": () => { api.reply("GET /api/auth/me", 200, ME); api.fail("GET /api/teams"); },
  "a timeout": () => { api.fail("GET /api/auth/me", ABORTED); api.fail("GET /api/teams", ABORTED); },
  "a /me with no user in it": () => { api.reply("GET /api/auth/me", 200, {}); api.reply("GET /api/teams", 200, TEAMS); },
};

test("a refusal, a lost answer or an unreadable one is not the end of the session", async () => {
  for (const [name, answer] of Object.entries(KEEPS_THE_TOKEN)) {
    fresh();
    answer();
    assert.equal(await session.loadSession(), "offline", name);
    assert.equal(api.items.get(TOKEN), "tok", name);
    assert.equal(state.auth.currentUser, null, name);
    assert.equal(heard, 1, name);
    api.assertAnswered();
  }
});

test("a listener that throws stops neither the others nor the load", async () => {
  fresh(null);
  const logged = [];
  const consoleError = console.error;
  console.error = (error) => logged.push(error);
  let after = 0;
  const removeThrowing = session.onSessionChange(() => { throw new Error("the first screen broke"); });
  const removeAfter = session.onSessionChange(() => { after += 1; });
  try {
    assert.equal(await session.loadSession(), "guest");
  } finally {
    console.error = consoleError;
    removeThrowing();
    removeAfter();
  }
  assert.equal(after, 1);
  assert.equal(heard, 1);
  assert.deepEqual(logged.map((error) => error.message), ["the first screen broke"]);
  api.assertAnswered();
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
  api.assertAnswered();
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
  api.assertAnswered();
});

test("a wrong password is the screen's to show and changes nothing", async () => {
  fresh(null);
  api.reply("POST /api/auth/login", 401, { error: { code: "WRONG_LOGIN_OR_PASSWORD", params: {}, message: "x" } });
  await assert.rejects(session.signIn({ login: "coach", password: "nope" }), (error) => error.code === "WRONG_LOGIN_OR_PASSWORD");
  assert.equal(api.items.has(TOKEN), false);
  assert.equal(heard, 0);
  api.assertAnswered();
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
  api.assertAnswered();
});

test("a session that dies mid-use resets every slice of the coach", () => {
  fresh();
  state.season.loaded = true;
  state.admin.loaded = true;
  session.sessionEnded();
  assert.equal(state.season.loaded, false);
  assert.equal(state.admin.loaded, false);
  assert.equal(heard, 1);
  api.assertAnswered();
});

// A profile save answers with publicUser, which has no preferences: those are only in /me.
test("a newer copy of the coach keeps the settings only /me brings", () => {
  fresh();
  state.auth.currentUser = { ...ME.user };
  session.mergeCurrentUser({ id: "u1", login: "renamed", telegram: "@new", isAdmin: false });
  assert.equal(state.auth.currentUser.login, "renamed");
  assert.equal(state.auth.currentUser.telegram, "@new");
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  assert.equal(heard, 0, "no one signed in or out: nobody is told");
  api.assertAnswered();
});

test("a copy that brings its own settings brings them, even empty ones", () => {
  fresh();
  state.auth.currentUser = { ...ME.user };
  session.mergeCurrentUser({ ...ME.user, preferences: { themeMode: "light" } });
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "light" });
  session.mergeCurrentUser({ ...ME.user, preferences: {} });
  assert.deepEqual(state.auth.currentUser.preferences, {});
  api.assertAnswered();
});

test("a copy brings no settings when it says null, and the same coach's are kept", () => {
  fresh();
  state.auth.currentUser = { ...ME.user };
  session.mergeCurrentUser({ id: "u1", login: "renamed", preferences: null });
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  fresh();
  session.mergeCurrentUser({ id: "u1", login: "coach", preferences: null });
  assert.equal(Object.hasOwn(state.auth.currentUser, "preferences"), false, "a null is not kept as if it were settings");
  api.assertAnswered();
});

// The profile answer is publicUser, and /me's accountUser adds two fields to it: preferences and managedByServer.
test("a newer copy of the coach keeps whether the server keeps the account", () => {
  fresh();
  state.auth.currentUser = { ...ME.user, managedByServer: true };
  session.mergeCurrentUser({ id: "u1", login: "coach", telegram: "@new", isAdmin: true });
  assert.equal(state.auth.currentUser.managedByServer, true);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" }, "both fields at once");
  session.mergeCurrentUser({ id: "u1", login: "coach", managedByServer: null });
  assert.equal(state.auth.currentUser.managedByServer, true, "a null brings none");
  api.assertAnswered();
});

test("a copy that says whether the server keeps the account is believed, false included", () => {
  fresh();
  state.auth.currentUser = { ...ME.user, managedByServer: true };
  session.mergeCurrentUser({ id: "u1", login: "coach", managedByServer: false });
  assert.equal(state.auth.currentUser.managedByServer, false);
  session.mergeCurrentUser({ id: "u1", login: "coach" });
  assert.equal(state.auth.currentUser.managedByServer, false, "and then it is the one we hold");
  api.assertAnswered();
});

test("the flag of another coach is not ours, and none is invented", () => {
  fresh();
  state.auth.currentUser = { ...ME.user, managedByServer: true };
  session.mergeCurrentUser({ id: "u2", login: "other" });
  assert.equal(Object.hasOwn(state.auth.currentUser, "managedByServer"), false);
  fresh();
  state.auth.currentUser = { ...ME.user };
  session.mergeCurrentUser({ id: "u1", login: "coach" });
  assert.equal(Object.hasOwn(state.auth.currentUser, "managedByServer"), false);
  api.assertAnswered();
});

test("a copy of another coach gets none of the settings we hold", () => {
  fresh();
  state.auth.currentUser = { ...ME.user };
  session.mergeCurrentUser({ id: "u2", login: "other", telegram: "@other" });
  assert.equal(state.auth.currentUser.id, "u2");
  assert.equal(Object.hasOwn(state.auth.currentUser, "preferences"), false);
  api.assertAnswered();
});

test("merging a coach into nobody sets them, and invents no settings", () => {
  fresh();
  const user = { id: "u1", login: "coach" };
  session.mergeCurrentUser(user);
  assert.deepEqual(state.auth.currentUser, { id: "u1", login: "coach" });
  assert.equal(Object.hasOwn(state.auth.currentUser, "preferences"), false);
  assert.deepEqual(user, { id: "u1", login: "coach" }, "the argument is left as it was");
  api.assertAnswered();
});
