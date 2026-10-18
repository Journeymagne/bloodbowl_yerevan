import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { valuesOf } from "./helpers/contrast.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/settings" };
const { renderSettings, saveTelegram, settingsMarkup, wireSettings } = await import("../src/screens/settings/index.mjs");
const { setLocaleHandler } = await import("../src/core/locale-request.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { setLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { rememberSessionToken, setOnTokenMoved } = await import("../src/core/api-client.mjs");
const { view } = await import("../src/core/view.mjs");
const { themePickerMarkup, wireThemePicker } = await import("../src/screens/settings/theme-picker.mjs");

const COACH = { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false, createdAt: "2025-03-01T10:00:00Z", preferences: { themeMode: "dark" } };
const markup = (over = {}) => settingsMarkup({ user: COACH, teamCount: 2, locale: "en", telegram: COACH.telegram, ...over });
const SHEETS = ["src/screens/settings/settings.css", "text-field.css", "button.css", "list-row.css", "segmented-control.css", "src/screens/settings/theme-picker.css"];
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

// The theme mode and the language are two segmented controls under one root: whichever wiring ran second used to hear nothing.
test("the language and the theme mode on one settings root each report their own change, click and arrow key, whichever is wired first", () => {
  const choice = { mode: "light", light: "grass", dark: "night" };
  const press = (fragment, group, value, key) => fireEvent(fragment.querySelector(`[data-seg-group="${group}"] [data-seg-value="${value}"]`), "keydown", { key });
  for (const languageFirst of [true, false]) {
    const label = languageFirst ? "language wired first" : "theme picker wired first";
    const asked = [];
    const picked = [];
    setLocaleHandler((locale) => asked.push(locale));
    const fragment = mount(markup({ appearanceHtml: themePickerMarkup(choice) }));
    const wireLanguage = () => wireSettings(fragment, NO_CALLBACKS);
    const wireMode = () => wireThemePicker(fragment, { current: () => choice, onChoice: (next) => picked.push(next) });
    if (languageFirst) { wireLanguage(); wireMode(); } else { wireMode(); wireLanguage(); }
    fireEvent(fragment.querySelector('[data-seg-group="mode"] [data-seg-value="dark"]'), "click");
    fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
    assert.deepEqual([asked, picked], [["ru"], [{ ...choice, mode: "dark" }]], `${label}: a click`);
    press(fragment, "mode", "dark", "ArrowRight");
    assert.deepEqual([asked, picked.length], [["ru"], 2], `${label}: an arrow in the mode control is not the language's`);
    assert.deepEqual(picked[1], { ...choice, mode: "system" });
    press(fragment, "language", "ru", "ArrowLeft");
    assert.deepEqual([asked, picked.length], [["ru", "en"], 2], `${label}: an arrow in the language control is not the mode's`);
    fireEvent(fragment.querySelector('[data-palette-key="ice"]'), "click");
    assert.deepEqual([asked.length, picked.length], [2, 3], `${label}: a card is the picker's alone`);
  }
});

test("a language the app could not load is not left showing as chosen", async () => {
  setLocaleHandler(() => Promise.reject(new Error("no data")));
  const fragment = mount(markup());
  const settled = [];
  const quiet = console.error;
  console.error = () => {};
  try {
    wireSettings(fragment, { ...NO_CALLBACKS, onLocaleSettled: (locale) => settled.push(locale) });
    fireEvent(fragment.querySelector('[data-seg-group="language"] [data-seg-value="ru"]'), "click");
    assert.deepEqual(settled, [], "not before the app has answered");
    await new Promise((resolve) => { setImmediate(resolve); });
  } finally {
    console.error = quiet;
  }
  assert.deepEqual(settled, ["ru"], "told which language was asked for");
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

test("a new contact must be in the registration format, the one on file is not checked", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH, telegram: "John from Minsk" };
  assert.match((await saveTelegram("John from Minsk too")).error, /@username/);
  assert.equal((await saveTelegram("")).error, dictionary("en")["error.TELEGRAM_REQUIRED"]);
  assert.equal(await saveTelegram("John from Minsk"), null, "unchanged, so not checked and not sent");
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

// R13-M3: the forms that talk to the account say a server's silence the same way (refusalText).
test("a gateway's answer with no code says the server did not answer, in the page's language, not 'Request failed with 502'", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH };
  for (const locale of ["en", "ru"]) {
    setLocale(locale);
    api.reply("PATCH /api/auth/profile", 502, {});
    assert.equal((await saveTelegram("@another")).error, dictionary(locale)["request.noAnswer"], locale);
  }
  setLocale("en");
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
const LOADED = { loaded: true, loading: false, error: "" };
function setTeams(count, over = LOADED) {
  state.myTeams = { items: Array.from({ length: count }, (_, index) => ({ id: `t${index}` })), ...over };
}
/** A visit: the coach comes from another screen. */
function draw(user = COACH, teams = 2) {
  globalThis.location.hash = "#/teams";
  releaseCurrentScreen();
  globalThis.location.hash = "#/settings";
  state.auth.currentUser = user ? { ...user } : null;
  setTeams(teams);
  renderSettings();
}
/** What the router does for a language switch or a change of session: the same route, drawn again. */
function redraw() {
  releaseCurrentScreen();
  renderSettings();
}
const text = (selector) => view.querySelector(selector)?.textContent;
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const field = () => view.querySelector("#settings-telegram");
const save = () => view.querySelector("[data-telegram-save]");
const type = (value) => {
  field().value = value;
  fireEvent(field(), "input");
};
/** toast() keeps a timer that a fake page cannot end; announce() keeps a zero one, which is let run. */
async function withoutTimers(run) {
  const real = globalThis.setTimeout;
  globalThis.setTimeout = () => 0;
  try {
    return await run();
  } finally {
    globalThis.setTimeout = real;
  }
}
const nextTick = () => new Promise((resolve) => { setTimeout(resolve, 5); });
const spoken = () => document.querySelectorAll('[role="status"]').map((region) => region.textContent).join("|");

test("the screen counts the coach's teams from the list the app holds", () => {
  api.reset();
  draw(COACH, 3);
  assert.equal(text(".g-settings__since"), "Coach since 2025 · teams: 3");
  draw(null);
  assert.equal(view.querySelector("#settings-telegram"), null);
  assert.ok(view.querySelector('a[href="#/login"]'));
});

// R13-M4: as the header's and the SideNav's way in does, a guest who signs in from Settings comes back to it.
test("a guest who goes to sign in or register from Settings is brought back to Settings", async () => {
  const { peekReturn, setReturn } = await import("../src/core/return-to.mjs");
  for (const href of ["#/login", "#/register"]) {
    setReturn("");
    draw(null);
    fireEvent(view.querySelector(`.g-settings__account a[href="${href}"]`), "click");
    assert.equal(peekReturn(), "#/settings", href);
  }
  setReturn("");
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
  assert.ok(spoken().includes("Contact saved"));
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
  type("@typed");
  draw();
  assert.equal(field().getAttribute("value"), "@felstell");
  assert.equal(field().value, "@felstell");
});

test("another coach does not find what the last one typed", () => {
  api.reset();
  draw();
  type("@typed");
  draw({ ...COACH, id: "u2", login: "other", telegram: "@other" });
  assert.equal(field().value, "@other");
});

// Fix round 1. (A node is never what assert.equal compares: a failure would print the whole tree.)
const LANGUAGE = (value) => `[data-seg-group="language"] [data-seg-value="${value}"]`;
const chosenLanguage = () => view.querySelector('[data-seg-group="language"] [aria-checked="true"]').getAttribute("data-seg-value");

test("wireSettings reports what is typed, and a bare name for the contact on file is no change", () => {
  const fragment = mount(markup());
  const typed = [];
  wireSettings(fragment, { ...NO_CALLBACKS, onInput: (value) => typed.push(value) });
  const input = fragment.querySelector("#settings-telegram");
  for (const [value, hidden] of [["felstell", true], ["@another", false], ["@felstell", true], ["@felstell ", true]]) {
    input.value = value;
    fireEvent(input, "input");
    assert.equal(fragment.querySelector("[data-telegram-save]").hasAttribute("hidden"), hidden, JSON.stringify(value));
  }
  assert.deepEqual(typed, ["felstell", "@another", "@felstell", "@felstell "]);
});

test("the markup draws Save the way the field does: a bare name for the contact on file is no change", () => {
  assert.equal(mount(markup({ telegram: "felstell" })).querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
  assert.equal(mount(markup({ telegram: "@another" })).querySelector("[data-telegram-save]").hasAttribute("hidden"), false);
  assert.equal(mount(markup({ user: { ...COACH, telegram: "@felstell " }, telegram: "@felstell" })).querySelector("[data-telegram-save]").hasAttribute("hidden"), true);
});

test("a contact that is the one on file is not sent, however it is spelt", async () => {
  api.reset();
  state.auth.currentUser = { ...COACH };
  assert.equal(await saveTelegram("felstell"), null);
  assert.equal(await saveTelegram("  @felstell "), null);
  state.auth.currentUser = { ...COACH, telegram: "@felstell " };
  assert.equal(await saveTelegram("@felstell"), null, "a stray space on file is the same contact");
  state.auth.currentUser = { ...COACH, telegram: "John" };
  assert.equal(await saveTelegram("John"), null, "unchanged, so not checked either");
  assert.equal(api.calls.length, 0);
});

test("a contact on file without its @ can still be saved with one", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { ...COACH, telegram: "felstell5" };
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@felstell5", isAdmin: false } });
  assert.equal(await saveTelegram("@felstell5"), null);
  assert.deepEqual(api.calls.map((call) => call.body), [{ telegram: "@felstell5" }]);
  assert.equal(mount(markup({ user: { ...COACH, telegram: "felstell5" }, telegram: "@felstell5" })).querySelector("[data-telegram-save]").hasAttribute("hidden"), false);
});

test("a count of teams the app has not got is not drawn as none", () => {
  assert.equal(mount(markup({ teamCount: null })).querySelector(".g-settings__since").textContent, "Coach since 2025");
  assert.equal(mount(markup({ teamCount: 0 })).querySelector(".g-settings__since").textContent, "Coach since 2025 · teams: 0");
  assert.equal(dictionary("ru")["settings.coachSinceYear"], "Тренер с {year}");
});

test("the screen says nothing of teams while the list is not loaded, or could not be read", () => {
  api.reset();
  draw(COACH, 0);
  assert.equal(text(".g-settings__since"), "Coach since 2025 · teams: 0");
  setTeams(0, { loaded: false, loading: true, error: "" });
  redraw();
  assert.equal(text(".g-settings__since"), "Coach since 2025");
  setTeams(2, { loaded: true, loading: false, error: dictionary("en")["request.offline"] });
  redraw();
  assert.equal(text(".g-settings__since"), "Coach since 2025");
  setTeams(2);
  redraw();
  assert.equal(text(".g-settings__since"), "Coach since 2025 · teams: 2");
});

test("what was typed is not lost when the screen is drawn again, though the field is not the one focused", async () => {
  api.reset();
  draw();
  type("@typed");
  redraw();
  assert.equal(field().value, "@typed");
  assert.equal(save().hasAttribute("hidden"), false);
  redraw();
  assert.equal(field().value, "@typed", "and again");
});

test("what was typed survives a language request the app could not carry out, which says so", async () => {
  api.reset();
  draw();
  type("@typed");
  setLocaleHandler(() => Promise.reject(new Error("no data")));
  const quiet = console.error;
  console.error = () => {};
  try {
    await withoutTimers(async () => {
      fireEvent(view.querySelector(LANGUAGE("ru")), "click");
      assert.equal(chosenLanguage(), "ru", "the control moves first");
      await settle();
    });
  } finally {
    console.error = quiet;
  }
  assert.equal(field().value, "@typed");
  assert.equal(save().hasAttribute("hidden"), false);
  assert.equal(chosenLanguage(), "en", "the control shows the language that is true");
  assert.ok(spoken().includes(dictionary("en")["settings.languageFailed"]));
  assert.equal(dictionary("ru")["settings.languageFailed"], "Не удалось сменить язык. Проверьте соединение и попробуйте ещё раз.");
});

test("what was typed survives a language switch that worked, which the route draws once", async () => {
  api.reset();
  draw();
  type("@typed");
  let wirings = 0;
  const original = view.addEventListener;
  view.addEventListener = function counted(...args) {
    wirings += 1;
    return original.apply(this, args);
  };
  try {
    redraw();
    const oneWiring = wirings;
    assert.ok(oneWiring > 0);
    setLocaleHandler((locale) => {
      setLocale(locale);
      redraw();
    });
    wirings = 0;
    fireEvent(view.querySelector(LANGUAGE("ru")), "click");
    await settle();
    assert.equal(wirings, oneWiring, "one drawing, the route's, and not a second from the answer");
    assert.equal(text(".g-settings__heading"), "Аккаунт");
    assert.equal(chosenLanguage(), "ru");
    assert.equal(field().value, "@typed");
    assert.equal(save().hasAttribute("hidden"), false);
  } finally {
    delete view.addEventListener;
    setLocale("en");
  }
});

test("a refused contact is said aloud, since the field's error is not read to anyone who is not on it", async () => {
  api.reset();
  draw();
  type("ab");
  assert.ok(!spoken().includes("@username"));
  fireEvent(save(), "click");
  await settle();
  await nextTick();
  assert.match(spoken(), /Format: @username/);
});

test("typing again takes the refusal away, and the field is no longer invalid", async () => {
  api.reset();
  draw();
  type("ab");
  fireEvent(save(), "click");
  await settle();
  assert.equal(field().getAttribute("aria-invalid"), "true");
  assert.ok(view.querySelector("#settings-telegram-error"));
  type("abc");
  assert.ok(!view.querySelector("#settings-telegram-error"), "no error left");
  assert.equal(field().getAttribute("aria-invalid"), null);
  assert.equal(/error/.test(field().getAttribute("aria-describedby") ?? ""), false);
  assert.equal(field().value, "abc");
  assert.equal(save().hasAttribute("hidden"), false);
});

test("after a save by Enter the field holds the contact as saved, keeps focus, and Enter again sends nothing", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  await withoutTimers(async () => {
    field().focus();
    type("another");
    fireEvent(field(), "keydown", { key: "Enter" });
    await settle();
    assert.equal(field().value, "@another");
    assert.ok(document.activeElement === field(), "the field has the focus");
    assert.equal(save().hasAttribute("hidden"), true);
    fireEvent(field(), "keydown", { key: "Enter" });
    await settle();
  });
  assert.equal(api.calls.length, 1);
});

test("a save by the button gives the focus to the field, which the hidden button cannot keep", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  await withoutTimers(async () => {
    type("@another");
    save().focus();
    fireEvent(save(), "click");
    await settle();
  });
  assert.ok(document.activeElement === field(), "the field has the focus");
});

test("a save does not take the focus from where the coach has gone meanwhile", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  const password = view.querySelector("[data-open-password]");
  await withoutTimers(async () => {
    type("@another");
    save().focus();
    fireEvent(save(), "click");
    password.focus();
    await settle();
  });
  assert.ok(document.activeElement === password, "the focus stayed where the coach put it");
});

