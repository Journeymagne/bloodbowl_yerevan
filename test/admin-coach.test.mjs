import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The client takes `fetch` when it loads (helpers/fake-api.mjs): the fake one first, then the modules that ask it.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/administration/users/u2", replace() {} };
const { DELETE_BLOCKS, adminCoachMarkup, adminCoachModel, renderAdminCoach } = await import("../src/screens/admin/coach.mjs");
const { RESET_SHEET_ID, TEAM_NEW_SHEET_ID } = await import("../src/screens/admin/coach-sheets.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");
const { formatDay } = await import("../src/core/format.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
// The races' names come from the reference, as on the page.
state.data = data;
const CSS = "src/screens/admin/coach.css";
const COACHES_CSS = "src/screens/admin/coaches.css";
const ADMIN_CSS = "src/screens/admin/admin.css";
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";
const adminCalls = () => api.calls.map(({ key }) => key).filter((key) => / \/api\/admin\//.test(key));
const writes = () => api.calls.filter(({ key }) => !key.startsWith("GET "));
/** A fact the admin reads: its word and its value. */
const facts = (fact) => [words(fact.querySelector(".g-acoach__factlabel")), words(fact.querySelector(".g-acoach__factvalue"))];

/** A day some days ago, as the server writes a moment. */
const daysAgo = (days) => new Date(Date.now() - days * 86400000).toISOString();
const LAST_LOGIN = daysAgo(2);
/** «20 Oct», the year said when it is another one. */
const dayOf = (iso) => formatDay(iso, { year: new Date(iso).getFullYear() !== new Date().getFullYear() });

const ADMIN = { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: true, createdAt: "2024-11-02T10:00:00Z", lastLoginAt: daysAgo(0), savedTeamCount: 1, managedByServer: false, deleteBlock: "self" };
const ORC_BOSS = {
  id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, createdAt: "2025-02-03T10:00:00Z", lastLoginAt: LAST_LOGIN,
  savedTeamCount: 3, draftTeamCount: 1, managedByServer: false, deleteBlock: "season",
};
const TEAMS = [
  { id: "rt1", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", stage: "active", inActiveSeason: true, matches: 6, friendlies: 0, deleteBlock: "season" },
  { id: "rt2", name: "Iron Teeth", baseTeamSlug: "teams/black-orc", stage: "active", inActiveSeason: false, matches: 1, friendlies: 1, deleteBlock: "friendly" },
  { id: "rt3", name: "Mudfoot Boyz", baseTeamSlug: "teams/human", stage: "draft", inActiveSeason: false, matches: 0, friendlies: 0, deleteBlock: null },
];
const PASSWORD = "k7Qp2xLm9wRaZt5Y";

/** The phone's media query. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); }, listening: () => listeners.size };
}

/** What the confirmation asks, answered `answer`. */
function confirmWith(answer) {
  const asked = [];
  globalThis.confirm = (message) => { asked.push(message); return answer; };
  return asked;
}

const sheet = (id) => document.querySelector(`dialog#${id}`);
const click = (target) => fireEvent(typeof target === "string" ? document.querySelector(target) : target, "click");
const type = (selector, value) => {
  const input = document.querySelector(selector);
  input.value = value;
  fireEvent(input, "input");
};
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);

/** The admin (or `user`) signed in on a page that reads `coach` and his teams as given. */
function signIn({ user = ADMIN, coach = ORC_BOSS, teams = TEAMS } = {}) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.data = data;
  state.auth.currentUser = user;
  api.reply(`GET /api/admin/users/${coach.id}`, 200, { user: coach, teams });
}

async function visit(options = {}, { phone = false } = {}) {
  const screen = width(phone);
  signIn(options);
  await renderAdminCoach(options.coach?.id ?? ORC_BOSS.id);
  await settle();
  return screen;
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test("the model: the coach's lines, the account's form, the teams with their lines and their ways, why a delete is closed", () => {
  const model = adminCoachModel({ user: ORC_BOSS, teams: TEAMS, viewer: ADMIN, phone: false });
  assert.equal(model.login, "orc_boss");
  assert.equal(model.since, `In the league since ${formatDay(ORC_BOSS.createdAt, { year: true })}`);
  assert.equal(model.lastLogin, `last sign-in ${dayOf(LAST_LOGIN)}`);
  assert.deepEqual([model.self, model.envAdmin, model.canReset, model.resetWhy, model.deleteBlock], [false, false, true, "", "season"]);
  assert.deepEqual(model.form, { login: "orc_boss", isAdmin: false });
  assert.deepEqual(model.teams.map(({ id, name, initials, line, editHref, deleteBlock }) => [id, name, initials, line, editHref, deleteBlock]), [
    ["rt1", "Grimtusk Raiders", "GR", "Orc · in the season · matches: 6", "#/administration/users/u2/teams/rt1/edit", "season"],
    ["rt2", "Iron Teeth", "IT", "Black Orc · friendlies: 1", "#/administration/users/u2/teams/rt2/edit", "friendly"],
    ["rt3", "Mudfoot Boyz", "MB", "Human · in the build", "#/administration/users/u2/teams/rt3/edit", null],
  ]);
  // No live session: nothing is said of the last sign-in (L14); one today is «today».
  assert.equal(adminCoachModel({ user: { ...ORC_BOSS, lastLoginAt: null }, teams: [], viewer: ADMIN }).lastLogin, "");
  assert.equal(adminCoachModel({ user: { ...ORC_BOSS, lastLoginAt: new Date().toISOString() }, teams: [], viewer: ADMIN }).lastLogin, "last sign-in today");
  // One's own row: no reset, and the delete is closed as one's own whatever the server sent.
  const own = adminCoachModel({ user: { ...ADMIN, deleteBlock: undefined }, teams: [], viewer: ADMIN });
  assert.deepEqual([own.self, own.canReset, own.resetWhy, own.deleteBlock], [true, false, t("administration.ownPassword"), "self"]);
  // The server's admin: no reset, the server's words.
  const env = adminCoachModel({ user: { ...ORC_BOSS, isAdmin: true, managedByServer: true, deleteBlock: null }, teams: [], viewer: ADMIN });
  assert.deepEqual([env.envAdmin, env.canReset, env.resetWhy], [true, false, t("error.ADMIN_PASSWORD_FROM_ENV")]);
  // A team in the season that is still in its build says both; one with past matches and no friendly says the matches.
  const lines = adminCoachModel({ user: ORC_BOSS, viewer: ADMIN, teams: [
    { id: "a", name: "A", baseTeamSlug: "teams/human", stage: "draft", inActiveSeason: true, matches: 0, friendlies: 0 },
    { id: "b", name: "B", baseTeamSlug: "teams/orc", stage: "active", inActiveSeason: false, matches: 4, friendlies: 0 },
    { id: "c", name: "C", baseTeamSlug: "teams/nowhere", stage: "active", inActiveSeason: false, matches: 0, friendlies: 0 },
  ] }).teams.map((team) => team.line);
  assert.deepEqual(lines, ["Human · in the build · in the season", "Orc · matches: 4", ""]);
  assert.deepEqual(DELETE_BLOCKS, ["self", "season", "friendly"]);
  assert.ok(Object.isFrozen(DELETE_BLOCKS));
});

// ---------------------------------------------------------------------------
// A desk: DeskAdminUser.html
// ---------------------------------------------------------------------------

test("a coach's page: the head, the account, the teams with their lines and their ways", async () => {
  await visit();
  assert.equal(view.querySelector("h1").textContent, "Coach");
  assert.equal(words(view.querySelector(".g-admin__crumbs")), "Administration → Coaches → orc_boss");
  assert.equal(view.querySelector(".g-admin__crumbs a").getAttribute("href"), "#/administration");
  assert.equal(view.querySelector('.g-admin__switch a[aria-current="page"]').getAttribute("href"), "#/administration", "a coach is the coaches' section");
  // The coach: the letter in its circle of 64, the login, since when and the last sign-in.
  assert.equal(view.querySelector(".g-acoach__id .g-admin__avatar--64").textContent, "O");
  assert.equal(view.querySelector(".g-acoach__login").textContent, "orc_boss");
  assert.equal(view.querySelector(".g-acoach__line").textContent,
    `In the league since ${formatDay(ORC_BOSS.createdAt, { year: true })} · last sign-in ${dayOf(LAST_LOGIN)}`);
  // «Account»: the login a field, Telegram read only, the switch with its rule, «Save» and «Reset password…».
  const account = view.querySelector(".g-acoach__account");
  assert.equal(account.querySelector("h2").textContent, "Account");
  assert.equal(account.querySelector("#acoach-login").value, "orc_boss");
  assert.deepEqual(account.querySelectorAll(".g-acoach__fact").map(facts), [["Telegram", "@orc_boss"]]);
  assert.equal(account.querySelector('input[name="telegram"]'), null, "no field of Telegram in the admin's edit");
  const toggle = account.querySelector('[role="switch"]');
  assert.deepEqual([words(toggle.querySelector(".g-toggle__label")), words(toggle.querySelector(".g-toggle__caption"))],
    ["Administrator", "Your own admin rights cannot be taken away"]);
  assert.equal(toggle.getAttribute("aria-checked"), "false");
  assert.equal(toggle.hasAttribute("disabled"), false);
  assert.deepEqual(account.querySelectorAll(".g-acoach__actions button").map(words), ["Save", "Reset password…"]);
  assert.equal(account.querySelector("[data-acoach-reset]").getAttribute("aria-haspopup"), "dialog");
  // «Teams»: «+ Team», a row each with its tile, its line, «Edit» and «Delete».
  const teams = view.querySelector(".g-acoach__teamscard");
  assert.equal(teams.querySelector("h2").textContent, "Teams");
  assert.equal(words(teams.querySelector("[data-acoach-team-new]")), "+ Team");
  const rows = teams.querySelectorAll(".g-acoach__team");
  assert.deepEqual(rows.map((row) => [words(row.querySelector(".g-acoach__tile")), words(row.querySelector(".g-acoach__teamname")), words(row.querySelector(".g-acoach__teamline"))]), [
    ["GR", "Grimtusk Raiders", "Orc · in the season · matches: 6"],
    ["IT", "Iron Teeth", "Black Orc · friendlies: 1"],
    ["MB", "Mudfoot Boyz", "Human · in the build"],
  ]);
  const edit = rows[0].querySelector("a.g-acoach__btn");
  assert.deepEqual([edit.textContent, edit.getAttribute("href"), edit.getAttribute("aria-label")], ["Edit", "#/administration/users/u2/teams/rt1/edit", "Edit Grimtusk Raiders"]);
  // A delete closed says why in its title; an open one is open.
  const deletes = rows.map((row) => row.querySelector("[data-acoach-team-delete]"));
  assert.deepEqual(deletes.map((button) => [button.textContent, button.getAttribute("aria-disabled"), button.getAttribute("title")]), [
    ["Delete", "true", t("administration.block.season")],
    ["Delete", "true", t("administration.block.friendly")],
    ["Delete", null, null],
  ]);
  assert.equal(deletes[2].getAttribute("aria-label"), "Delete Mudfoot Boyz");
  assert.equal(words(teams.querySelector(".g-admin__note")), "A team with a season history or friendly matches cannot be deleted.");
  // «Delete the coach» under its rule: closed, with why.
  const danger = teams.querySelector(".g-acoach__danger");
  assert.equal(words(danger.querySelector(".g-acoach__dangertitle")), "Delete the coach");
  assert.equal(words(danger.querySelector(".g-acoach__dangerwhy")), t("administration.block.season"));
  assert.equal(danger.querySelector("[data-acoach-delete]").getAttribute("aria-disabled"), "true");
  assert.equal(danger.querySelector("[data-acoach-delete]").getAttribute("aria-describedby"), "acoach-delete-why");
  assert.ok(document.activeElement === view.querySelector("h1"), "the title takes the focus");
  assert.deepEqual(api.calls.map(({ key }) => key), ["GET /api/admin/users/u2"]);
  api.assertAnswered();
});

test("a coach with no team, no live session and an open delete", async () => {
  await visit({ coach: { ...ORC_BOSS, lastLoginAt: null, deleteBlock: null }, teams: [] });
  assert.equal(view.querySelector(".g-acoach__line").textContent, `In the league since ${formatDay(ORC_BOSS.createdAt, { year: true })}`, "no word of a sign-in");
  assert.equal(words(view.querySelector(".g-acoach__none")), "No teams yet");
  const danger = view.querySelector(".g-acoach__danger");
  assert.equal(danger.querySelector("[data-acoach-delete]").getAttribute("aria-disabled"), null);
  assert.equal(words(danger.querySelector(".g-acoach__dangerwhy")), "The account and every team of it go for good.");
});

test("a phone's coach: the cards in one column, the same ways", async () => {
  await visit({}, { phone: true });
  assert.ok(view.querySelector(".g-acoach--phone"));
  assert.ok(view.querySelector(".g-pagehead").classList.contains("g-pagehead--phone"), "the title stands on a phone");
  assert.equal(view.querySelector("h1").textContent, "Coach");
  assert.deepEqual(view.querySelectorAll(".g-admin__switch a").map((link) => link.getAttribute("href")), ["#/administration", "#/administration/season"]);
  assert.equal(view.querySelectorAll(".g-acoach__team").length, 3);
  assert.ok(view.querySelector("#acoach-login"));
});

test("a coach who is no admin is told the section is the admin's, and nothing is read", async () => {
  for (const phone of [true, false]) {
    await visit({ user: { id: "u2", login: "orc_boss", isAdmin: false } }, { phone });
    assert.equal(view.querySelector("h1").textContent, "Administration");
    assert.equal(view.querySelector(".g-callout__title").textContent, t("administration.only"));
    assert.equal(view.querySelector(".g-acoach"), null);
    assert.deepEqual(api.calls, [], "nothing at all");
  }
});

test("a coach who is not there", async () => {
  width(false);
  signIn();
  api.reply("GET /api/admin/users/u404", 404, { error: { code: "USER_NOT_FOUND", message: "User not found." } });
  await renderAdminCoach("u404");
  await settle();
  assert.equal(view.querySelector("h1").textContent, "Coach");
  const link = view.querySelector("a.g-callout");
  assert.deepEqual([words(link.querySelector(".g-callout__title")), words(link.querySelector(".g-callout__sub")), link.getAttribute("href")],
    ["The league has no such coach", "To the coaches", "#/administration"]);
  assert.equal(view.querySelector(".g-acoach__account"), null);
});

test("a read that fails says why and reads again on «Try again»; while it is read, the screen says so", async () => {
  width(false);
  signIn();
  api.reply("GET /api/admin/users/u2", 500, { error: { code: "SERVER_ERROR", message: "Boom" } });
  await renderAdminCoach("u2");
  await settle();
  assert.match(view.querySelector('[role="alert"]').textContent, /^Could not read: /);
  api.reply("GET /api/admin/users/u2", 200, { user: ORC_BOSS, teams: TEAMS });
  click(view.querySelector("[data-acoach-again]"));
  await settle();
  assert.equal(view.querySelectorAll(".g-acoach__team").length, 3);
  signIn();
  const held = api.hold("GET /api/admin/users/u2");
  const drawing = renderAdminCoach("u2");
  await settle();
  assert.equal(view.querySelector('.g-acoach [role="status"]').textContent, "Reading…");
  held.release();
  await drawing;
  assert.equal(view.querySelectorAll(".g-acoach__team").length, 3);
});

// ---------------------------------------------------------------------------
// The account: one's own row, the server's admin, the save
// ---------------------------------------------------------------------------

test("one's own row: no reset, no demotion, no delete; the form never sends a password", async () => {
  await visit({ coach: ADMIN, teams: [] });
  const toggle = view.querySelector('.g-acoach__account [role="switch"]');
  assert.equal(toggle.hasAttribute("disabled"), true, "the switch is closed (L13)");
  assert.equal(toggle.getAttribute("aria-checked"), "true");
  assert.equal(words(toggle.querySelector(".g-toggle__caption")), "Your own admin rights cannot be taken away");
  assert.equal(view.querySelector("[data-acoach-reset]"), null, "no reset of one's own password");
  assert.equal(words(view.querySelector(".g-acoach__why")), "One's own password is changed in «Settings»");
  const remove = view.querySelector("[data-acoach-delete]");
  assert.equal(remove.getAttribute("aria-disabled"), "true");
  assert.equal(words(view.querySelector(".g-acoach__dangerwhy")), t("administration.block.self"));
  // «Save»: the login only, never the rights nor a password.
  api.reply("PATCH /api/admin/users/u1", 200, { user: { ...ADMIN, login: "felstell_2" } });
  type("#acoach-login", "felstell_2");
  click("[data-acoach-save]");
  await settle();
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [["PATCH /api/admin/users/u1", { login: "felstell_2" }]]);
  // The admin's own new login is in the shell's copy of him.
  assert.equal(state.auth.currentUser.login, "felstell_2");
  assert.equal(view.querySelector(".g-acoach__login").textContent, "felstell_2");
  assert.equal(words(view.querySelector('.g-acoach__account [role="status"]')), "Account saved");

  // Another's row: the login and the rights, never a password.
  await visit();
  api.reply("PATCH /api/admin/users/u2", 200, { user: { ...ORC_BOSS, isAdmin: true } });
  click('.g-acoach__account [role="switch"]');
  click("[data-acoach-save]");
  await settle();
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [["PATCH /api/admin/users/u2", { login: "orc_boss", isAdmin: true }]]);
  assert.equal(state.auth.currentUser.login, "felstell", "another's save leaves the admin as he is");
  assert.equal(view.querySelector('.g-acoach__account [role="switch"]').getAttribute("aria-checked"), "true");
  for (const call of writes()) assert.equal(Object.hasOwn(call.body, "password"), false);
  state.auth.currentUser = ADMIN;
});

