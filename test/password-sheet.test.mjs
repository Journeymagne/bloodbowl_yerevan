import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
const { changePassword, passwordReady, passwordSheetMarkup, wirePasswordSheet } = await import("../src/screens/settings/password-sheet.mjs");
const { initLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");

const blank = { current: "", next: "", repeat: "", show: false, pending: false, done: false, error: null };
const submit = (fragment) => fragment.querySelector('.g-sheet__foot button[type="submit"]');
const SHEETS = ["src/screens/settings/password.css", "src/screens/auth/login.css", "sheet.css", "text-field.css", "button.css", "callout.css"];
const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const refusal = (code, extra = {}) => ({ error: { code, params: {}, message: "x" }, ...extra });
function signedIn(over = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { id: "u1", login: "felstell", telegram: "@felstell", preferences: { themeMode: "dark" }, ...over };
}

test("three fields, a meter, three checks and one button that waits for all of them", () => {
  const fragment = mount(passwordSheetMarkup(blank));
  assert.equal(fragment.querySelector("dialog.g-sheet").id, "password-sheet");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => fragment.querySelector(id).getAttribute("autocomplete")),
    ["current-password", "new-password", "new-password"]);
  assert.equal(fragment.querySelectorAll(".g-check").length, 3);
  assert.equal(fragment.querySelectorAll(".g-check--ok").length, 0);
  assert.ok(submit(fragment).hasAttribute("disabled"));
  assertCspSafe(fragment);
  assertStyled(fragment, ...SHEETS);
});

test("the checks are the server's rule, not the prototype's eight characters", () => {
  const ready = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd" }));
  assert.equal(ready.querySelector(".g-check").textContent.startsWith("At least 4 characters"), true);
  assert.equal(ready.querySelectorAll(".g-check--ok").length, 3);
  assert.equal(submit(ready).hasAttribute("disabled"), false);
  assert.ok(submit(mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abc", repeat: "abc" }))).hasAttribute("disabled"));
  assert.ok(submit(mount(passwordSheetMarkup({ ...blank, current: "same", next: "same", repeat: "same" }))).hasAttribute("disabled"), "no change");
  assert.ok(submit(mount(passwordSheetMarkup({ ...blank, current: "", next: "abcd", repeat: "abcd" }))).hasAttribute("disabled"), "no current");
});

test("a wrong current password is said on that field, and the coach stays signed in", async () => {
  signedIn();
  api.reply("PATCH /api/auth/profile", 403, refusal("CURRENT_PASSWORD_WRONG"));
  const error = await changePassword({ current: "wrong", next: "abcd" });
  assert.deepEqual(api.calls.at(-1).body, { password: "abcd", currentPassword: "wrong" });
  assert.equal(error.field, "current");
  assert.equal(api.items.get("gata-league-auth-token"), "tok");
  assert.equal(state.auth.currentUser.id, "u1");
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "wrong", next: "abcd", repeat: "abcd", error }));
  assert.equal(fragment.querySelector("#password-current").getAttribute("aria-invalid"), "true");
  assert.equal(fragment.querySelector("#password-current-error").textContent, "The current password is wrong.");
  assert.equal(fragment.querySelector('[role="alert"]').textContent, "", "said once, on the field");
  assert.equal(fragment.querySelector("#password-next").hasAttribute("aria-invalid"), false);
});

test("too many guesses says when to try again, in minutes, and in seconds only for the last minute", async () => {
  signedIn();
  // The wait is refusalText's (K10c): the window is a quarter of an hour, so 120 s is "2 min", not "120".
  api.reply("PATCH /api/auth/profile", 429, refusal("TOO_MANY_LOGIN_ATTEMPTS", { retryAfterSeconds: 120 }));
  const error = await changePassword({ current: "x", next: "abcd" });
  assert.equal(error.field, null);
  assert.equal(error.text, "Too many attempts for this login. Try again in 2 min.");
  assert.ok(mount(passwordSheetMarkup({ ...blank, error })).querySelector('[role="alert"] .g-callout--danger'));
  api.reply("PATCH /api/auth/profile", 429, refusal("TOO_MANY_LOGIN_ATTEMPTS", { retryAfterSeconds: 45 }));
  assert.equal((await changePassword({ current: "x", next: "abcd" })).text, "Too many attempts for this login. Try again in 45 s.");
  assert.equal(state.auth.currentUser.id, "u1", "a refusal changes nothing");
});

