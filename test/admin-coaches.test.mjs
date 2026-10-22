import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { assertContrast, assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The client takes `fetch` when it loads (helpers/fake-api.mjs): the fake one first, then the modules that ask it.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/administration", replace() {} };
const { coachesModel, coachesMarkup, renderAdminCoaches } = await import("../src/screens/admin/coaches.mjs");
const { COACH_NEW_SHEET_ID } = await import("../src/screens/admin/coach-new.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");
const { formatDay } = await import("../src/core/format.mjs");
const { adminRequest } = await import("../src/data/admin.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const CSS = "src/screens/admin/coaches.css";
const ADMIN_CSS = "src/screens/admin/admin.css";
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";
const adminCalls = () => api.calls.map(({ key }) => key).filter((key) => / \/api\/admin\//.test(key));

const TODAY = new Date().toISOString();
const ADMIN = { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: true, savedTeamCount: 2, draftTeamCount: 0, lastTeamUpdatedAt: "2026-10-14T10:00:00Z" };
const ORC_BOSS = { id: "u2", login: "orc_boss", telegram: "@orc_boss", isAdmin: false, savedTeamCount: 1, draftTeamCount: 0, lastTeamUpdatedAt: "2026-10-12T10:00:00Z" };
const LILIT = { id: "u3", login: "Lilit", telegram: "@lilit_bb", isAdmin: false, savedTeamCount: 1, draftTeamCount: 1, lastTeamUpdatedAt: TODAY };
const USERS = [ADMIN, ORC_BOSS, LILIT];
const NEWBIE = { id: "u9", login: "newbie_coach", telegram: "@newbie", isAdmin: false, savedTeamCount: 1, draftTeamCount: 1, lastTeamUpdatedAt: TODAY };
const PASSWORD = "k7Qp2xLm9wRaZt5Y";

const pairing = (id, resultStatus, away = `e-${id}b`) => ({ id, tableNumber: 1, homeEntryId: `e-${id}a`, awayEntryId: away, resultStatus });
/** Round 7 is on: one result confirmed, one awaiting its confirmation, one not played, and a bye. */
const SEASON = {
  season: { id: "s1", name: "Season 1", currentRound: 7 },
  standings: [],
  rounds: [
    { roundNumber: 6, status: "completed", pairings: [pairing("p6", "confirmed")] },
    { roundNumber: 7, status: "started", pairings: [pairing("p1", "confirmed"), pairing("p2", "awaiting_confirmation"), pairing("p3", "pending"), pairing("p4", "pending", null)] },
    { roundNumber: 8, status: "draft", pairings: [] },
  ],
};

/** The phone's media query. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); }, listening: () => listeners.size };
}

const sheet = () => document.querySelector(`dialog#${COACH_NEW_SHEET_ID}`);
const isOpen = () => sheet() !== null;
const click = (target) => fireEvent(typeof target === "string" ? document.querySelector(target) : target, "click");
const type = (selector, value) => {
  const input = document.querySelector(selector);
  input.value = value;
  fireEvent(input, "input");
};
const create = () => document.querySelector("[data-coach-create]");

/** The admin (or `user`) signed in on a page that reads the coaches and the season as given. */
function signIn({ user = ADMIN, users = USERS, season = SEASON } = {}) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.data = data;
  state.auth.currentUser = user;
  state.season = { data: null, loaded: false, loading: false, error: "" };
  api.reply("GET /api/admin/users", 200, { users });
  api.reply("GET /api/season", 200, season);
}

async function visit(options = {}, { phone = false } = {}) {
  const screen = width(phone);
  signIn(options);
  await renderAdminCoaches();
  await settle();
  return screen;
}

/** «+ Coach with a team» pressed, and the form filled but for what `skip` names. */
function fill({ login = "newbie_coach", telegram = "newbie", teamName = "Mudfoot Boyz", race = "teams/orc" } = {}) {
  click("[data-coach-new]");
  assert.ok(isOpen(), "the sheet is open");
  if (login) type("#coach-new-login", login);
  if (telegram) type("#coach-new-telegram", telegram);
  if (teamName) type("#coach-new-team", teamName);
  if (race) click(`[data-coach-race="${race}"]`);
}

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test("the model: the counts of the league, a row per coach to his page, the last change and the build, the round of a phone", () => {
  const model = coachesModel({ users: USERS, query: "", season: SEASON, phone: true });
  assert.deepEqual(model.count, { coaches: 3, teams: 4 });
  assert.equal(model.seasonName, "Season 1");
  assert.deepEqual(model.rows.map(({ id, login, telegram, isAdmin, teams, edited, draft, href }) => [id, login, telegram, isAdmin, teams, edited, draft, href]), [
    ["u1", "felstell", "@felstell", true, 2, formatDay(ADMIN.lastTeamUpdatedAt, { year: true }), false, "#/administration/users/u1"],
    ["u2", "orc_boss", "@orc_boss", false, 1, formatDay(ORC_BOSS.lastTeamUpdatedAt, { year: true }), false, "#/administration/users/u2"],
    ["u3", "Lilit", "@lilit_bb", false, 1, "today · in the build", true, "#/administration/users/u3"],
  ]);
  // The last round under way: the pairings of two sides whose result is not confirmed (a bye waits for nothing).
  assert.deepEqual(model.round, { number: 7, waiting: 2, next: 8 });
  assert.equal(coachesModel({ users: USERS, season: SEASON, phone: false }).round, null, "a desk has no round's card");
  assert.equal(coachesModel({ users: USERS, season: { ...SEASON, rounds: [SEASON.rounds[0]] }, phone: true }).round, null, "no round under way, no card");
  assert.equal(coachesModel({ users: USERS, season: null, phone: true }).round, null);
  // A coach with no team has changed none: a dash; a count the server did not send is none.
  const bare = coachesModel({ users: [{ id: "u5", login: "bare" }], season: null }).rows[0];
  assert.deepEqual([bare.telegram, bare.teams, bare.edited, bare.draft], ["", 0, "—", false]);
});

test("the search finds by login or Telegram, any case", () => {
  const found = (query) => coachesModel({ users: USERS, query }).rows.map((row) => row.login);
  assert.deepEqual(found("ORC"), ["orc_boss"]);
  assert.deepEqual(found("@lilit"), ["Lilit"]);
  assert.deepEqual(found("  lil  "), ["Lilit"], "blanks around are no part of it");
  assert.deepEqual(found("zzz"), []);
  assert.deepEqual(found(""), ["felstell", "orc_boss", "Lilit"]);
  assert.deepEqual(coachesModel({ users: USERS, query: "zzz" }).count, { coaches: 3, teams: 4 }, "the counts are the league's, whatever is searched");
});

// ---------------------------------------------------------------------------
// A desk: DeskAdminUsers.html
// ---------------------------------------------------------------------------

test("a desk's coaches: the head with its counts, the search, the table in the prototype's columns, each row to its coach", async () => {
  await visit();
  assert.equal(view.querySelector("h1").textContent, "Coaches");
  assert.match(view.querySelector(".g-pagehead").textContent, /coaches: 3 · teams: 4/);
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "coaches: 3 · teams: 4 · Season 1");
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 3);
  assert.equal(view.querySelector(".g-coaches__row a").getAttribute("href"), "#/administration/users/u1");
  assert.ok(view.querySelector(".g-coaches__row .g-status"), "the admin's chip");
  assert.equal(view.querySelector(".g-coaches__row .g-status").textContent, "admin");
  assert.equal(view.querySelectorAll(".g-coaches__row .g-status").length, 1, "only the admin has it");
  // The table's heads, and a row in their order: the coach, Telegram, the teams, the last change, «Open».
  const table = view.querySelector('[role="table"]');
  assert.deepEqual(table.querySelectorAll('[role="columnheader"]').map(words), ["Coach", "Telegram", "Teams", "Last change", "Coach's page"]);
  const cells = view.querySelectorAll(".g-coaches__row")[2].querySelectorAll('[role="cell"]');
  assert.deepEqual(cells.slice(1).map(words), ["@lilit_bb", "1", "today · in the build", "Open"]);
  assert.equal(cells[0].querySelector(".g-coaches__login").textContent, "Lilit");
  const open = cells[4].querySelector("a.g-coaches__open");
  assert.deepEqual([open.getAttribute("href"), open.getAttribute("aria-label")], ["#/administration/users/u3", "Open Lilit"]);
  assert.equal(cells[0].querySelector(".g-coach-letter--36").textContent, "L");
  // The search at the left, «+ Coach with a team» at the right; no «Import as a list» (question 4).
  const search = view.querySelector('.g-coaches__tools input[type="search"]');
  assert.equal(search.getAttribute("placeholder"), "Login or Telegram");
  const add = view.querySelector(".g-coaches__tools [data-coach-new]");
  assert.deepEqual([add.textContent, add.getAttribute("aria-haspopup")], ["+ Coach with a team", "dialog"]);
  assert.equal(view.querySelectorAll("button").length, 1, "one button: the import is not drawn");
  // The switch to the season under the head (decision 8), the coaches the current one.
  assert.equal(view.querySelector('.g-admin__switch a[aria-current="page"]').getAttribute("href"), "#/administration");
  assert.equal(view.querySelector(".g-coaches__round"), null, "the round's card is a phone's");
  assert.ok(document.activeElement === view.querySelector("h1"), "the title takes the focus");
  assert.deepEqual(api.calls.map(({ key }) => key), ["GET /api/admin/users", "GET /api/season"]);
  api.assertAnswered();
});

