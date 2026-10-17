import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { createDocument } from "./helpers/fake-dom.mjs";

const api = installFakeApi();
const { state } = await import("../src/core/state.mjs");
const { createStorage } = await import("../src/core/storage.mjs");
const { initTheme, isThemeChosen, setThemeChoice, themeChoice } = await import("../src/core/theme.mjs");
const { savePreferences, saveTheme, syncThemeWithAccount } = await import("../src/data/preferences.mjs");
const { loadSession, onSessionChange, signOut } = await import("../src/data/session.mjs");

const PATCH = "PATCH /api/auth/preferences";
let backend = new Map();
/** The page boots from whatever the browser has stored, as it does at every load. */
function boot() {
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  const root = createDocument().documentElement;
  initTheme({ root, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  return root;
}
function browser(stored = null) {
  backend = new Map(stored ? [["gata-league-palette", JSON.stringify(stored)]] : []);
  const root = boot();
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  return root;
}
// As app.js wires it: every change of session starts a sync, which the test then waits for.
const syncs = [];
onSessionChange(() => { syncs.push(syncThemeWithAccount()); });
/** Sign in the way the app learns of it: /me and the teams, then the sync that follows. */
async function signInAs(user) {
  api.items.set("gata-league-auth-token", "tok");
  api.reply("GET /api/auth/me", 200, { user });
  api.reply("GET /api/teams", 200, { teams: [] });
  await loadSession();
  await Promise.all(syncs.splice(0));
}
async function signOutNow() {
  api.reply("POST /api/auth/logout", 200, {});
  await signOut();
  await Promise.all(syncs.splice(0));
}
const patches = () => api.calls.filter(({ key }) => key === PATCH);
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const PARCHMENT = { themeMode: "light", lightPalette: "parchment", darkPalette: "night" };
const coach = (preferences) => { state.auth.currentUser = { id: "u1", login: "coach", preferences }; };

test("an account that has a palette repaints this browser, whatever it had chosen", async () => {
  const root = browser({ mode: "dark", light: "grass", dark: "embers" });
  coach({ themeMode: "light", lightPalette: "parchment", darkPalette: "night" });
  await syncThemeWithAccount();
  assert.equal(root.getAttribute("data-palette"), "parchment");
  assert.equal(api.calls.length, 0);
  api.assertAnswered();
});

test("an account that has part of a palette takes the rest from this browser, not from the defaults", async () => {
  const root = browser({ mode: "dark", light: "ice", dark: "embers" });
  coach({ themeMode: "light" });
  await syncThemeWithAccount();
  assert.deepEqual(themeChoice(), { mode: "light", light: "ice", dark: "embers" });
  assert.equal(root.getAttribute("data-palette"), "ice");
  assert.equal(api.calls.length, 0, "the account is read, not rewritten");
  api.assertAnswered();
});

test("what the account says is the account's, not this browser's choice", async () => {
  browser(null);
  coach({ themeMode: "dark", darkPalette: "abyss" });
  assert.equal(isThemeChosen(), false);
  await syncThemeWithAccount();
  assert.equal(isThemeChosen(), false);
  assert.equal(JSON.parse(backend.get("gata-league-palette")).from, "account");
  api.assertAnswered();
});

test("a palette the account gave this browser does not go to the next coach's empty account", async () => {
  const root = browser(null);
  await signInAs({ id: "u1", login: "first", preferences: PARCHMENT });
  assert.equal(root.getAttribute("data-palette"), "parchment");
  await signOutNow();
  await signInAs({ id: "u2", login: "second", preferences: {} });
  assert.equal(patches().length, 0);
  assert.deepEqual(state.auth.currentUser.preferences, {});
  api.assertAnswered();
});

test("and neither does the cache that remembers it across a reload", async () => {
  browser(null);
  await signInAs({ id: "u1", login: "first", preferences: PARCHMENT });
  await signOutNow();
  const root = boot();
  assert.equal(root.getAttribute("data-palette"), "parchment", "the cache still paints it");
  assert.equal(isThemeChosen(), false);
  await signInAs({ id: "u2", login: "second", preferences: {} });
  assert.equal(patches().length, 0);
  api.assertAnswered();
});

test("a palette the reader picked after the account's is theirs to give", async () => {
  browser(null);
  await signInAs({ id: "u1", login: "first", preferences: PARCHMENT });
  setThemeChoice({ mode: "dark", light: "parchment", dark: "abyss" });
  await signOutNow();
  api.reply(PATCH, 200, { preferences: { themeMode: "dark", lightPalette: "parchment", darkPalette: "abyss" } });
  await signInAs({ id: "u2", login: "second", preferences: {} });
  assert.deepEqual(patches().map(({ body }) => body), [{ themeMode: "dark", lightPalette: "parchment", darkPalette: "abyss" }]);
  api.assertAnswered();
});

test("an empty account takes this browser's choice once, with all three keys", async () => {
  browser({ mode: "dark", light: "ice", dark: "abyss" });
  coach({});
  api.reply(PATCH, 200, { preferences: { themeMode: "dark", lightPalette: "ice", darkPalette: "abyss" } });
  await syncThemeWithAccount();
  assert.deepEqual(api.calls.map(({ key, body }) => [key, body]), [[PATCH, { themeMode: "dark", lightPalette: "ice", darkPalette: "abyss" }]]);
  assert.equal(state.auth.currentUser.preferences.darkPalette, "abyss");
  await syncThemeWithAccount();
  assert.equal(api.calls.length, 1, "now the account has it, so the next sync only reads");
  api.assertAnswered();
});

test("an account with other settings but no palette still takes this browser's choice", async () => {
  browser({ mode: "light", light: "parchment", dark: "night" });
  coach({ locale: "ru" });
  api.reply(PATCH, 200, { preferences: { locale: "ru", themeMode: "light", lightPalette: "parchment", darkPalette: "night" } });
  await syncThemeWithAccount();
  assert.deepEqual(api.calls.map(({ body }) => body), [{ themeMode: "light", lightPalette: "parchment", darkPalette: "night" }]);
  assert.equal(state.auth.currentUser.preferences.locale, "ru");
  api.assertAnswered();
});

test("two syncs before the first write is answered make one write", async () => {
  browser({ mode: "dark", light: "ice", dark: "abyss" });
  coach({});
  api.reply(PATCH, 200, { preferences: { themeMode: "dark", lightPalette: "ice", darkPalette: "abyss" } });
  await Promise.all([syncThemeWithAccount(), syncThemeWithAccount()]);
  assert.equal(patches().length, 1);
  assert.equal(state.auth.currentUser.preferences.darkPalette, "abyss");
  api.assertAnswered();
});

test("another coach's sync is not taken for the first one's write", async () => {
  browser({ mode: "dark", light: "ice", dark: "abyss" });
  coach({});
  api.reply(PATCH, 200, { preferences: { themeMode: "dark", lightPalette: "ice", darkPalette: "abyss" } });
  const first = syncThemeWithAccount();
  state.auth.currentUser = { id: "u2", login: "other", preferences: {} };
  await Promise.all([first, syncThemeWithAccount()]);
  assert.equal(patches().length, 2);
  assert.equal(state.auth.currentUser.preferences.darkPalette, "abyss", "the answer went to the coach it was for");
  api.assertAnswered();
});

test("a browser that never chose sends nothing: another device's palette is not overwritten", async () => {
  browser(null);
  coach({});
  await syncThemeWithAccount();
  assert.equal(api.calls.length, 0);
  assert.deepEqual(state.auth.currentUser.preferences, {});
  api.assertAnswered();
});

test("a write the server refuses or never gets is no one's problem: the sync resolves", async () => {
  const root = browser({ mode: "light", light: "ice", dark: "night" });
  coach({});
  api.reply(PATCH, 400, { error: { code: "FIELD_INVALID", params: { field: "darkPalette" }, message: "x" } });
  await syncThemeWithAccount();
  api.fail(PATCH);
  await syncThemeWithAccount();
  assert.equal(api.calls.length, 2, "it tried each time; the account stays empty");
  assert.equal(root.getAttribute("data-palette"), "ice");
  assert.deepEqual(state.auth.currentUser.preferences, {});
  api.assertAnswered();
});

test("a refused or unsent write resolves to nothing and leaves the page and the session as they are", async () => {
  const root = browser({ mode: "light", light: "ice", dark: "night" });
  coach({});
  api.reply(PATCH, 400, { error: { code: "FIELD_INVALID", params: { field: "darkPalette" }, message: "x" } });
  assert.equal(await savePreferences({ darkPalette: "neon" }), null);
  api.fail(PATCH);
  assert.equal(await savePreferences({ themeMode: "light" }), null);
  assert.equal(root.getAttribute("data-palette"), "ice");
  assert.equal(api.items.get("gata-league-auth-token"), "tok");
  api.assertAnswered();
});

test("a team that is not the coach's is refused the same way", async () => {
  browser(null);
  coach({ locale: "en" });
  api.reply(PATCH, 404, { error: { code: "TEAM_NOT_FOUND", params: {}, message: "x" } });
  assert.equal(await savePreferences({ activeTeamId: "11111111-1111-4111-8111-111111111111" }), null);
  assert.deepEqual(state.auth.currentUser.preferences, { locale: "en" });
  assert.equal(api.items.get("gata-league-auth-token"), "tok");
  api.assertAnswered();
});

test("a saved answer replaces the coach's settings in the session and comes back", async () => {
  browser(null);
  coach({ locale: "en", themeMode: "dark" });
  const saved = { locale: "ru", themeMode: "dark", lightPalette: "ice" };
  api.reply(PATCH, 200, { preferences: saved });
  assert.deepEqual(await savePreferences({ locale: "ru", lightPalette: "ice" }), saved);
  assert.deepEqual(api.calls[0].body, { locale: "ru", lightPalette: "ice" });
  assert.deepEqual(state.auth.currentUser.preferences, saved);
  api.assertAnswered();
});

test("an answer that is not settings changes nothing", async () => {
  browser(null);
  coach({ locale: "en" });
  api.reply(PATCH, 200, {});
  assert.equal(await savePreferences({ locale: "ru" }), null);
  assert.deepEqual(state.auth.currentUser.preferences, { locale: "en" });
  api.assertAnswered();
});

test("a coach who signs out while the write is on its way gets nothing put on the guest", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: { locale: "ru" } });
  const saving = savePreferences({ locale: "ru" });
  state.auth.currentUser = null;
  assert.equal(await saving, null);
  assert.equal(state.auth.currentUser, null);
  api.assertAnswered();
});