test("what the coach goes on typing while a save is on its way is not overwritten by its answer", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  await withoutTimers(async () => {
    type("@another");
    fireEvent(save(), "click");
    type("@another2");
    await settle();
  });
  assert.equal(field().value, "@another2");
  assert.equal(save().hasAttribute("hidden"), false, "it differs from the contact now on file");
});

test("a coach who left the screen is told their contact was saved all the same", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  draw();
  await withoutTimers(async () => {
    type("@another");
    fireEvent(save(), "click");
    globalThis.location.hash = "#/teams";
    releaseCurrentScreen();
    await settle();
  });
  assert.ok(spoken().includes("Contact saved"));
  assert.equal(state.auth.currentUser.telegram, "@another");
});

// Carried over from the 2.x modal's profile test (deleted with the modal, Task 9): the same save, now the screen's.
test("saving the contact keeps the account's palette, and the next sync paints it instead of writing over it", async () => {
  const { createStorage } = await import("../src/core/storage.mjs");
  const { initTheme, themeChoice } = await import("../src/core/theme.mjs");
  const { syncThemeWithAccount } = await import("../src/data/preferences.mjs");
  const account = { themeMode: "light", lightPalette: "parchment", darkPalette: "night", locale: "ru" };
  // This browser chose another palette than the account did.
  const backend = new Map([["gata-league-palette", JSON.stringify({ mode: "dark", light: "grass", dark: "embers" })]]);
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  initTheme({ root: document.documentElement, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { ...COACH, preferences: account };
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@another", isAdmin: false } });
  assert.equal(await saveTelegram("another"), null);
  assert.deepEqual(state.auth.currentUser.preferences, account);
  await syncThemeWithAccount();
  assert.deepEqual(api.calls.map(({ key }) => key), ["PATCH /api/auth/profile"], "no PATCH /api/auth/preferences went out");
  assert.deepEqual(themeChoice(), { mode: "light", light: "parchment", dark: "night" });
  api.assertAnswered();
});

// Task 10: the password sheet, on the screen. The sheet itself is test/password-sheet.test.mjs's.
const PASSWORD_SHEET = "#password-sheet";
const sheetOf = () => view.querySelector(PASSWORD_SHEET);
const modal = () => view.querySelector("dialog:modal");
const openPassword = () => view.querySelector("[data-open-password]");
const into = (selector, value) => {
  const input = view.querySelector(selector);
  input.focus();
  input.value = value;
  fireEvent(input, "input");
};
const fillPassword = (current, next, repeat = next) => {
  into("#password-current", current);
  into("#password-next", next);
  into("#password-repeat", repeat);
};
const submitPassword = () => fireEvent(view.querySelector("#password-form"), "submit");
const passwordAnswer = (status, body) => api.reply("PATCH /api/auth/profile", status, body);
const passwordCalls = () => api.calls.filter((call) => call.key === "PATCH /api/auth/profile");
function drawSignedIn(over = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  draw({ ...COACH, ...over });
}
/** The ways out of the sheet, each as the coach or the browser makes it. */
const WAYS_OUT = [
  ["the cross", () => fireEvent(view.querySelector("[data-sheet-close]"), "click")],
  ["Escape", () => fireEvent(view.querySelector("#password-current"), "keydown", { key: "Escape" })],
  ["the backdrop", () => fireEvent(sheetOf(), "click")],
  ["a close request (the Android back gesture)", () => fireEvent(sheetOf(), "cancel", { bubbles: false })],
];

test("the password row opens the sheet over the screen, modal, with the focus in its first field", () => {
  drawSignedIn();
  assert.equal(sheetOf(), null, "nothing is drawn until it is asked for");
  fireEvent(openPassword(), "click");
  assert.ok(sheetOf().matches("dialog:modal"), "opened modally, and kept so");
  assert.ok(document.activeElement === view.querySelector("#password-current"), "the first field has the focus");
  assert.ok(view.querySelector(".g-settings"), "the screen is under it");
  assert.equal(view.querySelector("#password-current").getAttribute("value"), "");
  assert.equal(view.querySelector('.g-sheet__foot button[type="submit"]').hasAttribute("disabled"), true);
  assert.equal(openPassword().getAttribute("aria-haspopup"), "dialog");
});

test("typing is kept through every redraw: the sheet stays modal, the field keeps the focus, and the button wakes when the checks pass", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  const dialog = sheetOf();
  into("#password-current", "old1");
  into("#password-next", "abcd");
  assert.ok(sheetOf() === dialog, "the same dialog, patched in place");
  assert.ok(sheetOf().matches("dialog:modal"));
  assert.equal(view.querySelectorAll(".g-check--ok").length, 2, "the length is enough and it differs; the repeat is not typed");
  into("#password-repeat", "abcd");
  assert.equal(view.querySelectorAll(".g-check--ok").length, 3);
  assert.equal(view.querySelector('.g-sheet__foot button[type="submit"]').hasAttribute("disabled"), false);
  assert.ok(document.activeElement === view.querySelector("#password-repeat"), "the field typed in is the one with the focus");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["old1", "abcd", "abcd"]);
  assert.equal(view.querySelector(".g-meter__label").textContent, "Fair", "the meter reads the new password");
});