test("the server's admin: login and rights read only, no reset, the server's words", async () => {
  await visit({ coach: { ...ORC_BOSS, isAdmin: true, telegram: "", managedByServer: true, deleteBlock: null } });
  const account = view.querySelector(".g-acoach__account");
  assert.equal(account.querySelector("#acoach-login"), null, "the login is no field");
  assert.deepEqual(account.querySelectorAll(".g-acoach__fact").map(facts), [["Login", "orc_boss"], ["Telegram", "—"]]);
  assert.equal(account.querySelector('[role="switch"]').hasAttribute("disabled"), true);
  assert.equal(account.querySelector("[data-acoach-save]"), null, "nothing to save");
  assert.equal(account.querySelector("[data-acoach-reset]"), null);
  assert.deepEqual(account.querySelectorAll(".g-admin__note").map(words), [t("error.ADMIN_PROFILE_FROM_ENV"), t("error.ADMIN_PASSWORD_FROM_ENV")]);
});

test("a save is one PATCH however many presses; a refusal is said in the card; a lost answer reads the coach again and is not sent again", async () => {
  await visit();
  const gate = api.hold("PATCH /api/admin/users/u2");
  api.reply("PATCH /api/admin/users/u2", 200, { user: { ...ORC_BOSS, login: "orc_king" } });
  type("#acoach-login", "orc_king");
  click("[data-acoach-save]");
  click("[data-acoach-save]");
  fireEvent(document.querySelector("#acoach-login"), "keydown", { key: "Enter" });
  assert.equal(words(view.querySelector("[data-acoach-save]")), "Saving…");
  assert.equal(view.querySelector("[data-acoach-save]").getAttribute("aria-busy"), "true");
  assert.equal(view.querySelector("#acoach-login").hasAttribute("readonly"), true);
  gate.release();
  await settle();
  assert.equal(writes().length, 1);
  assert.equal(view.querySelector(".g-acoach__login").textContent, "orc_king");
  assert.equal(words(view.querySelector("[data-acoach-save]")), "Save");

  // A refusal: the server's words in the card, the field as typed.
  await visit();
  api.reply("PATCH /api/admin/users/u2", 409, { error: { code: "LOGIN_ALREADY_REGISTERED", message: "Taken." } });
  type("#acoach-login", "felstell");
  click("[data-acoach-save]");
  await settle();
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), t("error.LOGIN_ALREADY_REGISTERED"));
  assert.equal(view.querySelector("#acoach-login").value, "felstell");
  assert.deepEqual(adminCalls(), ["GET /api/admin/users/u2", "PATCH /api/admin/users/u2"], "a refusal reads nothing");
  // Typing takes it back.
  type("#acoach-login", "felstell_x");
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), "");

  // A lost answer: read again, never sent again; the account as the server holds it.
  await visit();
  api.fail("PATCH /api/admin/users/u2");
  api.reply("GET /api/admin/users/u2", 200, { user: { ...ORC_BOSS, login: "orc_king" }, teams: TEAMS });
  type("#acoach-login", "orc_king");
  click("[data-acoach-save]");
  await settle();
  await settle();
  assert.deepEqual(adminCalls(), ["GET /api/admin/users/u2", "PATCH /api/admin/users/u2", "GET /api/admin/users/u2"]);
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), t("administration.mayHaveWritten"));
  assert.equal(view.querySelector("#acoach-login").value, "orc_king", "what the server holds");

  // Another tab's token: nothing sent.
  await visit();
  api.items.set("gata-league-auth-token", "another");
  click("[data-acoach-save]");
  await settle();
  assert.equal(writes().length, 0);
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), t("auth.otherTab"));
});

