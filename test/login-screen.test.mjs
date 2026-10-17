import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
globalThis.location = { hash: "#/login" };
const { loginMarkup, problemText, renderLogin, submitAuth } = await import("../src/screens/auth/login.mjs");
const { renderPasswordMeter } = await import("../src/screens/auth/password-meter.mjs");
const { renderCrest } = await import("../src/shell/crest.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const empty = { mode: "login", login: "", password: "", telegram: "", repeat: "", show: false, touched: false, forgotOpen: false, pending: false, error: null };
const SHEETS = ["src/screens/auth/login.css", "src/shell/crest.css", "text-field.css", "button.css", "segmented-control.css", "callout.css"];
const OFFLINE = "No connection to the server. Check the internet and try again.";
const NO_ANSWER = "The server did not answer. Try again in a minute.";

test("signing in: two fields, a button that waits for both, the password help and the way to register", () => {
  const fragment = mount(loginMarkup(empty));
  assert.equal(fragment.querySelector("h1").textContent, "Login");
  assert.equal(fragment.querySelector('[aria-current="page"]').getAttribute("href"), "#/login");
  assert.equal(fragment.querySelector("#auth-login").getAttribute("autocomplete"), "username");
  assert.equal(fragment.querySelector("#auth-password").getAttribute("type"), "password");
  assert.equal(fragment.querySelector("#auth-password").getAttribute("autocomplete"), "current-password");
  assert.ok(fragment.querySelector('[data-auth-form] button[type="submit"]').hasAttribute("disabled"));
  assert.equal(fragment.querySelector('[aria-controls="auth-forgot"]').getAttribute("aria-expanded"), "false");
  assert.ok(fragment.querySelector('a[href="#/register"]'));
  assert.equal(fragment.querySelector("#auth-telegram"), null);
  assertCspSafe(fragment);
  assertStyled(fragment, ...SHEETS);
  assert.equal(mount(loginMarkup({ ...empty, login: "coach", password: "x" })).querySelector('button[type="submit"]').hasAttribute("disabled"), false);
});

test("a refused sign-in keeps what was typed and says why, on both fields", () => {
  const fragment = mount(loginMarkup({ ...empty, login: "felstell", password: "qwerty", error: { text: "Wrong login or password.", fields: ["login", "password"] } }));
  assert.equal(fragment.querySelector('[role="alert"]').textContent, "Wrong login or password.");
  assert.equal(fragment.querySelector("#auth-login").getAttribute("aria-invalid"), "true");
  assert.equal(fragment.querySelector("#auth-password").getAttribute("aria-invalid"), "true");
  assert.equal(fragment.querySelector("#auth-login").getAttribute("value"), "felstell");
  // The alert says it once: the fields are marked, not given a line each.
  assert.equal(fragment.querySelector(".g-field__error"), null);
  assertStyled(fragment, ...SHEETS);
});

test("registering asks for a contact and a repeat, and shows its rules only after the first try", () => {
  const form = { ...empty, mode: "register", login: "ab", telegram: "@ab", password: "abc", repeat: "abd" };
  const quiet = mount(loginMarkup(form));
  assert.ok(quiet.querySelector("#auth-telegram") && quiet.querySelector("#auth-repeat"));
  assert.equal(quiet.querySelector(".g-field__error"), null);
  assert.equal(quiet.querySelector('button[type="submit"]').hasAttribute("disabled"), false);
  assert.equal(quiet.querySelector("#auth-repeat").getAttribute("autocomplete"), "new-password");
  const told = mount(loginMarkup({ ...form, touched: true }));
  assert.deepEqual(told.querySelectorAll(".g-field__error").map((node) => node.textContent), [
    "Login must be at least 3 characters.", "Format: @username, at least 5 characters after @",
    "Password must be at least 4 characters.", "Passwords do not match",
  ]);
  assertStyled(told, ...SHEETS);
});

// K10b: a toggle that also renamed itself would be read as "Hide, pressed". One name, and the state says the rest.
test("Show turns both password fields into text, and only its pressed state changes", () => {
  const hidden = mount(loginMarkup({ ...empty, mode: "register" }));
  const toggle = hidden.querySelector("[data-toggle-password]");
  assert.equal(toggle.getAttribute("type"), "button");
  assert.equal(toggle.getAttribute("aria-pressed"), "false");
  assert.equal(toggle.textContent, "Show password");
  const shown = mount(loginMarkup({ ...empty, mode: "register", show: true }));
  assert.deepEqual(["#auth-password", "#auth-repeat"].map((id) => shown.querySelector(id).getAttribute("type")), ["text", "text"]);
  assert.equal(shown.querySelector("[data-toggle-password]").getAttribute("aria-pressed"), "true");
  assert.equal(shown.querySelector("[data-toggle-password]").textContent, "Show password");
  assertStyled(shown, ...SHEETS);
});

test("the strength meter has three steps and words for them", () => {
  const steps = ["", "abc", "abcd", "abcdefgh"].map((password) => mount(renderPasswordMeter(password)));
  assert.deepEqual(steps.map((fragment) => fragment.querySelector(".g-meter").getAttribute("class")),
    ["g-meter g-meter--0", "g-meter g-meter--1", "g-meter g-meter--2", "g-meter g-meter--3"]);
  assert.deepEqual(steps.map((fragment) => fragment.querySelector(".g-meter__label").textContent), ["", "Too short", "Fair", "Strong"]);
  assert.ok(steps[1].querySelectorAll(".g-meter__bar").every((bar) => bar.getAttribute("aria-hidden") === "true"));
  for (const fragment of steps) assertStyled(fragment, "src/screens/auth/login.css");
});

test("what was typed is escaped", () => {
  const fragment = mount(loginMarkup({ ...empty, login: HOSTILE }));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector("#auth-login").getAttribute("value"), HOSTILE);
});