test("the sheet's form carries the coach's login for a password manager", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  assert.equal(view.querySelector('#password-form input[autocomplete="username"]').getAttribute("value"), "felstell");
});

test("Show passwords draws the three fields as text, and pressing it again hides them", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  const types = () => ["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).getAttribute("type"));
  const toggle = () => view.querySelector("[data-password-show]");
  assert.deepEqual(types(), ["password", "password", "password"]);
  fireEvent(toggle(), "click");
  assert.deepEqual(types(), ["text", "text", "text"]);
  assert.equal(toggle().getAttribute("aria-pressed"), "true");
  assert.ok(sheetOf().matches("dialog:modal"));
  assert.equal(view.querySelector("#password-next").value, "abcd", "what was typed is kept");
  fireEvent(toggle(), "click");
  assert.deepEqual(types(), ["password", "password", "password"]);
  assert.equal(toggle().getAttribute("aria-pressed"), "false");
});

test("a changed password says so, ends the form, and the focus goes to Done; the account's settings and the session stay", async () => {
  drawSignedIn();
  passwordAnswer(200, { user: { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false } });
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  submitPassword();
  assert.equal(view.querySelector("#password-form").getAttribute("aria-busy"), "true", "busy while it is on its way");
  await settle();
  await nextTick();
  assert.deepEqual(passwordCalls().map((call) => call.body), [{ password: "abcd", currentPassword: "old1" }]);
  assert.equal(view.querySelector("#password-form"), null);
  assert.match(text(`${PASSWORD_SHEET} .g-sheet__body`), /Password changed.*sign in again on your other devices/);
  assert.ok(document.activeElement === view.querySelector("[data-password-done]"), "the button that closes it has the focus");
  assert.ok(sheetOf().matches("dialog:modal"), "still the same open sheet");
  assert.equal(view.querySelectorAll("input[type=\"password\"], #password-current, #password-next, #password-repeat").length, 0, "no password is left on the page");
  assert.ok(spoken().includes("Password changed. You'll need to sign in again on your other devices."), "both sentences are said aloud, since the focus moved to a button");
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  assert.equal(api.items.get("gata-league-auth-token"), "tok", "this session goes on");
});