test("the search finds by login or Telegram, any case, and the field keeps the focus", async () => {
  await visit();
  const search = view.querySelector("#admin-coach-search");
  search.focus();
  type("#admin-coach-search", "ORC");
  assert.deepEqual(view.querySelectorAll(".g-coaches__row").map((row) => row.querySelector(".g-coaches__login").textContent), ["orc_boss"]);
  assert.ok(document.activeElement === search, "the field keeps the focus");
  type("#admin-coach-search", "@lilit");
  assert.deepEqual(view.querySelectorAll(".g-coaches__row").map((row) => row.querySelector(".g-coaches__login").textContent), ["Lilit"]);
  type("#admin-coach-search", "zzz");
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 0);
  assert.equal(view.querySelector(".g-coaches__none").textContent, "Nobody found by «zzz»");
  assert.ok(document.activeElement === search);
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "coaches: 3 · teams: 4 · Season 1", "the head counts the league");
  type("#admin-coach-search", "");
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 3);
  assert.equal(api.calls.length, 2, "a search reads nothing");
});

test("a league with no coach says so", async () => {
  for (const phone of [true, false]) {
    await visit({ users: [] }, { phone });
    assert.equal(view.querySelector(".g-coaches__none").textContent, "No coaches yet");
  }
});

// ---------------------------------------------------------------------------
// A phone: AdminMobile.html
// ---------------------------------------------------------------------------