test("the administrator whose password the server's settings keep is told so, in the alert", async () => {
  signedIn();
  api.reply("PATCH /api/auth/profile", 409, refusal("ADMIN_PASSWORD_FROM_ENV"));
  const error = await changePassword({ current: "old1", next: "abcd" });
  assert.deepEqual(error, { text: dictionary("en")["error.ADMIN_PASSWORD_FROM_ENV"], field: null });
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd", error }));
  assert.equal(fragment.querySelector('[role="alert"] .g-callout--danger .g-callout__title').textContent, error.text);
  assert.equal(fragment.querySelector("#password-current").hasAttribute("aria-invalid"), false, "no field is to blame");
  assert.equal(state.auth.currentUser.id, "u1");
  assert.equal(api.items.get("gata-league-auth-token"), "tok");
});

test("a lost connection and a server that does not answer are the alert's text too, and say the change may have gone through", async () => {
  signedIn();
  const maybe = dictionary("en")["password.maybeChanged"];
  assert.equal(maybe, "The change may have gone through. If your current password is refused, sign in with the new one.");
  api.fail("PATCH /api/auth/profile");
  assert.deepEqual(await changePassword({ current: "old1", next: "abcd" }), { text: dictionary("en")["request.offline"], field: null, sub: maybe });
  api.fail("PATCH /api/auth/profile", Object.assign(new Error("aborted"), { name: "AbortError" }));
  assert.deepEqual(await changePassword({ current: "old1", next: "abcd" }), { text: dictionary("en")["request.timeout"], field: null, sub: maybe }, "a timeout: the server may have been quicker than the answer");
  api.reply("PATCH /api/auth/profile", 502, {});
  assert.deepEqual(await changePassword({ current: "old1", next: "abcd" }), { text: dictionary("en")["request.noAnswer"], field: null, sub: maybe }, "a proxy's 502 or 504, not 'Request failed with 502'");
  // The server did answer, and said no: nothing was changed, and nothing says it might have been.
  for (const [status, code, extra] of [[400, "PASSWORD_TOO_SHORT"], [403, "CURRENT_PASSWORD_WRONG"], [409, "ADMIN_PASSWORD_FROM_ENV"], [429, "TOO_MANY_LOGIN_ATTEMPTS", { retryAfterSeconds: 30 }]]) {
    api.reply("PATCH /api/auth/profile", status, refusal(code, extra));
    assert.equal((await changePassword({ current: "old1", next: "abc" })).sub, undefined, code);
  }
  api.reply("PATCH /api/auth/profile", 503, refusal("MAINTENANCE"));
  assert.equal((await changePassword({ current: "old1", next: "abcd" })).sub, undefined, "a site closed for maintenance did not change it");
  api.reply("PATCH /api/auth/profile", 400, refusal("PASSWORD_TOO_SHORT"));
  assert.equal((await changePassword({ current: "old1", next: "abc" })).field, null, "the checks keep a short one from being sent; if the server refuses it all the same (400), it is the alert's");
});