test("Done closes the sheet and the focus goes back to the row that opened it", async () => {
  drawSignedIn();
  passwordAnswer(200, { user: { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false } });
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  submitPassword();
  await settle();
  fireEvent(view.querySelector("[data-password-done]"), "click");
  assert.equal(sheetOf(), null);
  assert.equal(modal(), null);
  assert.ok(document.activeElement === openPassword(), "the focus is on «Change password» again");
  fireEvent(openPassword(), "click");
  assert.equal(view.querySelector("#password-current").value, "", "a second visit does not find the passwords");
  assert.equal(view.querySelector("#password-next").value, "");
  assert.equal(view.querySelector("#password-repeat").value, "");
  assert.equal(sheetOf().querySelector("[data-password-done]"), null, "and finds the form, not the news");
});

for (const [way, close] of WAYS_OUT) {
  test(`${way} closes the sheet, forgets the passwords, and the focus goes back to the row that opened it`, () => {
    drawSignedIn();
    fireEvent(openPassword(), "click");
    fillPassword("old1", "abcd");
    fireEvent(view.querySelector("[data-password-show]"), "click");
    close();
    assert.equal(sheetOf(), null, "taken off the page after the redraw");
    assert.equal(modal(), null);
    assert.ok(document.activeElement === openPassword(), "the focus is on «Change password» again");
    assert.equal(passwordCalls().length, 0, "nothing was sent");
    fireEvent(openPassword(), "click");
    assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["", "", ""]);
    assert.equal(view.querySelector("#password-current").getAttribute("type"), "password", "and the passwords are hidden again");
    assert.equal(view.querySelector("[data-password-show]").getAttribute("aria-pressed"), "false");
  });
}

test("a wrong current password is said on that field, the focus goes there, and what was typed stays for another try", async () => {
  drawSignedIn();
  passwordAnswer(403, refusal("CURRENT_PASSWORD_WRONG"));
  fireEvent(openPassword(), "click");
  fillPassword("wrong", "abcd");
  submitPassword();
  await settle();
  assert.equal(text("#password-current-error"), "The current password is wrong.");
  assert.equal(view.querySelector("#password-current").getAttribute("aria-invalid"), "true");
  assert.ok(document.activeElement === view.querySelector("#password-current"), "the coach is put in the field, where the reason is read as its description");
  assert.match(view.querySelector("#password-current").getAttribute("aria-describedby"), /password-current-error/);
  assert.equal(view.querySelector('[role="alert"]').textContent, "", "said once");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["wrong", "abcd", "abcd"]);
  assert.equal(view.querySelector("#password-form").hasAttribute("aria-busy"), false);
  assert.ok(sheetOf().matches("dialog:modal"));
  assert.equal(api.items.get("gata-league-auth-token"), "tok");
  assert.equal(state.auth.currentUser.id, "u1");
  into("#password-current", "wrong2");
  assert.equal(view.querySelector("#password-current-error"), null, "typing takes the refusal away");
  assert.equal(view.querySelector("#password-current").getAttribute("aria-invalid"), null);
});