// ---------------------------------------------------------------------------
// The password's reset: DeskAdminReset.html
// ---------------------------------------------------------------------------

test("a reset asks first, then shows the password once; its copy", async () => {
  await visit();
  const asked = confirmWith(false);
  click("[data-acoach-reset]");
  await settle();
  assert.deepEqual(asked, ["Reset the password of orc_boss? Every session of the coach ends."]);
  assert.equal(writes().length, 0, "declined: nothing sent");

  confirmWith(true);
  api.reply("POST /api/admin/users/u2/reset-password", 200, { password: PASSWORD });
  const gate = api.hold("POST /api/admin/users/u2/reset-password");
  click("[data-acoach-reset]");
  await settle();
  click("[data-acoach-reset]");
  await settle();
  assert.equal(words(view.querySelector("[data-acoach-reset]")), "Resetting…");
  gate.release();
  await settle();
  assert.deepEqual(writes().map(({ key }) => key), ["POST /api/admin/users/u2/reset-password"], "one reset");
  // The window: «Temporary password», whose sessions ended, the password, «Copy», the note, «Done».
  const dialog = sheet(RESET_SHEET_ID);
  assert.ok(dialog.isModal);
  assert.ok(dialog.classList.contains("g-coachreset"));
  assert.equal(dialog.querySelector("h2").textContent, "Temporary password");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "orc_boss · every session of the coach ended");
  assert.equal(dialog.querySelector(".g-coachnew__password").textContent, PASSWORD);
  assert.equal(words(dialog.querySelector(".g-admin__note")),
    "Send the password to the coach on Telegram: after signing in it is changed in «Settings → Change password». One's own password cannot be reset here.");
  assert.deepEqual(dialog.querySelectorAll(".g-sheet__foot button").map(words), ["Done"]);
  assert.ok(document.activeElement === dialog.querySelector("[data-coach-copy]"), "«Copy» takes the focus");
  // The sessions ended: no word of a sign-in under the coach.
  assert.equal(view.querySelector(".g-acoach__line").textContent, `In the league since ${formatDay(ORC_BOSS.createdAt, { year: true })}`);
  // «Copy».
  const copied = [];
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (value) => { copied.push(value); } }, configurable: true });
  click("[data-coach-copy]");
  await settle();
  assert.deepEqual(copied, [PASSWORD]);
  assert.equal(sheet(RESET_SHEET_ID).querySelector(".g-coachnew__copied").textContent, "Password copied");
  Object.defineProperty(globalThis.navigator, "clipboard", { value: undefined, configurable: true });
  const selected = [];
  globalThis.getSelection = () => ({ selectAllChildren: (node) => selected.push(node) });
  try {
    click("[data-coach-copy]");
    await settle();
  } finally {
    delete globalThis.getSelection;
  }
  assert.deepEqual(selected, [sheet(RESET_SHEET_ID).querySelector(".g-coachnew__password")]);
  assert.equal(sheet(RESET_SHEET_ID).querySelector(".g-coachnew__copied").textContent, t("administration.copyByHand"));
  // «Done»: the password goes with the window; the focus back on «Reset password…».
  click(sheet(RESET_SHEET_ID).querySelector("[data-reset-done]"));
  assert.equal(sheet(RESET_SHEET_ID), null);
  assert.ok(document.activeElement === view.querySelector("[data-acoach-reset]"));
  assert.ok(!document.querySelectorAll("*").some((node) => node.childNodes?.some?.((child) => child.nodeType === 3 && child.nodeValue.includes(PASSWORD))), "not on the page");
  assert.ok(![...api.items.values()].some((value) => String(value).includes(PASSWORD)), "not in the storage");
  assert.ok(!location.hash.includes(PASSWORD), "not in the address");
});

