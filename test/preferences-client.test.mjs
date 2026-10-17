import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { createDocument } from "./helpers/fake-dom.mjs";

const api = installFakeApi();
const { state } = await import("../src/core/state.mjs");
const { createStorage } = await import("../src/core/storage.mjs");
const { initTheme, isThemeChosen, themeChoice } = await import("../src/core/theme.mjs");
const { savePreferences, syncThemeWithAccount } = await import("../src/data/preferences.mjs");

const PATCH = "PATCH /api/auth/preferences";
function browser(stored = null) {
  const backend = new Map(stored ? [["gata-league-palette", JSON.stringify(stored)]] : []);
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  const root = createDocument().documentElement;
  initTheme({ root, select: null, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  return root;
}
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

test("what the account says is this browser's choice afterwards", async () => {
  browser(null);
  coach({ themeMode: "dark", darkPalette: "abyss" });
  assert.equal(isThemeChosen(), false);
  await syncThemeWithAccount();
  assert.equal(isThemeChosen(), true);
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