test("a different coach who signed in while the write is on its way keeps their own settings", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: { locale: "ru" } });
  const saving = savePreferences({ locale: "ru" });
  state.auth.currentUser = { id: "u2", login: "other", preferences: { locale: "en" } };
  assert.equal(await saving, null);
  assert.deepEqual(state.auth.currentUser.preferences, { locale: "en" });
  api.assertAnswered();
});

test("a guest has no account to write to", async () => {
  browser(null);
  state.auth.currentUser = null;
  assert.equal(await savePreferences({ themeMode: "dark" }), null);
  assert.equal(api.calls.length, 0);
  api.assertAnswered();
});

test("a guest's sync does nothing, whatever the browser chose", async () => {
  const root = browser({ mode: "light", light: "ice", dark: "night" });
  state.auth.currentUser = null;
  await syncThemeWithAccount();
  assert.equal(api.calls.length, 0);
  assert.equal(root.getAttribute("data-palette"), "ice");
  api.assertAnswered();
});

// saveTheme: the one way the theme gets to the account after a pick. Requests are held so the test stands in the middle of one.
const ICE = { mode: "light", light: "ice", dark: "night" };
const IMPERIAL = { mode: "light", light: "imperial", dark: "night" };
const PARCHMENT_CHOICE = { mode: "light", light: "parchment", dark: "night" };
const body = ({ mode, light, dark }) => ({ themeMode: mode, lightPalette: light, darkPalette: dark });
const OFFLINE = { error: new TypeError("Failed to fetch") };