test("the alert says under its title that the change may have gone through, escaped, and only when told", () => {
  const maybe = dictionary("en")["password.maybeChanged"];
  const fragment = mount(passwordSheetMarkup({ ...blank, error: { text: "No answer", sub: maybe, field: null } }));
  assert.equal(fragment.querySelector('[role="alert"] .g-callout__sub').textContent, maybe);
  assert.equal(mount(passwordSheetMarkup({ ...blank, error: { text: "No", field: null } })).querySelector(".g-callout__sub"), null);
  const hostile = mount(passwordSheetMarkup({ ...blank, error: { text: HOSTILE, sub: HOSTILE, field: null } }));
  assert.equal(hostile.querySelector(".g-callout__sub").textContent, HOSTILE);
  assert.equal(hostile.querySelector("img"), null);
  assert.equal(dictionary("ru")["password.maybeChanged"], "Возможно, пароль уже сменился. Если текущий пароль не подходит, войдите с новым.");
});

test("an alert that names no field says what it is told, escaped", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, error: { text: HOSTILE, field: null } }));
  assert.equal(fragment.querySelector(".g-callout__title").textContent, HOSTILE);
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(mount(passwordSheetMarkup(blank)).querySelector('[role="alert"]').textContent, "", "on the page from the start, so what is put in it is read aloud");
  const wrong = mount(passwordSheetMarkup({ ...blank, error: { text: HOSTILE, field: "current" } }));
  assert.equal(wrong.querySelector("#password-current-error").textContent, HOSTILE);
  assert.equal(wrong.querySelector("img"), null);
});

test("success keeps the account's settings and says other devices sign in again", async () => {
  signedIn();
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@felstell" } });
  assert.equal(await changePassword({ current: "old1", next: "abcd" }), null);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  const done = mount(passwordSheetMarkup({ ...blank, done: true }));
  assert.equal(done.querySelector("#password-current"), null);
  assert.match(done.textContent, /Password changed/);
  assert.match(done.textContent, /sign in again on your other devices/);
  assert.ok(done.querySelector("[data-password-done]"));
  assert.equal(done.querySelector("form"), null);
  assert.equal(done.querySelector(".g-sheet__foot"), null);
  assertCspSafe(done);
  assertStyled(done, ...SHEETS);
});

test("success is read by mergeCurrentUser: the account the server keeps and its settings stay, a copy that names no one changes nothing", async () => {
  signedIn({ managedByServer: false });
  api.reply("PATCH /api/auth/profile", 200, { user: { id: "u1", login: "felstell", telegram: "@new", isAdmin: false } });
  assert.equal(await changePassword({ current: "old1", next: "abcd" }), null);
  assert.equal(state.auth.currentUser.telegram, "@new");
  assert.equal(state.auth.currentUser.managedByServer, false);
  assert.deepEqual(state.auth.currentUser.preferences, { themeMode: "dark" });
  signedIn();
  api.reply("PATCH /api/auth/profile", 200, {});
  assert.equal(await changePassword({ current: "old1", next: "abcd" }), null, "the password is changed whatever the body says");
  assert.equal(state.auth.currentUser.telegram, "@felstell");
});

test("typing reports the field, the form submits once, and every way out is one close", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd" }));
  const heard = [];
  wirePasswordSheet(fragment, {
    onInput: (name, value) => heard.push([name, value]), onToggleShow: () => heard.push(["show"]),
    onSubmit: () => heard.push(["submit"]), onClose: () => heard.push(["close"]),
  });
  const dialog = fragment.querySelector("dialog");
  dialog.showModal();
  const next = fragment.querySelector("#password-next");
  next.value = "abcde";
  fireEvent(next, "input");
  fireEvent(fragment.querySelector("form"), "submit");
  fireEvent(fragment.querySelector("[data-sheet-close]"), "click");
  assert.deepEqual(heard, [["next", "abcde"], ["submit"], ["close"]]);
});