test("too many tries and the administrator whose password the server keeps are the alert's text, with no field to blame", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  passwordAnswer(429, { ...refusal("TOO_MANY_LOGIN_ATTEMPTS"), retryAfterSeconds: 600 });
  submitPassword();
  await settle();
  assert.equal(text('[role="alert"] .g-callout--danger .g-callout__title'), "Too many attempts for this login. Try again in 10 min.");
  assert.equal(view.querySelector("#password-current").getAttribute("aria-invalid"), null);
  assert.equal(view.querySelector("#password-form").hasAttribute("aria-busy"), false);
  assert.equal(view.querySelector("#password-next").value, "abcd", "what was typed stays for another try");
  // K5: the .env administrator's password is the server's: its refusal is the sheet's alert.
  passwordAnswer(409, refusal("ADMIN_PASSWORD_FROM_ENV"));
  submitPassword();
  await settle();
  assert.equal(text('[role="alert"] .g-callout--danger .g-callout__title'), dictionary("en")["error.ADMIN_PASSWORD_FROM_ENV"]);
  assert.equal(view.querySelector("#password-current-error"), null);
  into("#password-next", "abcde");
  assert.equal(view.querySelector('[role="alert"]').textContent, "", "typing takes the refusal away");
  assert.equal(passwordCalls().length, 2);
});

test("a lost connection leaves the sheet as it was, with the reason in the alert", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  api.fail("PATCH /api/auth/profile");
  submitPassword();
  await settle();
  assert.equal(text('[role="alert"] .g-callout__title'), dictionary("en")["request.offline"]);
  assert.equal(view.querySelector("#password-next").value, "abcd");
  assert.equal(view.querySelector("#password-form").hasAttribute("aria-busy"), false);
});

test("a second press while the first is on its way sends nothing more, and a form that is not ready sends nothing", async () => {
  drawSignedIn();
  passwordAnswer(403, refusal("CURRENT_PASSWORD_WRONG"));
  fireEvent(openPassword(), "click");
  fillPassword("", "abcd");
  submitPassword();
  await settle();
  assert.equal(passwordCalls().length, 0, "no current password");
  fillPassword("old1", "abc", "abc");
  submitPassword();
  await settle();
  assert.equal(passwordCalls().length, 0, "too short");
  fillPassword("old1", "abcd");
  submitPassword();
  submitPassword();
  await settle();
  assert.equal(passwordCalls().length, 1);
});

test("an account the server keeps is never offered the sheet, even when the opener is reached", () => {
  drawSignedIn();
  const row = openPassword();
  row.focus();
  // /me answered, late, that the account is the server's: the row is still on the page until the next draw.
  state.auth.currentUser = { ...state.auth.currentUser, managedByServer: true };
  fireEvent(row, "click");
  assert.equal(sheetOf(), null, "no sheet is drawn");
  assert.equal(modal(), null);
  assert.ok(document.activeElement === row, "and the focus has not gone anywhere");
  drawSignedIn({ managedByServer: true });
  assert.equal(openPassword(), null, "and the row is not drawn for it");
  assert.equal(sheetOf(), null);
});

test("an account that becomes the server's while the sheet is open loses the sheet and its passwords", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  state.auth.currentUser = { ...state.auth.currentUser, managedByServer: true };
  redraw();
  assert.equal(sheetOf(), null);
  assert.equal(modal(), null);
  state.auth.currentUser = { ...state.auth.currentUser, managedByServer: false };
  redraw();
  fireEvent(openPassword(), "click");
  assert.equal(view.querySelector("#password-current").value, "");
  assert.equal(view.querySelector("#password-next").value, "");
});

test("a session that ends under the sheet takes it away, and the next coach finds no passwords", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  state.auth.currentUser = null;
  redraw();
  assert.equal(sheetOf(), null);
  assert.equal(modal(), null);
  assert.equal(view.querySelector("[data-open-password]"), null);
  state.auth.currentUser = { ...COACH };
  redraw();
  fireEvent(openPassword(), "click");
  assert.equal(view.querySelector("#password-next").value, "");
  // Another coach straight away, with no guest between them: the sheet is not theirs.
  fillPassword("old1", "abcd");
  state.auth.currentUser = { ...COACH, id: "u2", login: "other", telegram: "@other" };
  redraw();
  assert.equal(sheetOf(), null);
  assert.equal(modal(), null);
});

test("the same screen drawn again (a language switch, a change of session) keeps the sheet and what was typed in it", () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd", "abc");
  redraw();
  assert.ok(sheetOf().matches("dialog:modal"), "still open, and modal");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["old1", "abcd", "abc"]);
  assert.ok(document.activeElement === view.querySelector("#password-repeat"));
  redraw();
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["old1", "abcd", "abc"], "and again");
});

test("leaving the screen with the sheet open forgets the passwords, and takes the sheet's listeners with it", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  const form = view.querySelector("#password-form");
  globalThis.location.hash = "#/teams";
  releaseCurrentScreen();
  submitPassword();
  fireEvent(form, "submit");
  await settle();
  assert.equal(passwordCalls().length, 0, "nothing hears the form any more");
  draw();
  assert.equal(sheetOf(), null, "the sheet is not there when the coach comes back");
  assert.equal(modal(), null);
  fireEvent(openPassword(), "click");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => view.querySelector(id).value), ["", "", ""]);
});

test("an answer that comes after the coach closed the sheet is said in a toast, and draws no sheet again", async () => {
  drawSignedIn();
  passwordAnswer(200, { user: { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false } });
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  await withoutTimers(async () => {
    submitPassword();
    WAYS_OUT[1][1]();
    await settle();
  });
  assert.equal(sheetOf(), null, "the answer does not open it again");
  assert.ok(spoken().includes("Password changed"));
  assert.ok(document.activeElement === openPassword());
  // And a refusal that comes after the coach has gone to another screen.
  passwordAnswer(403, refusal("CURRENT_PASSWORD_WRONG"));
  fireEvent(openPassword(), "click");
  fillPassword("wrong", "abcd");
  await withoutTimers(async () => {
    submitPassword();
    globalThis.location.hash = "#/teams";
    releaseCurrentScreen();
    await settle();
  });
  assert.ok(spoken().includes("The current password is wrong."));
});

test("a try on its way shows it: the button says so, keeps the focus and is no second press, and is itself again after a refusal", async () => {
  drawSignedIn();
  passwordAnswer(403, refusal("CURRENT_PASSWORD_WRONG"));
  fireEvent(openPassword(), "click");
  fillPassword("wrong", "abcd");
  const button = () => view.querySelector('.g-sheet__foot button[type="submit"]');
  assert.equal(button().textContent, "Change password");
  button().focus();
  submitPassword();
  assert.equal(button().textContent, "Saving…");
  assert.equal(button().hasAttribute("disabled"), false);
  assert.ok(document.activeElement === button(), "the focus stays on the button that was pressed");
  assert.equal(view.querySelector("#password-form").getAttribute("aria-busy"), "true");
  submitPassword();
  await settle();
  assert.equal(passwordCalls().length, 1, "the second press was not a second request");
  assert.equal(button().textContent, "Change password");
  assert.equal(view.querySelector("#password-form").hasAttribute("aria-busy"), false);
});