test("a reset that lands after the page was left says the password reached nobody", async () => {
  await visit();
  confirmWith(true);
  api.reply("POST /api/admin/users/u2/reset-password", 200, { password: PASSWORD });
  const gate = api.hold("POST /api/admin/users/u2/reset-password");
  click("[data-acoach-reset]");
  await settle();
  releaseCurrentScreen();
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(sheet(RESET_SHEET_ID), null, "no window over a page left");
  assert.deepEqual(toasts(), ["The password of orc_boss was reset after the page was left: reset it once more to see the new one."]);
  assert.ok(!document.querySelectorAll("*").some((node) => node.childNodes?.some?.((child) => child.nodeType === 3 && child.nodeValue.includes(PASSWORD))));
});

test("a reset whose answer is lost says to reset once more; a refused one says why", async () => {
  await visit();
  confirmWith(true);
  api.fail("POST /api/admin/users/u2/reset-password");
  click("[data-acoach-reset]");
  await settle();
  await settle();
  assert.equal(sheet(RESET_SHEET_ID), null, "no password to show");
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), t("administration.resetLost"));
  assert.deepEqual(adminCalls(), ["GET /api/admin/users/u2", "POST /api/admin/users/u2/reset-password", "GET /api/admin/users/u2"], "read again, never sent again");

  await visit();
  confirmWith(true);
  api.reply("POST /api/admin/users/u2/reset-password", 409, { error: { code: "SELF_PASSWORD_RESET", message: "No." } });
  click("[data-acoach-reset]");
  await settle();
  assert.equal(words(view.querySelector('.g-acoach__account [role="alert"]')), t("error.SELF_PASSWORD_RESET"));
  assert.equal(sheet(RESET_SHEET_ID), null);
});