test("Show passwords is one button that is pressed or not, and it is wired", () => {
  const off = mount(passwordSheetMarkup(blank));
  const on = mount(passwordSheetMarkup({ ...blank, show: true }));
  const toggle = (fragment) => fragment.querySelector("[data-password-show]");
  assert.equal(toggle(off).getAttribute("aria-pressed"), "false");
  assert.equal(toggle(on).getAttribute("aria-pressed"), "true");
  assert.equal(toggle(on).textContent, toggle(off).textContent, "one name in both states (K10b); the pressed state says which");
  assert.equal(toggle(off).textContent, dictionary("en")["auth.showPassword"]);
  assert.equal(toggle(off).getAttribute("type"), "button", "it must not submit the form");
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => off.querySelector(id).getAttribute("type")), ["password", "password", "password"]);
  assert.deepEqual(["#password-current", "#password-next", "#password-repeat"].map((id) => on.querySelector(id).getAttribute("type")), ["text", "text", "text"]);
  assert.equal(off.querySelector("#password-next").hasAttribute("spellcheck"), false);
  assert.equal(on.querySelector("#password-next").getAttribute("spellcheck"), "false", "a password drawn as text is not sent to a spell checker, nor capitalised");
  assert.equal(on.querySelector("#password-next").getAttribute("autocapitalize"), "none");
  const heard = [];
  wirePasswordSheet(off, { onInput() {}, onToggleShow: () => heard.push("show"), onSubmit() {}, onClose() {} });
  fireEvent(toggle(off), "click");
  assert.deepEqual(heard, ["show"]);
});

test("the form submits by the button in the footer, and says it is busy while a try is on its way", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd", pending: true }));
  const form = fragment.querySelector("form");
  assert.equal(form.id, "password-form");
  assert.equal(form.querySelector('button[type="submit"]'), null, "the footer is outside the form");
  assert.equal(submit(fragment).getAttribute("form"), "password-form");
  assert.equal(form.getAttribute("aria-busy"), "true");
  assert.equal(mount(passwordSheetMarkup(blank)).querySelector("form").hasAttribute("aria-busy"), false);
});

test("each check says in words, to a screen reader, whether it is done", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abc" }));
  const checks = fragment.querySelectorAll(".g-check");
  assert.deepEqual(checks.map((check) => check.querySelector(".g-sr-only").textContent), [": done", ": done", ": not yet"]);
  assert.deepEqual(checks.map((check) => check.classList.contains("g-check--ok")), [true, true, false]);
  assert.ok(checks[0].querySelector("svg"), "a done check has a tick");
  assert.equal(checks[2].querySelector("svg"), null, "one not done is a circle");
  assert.equal(checks[2].querySelector(".g-check__ring").getAttribute("aria-hidden"), "true");
  assert.deepEqual(checks.map((check) => check.querySelector(".g-check__text").textContent), ["At least 4 characters", "Differs from the current one", "Passwords match"]);
  assert.equal(fragment.querySelector("ul.g-checks").querySelectorAll("li").length, 3);
});

test("the checks are read out as they change, and the new password's fields point at them", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abc" }));
  const list = fragment.querySelector("ul.g-checks");
  assert.equal(list.id, "password-checks");
  assert.equal(list.getAttribute("aria-live"), "polite", "a change of a check is said while the coach types");
  assert.equal(list.getAttribute("aria-atomic"), "true", "as the whole list, so 'passwords match: not yet' is not heard without its neighbours");
  assert.match(fragment.querySelector("#password-next").getAttribute("aria-describedby"), /(^| )password-checks( |$)/);
  assert.match(fragment.querySelector("#password-repeat").getAttribute("aria-describedby"), /(^| )password-checks( |$)/);
  assert.equal(fragment.querySelector("#password-current").hasAttribute("aria-describedby"), false, "the current password has no part in the checks");
  // A refusal on the current password is still read after what it points at.
  const wrong = mount(passwordSheetMarkup({ ...blank, error: { text: "Wrong", field: "current" } }));
  assert.equal(wrong.querySelector("#password-current").getAttribute("aria-describedby"), "password-current-error");
  assertCspSafe(fragment);
});