test("a lost answer says in the alert that the change may have gone through, and the sheet stays for another look", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  api.fail("PATCH /api/auth/profile");
  submitPassword();
  await settle();
  assert.equal(text('[role="alert"] .g-callout__title'), dictionary("en")["request.offline"]);
  assert.ok(dictionary("en")["password.maybeChanged"], "the sentence exists");
  assert.equal(text('[role="alert"] .g-callout__sub'), dictionary("en")["password.maybeChanged"]);
  assert.equal(view.querySelector("#password-next").value, "abcd");
  into("#password-next", "abcde");
  assert.equal(view.querySelector('[role="alert"]').textContent, "", "typing takes it away with the rest");
});

test("a lost answer that comes after the sheet was closed says the same in its toast", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  api.fail("PATCH /api/auth/profile");
  await withoutTimers(async () => {
    submitPassword();
    WAYS_OUT[0][1]();
    await settle();
  });
  assert.ok(spoken().includes(`${dictionary("en")["request.offline"]} ${dictionary("en")["password.maybeChanged"]}`));
});

test("the sheet's own screen texts are in both dictionaries and in Russian", () => {
  drawSignedIn();
  setLocale("ru");
  try {
    redraw();
    fireEvent(openPassword(), "click");
    assert.equal(text("#password-sheet-title"), "Смена пароля");
    assert.equal(view.querySelector("[data-password-show]").textContent, "Показать пароль");
  } finally {
    setLocale("en");
  }
});

// Task 11: the theme picker on the screen. The picker itself is test/theme-picker.test.mjs's.
const THEME_PATCH = "PATCH /api/auth/preferences";
/** What the toasts say, which a fake page never takes down, so each test that listens starts from none. */
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const clearToasts = () => { for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node); };
const NOT_SAVED = dictionary("en")["settings.themeNotSaved"];
const card = (key) => view.querySelector(`[data-palette-key="${key}"]`);
const modeItem = (value) => view.querySelector(`[data-seg-group="mode"] [data-seg-value="${value}"]`);
const checkedCards = () => view.querySelectorAll(".g-palettes").map((row) => row.querySelector('[aria-checked="true"]').getAttribute("data-palette-key"));
const themeCalls = () => api.calls.filter((call) => call.key === THEME_PATCH);

/** The reader's browser: a cache (the Map) holding `stored`, painted onto the page's <html>. */
async function startTheme(stored = null) {
  const { createStorage } = await import("../src/core/storage.mjs");
  const { initTheme } = await import("../src/core/theme.mjs");
  const backend = new Map(stored ? [["gata-league-palette", JSON.stringify(stored)]] : []);
  const store = createStorage({ getItem: (key) => backend.get(key) ?? null, setItem: (key, value) => backend.set(key, String(value)), removeItem: (key) => backend.delete(key) });
  initTheme({ root: document.documentElement, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
  return { backend, cached: () => JSON.parse(backend.get("gata-league-palette") ?? "null") };
}
const LIGHT_GRASS = { mode: "light", light: "grass", dark: "night" };

test("the appearance holds the theme picker, then the language, drawn from the choice on the page", async () => {
  await startTheme({ mode: "dark", light: "ice", dark: "abyss" });
  drawSignedIn();
  const appearance = view.querySelector(".g-settings__appearance");
  assert.deepEqual(appearance.querySelectorAll(".g-seg").map((control) => control.getAttribute("data-seg-group")), ["mode", "language"]);
  assert.equal(appearance.querySelector('[data-seg-group="mode"] [aria-checked="true"]').getAttribute("data-seg-value"), "dark");
  assert.deepEqual(view.querySelectorAll(".g-palettes").map((row) => row.getAttribute("data-palette-mode")), ["dark"]);
  assert.deepEqual(checkedCards(), ["abyss"]);
  const guest = mount(markup({ appearanceHtml: themePickerMarkup(LIGHT_GRASS) }));
  assertCspSafe(guest);
  assertStyled(guest, ...SHEETS);
});

test("a guest sees the picker too", async () => {
  await startTheme(LIGHT_GRASS);
  api.reset();
  draw(null);
  assert.ok(modeItem("light"));
  assert.deepEqual(checkedCards(), ["grass"]);
});

test("a signed-in pick paints at once, is cached, and goes to the account as one request with all three keys", async () => {
  const browser = await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  const saved = { themeMode: "light", lightPalette: "parchment", darkPalette: "night" };
  api.reply(THEME_PATCH, 200, { preferences: saved });
  fireEvent(card("parchment"), "click");
  assert.equal(document.documentElement.getAttribute("data-palette"), "parchment", "painted before the account has answered");
  assert.deepEqual(browser.cached(), { mode: "light", light: "parchment", dark: "night" });
  assert.deepEqual(checkedCards(), ["parchment"], "the screen shows it too");
  await settle();
  assert.deepEqual(themeCalls().map((call) => call.body), [saved]);
  assert.equal(api.calls.length, 1);
  assert.deepEqual(state.auth.currentUser.preferences, saved);
  api.assertAnswered();
});

test("every kind of pick is one request that names the whole choice", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  api.reply(THEME_PATCH, 200, { preferences: {} });
  fireEvent(modeItem("system"), "click");
  await settle();
  fireEvent(view.querySelector('[data-palette-mode="dark"] [data-palette-key="dungeon"]'), "click");
  await settle();
  fireEvent(modeItem("dark"), "click");
  await settle();
  assert.deepEqual(themeCalls().map((call) => call.body), [
    { themeMode: "system", lightPalette: "grass", darkPalette: "night" },
    { themeMode: "system", lightPalette: "grass", darkPalette: "dungeon" },
    { themeMode: "dark", lightPalette: "grass", darkPalette: "dungeon" },
  ]);
  api.assertAnswered();
});

test("a guest's pick paints and is cached, and nothing is sent", async () => {
  const browser = await startTheme(LIGHT_GRASS);
  api.reset();
  draw(null);
  clearToasts();
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    await settle();
  });
  assert.deepEqual(toasts(), [], "a guest has no account to fail to save to");
  assert.equal(document.documentElement.getAttribute("data-palette"), "ice");
  assert.deepEqual(browser.cached(), { mode: "light", light: "ice", dark: "night" });
  assert.equal(api.calls.length, 0);
  const { isThemeChosen } = await import("../src/core/theme.mjs");
  assert.equal(isThemeChosen(), true, "it is this browser's own choice, for the account that signs in next");
  api.assertAnswered();
});