// ---------------------------------------------------------------------------
// The teams and the deletes
// ---------------------------------------------------------------------------

test("a delete closed says why on a press; an open one asks, then goes to the coaches", async () => {
  await visit();
  const asked = confirmWith(true);
  await withoutTimers(async () => {
    click("[data-acoach-delete]");
    click('[data-acoach-team-delete="rt2"]');
    await settle();
  });
  assert.deepEqual(toasts(), [t("administration.block.season"), t("administration.block.friendly")]);
  assert.deepEqual(asked, [], "nothing asked");
  assert.equal(writes().length, 0, "nothing sent");

  await visit({ coach: { ...ORC_BOSS, deleteBlock: null }, teams: [] });
  const asking = confirmWith(true);
  api.reply("DELETE /api/admin/users/u2", 200, { ok: true });
  location.hash = "#/administration/users/u2";
  click("[data-acoach-delete]");
  await settle();
  await settle();
  assert.deepEqual(asking, ["Delete the coach orc_boss with every team?"]);
  assert.deepEqual(writes().map(({ key }) => key), ["DELETE /api/admin/users/u2"]);
  assert.equal(location.hash, "#/administration");

  // Declined: nothing sent, nowhere gone.
  await visit({ coach: { ...ORC_BOSS, deleteBlock: null }, teams: [] });
  confirmWith(false);
  location.hash = "#/administration/users/u2";
  click("[data-acoach-delete]");
  await settle();
  assert.equal(writes().length, 0);
  assert.equal(location.hash, "#/administration/users/u2");

  // Refused: the server's words; a lost answer that finds the coach gone goes to the coaches too.
  await visit({ coach: { ...ORC_BOSS, deleteBlock: null }, teams: [] });
  confirmWith(true);
  api.reply("DELETE /api/admin/users/u2", 409, { error: { code: "USER_IN_FRIENDLY_GAMES", message: "No." } });
  click("[data-acoach-delete]");
  await settle();
  assert.equal(words(view.querySelector('.g-acoach__teamscard [role="alert"]')), t("error.USER_IN_FRIENDLY_GAMES"));
  await visit({ coach: { ...ORC_BOSS, deleteBlock: null }, teams: [] });
  confirmWith(true);
  api.fail("DELETE /api/admin/users/u2");
  api.reply("GET /api/admin/users/u2", 404, { error: { code: "USER_NOT_FOUND", message: "User not found." } });
  location.hash = "#/administration/users/u2";
  click("[data-acoach-delete]");
  await settle();
  await settle();
  assert.equal(location.hash, "#/administration");
  assert.equal(writes().length, 1, "not sent again");
});