test("while a try is on its way the button says so and stays a button the focus can rest on", () => {
  const idle = submit(mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd" })));
  const busy = submit(mount(passwordSheetMarkup({ ...blank, current: "old1", next: "abcd", repeat: "abcd", pending: true })));
  assert.equal(idle.textContent, "Change password");
  assert.equal(busy.textContent, "Saving…");
  assert.equal(busy.hasAttribute("disabled"), false, "a focused button that is disabled drops the focus in Chrome: the screen's guard stops a second press");
  assert.equal(busy.getAttribute("form"), "password-form");
  assert.equal(submit(mount(passwordSheetMarkup({ ...blank, pending: true }))).textContent, "Saving…");
  initLocale("ru");
  try {
    assert.equal(submit(mount(passwordSheetMarkup({ ...blank, current: "a", next: "abcd", repeat: "abcd", pending: true }))).textContent, "Сохраняем…");
  } finally {
    initLocale("en");
  }
  const css = readFileSync(new URL("../src/screens/settings/password.css", import.meta.url), "utf8");
  assert.match(css, /\.g-password__form\[aria-busy="true"\]\s*\{[^}]*opacity:[^}]*cursor:\s*progress/, "the form shows that it is busy");
});

test("passwords are escaped where they are drawn", () => {
  const fragment = mount(passwordSheetMarkup({ ...blank, current: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("#password-current").getAttribute("value"), HOSTILE);
});

test("the button is ready only for a current password and three checks passed", () => {
  assert.equal(passwordReady({ current: "old1", next: "abcd", repeat: "abcd" }), true);
  for (const form of [{ current: "", next: "abcd", repeat: "abcd" }, { current: "old1", next: "abc", repeat: "abc" },
    { current: "abcd", next: "abcd", repeat: "abcd" }, { current: "old1", next: "abcd", repeat: "abcde" }, {}]) {
    assert.equal(passwordReady(form), false, JSON.stringify(form));
  }
});

test("the sheet speaks Russian when the site does, and the checks use the same rule", () => {
  initLocale("ru");
  try {
    const fragment = mount(passwordSheetMarkup({ ...blank, current: "старый", next: "abcd", repeat: "abc" }));
    assert.equal(fragment.querySelector("#password-sheet-title").textContent, "Смена пароля");
    assert.equal(fragment.querySelector('label[for="password-current"]').textContent, "Текущий пароль");
    assert.equal(fragment.querySelector(".g-check").textContent, "Не короче 4 символов: выполнено");
    assert.equal(fragment.querySelectorAll(".g-check")[2].textContent, "Пароли совпадают: не выполнено");
    assert.equal(submit(fragment).textContent, "Сменить пароль");
    assert.equal(mount(passwordSheetMarkup({ ...blank, done: true })).querySelector("[data-password-done]").textContent, "Готово");
  } finally {
    initLocale("en");
  }
});

test("every key the sheet asks for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/settings/password-sheet.mjs");
});

test("the keys the brief names are in both dictionaries with the brief's words", () => {
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const key of ["title", "current", "next", "repeat", "check.length", "check.different", "check.match", "check.ok", "check.no", "submit", "pending", "maybeChanged", "done", "doneText", "doneButton"]) {
      assert.ok(words[`password.${key}`], `${locale} password.${key}`);
    }
    assert.equal(words["password.show"], undefined, "the toggle is auth.showPassword (K10b), not a pair of keys");
    assert.equal(words["password.hide"], undefined);
  }
});

// R12: the token another tab stored is not the one the coach on this page was read with.
test("a password change while another tab holds another token is not sent: the current password would be tried against that account", async () => {
  signedIn();
  rememberSessionToken("tok");
  api.items.set("gata-league-auth-token", "other-tab");
  const error = await changePassword({ current: "old1", next: "abcd" });
  assert.deepEqual(error, { text: dictionary("en")["auth.otherTab"], field: null });
  assert.equal(api.calls.length, 0);
  rememberSessionToken("");
});
