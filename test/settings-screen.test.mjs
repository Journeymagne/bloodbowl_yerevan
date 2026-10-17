import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/settings" };
const { renderSettings, saveTelegram, settingsMarkup, wireSettings } = await import("../src/screens/settings/index.mjs");
const { setLocaleHandler } = await import("../src/core/locale-request.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { renderSegmentedControl, wireSegmentedControls } = await import("../src/ui/segmented-control.mjs");

const COACH = { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false, createdAt: "2025-03-01T10:00:00Z", preferences: { themeMode: "dark" } };
const markup = (over = {}) => settingsMarkup({ user: COACH, teamCount: 2, locale: "en", telegram: COACH.telegram, ...over });
const SHEETS = ["src/screens/settings/settings.css", "text-field.css", "button.css", "list-row.css", "segmented-control.css"];
const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const NO_CALLBACKS = { saved: "@felstell", onSaveTelegram() {}, onLogout() {}, onOpenPassword() {} };
const refusal = (code) => ({ error: { code, params: {}, message: "x" } });

test("a coach sees who they are, since when, their contact and the ways out", () => {
  const fragment = mount(markup());
  assert.equal(fragment.querySelector(".g-settings__login").textContent, "felstell");
  assert.equal(fragment.querySelector(".g-settings__since").textContent, "Coach since 2025 · teams: 2");
  assert.equal(fragment.querySelector("#settings-telegram").getAttribute("value"), "@felstell");
  assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
  assert.equal(fragment.querySelector("[data-open-password]").getAttribute("aria-haspopup"), "dialog");
  assert.ok(fragment.querySelector("button.g-btn--danger-outline[data-logout]"));
  assert.equal(fragment.querySelector('a[href="#/administration"]'), null);
  assert.equal(fragment.querySelectorAll("h1").length, 1);
  assertCspSafe(fragment);
  assertStyled(fragment, ...SHEETS);
});

test("an admin also finds the way into administration", () => {
  assert.ok(mount(markup({ user: { ...COACH, isAdmin: true } })).querySelector('.g-settings__admin a[href="#/administration"]'));
});

test("a guest gets appearance and a way to sign in, not an account", () => {
  const fragment = mount(settingsMarkup({ user: null, teamCount: 0, locale: "en", telegram: "" }));
  assert.equal(fragment.querySelector("#settings-telegram"), null);
  assert.ok(fragment.querySelector('a[href="#/login"]'));
  assert.ok(fragment.querySelector('a[href="#/register"]'));
  assertStyled(fragment, ...SHEETS);
});

test("a login and a contact a coach typed are text, not markup", () => {
  const fragment = mount(markup({ user: { ...COACH, login: HOSTILE }, telegram: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("#settings-telegram").getAttribute("value"), HOSTILE);
});

test("Save shows only while the contact differs from the saved one", () => {
  const fragment = mount(markup());
  wireSettings(fragment, { saved: "@felstell", onSaveTelegram() {}, onLogout() {}, onOpenPassword() {} });
  const input = fragment.querySelector("#settings-telegram");
  input.value = "@another";
  fireEvent(input, "input");
  assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), false);
  input.value = "@felstell";
  fireEvent(input, "input");
  assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
});

test("saving a contact keeps the account settings the profile answer does not carry", async () => {
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { ...COACH };
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  assert.equal(await saveTelegram("another"), null);
  assert.deepEqual(api.calls.at(-1).body, { telegram: "@another" });
  assert.equal(state.auth.currentUser.telegram, "@another");
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
});

test("a contact that is not @username is refused before it is sent", async () => {
  api.reset();
  assert.match((await saveTelegram("ab")).error, /@username/);
  assert.equal(api.calls.length, 0);
});

test("the language switch asks the app, which owns the reload", () => {
  const asked = [];
  setLocaleHandler((locale) => asked.push(locale));
  const fragment = mount(markup());
  wireSettings(fragment, { saved: "@felstell", onSaveTelegram() {}, onLogout() {}, onOpenPassword() {} });
  fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
  assert.deepEqual(asked, ["ru"]);
});

test("every key the screen asks for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/settings/index.mjs");
});

// Task 11 puts the theme mode in this root too: whichever of two wirings ran second used to hear nothing.
test("the language and a second segmented control on one root each report their own change", () => {
  const MODES = [{ value: "light", label: "Light" }, { value: "dark", label: "Dark" }, { value: "system", label: "System" }];
  const mode = renderSegmentedControl({ label: "Mode", items: MODES, selected: "light", data: { segGroup: "mode" } });
  for (const languageFirst of [true, false]) {
    const asked = [];
    const modes = [];
    setLocaleHandler((locale) => asked.push(locale));
    const fragment = mount(markup() + mode);
    const wireLanguage = () => wireSettings(fragment, NO_CALLBACKS);
    const wireMode = () => wireSegmentedControls(fragment, (value) => modes.push(value), { group: "mode" });
    if (languageFirst) { wireLanguage(); wireMode(); } else { wireMode(); wireLanguage(); }
    fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="dark"]'), "click");
    fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
    assert.deepEqual([asked, modes], [["ru"], ["dark"]], languageFirst ? "language wired first" : "mode wired first");
  }
});

