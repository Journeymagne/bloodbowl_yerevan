import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const session = await import("../src/data/session.mjs");
const { state } = await import("../src/core/state.mjs");
const { setOnUnauthorized } = await import("../src/core/api-client.mjs");
const { API_ERROR, ApiError } = await import("../src/core/api.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { peekReturn, setReturn } = await import("../src/core/return-to.mjs");

const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
setDictionaries({ en: dictionary("en"), ru: dictionary("ru") });
const OFFLINE = "No connection to the server. Check the internet and try again.";
const NO_ANSWER = "The server did not answer. Try again in a minute.";

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
  "a timeout": () => { api.fail("GET /api/auth/me", ABORTED); api.fail("GET /api/teams", ABORTED); },
  "a /me with no user in it": () => { api.reply("GET /api/auth/me", 200, {}); api.reply("GET /api/teams", 200, TEAMS); },
};

test("a refusal, a lost answer or an unreadable one on /me is not the end of the session", async () => {
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

// R10 (final review I1): /me is the session; the list of teams is only the coach's list. A list that failed without
// a 401 used to make the coach a guest on every load: locked out of their pages, and "already signed in" at the door.
const LIST_FAILS = {
  "a 500 on the teams": () => api.reply("GET /api/teams", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } }),
  "a 403 on the teams": () => api.reply("GET /api/teams", 403, FORBIDDEN),
  "the teams lost on the way": () => api.fail("GET /api/teams"),
  "the teams timed out": () => api.fail("GET /api/teams", ABORTED),
};

test("a coach /me knows is signed in whatever became of the teams: the list is not read, and says why", async () => {
  for (const [name, listFails] of Object.entries(LIST_FAILS)) {
    fresh();
    api.reply("GET /api/auth/me", 200, ME);
    listFails();
    assert.equal(await session.loadSession(), "signed-in", name);
    assert.equal(state.auth.currentUser?.id, "u1", name);
    assert.equal(api.items.get(TOKEN), "tok", name);
    assert.deepEqual([state.myTeams.items, state.myTeams.loaded, state.myTeams.loading], [[], false, false], name);
    assert.notEqual(state.myTeams.error, "", name);
    assert.equal(heard, 1, name);
    api.assertAnswered();
  }
  fresh();
  api.reply("GET /api/auth/me", 200, ME);
  api.fail("GET /api/teams");
  await session.loadSession();
  assert.equal(state.myTeams.error, OFFLINE, "the list's own failure, as a sentence");
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

// Task 3 carry (b): the page a coach signed out on is not where the next sign-in, maybe someone else's, should land.
test("signing out leaves no page to come back to; a session that dies keeps the one the router remembered", async () => {
  fresh();
  state.auth.currentUser = ME.user;
  setReturn("#/t/t1/roster");
  api.reply("POST /api/auth/logout", 200, { ok: true });
  await session.signOut();
  assert.equal(peekReturn(), "");
  fresh();
  state.auth.currentUser = ME.user;
  setReturn("#/t/t1/roster");
  session.sessionEnded();
  assert.equal(peekReturn(), "#/t/t1/roster");
  setReturn("");
  api.assertAnswered();
});

// Task 2 carry (a): the login answer is in, the token with it; only /me did not come.
test("a sign-in that went through while /me did not answer keeps the token and says offline", async () => {
  fresh(null);
  api.reply("POST /api/auth/login", 200, { token: "new", user: { id: "u1", login: "coach" } });
  api.fail("GET /api/auth/me");
  api.reply("GET /api/teams", 200, TEAMS);
  assert.equal(await session.signIn({ login: "coach", password: "secret" }), "offline");
  assert.equal(api.items.get(TOKEN), "new");
  assert.equal(state.auth.currentUser, null);
  assert.equal(session.sessionFailureText(), OFFLINE);
  fresh(null);
  api.reply("POST /api/auth/register", 201, { token: "fresh", user: { id: "u2", login: "rookie" } });
  api.reply("GET /api/auth/me", 200, { user: { id: "u2", login: "rookie", preferences: {} } });
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await session.register({ login: "rookie", password: "secret", telegram: "@rookie" }), "signed-in");
  api.assertAnswered();
});

// Task 2 carry (b): "no connection" sends a coach to check a network that works.
test("a session that could not be read says whose fault it was: the connection's or the server's", async () => {
  const cases = [
    ["no network", () => { api.fail("GET /api/auth/me"); api.fail("GET /api/teams"); }, OFFLINE],
    ["a timeout", () => { api.fail("GET /api/auth/me", ABORTED); api.reply("GET /api/teams", 200, TEAMS); }, "The server is taking too long to answer. Try again."],
    ["a 500", () => { api.reply("GET /api/auth/me", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } }); api.reply("GET /api/teams", 200, TEAMS); }, NO_ANSWER],
    ["a 503 that is not maintenance", () => { api.reply("GET /api/auth/me", 503, {}); api.reply("GET /api/teams", 200, TEAMS); }, NO_ANSWER],
    ["a 403", () => { api.reply("GET /api/auth/me", 403, FORBIDDEN); api.reply("GET /api/teams", 200, TEAMS); }, NO_ANSWER],
    ["a /me with no user in it", () => { api.reply("GET /api/auth/me", 200, {}); api.reply("GET /api/teams", 200, TEAMS); }, NO_ANSWER],
  ];
  for (const [name, answer, text] of cases) {
    fresh();
    answer();
    assert.equal(await session.loadSession(), "offline", name);
    assert.equal(session.sessionFailureText(), text, name);
    api.assertAnswered();
  }
});