test("quick picks go out one at a time, the last one last, and at most two requests are made", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: PARCHMENT });
  const gate = api.hold(PATCH);
  const results = [saveTheme(ICE), saveTheme(IMPERIAL), saveTheme(PARCHMENT_CHOICE)];
  await settle();
  assert.deepEqual(patches().map((call) => call.body), [body(ICE)], "the others wait for the one on its way");
  assert.equal(gate.count, 1);
  gate.release();
  assert.deepEqual(await Promise.all(results), ["superseded", "superseded", "saved"], "only the last pick reports");
  assert.deepEqual(patches().map((call) => call.body), [body(ICE), PARCHMENT], "the one in the middle was never sent");
  assert.deepEqual(state.auth.currentUser.preferences, PARCHMENT);
  api.assertAnswered();
});

test("a request that fails with a newer pick behind it is not reported, and the account ends on the last pick", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: PARCHMENT });
  const gate = api.hold(PATCH);
  const first = saveTheme(ICE);
  const last = saveTheme(PARCHMENT_CHOICE);
  await settle();
  gate.release(OFFLINE);
  assert.deepEqual([await first, await last], ["superseded", "saved"]);
  assert.deepEqual(patches().map((call) => call.body), [body(ICE), PARCHMENT]);
  assert.deepEqual(state.auth.currentUser.preferences, PARCHMENT, "what the account holds is the last pick");
  api.assertAnswered();
});