test("a language the app could not load is not left showing as chosen", async () => {
  setLocaleHandler(() => Promise.reject(new Error("no data")));
  const fragment = mount(markup());
  let settled = 0;
  const quiet = console.error;
  console.error = () => {};
  try {
    wireSettings(fragment, { ...NO_CALLBACKS, onLocaleSettled: () => { settled += 1; } });
    fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
    assert.equal(settled, 0, "not before the app has answered");
    await new Promise((resolve) => { setImmediate(resolve); });
  } finally {
    console.error = quiet;
  }
  assert.equal(settled, 1);
});

test("Save and Enter hand the contact over as typed, and only while it differs", () => {
  const fragment = mount(markup());
  const saved = [];
  wireSettings(fragment, { ...NO_CALLBACKS, onSaveTelegram: (value) => saved.push(value) });
  const input = fragment.querySelector("#settings-telegram");
  fireEvent(input, "keydown", { key: "Enter" });
  assert.deepEqual(saved, [], "the contact on file is not saved again");
  input.value = " another ";
  fireEvent(input, "input");
  fireEvent(fragment.querySelector("[data-telegram-save]"), "click");
  const enter = fireEvent(input, "keydown", { key: "Enter" });
  assert.deepEqual(saved, [" another ", " another "], "normalizing is saveTelegram's");
  assert.equal(enter.defaultPrevented, true);
  const other = fireEvent(input, "keydown", { key: "a" });
  assert.equal(other.defaultPrevented, false);
  assert.deepEqual(saved, [" another ", " another "]);
});

test("changing the password and signing out are the screen's callbacks", () => {
  const fragment = mount(markup());
  const done = [];
  wireSettings(fragment, { ...NO_CALLBACKS, onLogout: () => done.push("logout"), onOpenPassword: () => done.push("password") });
  fireEvent(fragment.querySelector("[data-open-password]"), "click");
  fireEvent(fragment.querySelector("[data-logout]"), "click");
  assert.deepEqual(done, ["password", "logout"]);
});

test("wireSettings gives its listeners back", () => {
  const fragment = mount(markup());
  const done = [];
  const release = wireSettings(fragment, { ...NO_CALLBACKS, onLogout: () => done.push("logout") });
  release();
  fireEvent(fragment.querySelector("[data-logout]"), "click");
  assert.deepEqual(done, []);
});

test("a contact on file in another shape is shown as it is, with nothing to save", () => {
  const fragment = mount(markup({ user: { ...COACH, telegram: "John from Minsk" }, telegram: "John from Minsk" }));
  assert.equal(fragment.querySelector("#settings-telegram").getAttribute("value"), "John from Minsk");
  assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
});

test("a new contact must be in the registration format, a bare name gets its @", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH, telegram: "John from Minsk" };
  assert.match((await saveTelegram("John from Minsk")).error, /@username/);
  assert.equal((await saveTelegram("")).error, dictionary("en")["error.TELEGRAM_REQUIRED"]);
  assert.equal(api.calls.length, 0);
});

test("the contact field says why a save was refused", () => {
  const fragment = mount(markup({ telegram: "ab", telegramError: HOSTILE }));
  const input = fragment.querySelector("#settings-telegram");
  assert.equal(input.getAttribute("aria-invalid"), "true");
  assert.match(input.getAttribute("aria-describedby"), /settings-telegram-error/);
  assert.equal(fragment.querySelector("#settings-telegram-error").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), false, "what was typed differs from what is on file");
});

test("an account the server keeps shows its login and contact as text, with nothing to change", () => {
  const fragment = mount(markup({ user: { ...COACH, isAdmin: true, managedByServer: true } }));
  assert.equal(fragment.querySelector(".g-settings__login").textContent, "felstell");
  assert.equal(fragment.querySelector("#settings-telegram"), null);
  assert.equal(fragment.querySelector("[data-telegram-save]"), null);
  assert.equal(fragment.querySelector("[data-open-password]"), null);
  assert.equal(fragment.querySelectorAll("input").length, 0);
  assert.equal(fragment.querySelector(".g-kv").textContent, "Telegram contact@felstell");
  assert.equal(fragment.querySelector(".g-settings__managed").textContent, "This account's login, Telegram and password are set in the server's settings.");
  assert.ok(fragment.querySelector("[data-logout]"), "it still signs out");
  assert.ok(fragment.querySelector('.g-settings__admin a[href="#/administration"]'), "and, being an admin, still finds administration");
  assertCspSafe(fragment);
  assertStyled(fragment, ...SHEETS);
});

test("an account the server keeps says so in Russian too", () => {
  assert.equal(dictionary("ru")["settings.managedByServer"], "Логин, Telegram и пароль этого аккаунта задаются в настройках сервера.");
});