test("a phone's administration: the two links, the round's card, the rows with their Telegram and teams", async () => {
  await visit({}, { phone: true });
  assert.equal(view.querySelector("h1").textContent, "Administration");
  assert.ok(view.querySelector(".g-pagehead").classList.contains("g-pagehead--phone"), "the title stands on a phone");
  assert.deepEqual(view.querySelectorAll(".g-admin__switch a").map((link) => [link.textContent, link.getAttribute("href")]),
    [["Coaches", "#/administration"], ["Season", "#/administration/season"]]);
  const round = view.querySelector(".g-coaches__round");
  assert.equal(round.querySelector(".g-coaches__roundtitle").textContent, "Round 7 · awaiting confirmation: 2");
  assert.equal(round.querySelector(".g-coaches__roundnote").textContent, "Round 8 can be generated once every result is confirmed.");
  assert.equal(round.classList.contains("g-coaches__round--done"), false);
  const items = view.querySelectorAll("a.g-coaches__item");
  assert.deepEqual(items.map((item) => [item.getAttribute("href"), item.querySelector(".g-coaches__itemlogin").textContent, item.querySelector(".g-coaches__itemline").textContent]), [
    ["#/administration/users/u1", "felstell", "@felstell · teams: 2"],
    ["#/administration/users/u2", "orc_boss", "@orc_boss · teams: 1"],
    ["#/administration/users/u3", "Lilit", "@lilit_bb · teams: 1"],
  ]);
  assert.equal(items[0].querySelector(".g-coach-letter--40").textContent, "F");
  assert.ok(items[0].querySelector("svg"), "AdminMobile's chevron");
  assert.equal(view.querySelector(".g-coaches__row"), null, "a desk's table is not a phone's");
  // AdminMobile's order: the round, the search, the coaches, «+ Coach with a team» the whole width.
  const order = view.querySelector(".g-coaches").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]);
  assert.deepEqual(order, ["g-coaches__round", "g-search", "g-coaches__list", "g-coaches__add"]);
  assert.ok(view.querySelector(".g-coaches__add [data-coach-new]").classList.contains("g-btn--block"));

  // Every result confirmed: the next round can be generated.
  const done = { ...SEASON, rounds: [{ roundNumber: 7, status: "started", pairings: [pairing("p1", "confirmed"), pairing("p4", "pending", null)] }] };
  await visit({ season: done }, { phone: true });
  assert.equal(view.querySelector(".g-coaches__roundtitle").textContent, "Round 7 · results confirmed");
  assert.equal(view.querySelector(".g-coaches__roundnote").textContent, "Round 8 can be generated");
  assert.ok(view.querySelector(".g-coaches__round").classList.contains("g-coaches__round--done"));
  // A season the page loaded before (the round's results not confirmed then) is read anew: the card says how it stands now.
  width(true);
  signIn({ season: done });
  state.season = { data: SEASON, loaded: true, loading: false, error: "" };
  await renderAdminCoaches();
  await settle();
  assert.ok(api.calls.some(({ key }) => key === "GET /api/season"), "read again on the visit");
  assert.equal(view.querySelector(".g-coaches__roundtitle").textContent, "Round 7 · results confirmed");
  // No round under way: no card.
  await visit({ season: { ...SEASON, rounds: [] } }, { phone: true });
  assert.equal(view.querySelector(".g-coaches__round"), null);
  // A coach with no Telegram: the teams alone.
  await visit({ users: [{ ...ORC_BOSS, telegram: "" }] }, { phone: true });
  assert.equal(view.querySelector(".g-coaches__itemline").textContent, "teams: 1");
});

test("a coach who is no admin is told the section is the admin's, and nothing is read", async () => {
  for (const phone of [true, false]) {
    await visit({ user: { id: "u2", login: "orc_boss", isAdmin: false } }, { phone });
    assert.equal(view.querySelector("h1").textContent, "Administration");
    assert.equal(view.querySelector(".g-callout__title").textContent, t("administration.only"));
    assert.equal(view.querySelector(".g-coaches"), null);
    assert.deepEqual(adminCalls(), []);
    assert.deepEqual(api.calls, [], "nothing at all");
  }
});

test("a read that fails says why and reads again on «Try again»", async () => {
  width(false);
  signIn();
  api.reply("GET /api/admin/users", 500, { error: { code: "SERVER_ERROR", message: "Boom" } });
  await renderAdminCoaches();
  await settle();
  assert.match(view.querySelector('[role="alert"]').textContent, /^Could not read: /);
  assert.equal(view.querySelector(".g-coaches__row"), null);
  api.reply("GET /api/admin/users", 200, { users: USERS });
  click(view.querySelector("[data-coaches-again]"));
  await settle();
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 3);
  assert.equal(view.querySelector('[role="alert"]'), null);
  // While it is read, the screen says so.
  signIn();
  const held = api.hold("GET /api/admin/users");
  const drawing = renderAdminCoaches();
  await settle();
  assert.equal(view.querySelector('.g-coaches [role="status"]').textContent, "Reading…");
  held.release();
  await drawing;
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 3);
});

// ---------------------------------------------------------------------------
// «Coach with a team»: DeskAdminCoachNew.html
// ---------------------------------------------------------------------------