test("the word is about the final state: a last write that fails says so, once, and so does a lone failure or refusal", async () => {
  browser(null);
  coach({});
  api.fail(PATCH);
  const gate = api.hold(PATCH);
  const first = saveTheme(ICE);
  const last = saveTheme(IMPERIAL);
  await settle();
  gate.release();
  assert.deepEqual([await first, await last], ["superseded", "failed"]);
  assert.equal(await saveTheme(PARCHMENT_CHOICE), "failed");
  api.reply(PATCH, 400, { error: { code: "FIELD_INVALID", params: { field: "darkPalette" }, message: "x" } });
  assert.equal(await saveTheme(ICE), "failed", "a refusal is no different from a lost connection");
  api.reply(PATCH, 200, {});
  assert.equal(await saveTheme(IMPERIAL), "failed", "an answer that is not settings is not a save");
  api.assertAnswered();
});

test("after a failure the queue still works", async () => {
  browser(null);
  coach({});
  api.fail(PATCH);
  assert.equal(await saveTheme(ICE), "failed");
  api.reply(PATCH, 200, { preferences: PARCHMENT });
  assert.equal(await saveTheme(PARCHMENT_CHOICE), "saved");
  assert.deepEqual(state.auth.currentUser.preferences, PARCHMENT);
  api.assertAnswered();
});

test("a coach who signs out while the write is on its way: nothing for the next one, and nothing to say", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: { locale: "ru" } });
  const gate = api.hold(PATCH);
  const first = saveTheme(ICE);
  const behind = saveTheme(IMPERIAL);
  await settle();
  state.auth.currentUser = null;
  gate.release(OFFLINE);
  assert.deepEqual([await first, await behind], ["gone", "gone"]);
  assert.equal(patches().length, 1, "the one behind it was not sent for nobody");
  assert.equal(state.auth.currentUser, null);
  assert.equal(await saveTheme(PARCHMENT_CHOICE), "gone", "a guest has nothing to write to");
  assert.equal(patches().length, 1);
  api.assertAnswered();
});

test("a different coach who signs in while the write is on its way gets none of it, and writes their own pick after it", async () => {
  browser(null);
  coach({});
  api.reply(PATCH, 200, { preferences: { ...PARCHMENT, locale: "ru" } });
  const gate = api.hold(PATCH);
  const first = saveTheme(ICE);
  const behind = saveTheme(IMPERIAL);
  await settle();
  state.auth.currentUser = { id: "u2", login: "other", preferences: { locale: "en" } };
  gate.release();
  assert.deepEqual([await first, await behind], ["gone", "gone"]);
  assert.deepEqual(patches().map((call) => call.body), [body(ICE)], "only the first, which went out as the first coach");
  assert.deepEqual(state.auth.currentUser.preferences, { locale: "en" }, "the answer is not put on the coach who is here now");
  assert.equal(await saveTheme(PARCHMENT_CHOICE), "saved");
  assert.deepEqual(patches().map((call) => call.body).at(-1), PARCHMENT);
  assert.deepEqual(state.auth.currentUser.preferences, { ...PARCHMENT, locale: "ru" }, "now the second coach's own pick is theirs");
  api.assertAnswered();
});

test("a pick made while the sync's write is on its way waits for it, and is sent after it", async () => {
  browser(ICE);
  coach({});
  api.reply(PATCH, 200, { preferences: PARCHMENT });
  const gate = api.hold(PATCH);
  const sync = syncThemeWithAccount();
  setThemeChoice(IMPERIAL);
  const pick = saveTheme(IMPERIAL);
  await settle();
  assert.deepEqual(patches().map((call) => call.body), [body(ICE)], "the pick does not race the sync's write");
  gate.release();
  await sync;
  assert.equal(await pick, "saved");
  assert.deepEqual(patches().map((call) => call.body), [body(ICE), body(IMPERIAL)]);
  api.assertAnswered();
});

test("a pick that is the choice already on its way is that request, and takes what waited behind it", async () => {
  browser(ICE);
  coach({});
  api.reply(PATCH, 200, { preferences: PARCHMENT });
  const gate = api.hold(PATCH);
  const sync = syncThemeWithAccount();
  const middle = saveTheme(IMPERIAL);
  const same = saveTheme(ICE);
  await settle();
  gate.release();
  assert.equal(await middle, "superseded", "what waited is no longer the latest");
  assert.equal(await same, "saved");
  await sync;
  assert.deepEqual(patches().map((call) => call.body), [body(ICE)], "one request for the choice, none for the one that was taken back");
  api.assertAnswered();
});