test("the account's own choice, applied here, sends nothing; the next pick sends one", async () => {
  const browser = await startTheme();
  const { syncThemeWithAccount } = await import("../src/data/preferences.mjs");
  const account = { themeMode: "light", lightPalette: "ice", darkPalette: "night" };
  drawSignedIn({ preferences: account });
  await syncThemeWithAccount();
  redraw();
  assert.equal(document.documentElement.getAttribute("data-palette"), "ice");
  assert.deepEqual(checkedCards(), ["ice"], "the screen shows what the account holds");
  assert.deepEqual(browser.cached(), { mode: "light", light: "ice", dark: "night", from: "account" });
  assert.equal(api.calls.length, 0, "reading the account is not writing to it");
  api.reply(THEME_PATCH, 200, { preferences: { ...account, lightPalette: "imperial" } });
  fireEvent(card("imperial"), "click");
  await settle();
  assert.deepEqual(themeCalls().map((call) => call.body), [{ ...account, lightPalette: "imperial" }]);
  assert.deepEqual(browser.cached(), { mode: "light", light: "imperial", dark: "night" }, "the pick is this browser's own now");
  api.assertAnswered();
});

test("a pick the account did not take stays on this device, and says so", async () => {
  const browser = await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  api.fail(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("imperial"), "click");
    await settle();
  });
  assert.deepEqual(toasts(), [NOT_SAVED]);
  assert.equal(document.documentElement.getAttribute("data-palette"), "imperial");
  assert.deepEqual(browser.cached(), { mode: "light", light: "imperial", dark: "night" });
  assert.deepEqual(state.auth.currentUser.preferences, {}, "what the account holds is what it said");
  assert.deepEqual(checkedCards(), ["imperial"]);
});

test("a pick the account refused says so too, and a pick it took says nothing of the kind", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  api.reply(THEME_PATCH, 400, { error: { code: "INVALID_PREFERENCES", params: {}, message: "x" } });
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    await settle();
  });
  assert.deepEqual(toasts(), [NOT_SAVED]);
  clearToasts();
  api.reply(THEME_PATCH, 200, { preferences: { themeMode: "light", lightPalette: "grass", darkPalette: "night" } });
  await withoutTimers(async () => {
    fireEvent(card("grass"), "click");
    await settle();
  });
  assert.deepEqual(toasts(), [], "no toast");
});

const OFFLINE = { error: new TypeError("Failed to fetch") };
const LIGHT = (light) => ({ themeMode: "light", lightPalette: light, darkPalette: "night" });

test("quick picks go out one at a time, the last one last, and an account that took them is not apologised to", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  api.reply(THEME_PATCH, 200, { preferences: LIGHT("parchment") });
  const gate = api.hold(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    fireEvent(card("imperial"), "click");
    fireEvent(card("parchment"), "click");
    await settle();
    assert.deepEqual(themeCalls().map((call) => call.body), [LIGHT("ice")], "one request on its way, the rest behind it");
    gate.release();
    await settle();
  });
  assert.deepEqual(themeCalls().map((call) => call.body), [LIGHT("ice"), LIGHT("parchment")], "two requests for three picks, the last pick last");
  assert.deepEqual(toasts(), []);
  assert.deepEqual(state.auth.currentUser.preferences, LIGHT("parchment"));
  assert.equal(document.documentElement.getAttribute("data-palette"), "parchment", "the page followed every pick at once");
  api.assertAnswered();
});

test("a request that failed with a newer pick behind it is not said; the account ends on the last pick", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  api.reply(THEME_PATCH, 200, { preferences: LIGHT("imperial") });
  const gate = api.hold(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    fireEvent(card("imperial"), "click");
    await settle();
    gate.release(OFFLINE);
    await settle();
  });
  assert.deepEqual(toasts(), [], "the failure was about a pick the account no longer needs");
  assert.deepEqual(themeCalls().map((call) => call.body), [LIGHT("ice"), LIGHT("imperial")]);
  assert.deepEqual(state.auth.currentUser.preferences, LIGHT("imperial"));
  api.assertAnswered();
});

test("the toast is about the final state: the last pick failing is said, though the one before it was saved", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  api.fail(THEME_PATCH);
  const gate = api.hold(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    fireEvent(card("imperial"), "click");
    await settle();
    gate.release({ status: 200, body: { preferences: LIGHT("ice") } });
    await settle();
  });
  assert.deepEqual(toasts(), [NOT_SAVED], "the account holds ice, the page wears imperial, and that is what is said");
  assert.deepEqual(state.auth.currentUser.preferences, LIGHT("ice"));
});

test("a coach who signs out while a pick is on its way: nothing is said, and nothing is written for the next one", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  clearToasts();
  const gate = api.hold(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("ice"), "click");
    fireEvent(card("imperial"), "click");
    await settle();
    state.auth.currentUser = null;
    gate.release(OFFLINE);
    await settle();
  });
  assert.deepEqual(toasts(), [], "the next person is not told about the last coach's pick");
  assert.deepEqual(themeCalls().map((call) => call.body), [LIGHT("ice")], "the pick behind it was not sent for nobody");
  // Someone else signs in on this screen's page and the first coach's request is answered late.
  drawSignedIn({ preferences: {} });
  const second = api.hold(THEME_PATCH);
  await withoutTimers(async () => {
    fireEvent(card("parchment"), "click");
    await settle();
    state.auth.currentUser = { id: "u2", login: "other", preferences: { themeMode: "dark" } };
    second.release(OFFLINE);
    await settle();
  });
  assert.deepEqual(toasts(), [], "nor is the next coach told about the one before");
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" }, "and what they hold is theirs");
});

test("a pick keeps the focus where it is: the card is patched, not drawn again", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  api.reply(THEME_PATCH, 200, { preferences: {} });
  const ice = card("ice");
  ice.focus();
  fireEvent(ice, "click");
  assert.ok(card("ice") === ice, "the same element");
  assert.ok(document.activeElement === ice, "the focus stays");
  assert.equal(ice.getAttribute("aria-checked"), "true");
  assert.equal(card("grass").getAttribute("aria-checked"), "false");
  // The keyboard: the arrow moves the focus to the next card, and the redraw leaves it there.
  fireEvent(ice, "keydown", { key: "ArrowRight" });
  const imperial = card("imperial");
  assert.ok(document.activeElement === imperial);
  assert.equal(imperial.getAttribute("aria-checked"), "true");
  assert.deepEqual(checkedCards(), ["imperial"]);
  // And the mode control keeps its own focus through a redraw that adds a row.
  const light = modeItem("light");
  light.focus();
  fireEvent(light, "keydown", { key: "ArrowRight" });
  fireEvent(modeItem("dark"), "keydown", { key: "ArrowRight" });
  assert.ok(document.activeElement === modeItem("system"));
  assert.deepEqual(view.querySelectorAll(".g-palettes").map((row) => row.getAttribute("data-palette-mode")), ["light", "dark"]);
  await settle();
});