test("the sheet: its fields, five races and «Other…» that opens every race, the season's entry on, the rule under it", async () => {
  await visit();
  click("[data-coach-new]");
  const dialog = sheet();
  assert.ok(dialog.isModal, "a modal window");
  assert.ok(dialog.classList.contains("g-sheet--wide") && dialog.classList.contains("g-coachnew"));
  assert.equal(dialog.querySelector("h2").textContent, "Coach with a team");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "The account, the team and the season's entry at one stroke");
  assert.deepEqual(dialog.querySelectorAll(".g-field__label").map(words), ["Login", "Telegram", "Team name"]);
  assert.ok(document.activeElement === document.querySelector("#coach-new-login"), "the login takes the focus");
  // DeskAdminCoachNew's five races and «Other…».
  const group = dialog.querySelector('[role="radiogroup"]');
  assert.equal(group.getAttribute("aria-label"), "Race");
  assert.deepEqual(group.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("data-coach-race")),
    ["teams/human", "teams/orc", "teams/ogre", "teams/wood-elves", "teams/skaven"]);
  assert.deepEqual(group.querySelectorAll('[role="radio"]').map(words), ["Human", "Orc", "Ogre", "Wood Elves", "Skaven"]);
  assert.deepEqual(group.querySelectorAll('[role="radio"]').map((radio) => radio.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1"]);
  const other = group.querySelector("[data-coach-races-all]");
  assert.deepEqual([other.textContent, other.getAttribute("aria-expanded")], ["Other…", "false"]);
  click(other);
  const all = sheet().querySelectorAll('[role="radio"]');
  assert.equal(all.length, data.teams.length, "every race of the league");
  assert.deepEqual(all.map(words), data.teams.map((race) => race.title).sort((one, other2) => one.localeCompare(other2)), "by their names");
  assert.equal(sheet().querySelector("[data-coach-races-all]"), null);
  assert.ok(document.activeElement === all[0], "the focus on the first race of the list");
  click('[data-coach-race="teams/amazon"]');
  assert.equal(sheet().querySelector('[data-coach-race="teams/amazon"]').getAttribute("aria-checked"), "true");
  // The season's entry: on, with the season's name.
  const toggle = dialog.querySelector('[role="switch"]');
  assert.equal(toggle.getAttribute("aria-checked"), "true");
  assert.deepEqual([toggle.querySelector(".g-toggle__label").textContent, toggle.querySelector(".g-toggle__caption").textContent],
    ["Enter the current season now", "Makes the team an entrant of Season 1"]);
  assert.equal(dialog.querySelector(".g-coachnew .g-admin__note").textContent,
    "The team starts in its build: 600k; its roster is put together on the team's pages; it goes into the season from «Season → Entries».");
  // The foot: «Cancel» and «Create»; «Cancel» closes, the focus back on the button that opened it.
  assert.deepEqual(dialog.querySelectorAll(".g-sheet__foot button").map(words), ["Cancel", "Enter a login"]);
  click(dialog.querySelector(".g-sheet__foot [data-sheet-close]"));
  assert.equal(isOpen(), false);
  assert.ok(document.activeElement === view.querySelector("[data-coach-new]"));
  assert.deepEqual(adminCalls(), ["GET /api/admin/users"], "nothing sent");
});