test("the server's refusals land on the fields they are about", async () => {
  const form = { ...empty, login: "felstell", password: "qwerty" };
  api.reply("POST /api/auth/login", 401, { error: { code: "WRONG_LOGIN_OR_PASSWORD", params: {}, message: "x" } });
  assert.deepEqual((await submitAuth(form)).fields, ["login", "password"]);
  api.reply("POST /api/auth/login", 429, { error: { code: "TOO_MANY_LOGIN_ATTEMPTS", params: {}, message: "x" }, retryAfterSeconds: 30 });
  assert.match((await submitAuth(form)).text, /30/);
  api.reply("POST /api/auth/register", 409, { error: { code: "LOGIN_ALREADY_REGISTERED", params: {}, message: "x" } });
  assert.deepEqual((await submitAuth({ ...form, mode: "register", telegram: "felstell", repeat: "qwerty" })).fields, ["login"]);
  assert.deepEqual(api.calls.at(-1).body, { login: "felstell", password: "qwerty", telegram: "@felstell" });
  api.fail("POST /api/auth/login");
  assert.equal((await submitAuth(form)).text, OFFLINE);
  api.assertAnswered();
});

// Task 2 carry (b): a proxy's 502 while the server restarts has no code, and is no lost connection either.
test("an answer that is no answer says the server did not answer", async () => {
  api.reply("POST /api/auth/login", 502, {});
  assert.deepEqual(await submitAuth({ ...empty, login: "felstell", password: "qwerty" }), { text: NO_ANSWER, fields: [] });
});

test("a successful sign-in hands over to the session", async () => {
  api.reply("POST /api/auth/login", 200, { token: "new", user: { id: "u1", login: "felstell" } });
  api.reply("GET /api/auth/me", 200, { user: { id: "u1", login: "felstell", preferences: {} } });
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await submitAuth({ ...empty, login: "felstell", password: "right" }), null);
  assert.equal(api.items.get("gata-league-auth-token"), "new");
  assert.equal(state.auth.currentUser.login, "felstell");
});

// Task 2 carry (a): the 2.x modal closed here and left a guest with no word. The token stays, and the next load reads it.
test("a sign-in that went through while the account could not be read keeps the token and says so", async () => {
  for (const [name, answer, text] of [
    ["offline", () => api.fail("GET /api/auth/me"), OFFLINE],
    ["a 500", () => api.reply("GET /api/auth/me", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } }), NO_ANSWER],
  ]) {
    api.reset();
    state.auth.currentUser = null;
    api.reply("POST /api/auth/login", 200, { token: "kept", user: { id: "u1", login: "felstell" } });
    answer();
    api.reply("GET /api/teams", 200, { teams: [] });
    const said = await submitAuth({ ...empty, login: "felstell", password: "right" });
    assert.equal(said.text, text, name);
    assert.equal(said.sub, "You are signed in: reloading the page opens your account.", name);
    assert.deepEqual(said.fields, [], name);
    assert.equal(api.items.get("gata-league-auth-token"), "kept", name);
    assert.equal(state.auth.currentUser, null, name);
    const drawn = mount(loginMarkup({ ...empty, error: said }));
    assert.equal(drawn.querySelector('[role="alert"] .g-callout__sub').textContent, said.sub, name);
  }
});

test("every rule a registration can break has its words", () => {
  for (const [code, text] of [
    ["LOGIN_TOO_SHORT", "Login must be at least 3 characters."], ["TELEGRAM_REQUIRED", "Telegram contact is required."],
    ["TELEGRAM_FORMAT", "Format: @username, at least 5 characters after @"], ["PASSWORD_TOO_SHORT", "Password must be at least 4 characters."],
    ["PASSWORDS_DIFFER", "Passwords do not match"],
  ]) assert.equal(problemText(code), text, code);
});