test("system shows two rows and a fixed mode one; the hint follows the mode", async () => {
  await startTheme({ mode: "system", light: "ice", dark: "abyss" });
  drawSignedIn({ preferences: {} });
  api.reply(THEME_PATCH, 200, { preferences: {} });
  assert.deepEqual(checkedCards(), ["ice", "abyss"]);
  assert.equal(text(".g-theme__hint"), dictionary("en")["settings.modeHint.system"]);
  fireEvent(modeItem("dark"), "click");
  assert.deepEqual(view.querySelectorAll(".g-palettes").map((row) => row.getAttribute("data-palette-mode")), ["dark"]);
  assert.deepEqual(checkedCards(), ["abyss"]);
  assert.equal(text(".g-theme__hint"), dictionary("en")["settings.modeHint.dark"]);
  await settle();
});

test("the screen drawn again does not wire the picker twice, and leaving it takes the picker's listeners", async () => {
  await startTheme(LIGHT_GRASS);
  drawSignedIn({ preferences: {} });
  api.reply(THEME_PATCH, 200, { preferences: {} });
  redraw();
  redraw();
  redraw();
  fireEvent(card("parchment"), "click");
  await settle();
  assert.equal(themeCalls().length, 1, "one pick, one request");
  const { themeChoice } = await import("../src/core/theme.mjs");
  globalThis.location.hash = "#/teams";
  releaseCurrentScreen();
  fireEvent(card("ice"), "click");
  fireEvent(modeItem("dark"), "click");
  await settle();
  assert.equal(themeCalls().length, 1);
  assert.deepEqual(themeChoice(), { mode: "light", light: "parchment", dark: "night" }, "a screen that is gone picks nothing");
});

test("the picker is drawn in Russian too", async () => {
  await startTheme({ mode: "system", light: "grass", dark: "night" });
  drawSignedIn({ preferences: {} });
  setLocale("ru");
  try {
    redraw();
    assert.deepEqual(view.querySelectorAll('[data-seg-group="mode"] [data-seg-value]').map((item) => item.textContent), ["Светлая", "Тёмная", "Как в системе"]);
    assert.deepEqual(view.querySelectorAll(".g-palettes").map((row) => row.getAttribute("aria-label")), ["Палитра для светлого режима", "Палитра для тёмного режима"]);
    assert.equal(card("embers").querySelector(".g-palette__name").textContent, "Пламя Хаоса");
    assert.equal(card("embers").querySelector(".g-palette__mood").textContent, "уголь и огонь");
  } finally {
    setLocale("en");
  }
});

test("from 901px the appearance and the account share a row only where both fit, as in DeskCoach.html", () => {
  // Two equal columns left 1024px a segment and a palette name squeezed onto two lines: the appearance
  // grows twice as fast as the account, and below their two bases the account takes a row of its own.
  const SETTINGS_CSS = "src/screens/settings/settings.css";
  assert.deepEqual(valuesOf(SETTINGS_CSS, ".g-settings", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(SETTINGS_CSS, ".g-settings", "grid-template-columns"), []);
  assert.deepEqual(valuesOf(SETTINGS_CSS, ".g-settings__appearance", "flex"), ["2 1 520px"]);
  assert.deepEqual(valuesOf(SETTINGS_CSS, ".g-settings__account", "flex"), ["1 1 340px"]);
  // The account comes first in the markup, for a phone; on a wide screen the appearance is at the left.
  assert.deepEqual([valuesOf(SETTINGS_CSS, ".g-settings__appearance", "order"), valuesOf(SETTINGS_CSS, ".g-settings__account", "order")], [["1"], ["2"]]);
});

// R12: another tab stored another token; this page still shows the coach it read with the one before.
/** Empty the live regions, so what a test hears is what it caused. */
const hush = () => document.querySelectorAll('[role="status"]').forEach((region) => { region.textContent = ""; });
test("a contact is not saved while another tab holds another token: it would go to that tab's account", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "other-tab");
  rememberSessionToken("tok");
  state.auth.currentUser = { ...COACH };
  try {
    assert.deepEqual(await saveTelegram("@another"), { error: dictionary("en")["auth.otherTab"] });
    assert.equal(api.calls.length, 0);
    assert.equal(state.auth.currentUser.telegram, "@felstell");
  } finally {
    rememberSessionToken("");
  }
});

test("the screen says so in a toast, since the session it was drawn for is being read again", async () => {
  api.reset();
  api.items.set("gata-league-auth-token", "other-tab");
  draw();
  rememberSessionToken("tok");
  // What the session does when it hears of it: no coach until the new token has been read.
  setOnTokenMoved(() => { state.auth.currentUser = null; });
  hush();
  try {
    await withoutTimers(async () => {
      type("@another");
      fireEvent(save(), "click");
      await settle();
    });
  } finally {
    setOnTokenMoved(() => {});
    rememberSessionToken("");
  }
  assert.equal(api.calls.length, 0);
  assert.ok(spoken().includes(dictionary("en")["auth.otherTab"]));
  assert.equal(view.querySelector("#settings-telegram-error"), null, "nor is it said on a field of a coach who is not here");
});

test("a password change found the token moved: nothing is sent, the toast says why, and no password is kept for the coach who comes back", async () => {
  drawSignedIn();
  fireEvent(openPassword(), "click");
  fillPassword("old1", "abcd");
  api.items.set("gata-league-auth-token", "other-tab");
  rememberSessionToken("tok");
  setOnTokenMoved(() => { state.auth.currentUser = null; });
  hush();
  try {
    await withoutTimers(async () => {
      submitPassword();
      await settle();
    });
  } finally {
    setOnTokenMoved(() => {});
    rememberSessionToken("");
  }
  assert.equal(passwordCalls().length, 0);
  assert.ok(spoken().includes(dictionary("en")["auth.otherTab"]));
  // The session read again finds the same coach (the other tab signed in as them): the sheet is not back, half sent.
  state.auth.currentUser = { ...COACH };
  redraw();
  assert.equal(sheetOf(), null);
});