// The server's window is 15 minutes, so the first 429 says 899 seconds: a wait that long is said in minutes.
test("a refusal reads as the server's words; too many tries say how long to wait, in minutes until the last one", () => {
  const refused = (status, body) => new ApiError(status === 429 ? API_ERROR.HTTP : API_ERROR.CONFLICT, { status, payload: body });
  const tooMany = { error: { code: "TOO_MANY_LOGIN_ATTEMPTS", params: {}, message: "x" } };
  const wait = (retryAfterSeconds) => session.refusalText(refused(429, { ...tooMany, retryAfterSeconds }));
  assert.equal(wait(899), "Too many attempts for this login. Try again in 15 min.");
  assert.equal(wait(61), "Too many attempts for this login. Try again in 2 min.");
  assert.equal(wait(60), "Too many attempts for this login. Try again in 1 min.");
  assert.equal(wait(59), "Too many attempts for this login. Try again in 59 s.");
  assert.equal(wait(0.4), "Too many attempts for this login. Try again in 1 s.");
  for (const unknown of [undefined, 0, -5, "soon"]) {
    assert.equal(wait(unknown), "Too many attempts for this login. Try again shortly.", `no number, no promise: ${unknown}`);
  }
  assert.equal(session.refusalText(refused(409, { error: { code: "LOGIN_ALREADY_REGISTERED", params: {}, message: "x" } })), "This login is already registered.");
  assert.equal(session.refusalText(new ApiError(API_ERROR.HTTP, { status: 502, payload: {} })), NO_ANSWER);
  assert.equal(session.refusalText(new ApiError(API_ERROR.OFFLINE)), OFFLINE);
});

// R12: the token is the browser's and every tab shares it. Another tab that signs out, or in as someone else,
// changes it under this page, and the browser tells this one with a `storage` event.
const otherTabs = new EventTarget();
session.followSessionAcrossTabs(otherTabs);
const { savePreferences } = await import("../src/data/preferences.mjs");
const SECOND = { user: { id: "u2", login: "second", preferences: {} } };
/** A few turns of the event loop: a session read that a storage event started has no promise to await. */
const settled = async () => { for (let turn = 0; turn < 10; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
/** Signed in as u1 with "tok", the session's listeners told. */
const signedInWithAnUnreadOrReadList = () => signedInWith("tok");
async function signedInWith(token) {
  fresh(token);
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 200, TEAMS);
  assert.equal(await session.loadSession(), "signed-in");
  api.reset();
  api.items.set(TOKEN, token);
  heard = 0;
}

test("a token another tab stored is this page's session too: it is read again with that token, and the app hears it once", async () => {
  await signedInWith("tok");
  api.items.set(TOKEN, "other");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [] });
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser?.id, "u2");
  assert.deepEqual(api.calls.map((call) => call.headers.Authorization), ["Bearer other", "Bearer other"]);
  assert.equal(heard, 1);
  api.assertAnswered();
});

test("a token another tab removed ends the session here, with nothing asked", async () => {
  await signedInWith("tok");
  api.items.delete(TOKEN);
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser, null);
  assert.equal(state.myTeams.loaded, false);
  assert.equal(api.calls.length, 0);
  assert.equal(heard, 1);
  api.assertAnswered();
});

test("a storage event that leaves the token as it was is nothing to this page", async () => {
  await signedInWith("tok");
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser.id, "u1");
  assert.deepEqual([api.calls.length, heard], [0, 0]);
  fresh(null);
  assert.equal(await session.loadSession(), "guest");
  heard = 0;
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.deepEqual([api.calls.length, heard], [0, 0], "a guest page stays a guest while no tab signs in");
  api.assertAnswered();
});