test("a team's delete asks, then the coach is read again; a lost answer is not sent again", async () => {
  await visit();
  const asked = confirmWith(true);
  api.reply("DELETE /api/admin/teams/rt3", 200, { ok: true, ownerId: "u2" });
  api.reply("GET /api/admin/users/u2", 200, { user: ORC_BOSS, teams: TEAMS.slice(0, 2) });
  click('[data-acoach-team-delete="rt3"]');
  await settle();
  await settle();
  assert.deepEqual(asked, ["Delete the team «Mudfoot Boyz»?"]);
  assert.deepEqual(adminCalls(), ["GET /api/admin/users/u2", "DELETE /api/admin/teams/rt3", "GET /api/admin/users/u2"]);
  assert.equal(view.querySelectorAll(".g-acoach__team").length, 2);
  assert.equal(words(view.querySelector('.g-acoach__teamscard [role="status"]')), "Team «Mudfoot Boyz» deleted");

  await visit();
  confirmWith(true);
  api.fail("DELETE /api/admin/teams/rt3");
  click('[data-acoach-team-delete="rt3"]');
  await settle();
  await settle();
  assert.deepEqual(adminCalls(), ["GET /api/admin/users/u2", "DELETE /api/admin/teams/rt3", "GET /api/admin/users/u2"]);
  assert.equal(words(view.querySelector('.g-acoach__teamscard [role="alert"]')), t("administration.mayHaveWritten"));
});

test("a new team for the coach is a draft of 600k", async () => {
  await visit();
  click("[data-acoach-team-new]");
  const dialog = sheet(TEAM_NEW_SHEET_ID);
  assert.ok(dialog.isModal);
  assert.equal(dialog.querySelector("h2").textContent, "New team");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "orc_boss · in the build: 600k");
  assert.deepEqual(dialog.querySelectorAll(".g-field__label").map(words), ["Team name"]);
  assert.ok(document.activeElement === document.querySelector("#team-new-name"), "the name takes the focus");
  // The race as in «Coach with a team»: five and «Other…».
  assert.deepEqual(dialog.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("data-coach-race")),
    ["teams/human", "teams/orc", "teams/ogre", "teams/wood-elves", "teams/skaven"]);
  assert.ok(dialog.querySelector("[data-coach-races-all]"));
  const create = () => sheet(TEAM_NEW_SHEET_ID).querySelector("[data-team-create]");
  // What is missing, said and not sent.
  assert.equal(words(create()), "Enter the team's name");
  click(create());
  assert.equal(writes().length, 0);
  type("#team-new-name", "Bog Lords");
  assert.equal(words(create()), "Choose the race");
  click("[data-coach-races-all]");
  click('[data-coach-race="teams/lizardmen"]');
  assert.equal(words(create()), "Create");
  api.reply("POST /api/admin/users/u2/teams", 201, { user: ORC_BOSS, team: { id: "rt9", name: "Bog Lords", stage: "draft" } });
  api.reply("GET /api/admin/users/u2", 200, { user: ORC_BOSS, teams: [...TEAMS, { id: "rt9", name: "Bog Lords", baseTeamSlug: "teams/lizardmen", stage: "draft", matches: 0, friendlies: 0, deleteBlock: null }] });
  const gate = api.hold("POST /api/admin/users/u2/teams");
  click(create());
  click(create());
  assert.equal(words(create()), "Creating…");
  gate.release();
  await settle();
  await settle();
  const posts = writes();
  assert.equal(posts.length, 1, "one POST");
  const { body } = posts[0];
  assert.deepEqual([body.name, body.baseTeamSlug], ["Bog Lords", "teams/lizardmen"]);
  assert.equal(body.roster.treasury, 600, "the build's 600k");
  assert.deepEqual(body.roster.players, [], "nobody hired");
  assert.equal(body.roster.teamName, "Bog Lords");
  assert.equal(Object.hasOwn(body.roster, "logoData"), false);
  assert.equal(sheet(TEAM_NEW_SHEET_ID), null, "the window goes");
  assert.equal(view.querySelectorAll(".g-acoach__team").length, 4, "the coach read again");
  assert.equal(words(view.querySelector('.g-acoach__teamscard [role="status"]')), "Team «Bog Lords» in the build");
  assert.ok(document.activeElement === view.querySelector("[data-acoach-team-new]"), "the focus back on «+ Team»");

  // A refusal stays in the window, the fields kept.
  await visit();
  click("[data-acoach-team-new]");
  type("#team-new-name", "Bog Lords");
  click('[data-coach-race="teams/orc"]');
  api.reply("POST /api/admin/users/u2/teams", 400, { error: { code: "TEAM_NAME_REQUIRED", message: "No." } });
  click(create());
  await settle();
  assert.equal(words(sheet(TEAM_NEW_SHEET_ID).querySelector('[role="alert"]')), t("error.TEAM_NAME_REQUIRED"));
  assert.equal(document.querySelector("#team-new-name").value, "Bog Lords");

  // A lost answer: the coach read again; a new team of that name is the one made.
  await visit();
  click("[data-acoach-team-new]");
  type("#team-new-name", "Bog Lords");
  click('[data-coach-race="teams/orc"]');
  api.fail("POST /api/admin/users/u2/teams");
  api.reply("GET /api/admin/users/u2", 200, { user: ORC_BOSS, teams: [...TEAMS, { id: "rt9", name: "Bog Lords", baseTeamSlug: "teams/orc", stage: "draft", matches: 0, friendlies: 0, deleteBlock: null }] });
  click(create());
  await settle();
  await settle();
  assert.equal(writes().length, 1, "not sent again");
  assert.equal(sheet(TEAM_NEW_SHEET_ID), null);
  assert.equal(words(view.querySelector('.g-acoach__teamscard [role="status"]')), "Team «Bog Lords» in the build");
  // None found: the window says it may have been written.
  await visit();
  click("[data-acoach-team-new]");
  type("#team-new-name", "Bog Lords");
  click('[data-coach-race="teams/orc"]');
  api.fail("POST /api/admin/users/u2/teams");
  click(create());
  await settle();
  await settle();
  assert.equal(words(sheet(TEAM_NEW_SHEET_ID).querySelector('[role="alert"]')), t("administration.mayHaveWritten"));
  // «Cancel» closes it, the focus back on «+ Team».
  click(sheet(TEAM_NEW_SHEET_ID).querySelector(".g-sheet__foot [data-sheet-close]"));
  assert.equal(sheet(TEAM_NEW_SHEET_ID), null);
  assert.ok(document.activeElement === view.querySelector("[data-acoach-team-new]"));
});