test("the crest is decoration drawn by the palette, not by colours in the markup", () => {
  const svg = mount(renderCrest({ size: "lg" })).querySelector("svg.g-crest.g-crest--lg");
  assert.equal(svg.getAttribute("aria-hidden"), "true");
  assert.equal(svg.walk().some((node) => node.nodeType === 1 && /#[0-9a-f]{3,6}/i.test(node.getAttribute("fill") ?? "")), false);
  for (const size of ["sm", "md", "lg"]) assertStyled(mount(renderCrest({ size })), "src/shell/crest.css");
  assert.throws(() => renderCrest({ size: "xl" }), /size/);
});

test("the sign-in modal is gone from the page and from the code", () => {
  assert.doesNotMatch(read("index.html"), /auth-modal/);
  assert.equal(existsSync(new URL("../src/components/auth-modal.mjs", import.meta.url)), false);
  assert.doesNotMatch(read("src/styles/shell.css"), /\.auth-(modal|dialog|backdrop|account|error|form)|auth-open/);
  assert.doesNotMatch(read("src/styles/overlays.css"), /\.auth-/);
  const imports = read("src/styles.css");
  for (const sheet of ["screens/auth/login.css", "shell/crest.css"]) assert.ok(imports.includes(`@import url("${sheet}");`), sheet);
});

test("every key the screen asks for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/auth/login.mjs", "src/screens/auth/password-meter.mjs", "src/data/session.mjs");
});

// ---------------------------------------------------------------------------
// The screen: what it holds between keystrokes, and what it forgets
// ---------------------------------------------------------------------------

const input = (id, value) => {
  const field = view.querySelector(`#${id}`);
  field.value = value;
  fireEvent(field, "input");
};
const submitButton = () => view.querySelector('[data-auth-form] button[type="submit"]');
function leaveTo(hash) {
  globalThis.location.hash = hash;
  releaseCurrentScreen();
}

test("typing is kept between redraws, Show and the password help answer a click, and leaving forgets the password", () => {
  api.reset();
  state.auth.currentUser = null;
  globalThis.location.hash = "#/login";
  renderLogin("login");
  assert.ok(submitButton().hasAttribute("disabled"));
  input("auth-login", "felstell");
  input("auth-password", "secret");
  assert.equal(submitButton().hasAttribute("disabled"), false);
  assert.equal(view.querySelector("#auth-login").getAttribute("value"), "felstell", "the redraw writes what was typed back");

  fireEvent(view.querySelector("[data-toggle-password]"), "click");
  assert.equal(view.querySelector("#auth-password").getAttribute("type"), "text");
  assert.equal(view.querySelector("[data-toggle-password]").getAttribute("aria-pressed"), "true");
  fireEvent(view.querySelector('[aria-controls="auth-forgot"]'), "click");
  assert.equal(view.querySelector('[aria-controls="auth-forgot"]').getAttribute("aria-expanded"), "true");
  assert.equal(view.querySelector("#auth-forgot").hasAttribute("hidden"), false);

  // The switch is a link: the router draws the other mode, and what was typed goes with the coach.
  leaveTo("#/register");
  renderLogin("register");
  assert.equal(view.querySelector("#auth-login").getAttribute("value"), "felstell");
  assert.equal(view.querySelector("#auth-password").getAttribute("value"), "secret");
  assert.ok(view.querySelector(".g-meter--2"));

  leaveTo("#/legal");
  globalThis.location.hash = "#/login";
  renderLogin("login");
  assert.equal(view.querySelector("#auth-password").getAttribute("value"), "", "the password went when the coach left");
  assert.equal(view.querySelector("#auth-login").getAttribute("value"), "felstell");
  assert.equal(view.querySelector("#auth-password").getAttribute("type"), "password");
  assert.equal(view.querySelector('[aria-controls="auth-forgot"]').getAttribute("aria-expanded"), "false");
  leaveTo("#/legal");
  api.assertAnswered();
});

test("a registration that breaks a rule is told so on its fields and sends nothing", () => {
  api.reset();
  globalThis.location.hash = "#/register";
  renderLogin("register");
  input("auth-login", "ab");
  assert.equal(view.querySelector(".g-field__error"), null, "nothing is said before the first try");
  fireEvent(view.querySelector("[data-auth-form]"), "submit");
  assert.equal(api.calls.length, 0);
  assert.equal(view.querySelector("#auth-login-error").textContent, "Login must be at least 3 characters.");
  assert.equal(document.activeElement, view.querySelector("#auth-login"), "the first field to fix has the focus");
  leaveTo("#/legal");
});

test("a refused sign-in is drawn on the screen, and typing takes it back", async () => {
  api.reset();
  state.auth.currentUser = null;
  globalThis.location.hash = "#/login";
  renderLogin("login");
  input("auth-login", "felstell");
  input("auth-password", "wrong");
  api.reply("POST /api/auth/login", 401, { error: { code: "WRONG_LOGIN_OR_PASSWORD", params: {}, message: "x" } });
  const submitted = fireEvent(view.querySelector("[data-auth-form]"), "submit");
  assert.equal(submitted.defaultPrevented, true, "the page does not post the form");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(view.querySelector('[role="alert"]').textContent, "Wrong login or password.");
  assert.equal(view.querySelector("#auth-password").getAttribute("aria-invalid"), "true");
  input("auth-password", "right");
  assert.equal(view.querySelector('[role="alert"]').textContent, "");
  assert.equal(view.querySelector("#auth-password").hasAttribute("aria-invalid"), false);
  leaveTo("#/legal");
  api.assertAnswered();
});
