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
const { setLocale } = await import("../src/core/i18n.mjs");
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
  initTheme({ root: document.documentElement, select: null, store, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) });
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