// ---------------------------------------------------------------------------
// The screen's life
// ---------------------------------------------------------------------------

test("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const screen = await visit();
  view.querySelector("#acoach-login").focus();
  type("#acoach-login", "orc_k");
  screen.cross(true);
  assert.ok(view.querySelector(".g-acoach--phone"));
  assert.ok(document.activeElement === view.querySelector("#acoach-login"), "the field kept");
  assert.equal(view.querySelector("#acoach-login").value, "orc_k", "and what was typed");
  view.querySelector(".g-acoach__team a").focus();
  screen.cross(false);
  assert.equal(view.querySelector(".g-acoach--phone"), null, "a desk's form");
});

test("leaving stops listening and takes the windows away", async () => {
  const screen = await visit();
  click("[data-acoach-team-new]");
  assert.ok(sheet(TEAM_NEW_SHEET_ID));
  assert.equal(screen.listening(), 1);
  releaseCurrentScreen();
  assert.equal(screen.listening(), 0);
  assert.equal(sheet(TEAM_NEW_SHEET_ID), null);
  screen.cross(true);
  assert.ok(view.querySelector(".g-acoach") && !view.querySelector(".g-acoach--phone"), "a page left is not drawn again");
  // A read that lands after the screen was left draws nothing.
  width(false);
  signIn();
  const held = api.hold("GET /api/admin/users/u2");
  const drawing = renderAdminCoach("u2");
  releaseCurrentScreen();
  view.innerHTML = "";
  held.release();
  await drawing;
  assert.equal(view.querySelector(".g-acoach"), null);
});

test("names are text", async () => {
  const coach = { ...ORC_BOSS, login: HOSTILE, telegram: HOSTILE };
  const teams = [{ ...TEAMS[0], name: HOSTILE }];
  for (const phone of [true, false]) {
    await visit({ coach, teams }, { phone });
    assertCspSafe(view);
    assert.equal(view.querySelector("img"), null);
    assert.equal(view.querySelector(".g-acoach__login").textContent, HOSTILE);
    assert.equal(view.querySelector(".g-acoach__teamname").textContent, HOSTILE);
    assert.equal(view.querySelector("#acoach-login").value, HOSTILE);
    click("[data-acoach-team-new]");
    type("#team-new-name", HOSTILE);
    assertCspSafe(sheet(TEAM_NEW_SHEET_ID));
    assert.equal(sheet(TEAM_NEW_SHEET_ID).querySelector("img"), null);
    fireEvent(sheet(TEAM_NEW_SHEET_ID), "keydown", { key: "Escape" });
  }
  const fragment = document.createElement("div");
  fragment.innerHTML = adminCoachMarkup(adminCoachModel({ user: coach, teams, viewer: ADMIN }));
  assert.equal(fragment.querySelector("img"), null);
});

test("styled; no inline style or handler", async () => {
  for (const phone of [true, false]) {
    await visit({}, { phone });
    assertCspSafe(view);
    assertStyled(view, CSS, ADMIN_CSS, "page-head.css", "segmented-control.css", "button.css", "text-field.css", "toggle.css", "callout.css");
    click("[data-acoach-team-new]");
    assertCspSafe(sheet(TEAM_NEW_SHEET_ID));
    assertStyled(sheet(TEAM_NEW_SHEET_ID), CSS, COACHES_CSS, ADMIN_CSS, "sheet.css", "button.css", "text-field.css", "callout.css");
    fireEvent(sheet(TEAM_NEW_SHEET_ID), "keydown", { key: "Escape" });
    confirmWith(true);
    api.reply("POST /api/admin/users/u2/reset-password", 200, { password: PASSWORD });
    click("[data-acoach-reset]");
    await settle();
    assertCspSafe(sheet(RESET_SHEET_ID));
    assertStyled(sheet(RESET_SHEET_ID), CSS, COACHES_CSS, ADMIN_CSS, "sheet.css", "button.css");
    click(sheet(RESET_SHEET_ID).querySelector("[data-reset-done]"));
  }
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/admin/coach.css") > at("screens/admin/coaches.css"), "after the coaches' sheet, in the order of the tasks");
  assert.equal(at("styles/administration.css"), -1, "the 2.x sheet is gone");
  assert.equal(at("styles/saved-teams.css"), -1);
});

test("the 2.x profile, its sheets and its cards are gone; the router draws the 3.0 coach", () => {
  for (const file of ["src/screens/administration/user.mjs", "src/styles/administration.css", "src/components/saved-teams.mjs", "src/styles/saved-teams.css", "test/user-profile-template.test.mjs"]) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
  const router = text("src/core/router.mjs");
  assert.match(router, /adminUserProfile: \(\{ userId \}\) => renderAdminCoach\(userId\)/);
  assert.doesNotMatch(router, /administration\/user\.mjs/);
  // The coach's public page leads an admin here by the administration's own address.
  assert.match(text("src/screens/coaches/profile.mjs"), /adminHref: admin \? adminCoachUrl\(user\) : ""/);
});