test("an account that is its own to change has no such note", () => {
  assert.equal(mount(markup({ user: { ...COACH, managedByServer: false } })).querySelector(".g-settings__managed"), null);
});

test("a refusal for the account the server keeps is the field's text, and nothing changes", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { ...COACH, managedByServer: false };
  api.reply("PATCH /api/auth/profile", 409, refusal("ADMIN_PROFILE_FROM_ENV"));
  const failure = await saveTelegram("@another");
  assert.equal(failure.error, dictionary("en")["error.ADMIN_PROFILE_FROM_ENV"]);
  assert.equal(state.auth.currentUser.telegram, "@felstell");
  assert.match(mount(markup({ telegram: "@another", telegramError: failure.error })).querySelector("#settings-telegram-error").textContent, /set in the server's settings/);
});

test("a lost connection is the field's text too", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH };
  api.fail("PATCH /api/auth/profile");
  assert.equal((await saveTelegram("@another")).error, dictionary("en")["request.offline"]);
  assert.equal(state.auth.currentUser.telegram, "@felstell");
});

test("a saved contact leaves the account's other /me-only fields as they were", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH, managedByServer: false };
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  assert.equal(await saveTelegram("@another"), null);
  assert.equal(state.auth.currentUser.managedByServer, false);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
});

// The screen itself, on the fake page.
function draw(user = COACH, teams = 2) {
  releaseCurrentScreen();
  state.auth.currentUser = user ? { ...user } : null;
  state.myTeams = { items: Array.from({ length: teams }, (_, index) => ({ id: `t${index}` })), loaded: true, loading: false, error: "" };
  renderSettings();
}
const text = (selector) => view.querySelector(selector)?.textContent;
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

test("the screen counts the coach's teams from the list the app holds", () => {
  api.reset();
  draw(COACH, 3);
  assert.equal(text(".g-settings__since"), "Coach since 2025 · teams: 3");
  draw(null);
  assert.equal(view.querySelector("#settings-telegram"), null);
  assert.ok(view.querySelector('a[href="#/login"]'));
});

test("a refused contact stays in the field with its reason, until it is fixed", async () => {
  api.reset();
  draw();
  const input = () => view.querySelector("#settings-telegram");
  input().value = "ab";
  fireEvent(input(), "input");
  fireEvent(view.querySelector("[data-telegram-save]"), "click");
  await settle();
  assert.match(text("#settings-telegram-error"), /@username/);
  assert.equal(input().value, "ab", "what was typed is not taken away");
  assert.equal(view.querySelector("[data-telegram-save]").hasAttribute("hidden"), false);
  assert.equal(api.calls.length, 0);
});

test("a saved contact becomes the one on file, says so, and the Save button goes", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  const input = view.querySelector("#settings-telegram");
  input.value = "another";
  fireEvent(input, "input");
  const realSetTimeout = globalThis.setTimeout;
  globalThis.setTimeout = () => 0; // the toast's countdown must not outlive the test
  try {
    fireEvent(view.querySelector("[data-telegram-save]"), "click");
    await settle();
  } finally {
    globalThis.setTimeout = realSetTimeout;
  }
  assert.deepEqual(api.calls.map((call) => call.key), ["PATCH /api/auth/profile"]);
  assert.equal(view.querySelector("#settings-telegram").getAttribute("value"), "@another");
  assert.equal(view.querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
  assert.equal(view.querySelector("#settings-telegram-error"), null);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  assert.equal(document.querySelector('[role="status"]').childNodes.at(-1).textContent, "Contact saved");
});

test("a second tap on Save while the first is on its way sends nothing more", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 409, refusal("ADMIN_PROFILE_FROM_ENV"));
  draw();
  const input = view.querySelector("#settings-telegram");
  input.value = "@another";
  fireEvent(input, "input");
  fireEvent(view.querySelector("[data-telegram-save]"), "click");
  fireEvent(view.querySelector("[data-telegram-save]"), "click");
  await settle();
  assert.equal(api.calls.length, 1);
  assert.match(text("#settings-telegram-error"), /set in the server's settings/);
});

test("signing out forgets the coach and goes home", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("POST /api/auth/logout", 200, {});
  draw();
  fireEvent(view.querySelector("[data-logout]"), "click");
  await settle();
  assert.equal(state.auth.currentUser, null);
  assert.equal(api.items.has("gata-league-auth-token"), false);
  assert.equal(globalThis.location.hash, "#/");
});

test("leaving the screen takes its listeners with it", () => {
  api.reset();
  draw();
  const button = view.querySelector("[data-logout]");
  releaseCurrentScreen();
  fireEvent(button, "click");
  assert.equal(api.calls.length, 0);
});

test("a contact typed and not saved is not kept for the next visit", () => {
  api.reset();
  draw();
  const input = view.querySelector("#settings-telegram");
  input.value = "@typed";
  fireEvent(input, "input");
  draw();
  assert.equal(view.querySelector("#settings-telegram").getAttribute("value"), "@felstell");
});