test("a coach with a team: the button says what is missing, then sends once; the password is shown once with its copy", async () => {
  await visit();
  click("[data-coach-new]");
  click(create());
  click(create());
  assert.equal(create().textContent, "Enter a login");
  assert.equal(create().getAttribute("aria-disabled"), "true");
  assert.ok(document.activeElement === document.querySelector("#coach-new-login"), "a press puts the coach where the form wants him");
  assert.deepEqual(adminCalls(), ["GET /api/admin/users"], "no request");
  // What is missing, in the order of the form.
  type("#coach-new-login", "ab");
  assert.equal(create().textContent, "A login of 3 characters or more");
  type("#coach-new-login", "newbie_coach");
  assert.equal(create().textContent, "Enter the Telegram");
  type("#coach-new-telegram", "@new");
  assert.equal(create().textContent, "Telegram: @ and 5 characters or more");
  type("#coach-new-telegram", "newbie");
  assert.equal(create().textContent, "Enter the team's name");
  type("#coach-new-team", "Mudfoot Boyz");
  assert.equal(create().textContent, "Choose the race");
  click(create());
  assert.ok(document.activeElement === document.querySelector('[data-coach-race="teams/human"]'), "the race group takes the focus");
  click('[data-coach-race="teams/orc"]');
  assert.equal(create().textContent, "Create");
  assert.equal(create().getAttribute("aria-disabled"), null);

  // Two presses in a row: one POST, with what the form holds.
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz", stage: "draft" }, password: PASSWORD, entryId: "e9" });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  const gate = api.hold("POST /api/admin/coaches");
  click(create());
  click(create());
  assert.equal(create().getAttribute("aria-busy"), "true");
  assert.equal(create().textContent, "Creating…");
  assert.equal(document.querySelector("#coach-new-login").hasAttribute("readonly"), true, "the form holds still while it is sent");
  click('[data-coach-race="teams/human"]');
  assert.equal(sheet().querySelector('[data-coach-race="teams/orc"]').getAttribute("aria-checked"), "true", "the races closed meanwhile");
  assert.equal(sheet().querySelector('[role="switch"]').hasAttribute("disabled"), true);
  gate.release();
  await settle();
  const posts = api.calls.filter(({ key }) => key === "POST /api/admin/coaches");
  assert.equal(posts.length, 1);
  assert.deepEqual(posts[0].body, { login: "newbie_coach", telegram: "@newbie", teamName: "Mudfoot Boyz", baseTeamSlug: "teams/orc", enter: true });
  // The sheet turns to the result: the coach in the league, the password once, «Copy».
  assert.equal(sheet().querySelector("h2").textContent, "Coach in the league");
  assert.equal(sheet().querySelector(".g-sheet__sub").textContent, "newbie_coach · team «Mudfoot Boyz» in the build");
  assert.equal(sheet().querySelector(".g-coachnew__password").textContent, PASSWORD);
  assert.equal(sheet().querySelector(".g-admin__note").textContent,
    "Send the password to the coach on Telegram: it is changed in «Settings → Change password». The password is shown once.");
  const open = sheet().querySelector("a[data-coach-open]");
  assert.deepEqual([open.textContent, open.getAttribute("href")], ["Open the coach", "#/administration/users/u9"]);
  assert.ok(document.activeElement === sheet().querySelector("[data-coach-copy]"), "«Copy» takes the focus");
  // The list is read again, with the new coach in it.
  assert.deepEqual(adminCalls(), ["GET /api/admin/users", "POST /api/admin/coaches", "GET /api/admin/users"]);
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 4);

  // «Copy»: the clipboard has it.
  const copied = [];
  Object.defineProperty(globalThis.navigator, "clipboard", { value: { writeText: async (value) => { copied.push(value); } }, configurable: true });
  click("[data-coach-copy]");
  await settle();
  assert.deepEqual(copied, [PASSWORD]);
  assert.equal(sheet().querySelector(".g-coachnew__copied").textContent, "Password copied");
  // No clipboard: the password selected, and the words to copy it by hand.
  Object.defineProperty(globalThis.navigator, "clipboard", { value: undefined, configurable: true });
  const selected = [];
  globalThis.getSelection = () => ({ selectAllChildren: (node) => selected.push(node) });
  try {
    click("[data-coach-copy]");
    await settle();
  } finally {
    delete globalThis.getSelection;
  }
  assert.deepEqual(selected, [sheet().querySelector(".g-coachnew__password")]);
  assert.equal(sheet().querySelector(".g-coachnew__copied").textContent, t("administration.copyByHand"));

  // «Done»: the password goes with the sheet, nowhere kept.
  click(sheet().querySelector("[data-coach-done]"));
  assert.equal(isOpen(), false);
  assert.ok(!document.querySelectorAll("*").some((node) => node.childNodes?.some?.((child) => child.nodeType === 3 && child.nodeValue.includes(PASSWORD))), "not on the page");
  assert.ok(![...api.items.values()].some((value) => String(value).includes(PASSWORD)), "not in the storage");
  assert.ok(!location.hash.includes(PASSWORD), "not in the address");
  assert.ok(document.activeElement === view.querySelector("[data-coach-new]"), "the focus back where the sheet was opened");
  click("[data-coach-new]");
  assert.equal(sheet().querySelector(".g-coachnew__password"), null, "a new sheet is a new form");
  assert.equal(document.querySelector("#coach-new-login").value, "");
});

test("the window speaks from inside itself: what «Create» still wants, the news of the coach made; its empty regions stay on the page", async () => {
  await visit();
  click("[data-coach-new]");
  const said = () => sheet().querySelector("[data-window-said]");
  assert.equal(said().getAttribute("role"), "status");
  assert.ok(sheet().contains(said()), "in the window: under a modal the page's own live region is inert");
  click(create());
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(said().textContent, "Enter a login");
  type("#coach-new-login", "newbie_coach");
  type("#coach-new-telegram", "newbie");
  type("#coach-new-team", "Mudfoot Boyz");
  click('[data-coach-race="teams/orc"]');
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz", stage: "draft" }, password: PASSWORD, entryId: "e9" });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  click(create());
  await settle();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(said().textContent, "Coach in the league. newbie_coach · team «Mudfoot Boyz» in the build");
  // An empty alert or copy line is not hidden away (a region a reader has not met is not heard): the gap is taken back.
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__alert:empty", "display"), []);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__alert:empty", "margin-bottom"), ["calc(-1 * var(--space-14))"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__copied:empty", "display"), []);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew .g-sheet__body", "gap"), ["var(--space-14)"]);
});

test("the season's entry off sends enter: false; Enter in a field is «Create»", async () => {
  await visit();
  fill();
  click('[role="switch"]');
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz" }, password: PASSWORD, entryId: null });
  fireEvent(document.querySelector("#coach-new-team"), "keydown", { key: "Enter" });
  await settle();
  const post = api.calls.find(({ key }) => key === "POST /api/admin/coaches");
  assert.equal(post.body.enter, false);
  assert.equal(sheet().querySelector(".g-coachnew__password").textContent, PASSWORD);
});

test("a press while the coach is being created sends nothing more; a lost answer finds the coach by the login and offers the reset", async () => {
  await visit();
  fill();
  api.fail("POST /api/admin/coaches");
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  const gate = api.hold("POST /api/admin/coaches");
  click(create());
  click(create());
  fireEvent(document.querySelector("#coach-new-login"), "keydown", { key: "Enter" });
  gate.release();
  await settle();
  assert.deepEqual(adminCalls(), ["GET /api/admin/users", "POST /api/admin/coaches", "GET /api/admin/users"], "read again, never sent again");
  const alert = sheet().querySelector('[role="alert"]');
  const link = alert.querySelector("a");
  assert.deepEqual([link.getAttribute("href"), words(link.querySelector(".g-callout__title"))], ["#/administration/users/u9", t("administration.createdNoPassword")]);
  assert.equal(sheet().querySelector(".g-coachnew__password"), null, "no password to show");
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 4, "the list as the server holds it");

  // An answer that has no password is no better than none: the same way to the coach's page.
  await visit();
  fill();
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9" } });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  click(create());
  await settle();
  assert.equal(sheet().querySelector('[role="alert"] a').getAttribute("href"), "#/administration/users/u9");
  assert.equal(sheet().querySelector(".g-coachnew__password"), null);

  // Not found: the words that it may have been written; the fields kept.
  await visit();
  fill();
  api.fail("POST /api/admin/coaches");
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("administration.mayHaveWritten"));
  assert.equal(sheet().querySelector('[role="alert"] a'), null);
  assert.equal(document.querySelector("#coach-new-login").value, "newbie_coach");
  assert.equal(api.calls.filter(({ key }) => key === "POST /api/admin/coaches").length, 1);

  // A coach of that login was in the league before: finding him proves nothing, and no reset is offered for him.
  await visit();
  fill({ login: "orc_boss" });
  api.fail("POST /api/admin/coaches");
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("administration.mayHaveWritten"));
  assert.equal(sheet().querySelector('[role="alert"] a'), null);
});