test("nothing is cut with «…»; long lines wrap; the 900/901 breakpoints only", () => {
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  for (const selector of [".g-acoach__login", ".g-acoach__line", ".g-acoach__factvalue", ".g-acoach__teamname", ".g-acoach__teamline", ".g-acoach__dangerwhy", ".g-acoach__none"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("a team's row wraps at every width: on a narrow card «Edit» and «Delete» drop under the name and never crush it", () => {
  // From 901px the grid puts the cards side by side from a main area of 700 (admin.css), so a desk's card can be ~314
  // inside: a row that never wraps leaves the name a column a few pixels wide between 997 and ~1210px.
  assert.deepEqual(valuesOf(CSS, ".g-acoach__team", "flex-wrap"), ["wrap"], "the base row wraps, not only a phone's");
  assert.deepEqual(valuesOf(CSS, ".g-acoach--phone .g-acoach__team", "flex-wrap"), [], "no second rule for a phone");
  const [flex, ...more] = valuesOf(CSS, ".g-acoach__teamtext", "flex");
  assert.equal(more.length, 0, "one flex for the name and its line, at every width");
  const [grow, shrink, basis] = flex.split(/\s+/);
  assert.equal(grow, "1", "the name takes what the line leaves it");
  assert.equal(shrink, "1");
  assert.match(basis, /^\d+px$/, "a basis in pixels, so the buttons wrap before the name is squeezed");
  const keeps = Number.parseInt(basis, 10);
  assert.ok(keeps >= 120, `the name keeps ${basis} before the buttons drop under it`);
  // Measured in the browser, Russian: «Редактировать» and «Удалить» with their 8 take 228; a desk's card of 1280 has
  // 442 inside (the frame 232, the paddings 64, two cards 20 apart, 20 each side). There the line stays one, as drawn.
  assert.ok(40 + 12 + keeps + 12 + 228 <= 442, `a card of 1280 keeps DeskAdminUser's one line with a basis of ${basis}`);
  assert.deepEqual(valuesOf(CSS, ".g-acoach--phone .g-acoach__teamtext", "flex-basis"), []);
  // A wrapped row keeps its buttons off its rule; one line stays the prototype's 64 (its padding inside the 64).
  assert.deepEqual(valuesOf(CSS, ".g-acoach__team", "padding"), ["var(--space-8) 0"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__team", "box-sizing"), ["border-box"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__teambtns", "flex-wrap"), ["wrap"], "the buttons wrap among themselves on a narrow phone");
});

test("the prototypes' measures: the coach's head, the cards, the rows of the teams, the buttons, the window of the reset", () => {
  assert.deepEqual(valuesOf(CSS, ".g-acoach__id", "gap"), ["var(--space-16)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__login", "font"), ["700 32px/1 var(--font-display)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__line", "font"), ["400 14px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__team", "min-height"), ["64px"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__team", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__tile", "width"), ["40px"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__tile", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__tile", "background"), ["var(--header)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__teamname", "font"), ["700 16px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__teamline", "font"), ["400 13px/1.35 var(--font-body)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-acoach__btn", "min-height"), ["40px"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__actions .g-btn", "min-height"), ["48px"], "«Save» and the reset: the prototype's 48 at both widths");
  assert.deepEqual(valuesOf(CSS, ".g-acoach__account .g-toggle", "min-height"), ["56px"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__dangertitle", "color"), ["var(--danger)"]);
  assert.deepEqual(valuesOf(CSS, ".g-acoach__danger", "border-top"), ["1px solid var(--line)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", "dialog.g-sheet.g-coachreset", "width"), ["min(520px, calc(100% - 32px))"]);
});

test("D2: a thumb's targets 44 and more, a desk's as the prototype draws them, 24 and more", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  assert.ok(px(valuesOf(CSS, ".g-acoach__btn", "min-height")[0]) >= 44, "«Edit», «Delete» on a phone");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-acoach__btn", "min-height")[0]) >= 24);
  assert.ok(px(valuesOf(CSS, ".g-acoach__actions .g-btn", "min-height")[0]) >= 44);
  assert.ok(px(valuesOf(CSS, ".g-acoach__teamscard .g-admin__cardhead .g-btn", "min-height")[0]) >= 44, "«+ Team» on a phone");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-acoach__teamscard .g-admin__cardhead .g-btn", "min-height")[0]) >= 24);
  assert.ok(px(valuesOf(CSS, ".g-coachreset .g-sheet__foot .g-btn", "min-height")[0]) >= 48);
});

test("readable: the coach's line, the facts, the rows, the closed delete, the danger, in every palette", () => {
  assertReadable(CSS, ".g-acoach__line", "color", ["--page", "--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__factlabel", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__factvalue", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__tile", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-acoach__teamline", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__btn", "color", ["--surface"], 4.5);
  assertReadable(CSS, '.g-acoach__btn[aria-disabled="true"]', "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-acoach__btn--delete", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__dangertitle", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__dangerwhy", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-acoach__status", "color", ["--surface"], 4.5);
});

test("every key in both dictionaries; the reasons of a closed delete by DELETE_BLOCKS", () => {
  assertDictionaryCovers("src/screens/admin/coach.mjs", "src/screens/admin/coach-sheets.mjs");
  const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(text(`src/i18n/${locale}.json`)));
  for (const block of DELETE_BLOCKS) {
    assert.ok(en[`administration.block.${block}`], `en administration.block.${block}`);
    assert.ok(ru[`administration.block.${block}`], `ru administration.block.${block}`);
  }
  const own = (dictionary) => Object.keys(dictionary).filter((key) => key.startsWith("administration."));
  assert.deepEqual(own(ru), own(en), "the same keys in the same order");
  // A number has no plural form; the words name no one by «he».
  assert.deepEqual([ru["administration.team.matches"], ru["administration.team.friendlies"]], ["матчей: {count}", "товарищеских: {count}"]);
  assert.equal(ru["administration.isAdminCaption"], "Себя снять с админа нельзя");
  assert.equal(ru["administration.resetLine"], "{login} · все сессии тренера завершены");
  assert.equal(ru["administration.teamsNote"], "Команду с историей в сезоне или товарищескими матчами удалить нельзя.");
  // The 2.x profile's words went with it.
  for (const key of ["admin.resetPasswordConfirm", "admin.manageUserHeading", "admin.generatedPasswordNote", "myTeams.openRoster"]) {
    assert.equal(en[key], undefined, key);
    assert.equal(ru[key], undefined, key);
  }
});