test("a guest page that another tab signed in is signed in too", async () => {
  fresh(null);
  assert.equal(await session.loadSession(), "guest");
  heard = 0;
  api.items.set(TOKEN, "other");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [] });
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser?.id, "u2");
  assert.equal(heard, 1);
  api.assertAnswered();
});

test("a read of the session that another tab overtook says nothing of its own: the newer one is heard, once", async () => {
  fresh("tok");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [] });
  const gate = api.hold("GET /api/auth/me");
  const first = session.loadSession();
  api.items.set(TOKEN, "other");
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(gate.count, 2, "both reads are on their way");
  gate.release();
  assert.equal(await first, "signed-in", "the first caller hears what the newer read found");
  await settled();
  assert.equal(heard, 1);
  assert.equal(state.auth.currentUser.id, "u2");
  api.assertAnswered();
});

test("a write to the account while another tab holds another token sends nothing, and the page follows the token", async () => {
  await signedInWith("tok");
  api.items.set(TOKEN, "other");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await savePreferences({ locale: "ru" }), null);
  await settled();
  assert.equal(api.calls.some((call) => call.key === "PATCH /api/auth/preferences"), false);
  assert.equal(state.auth.currentUser?.id, "u2", "the session was read again with the token that is there now");
  assert.equal(heard, 1);
  api.assertAnswered();
});

// Final-wave item 2: one way to take a newer copy of the coach, so no screen drops what only /me carries.
test("who is signed in is set by the session alone; a screen that has a newer copy of the coach merges it", async () => {
  const { readdirSync } = await import("node:fs");
  const root = new URL("../src/", import.meta.url);
  const files = readdirSync(root, { recursive: true }).filter((file) => file.endsWith(".mjs") || file.endsWith(".js"));
  const setters = files.filter((file) => /state\.auth\.currentUser\s*=(?!=)/.test(readFileSync(new URL(file, root), "utf8")));
  assert.deepEqual(setters.sort(), ["core/api-client.mjs", "data/session.mjs"], "the session, and the api-client's 401 hook letting go of the coach");
});

// R14 (N2): another tab signed in as someone else. Nothing the page loaded for the coach before is the new one's.
test("a coach another tab swapped in starts clean: no active team, games, season or administration of the one before", async () => {
  await signedInWithAnUnreadOrReadList();
  state.activeTeamId = "t1";
  state.games = { items: [{ id: "g1" }], currentItems: [], loaded: true, loading: false, error: "" };
  state.season = { data: { myEntry: { id: "e1" } }, loaded: true, loading: false, error: "" };
  state.admin = { users: [{ id: "u9" }], loaded: true, loading: false, error: "", editingTeams: new Map() };
  api.items.set(TOKEN, "other");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [{ id: "t5" }] });
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser?.id, "u2");
  assert.equal(state.activeTeamId, null);
  assert.deepEqual([state.games.items, state.games.loaded], [[], false]);
  assert.deepEqual([state.season.data, state.season.loaded], [null, false]);
  assert.deepEqual([state.admin.users, state.admin.loaded], [[], false]);
  assert.deepEqual(state.myTeams.items, [{ id: "t5" }], "the new coach's own list");
  api.assertAnswered();
});

test("the same coach signed in again in another tab keeps what the page has", async () => {
  await signedInWithAnUnreadOrReadList();
  state.games = { items: [{ id: "g1" }], currentItems: [], loaded: true, loading: false, error: "" };
  api.items.set(TOKEN, "renewed");
  api.reply("GET /api/auth/me", 200, ME);
  api.reply("GET /api/teams", 200, TEAMS);
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  assert.equal(state.auth.currentUser?.id, "u1");
  assert.deepEqual(state.games.items, [{ id: "g1" }]);
  api.assertAnswered();
});

test("a coach swapped while an earlier read was still on its way starts clean too", async () => {
  await signedInWithAnUnreadOrReadList();
  state.games = { items: [{ id: "g1" }], currentItems: [], loaded: true, loading: false, error: "" };
  api.items.set(TOKEN, "first-swap");
  api.reply("GET /api/auth/me", 200, SECOND);
  api.reply("GET /api/teams", 200, { teams: [] });
  const gate = api.hold("GET /api/auth/me");
  otherTabs.dispatchEvent(new Event("storage"));
  api.items.set(TOKEN, "second-swap");
  otherTabs.dispatchEvent(new Event("storage"));
  await settled();
  gate.release();
  await settled();
  assert.equal(state.auth.currentUser?.id, "u2");
  assert.deepEqual([state.games.items, state.games.loaded], [[], false]);
  api.assertAnswered();
});