test("after a lost answer, a press again of the same login that the server refuses as taken leads to the coach made, not to a refusal", async () => {
  await visit();
  fill();
  // The first try: no answer, and the coaches read again do not have the coach yet.
  api.fail("POST /api/admin/coaches");
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("administration.mayHaveWritten"));
  // Pressed again: the server says the login is taken — the first try's coach. The window leads to his page and the reset.
  api.reply("POST /api/admin/coaches", 409, { error: { code: "LOGIN_ALREADY_REGISTERED", message: "Taken." } });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  click(create());
  await settle();
  const link = sheet().querySelector('[role="alert"] a');
  assert.deepEqual([link?.getAttribute("href"), words(link?.querySelector(".g-callout__title"))], ["#/administration/users/u9", t("administration.createdNoPassword")]);
  assert.equal(api.calls.filter(({ key }) => key === "POST /api/admin/coaches").length, 2);
  // Another login is another try: its refusal is the server's words.
  type("#coach-new-login", "orc_boss");
  api.reply("POST /api/admin/coaches", 409, { error: { code: "LOGIN_ALREADY_REGISTERED", message: "Taken." } });
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("error.LOGIN_ALREADY_REGISTERED"));
});

test("a press while another write of the administration is on its way sends nothing and says why", async () => {
  await visit();
  fill();
  api.reply("DELETE /api/admin/teams/t1", 200, { ok: true });
  const gate = api.hold("DELETE /api/admin/teams/t1");
  const other = adminRequest("/api/admin/teams/t1", { method: "DELETE" });
  try {
    click(create());
    await settle();
    assert.equal(words(sheet().querySelector('[role="alert"]')), t("administration.writing"));
    assert.equal(api.calls.filter(({ key }) => key === "POST /api/admin/coaches").length, 0, "nothing sent");
    assert.equal(create().textContent, "Create", "free to press again");
  } finally {
    gate.release();
    await other;
  }
});

test("«Open the coach» with a modifier opens his page elsewhere: the window, and its password, stay", async () => {
  await visit();
  fill();
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz", stage: "draft" }, password: PASSWORD, entryId: "e9" });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  click(create());
  await settle();
  for (const init of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }]) {
    fireEvent(sheet().querySelector("a[data-coach-open]"), "click", init);
    assert.ok(isOpen(), JSON.stringify(init));
    assert.equal(sheet().querySelector(".g-coachnew__password").textContent, PASSWORD);
  }
  click(sheet().querySelector("a[data-coach-open]"));
  assert.equal(isOpen(), false, "a plain press leaves the page, and the window goes first");
});

test("a refusal stays in the sheet, the fields kept", async () => {
  await visit();
  fill({ login: "orc_boss" });
  api.reply("POST /api/admin/coaches", 409, { error: { code: "LOGIN_ALREADY_REGISTERED", message: "Taken." } });
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("error.LOGIN_ALREADY_REGISTERED"));
  assert.equal(document.querySelector("#coach-new-login").value, "orc_boss");
  assert.equal(sheet().querySelector('[data-coach-race="teams/orc"]').getAttribute("aria-checked"), "true");
  assert.equal(create().textContent, "Create", "free to try again");
  assert.deepEqual(adminCalls(), ["GET /api/admin/users", "POST /api/admin/coaches"], "a refusal reads nothing");
  // Typing takes back what was said.
  type("#coach-new-login", "orc_boss_2");
  assert.equal(words(sheet().querySelector('[role="alert"]')), "");
  // Another tab's token: nothing sent, the words why.
  api.items.set("gata-league-auth-token", "another");
  click(create());
  await settle();
  assert.equal(words(sheet().querySelector('[role="alert"]')), t("auth.otherTab"));
  assert.equal(api.calls.filter(({ key }) => key === "POST /api/admin/coaches").length, 1);
});

test("a sheet closed while the coach was created says the password did not reach the page", async () => {
  await visit();
  fill();
  api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz" }, password: PASSWORD, entryId: "e9" });
  api.reply("GET /api/admin/users", 200, { users: [...USERS, NEWBIE] });
  const gate = api.hold("POST /api/admin/coaches");
  click(create());
  fireEvent(sheet(), "keydown", { key: "Escape" });
  assert.equal(isOpen(), false);
  // The toast keeps a timer the fake page cannot end.
  await withoutTimers(async () => {
    gate.release();
    await settle();
  });
  assert.equal(isOpen(), false, "not opened again");
  assert.deepEqual(document.querySelectorAll("output").map((node) => node.textContent), [t("administration.createdNoPassword")]);
  assert.ok(!document.querySelectorAll("*").some((node) => node.childNodes?.some?.((child) => child.nodeType === 3 && child.nodeValue.includes(PASSWORD))));
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 4);
});

// ---------------------------------------------------------------------------
// The screen's life
// ---------------------------------------------------------------------------

test("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const screen = await visit();
  view.querySelector(".g-coaches__open").focus();
  screen.cross(true);
  assert.ok(view.querySelector(".g-coaches--phone"));
  assert.ok(document.activeElement === view.querySelector("h1"));
  view.querySelector("#admin-coach-search").focus();
  type("#admin-coach-search", "orc");
  screen.cross(false);
  assert.ok(view.querySelector(".g-coaches--desk"));
  assert.ok(document.activeElement === view.querySelector("#admin-coach-search"), "the search kept");
  assert.equal(view.querySelector("#admin-coach-search").value, "orc");
  assert.equal(view.querySelectorAll(".g-coaches__row").length, 1, "and what it found");
});

test("leaving stops listening and takes the sheet away", async () => {
  const screen = await visit();
  click("[data-coach-new]");
  type("#coach-new-login", "newbie_coach");
  assert.equal(screen.listening(), 1);
  releaseCurrentScreen();
  assert.equal(screen.listening(), 0);
  assert.equal(isOpen(), false);
  screen.cross(true);
  assert.ok(view.querySelector(".g-coaches--desk"), "a page left is not drawn again");
  // A read that lands after the screen was left draws nothing.
  width(false);
  signIn();
  const held = api.hold("GET /api/admin/users");
  const drawing = renderAdminCoaches();
  releaseCurrentScreen();
  view.innerHTML = "";
  held.release();
  await drawing;
  assert.equal(view.querySelector(".g-coaches"), null);
});

test("names are text", async () => {
  const hostile = { ...ORC_BOSS, login: HOSTILE, telegram: HOSTILE };
  for (const phone of [true, false]) {
    await visit({ users: [hostile], season: { ...SEASON, season: { ...SEASON.season, name: HOSTILE } } }, { phone });
    assertCspSafe(view);
    assert.equal(view.querySelector("img"), null);
    assert.equal(view.querySelector(phone ? ".g-coaches__itemlogin" : ".g-coaches__login").textContent, HOSTILE);
    click("[data-coach-new]");
    type("#coach-new-login", HOSTILE);
    type("#coach-new-team", HOSTILE);
    assertCspSafe(sheet());
    assert.equal(document.querySelector("#coach-new-login").value, HOSTILE);
    assert.equal(sheet().querySelector("img"), null);
    fireEvent(sheet(), "keydown", { key: "Escape" });
  }
  const model = coachesModel({ users: [hostile], query: HOSTILE });
  const fragment = document.createElement("div");
  fragment.innerHTML = coachesMarkup({ ...model, rows: [] });
  assert.equal(fragment.querySelector(".g-coaches__none").textContent, `Nobody found by «${HOSTILE}»`);
});

test("styled; no inline style or handler", async () => {
  for (const phone of [true, false]) {
    await visit({}, { phone });
    assertCspSafe(view);
    assertStyled(view, CSS, ADMIN_CSS, "page-head.css", "segmented-control.css", "search-field.css", "button.css", "status-chip.css", "coach-letter.css");
    click("[data-coach-new]");
    assertCspSafe(sheet());
    assertStyled(sheet(), CSS, ADMIN_CSS, "sheet.css", "button.css", "text-field.css", "toggle.css", "callout.css");
    fill({ race: "teams/orc" });
    api.reply("POST /api/admin/coaches", 201, { user: NEWBIE, team: { id: "t9", name: "Mudfoot Boyz" }, password: PASSWORD, entryId: "e9" });
    click(create());
    await settle();
    assertCspSafe(sheet());
    assertStyled(sheet(), CSS, ADMIN_CSS, "sheet.css", "button.css", "text-field.css");
    click(sheet().querySelector("[data-coach-done]"));
  }
  const styles = text("src/styles.css");
  const at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/admin/coaches.css") > at("screens/admin/admin.css"), "after the frame's sheet, in the order of the tasks");
});

test("nothing is cut with «…»; long lines wrap; the 900/901 breakpoints only", () => {
  assert.doesNotMatch(text(CSS), /ellipsis/);
  assertBreakpoints(CSS);
  // `nowrap` only on the admin's chip (decision: the chip and the numbers).
  assert.deepEqual([...text(CSS).replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{[^{}]*white-space:\s*nowrap/g)].map(([, selector]) => selector.trim()), [".g-coaches__who .g-status"]);
  for (const selector of [".g-coaches__login", ".g-coaches__tg", ".g-coaches__edited", ".g-coaches__itemlogin", ".g-coaches__itemline", ".g-coachnew__password", ".g-coachnew__race", ".g-coaches__none"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").includes("anywhere"), `${selector} wraps`);
  }
});

test("the prototypes' measures: the table's columns and heads, the rows, «Open», the search, the chip, the round's card, the window", () => {
  const columns = "minmax(0, 2fr) minmax(0, 1.4fr) 90px minmax(0, 1.4fr) 120px";
  assert.deepEqual(valuesOf(CSS, ".g-coaches__head", "grid-template-columns"), [columns]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__row", "grid-template-columns"), [columns]);
  // The heads in capitals, said so (L21).
  assert.deepEqual(valuesOf(CSS, ".g-coaches__head", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__head", "letter-spacing"), ["0.04em"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__head", "border-bottom"), ["1px solid var(--control-border)"], "the prototype's #C9D3CE under the head");
  assert.deepEqual(valuesOf(CSS, ".g-coaches__row", "min-height"), ["60px"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-coaches__open", "min-height"), ["36px"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__open", "box-shadow"), ["inset 0 0 0 1px var(--control-border)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__open", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-coaches__tools .g-search", "width"), ["320px"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches .g-search__input", "height"), ["44px"]);
  // A desk's words are the prototype's 15px; a phone's the shared 16px (iPhone's Safari zooms into a smaller field), with
  // AdminMobile's field: no magnifier, 14 in.
  assert.deepEqual(valuesOf(CSS, ".g-coaches .g-search__input", "font"), ["400 16px/1.2 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches--desk .g-search__input", "font-size"), ["15px"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches--phone .g-search__input", "font-size"), []);
  assert.deepEqual(valuesOf(CSS, ".g-coaches--phone .g-search > .g-icon", "display"), ["none"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches--phone .g-search__input", "padding"), ["0 var(--space-14)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__who .g-status", "height"), ["26px"]);
  // AdminMobile's round: the warning's tint in the card's ring, 10 between its lines (L21).
  assert.deepEqual(valuesOf(CSS, ".g-coaches__round", "background"), ["var(--warn-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__round", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__round", "gap"), ["var(--space-10)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coaches__item", "min-height"), ["60px"]);
  // DeskAdminCoachNew: the window of 720, «Race» in capitals 12/700/0.06em, three races to a row (two on a phone).
  assert.deepEqual(inMedia(CSS, "min-width: 901px", "dialog.g-sheet.g-coachnew", "width"), ["min(720px, calc(100% - 32px))"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__label", "font"), ["700 12px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__label", "letter-spacing"), ["0.06em"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__label", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__races", "grid-template-columns").slice(0, 1), ["repeat(3, minmax(0, 1fr))"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-coachnew__races", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(CSS, '.g-coachnew__race[aria-checked="true"]', "box-shadow"), ["var(--ring-selected)"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__password", "font"), ["700 22px/1.3 ui-monospace, Menlo, monospace"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__password", "letter-spacing"), ["0.04em"]);
  assert.deepEqual(valuesOf(CSS, ".g-coachnew__secret", "background"), ["var(--surface-2)"]);
});

test("D2: a thumb's targets 44 and more, a desk's as the prototype draws them, 24 and more", () => {
  const px = (value) => Number(String(value).replace("px", ""));
  assert.ok(px(valuesOf(CSS, ".g-coaches__open", "min-height")[0]) >= 44, "«Open» on a phone");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-coaches__open", "min-height")[0]) >= 24);
  assert.ok(px(valuesOf(CSS, ".g-coaches__item", "min-height")[0]) >= 44, "a phone's row");
  assert.ok(px(valuesOf(CSS, ".g-coaches .g-search__input", "height")[0]) >= 44);
  assert.ok(px(valuesOf(CSS, ".g-coaches .g-btn", "min-height")[0]) >= 48, "«+ Coach with a team»: the prototype's 48");
  assert.ok(px(valuesOf(CSS, ".g-coachnew__race", "min-height")[0]) >= 44);
  assert.ok(px(valuesOf(CSS, ".g-coachnew .g-sheet__foot .g-btn", "min-height")[0]) >= 48);
  assert.ok(px(valuesOf(CSS, ".g-coachnew__secret .g-btn", "min-height")[0]) >= 44, "«Copy» on a phone");
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-coachnew__secret .g-btn", "min-height")[0]) >= 40);
  assert.ok(px(valuesOf(CSS, ".g-coachnew .g-toggle", "min-height")[0]) >= 44);
});

test("readable: the heads, the rows, the chip, the round's card, the races, the password, in every palette", () => {
  assertReadable(CSS, ".g-coaches__head", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coaches__tg", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coaches__edited", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coaches__open", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coaches__itemline", "color", ["--surface", "--page"], 4.5);
  assertReadable(CSS, ".g-coaches__none", "color", ["--surface", "--page"], 4.5);
  assertContrast("--on-accent-tint", ["--accent-tint"], 4.5, { what: "the admin's chip" });
  assertReadable(CSS, ".g-coaches__round", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-coaches__roundnote", "color", ["--warn-tint", "--surface"], 4.5);
  assertReadable(CSS, ".g-coachnew__race", "color", ["--surface", "--accent-tint-soft"], 4.5);
  assertReadable(CSS, ".g-coachnew__label", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coachnew__password", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-coachnew__copied", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-coaches .g-btn", "color", ["--surface"], 4.5);
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/admin/coaches.mjs", "src/screens/admin/coach-new.mjs");
  const [en, ru] = ["en", "ru"].map((locale) => JSON.parse(text(`src/i18n/${locale}.json`)));
  const own = (dictionary) => Object.keys(dictionary).filter((key) => key.startsWith("administration."));
  assert.deepEqual(own(ru), own(en), "the same keys in the same order");
  // A number has no plural form (decision 25 of stage 05).
  assert.deepEqual([en["administration.count"], ru["administration.count"]], ["coaches: {coaches} · teams: {teams}", "тренеров: {coaches} · команд: {teams}"]);
  assert.deepEqual([ru["administration.round.waiting"], ru["administration.inDraft"]], ["Тур {round} · ждут подтверждения: {count}", "{date} · в наборе"]);
  assert.equal(ru["administration.createdNoPassword"], "Тренер в лиге, но пароль не дошёл: сбросьте его на странице тренера");
  assert.equal(ru["administration.coachNew.title"], "Тренер с командой");
});
