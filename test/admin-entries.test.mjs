import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

// The API is installed before anything that asks it is imported: the client takes `fetch` when it loads.
const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/administration/season/entries", replace() {} };
// confirmAction asks the browser's own question where there is no <dialog> to build one: the answer is the test's.
const asked = [];
let answer = true;
globalThis.confirm = (message) => {
  asked.push(message);
  return answer;
};

const { renderAdminSeason } = await import("../src/screens/admin/season.mjs");
const { ENTRY_SHEET, entriesModel, placesFrom } = await import("../src/screens/admin/season-entries.mjs");
const { startingBudget } = await import("../src/domain/league-rules.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { pendingScreenCleanupCount, releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let turn = 0; turn < 12; turn += 1) await settle();
};
const CSS = "src/screens/admin/season.css";
const TOKEN = "gata-league-auth-token";

const ADMIN = { id: "u1", login: "admin", isAdmin: true };
const COACH = { id: "u2", login: "orc_boss", isAdmin: false };
// DeskAdminEntries.html's eight: the four of the prototype and four more; Mudfoot Boyz is still in its build.
const TEAMS = [
  ["e1", "u2", "orc_boss", "Grimtusk Raiders"], ["e2", "u3", "thalion", "Silverbrook Rangers"], ["e3", "u4", "felstell", "Ashgrove Wardens"],
  ["e4", "u5", "cinder", "Cinderpeak Ash"], ["e5", "u6", "dusk", "Duskspire Knives"], ["e6", "u7", "gnaw", "Ratwharf Gnawers"],
  ["e7", "u8", "newbie_coach", "Mudfoot Boyz"], ["e8", "u9", "teeth", "Iron Teeth"],
];
const entry = ([id, userId, login, name], over = {}) => ({
  id, seasonId: "s1", withdrawnAt: null, user: { id: userId, login, isAdmin: false }, team: { id: `t-${id}`, name, baseTeamSlug: "teams/orc" }, ...over,
});
const ENTRIES = TEAMS.map((row) => entry(row));
// Old Guard left the season; its coach has no other team in it.
const GONE = entry(["h1", "u11", "veteran", "Old Guard"], { withdrawnAt: "2026-10-10T10:00:00Z" });

/** A team as the admin's block of `/api/season` sends it (`publicAdminSavedTeamSlim`, with stage 12's `stage` and `treasury`). */
const saved = (id, name, [ownerId, login], stage = "active", treasury = 40) => ({
  id, name, baseTeamSlug: "teams/orc", logoData: null, roster: {}, stage, treasury, owner: { id: ownerId, login, telegram: "", isAdmin: false },
});
const SAVED = [
  ...TEAMS.map(([id, userId, login, name]) => saved(`t-${id}`, name, [userId, login], id === "e7" ? "draft" : "active", id === "e7" ? 150 : 40)),
  // orc_boss's second team: the coach is in the season with another one, so it is no candidate.
  saved("t-x2", "Black Orc Second", ["u2", "orc_boss"], "draft", 600),
  saved("t-x1", "Black Orcs", ["u10", "lilit"], "draft", 600),
  saved("t-h1", "Old Guard", ["u11", "veteran"], "active", 20),
];
const seasonWith = ({ entries = ENTRIES, gone = [GONE], savedTeams = SAVED, places = 4 } = {}) => ({
  season: { id: "s1", name: "Season 1", status: "active", currentRound: 7, playoffPlaces: places }, entries, historicalEntries: gone, standings: [], rounds: [],
  myEntry: null, currentFixture: null, myTeams: [], admin: { users: [ADMIN], savedTeams },
});
const SEASON = seasonWith();

/** The phone's media query, and the width crossing 900px. */
function width(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return (next) => {
    media.matches = next;
    listeners.forEach((listener) => listener());
  };
}

function signIn(user = ADMIN) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = user;
  state.season = { data: null, loaded: false, loading: false, error: "" };
}

/** The admin on the season's entries, the season read. */
async function visit({ season = SEASON, phone = false, user = ADMIN } = {}) {
  const cross = width(phone);
  signIn(user);
  api.reply("GET /api/season", 200, season);
  await renderAdminSeason("entries");
  await flush();
  return cross;
}

const keys = () => api.calls.map(({ key }) => key);
const writes = () => api.calls.filter(({ key }) => !key.startsWith("GET "));
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const words = (node) => node?.textContent.replace(/\s+/g, " ").trim() ?? "";
const rowOf = (id) => view.querySelector(`.g-adminentries__row[data-key="entry-${id}"]`);
const rows = () => view.querySelectorAll(".g-adminentries .g-adminentries__row");
const sheet = () => view.querySelector(`dialog#${ENTRY_SHEET}`);
const field = () => view.querySelector("#admin-playoff-places");
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
/** Type into the playoff places and send the form, as Enter or «Save» does. */
const savePlaces = async (value) => {
  field().value = value;
  fireEvent(field(), "input");
  fireEvent(view.querySelector("form[data-entries-places]"), "submit");
  await flush();
};
/** A test with toasts, whose timers a fake page cannot end. */
const it = (name, body) => test(name, () => withoutTimers(body));

// ---------------------------------------------------------------------------
// The model
// ---------------------------------------------------------------------------

test("the model: the places, each entry's stage and what a build has spent, the withdrawn, the teams that may enter", () => {
  const model = entriesModel(SEASON);
  assert.equal(model.places, 4);
  assert.equal(model.entries.length, 8);
  const pick = ({ id, team, coach, stage, spent, href }) => ({ id, team, coach, stage, spent, href });
  assert.deepEqual(pick(model.entries[6]), { id: "e7", team: "Mudfoot Boyz", coach: "newbie_coach", stage: "draft", spent: startingBudget - 150,
    href: "#/administration/users/u8/teams/t-e7/edit" });
  assert.deepEqual(pick(model.entries[0]), { id: "e1", team: "Grimtusk Raiders", coach: "orc_boss", stage: "active", spent: null,
    href: "#/administration/users/u2/teams/t-e1/edit" });
  assert.deepEqual(model.withdrawn.map(({ id, team, coach }) => [id, team, coach]), [["h1", "Old Guard", "veteran"]]);
  // A team enters when neither it nor its coach is in the season: one team of a coach a season (2.x's rule).
  assert.deepEqual(model.candidates.map(({ teamId, label }) => [teamId, label]), [["t-x1", "Black Orcs · lilit"], ["t-h1", "Old Guard · veteran"]]);

  assert.equal(entriesModel(seasonWith({ places: null })).places, null, "no places set: no zone");
  // A team the admin's block does not name is a team of before stage 12: in the season.
  assert.equal(entriesModel(seasonWith({ savedTeams: [] })).entries[6].stage, "active");
  assert.deepEqual(entriesModel(seasonWith({ savedTeams: [] })).candidates, []);
});

test("the playoff places: a whole number from 1 to 64, or none", () => {
  for (const [typed, value] of [["4", 4], [" 64 ", 64], ["1", 1], ["", null], ["   ", null]]) assert.deepEqual(placesFrom(typed), { value }, typed);
  for (const typed of ["0", "65", "70", "два", "2.5", "-1", "4 5", "1e1"]) {
    assert.deepEqual(placesFrom(typed), { error: "A number from 1 to 64, or empty for no zone" }, typed);
  }
});

// ---------------------------------------------------------------------------
// The entries
// ---------------------------------------------------------------------------

it("the entries: in the season and in the build with what was spent; the move into the season only for a build", async () => {
  await visit();
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Administration → Season · entries");
  assert.deepEqual(view.querySelectorAll(".g-adminseason__tabs a").map((link) => link.getAttribute("aria-current")), [null, "page"]);
  assert.deepEqual(keys(), ["GET /api/season"], "the scores awaiting are the rounds'");
  assert.equal(words(view.querySelector(".g-adminentries h2")), "Entries · 8");
  assert.equal(words(view.querySelector(".g-adminentries .g-admin__note")), t("adminSeason.entriesNote"));
  assert.equal(rows().length, 8);

  const playing = rowOf("e1");
  assert.equal(playing.querySelector("a.g-adminentries__team").getAttribute("href"), "#/administration/users/u2/teams/t-e1/edit");
  assert.deepEqual([words(playing.querySelector(".g-adminentries__team")), words(playing.querySelector(".g-adminentries__coach"))], ["Grimtusk Raiders", "orc_boss"]);
  assert.equal(words(playing.querySelector(".g-adminentries__status--active")), "in the season");
  assert.equal(playing.querySelector("[data-entries-activate]"), null, "a team in the season is not moved into it");
  assert.equal(words(playing.querySelector("[data-entries-withdraw]")), "Withdraw from the season");

  const build = rowOf("e7");
  assert.equal(words(build.querySelector(".g-adminentries__status--draft")), "build · spent 450k of 600k");
  assert.equal(words(build.querySelector("[data-entries-activate]")), "Move into the season");
  assert.equal(view.querySelectorAll("[data-entries-activate]").length, 1, "only the build is moved");

  // Two presses while the move is on its way: one POST, then the season read again.
  const moved = seasonWith({ savedTeams: SAVED.map((team) => (team.id === "t-e7" ? { ...team, stage: "active" } : team)) });
  api.reply("POST /api/teams/t-e7/activate", 200, { team: { id: "t-e7", stage: "active" } });
  const gate = api.hold("POST /api/teams/t-e7/activate");
  build.querySelector("[data-entries-activate]").focus();
  fireEvent(build.querySelector("[data-entries-activate]"), "click");
  await flush();
  assert.equal(rowOf("e7").querySelector("[data-entries-activate]").getAttribute("aria-busy"), "true");
  fireEvent(rowOf("e7").querySelector("[data-entries-activate]"), "click");
  await flush();
  api.reply("GET /api/season", 200, moved);
  gate.release();
  await flush();
  assert.deepEqual(keys(), ["GET /api/season", "POST /api/teams/t-e7/activate", "GET /api/season"], "one move however many presses; the season read again");
  assert.deepEqual(api.calls[1].body, {});
  assert.equal(words(rowOf("e7").querySelector(".g-adminentries__status--active")), "in the season");
  assert.equal(view.querySelector("[data-entries-activate]"), null);
  assert.ok(document.activeElement === rowOf("e7").querySelector("[data-entries-withdraw]"), "the focus stays in the row");
  api.assertAnswered();
});

it("a build that holds more than it started with says its treasury; one the block does not know is a build", async () => {
  const savedTeams = SAVED.map((team) => (team.id === "t-e7" ? { ...team, treasury: 650 } : team.id === "t-e8" ? { ...team, stage: "draft", treasury: null } : team));
  await visit({ season: seasonWith({ savedTeams }) });
  assert.equal(words(rowOf("e7").querySelector(".g-adminentries__status--draft")), "build · 650k in the treasury");
  assert.equal(words(rowOf("e8").querySelector(".g-adminentries__status--draft")), "build");
  assert.equal(view.querySelectorAll("[data-entries-activate]").length, 2);
});

it("the playoff places: a number from 1 to 64 or none", async () => {
  await visit();
  assert.equal(words(view.querySelector(".g-adminentries__playoff h2")), "Playoffs");
  assert.equal(field().value, "4");
  assert.equal(field().getAttribute("inputmode"), "numeric");
  assert.equal(words(view.querySelector(`label[for="admin-playoff-places"]`)), "Playoff places");
  assert.equal(words(view.querySelector("#admin-playoff-places-help")), "The table draws its line after this place. Empty: no zone.");

  // Words before sending: nothing goes.
  for (const typed of ["0", "70", "два"]) {
    await savePlaces(typed);
    assert.equal(words(view.querySelector("#admin-playoff-places-error")), "A number from 1 to 64, or empty for no zone", typed);
    assert.equal(field().getAttribute("aria-invalid"), "true");
    assert.ok(document.activeElement === field(), "the field takes the focus back to be corrected");
  }
  assert.equal(writes().length, 0);
  fireEvent(field(), "input");
  await flush();
  assert.equal(view.querySelector("#admin-playoff-places-error"), null, "typing again clears the words");

  // A number: one PATCH however many presses; the answer is the season, put in place as it came.
  api.reply("PATCH /api/season/admin/settings", 200, seasonWith({ places: 6 }));
  const gate = api.hold("PATCH /api/season/admin/settings");
  await savePlaces("6");
  assert.equal(view.querySelector("[data-entries-places-save]").getAttribute("aria-busy"), "true");
  fireEvent(view.querySelector("form[data-entries-places]"), "submit");
  await flush();
  gate.release();
  await flush();
  assert.deepEqual(writes().map(({ key, body }) => [key, body]), [["PATCH /api/season/admin/settings", { playoffPlaces: 6 }]]);
  assert.deepEqual(keys().at(-1), "PATCH /api/season/admin/settings", "the answer is the season: nothing read again");
  assert.equal(state.season.data.season.playoffPlaces, 6);
  assert.equal(field().value, "6");

  // Empty: no zone.
  api.reply("PATCH /api/season/admin/settings", 200, seasonWith({ places: null }));
  await savePlaces("");
  assert.deepEqual(writes().at(-1).body, { playoffPlaces: null });
  assert.equal(field().value, "");
  api.assertAnswered();
});

it("a withdrawal asks first; a new entry from the coaches' teams", async () => {
  await visit();
  answer = false;
  await press(rowOf("e1").querySelector("[data-entries-withdraw]"));
  assert.equal(asked.at(-1), t("adminSeason.withdrawConfirm", { team: "Grimtusk Raiders" }));
  assert.equal(writes().length, 0, "asked, and told no: nothing goes");
  answer = true;
  const after = seasonWith({ entries: ENTRIES.slice(1), gone: [GONE, { ...ENTRIES[0], withdrawnAt: "2026-10-22T10:00:00Z" }] });
  api.reply("DELETE /api/season/admin/entries/e1", 200, after);
  rowOf("e1").querySelector("[data-entries-withdraw]").focus();
  await press(rowOf("e1").querySelector("[data-entries-withdraw]"));
  assert.deepEqual(writes().map(({ key }) => key), ["DELETE /api/season/admin/entries/e1"]);
  assert.equal(rowOf("e1"), null);
  assert.equal(words(view.querySelector(".g-adminentries h2")), "Entries · 7");
  assert.equal(words(view.querySelector(".g-adminentries__gone .g-adminseason__pastname")), "Withdrawn · 2");
  assert.ok(document.activeElement === view.querySelector("[data-entries-title]"), "the row gone, the card's title takes the focus");

  // «+ Entry»: the coaches' teams without an entry, a coach with one in the season left out.
  const add = view.querySelector("[data-entries-add]");
  assert.equal(add.getAttribute("aria-haspopup"), "dialog");
  await press(add);
  assert.ok(sheet()?.isModal, "the sheet opens");
  const card = (option) => [option.getAttribute("data-option-value"), words(option.querySelector(".g-option__title")), words(option.querySelector(".g-option__sub"))];
  assert.deepEqual(sheet().querySelectorAll("[data-option-value]").map(card), [
    ["t-e1", "Grimtusk Raiders", "orc_boss"], ["t-x2", "Black Orc Second", "orc_boss · build"], ["t-x1", "Black Orcs", "lilit · build"], ["t-h1", "Old Guard", "veteran"],
  ], "orc_boss is out of the season now: either team of the coach may enter");
  const save = () => sheet().querySelector("[data-entry-save]");
  assert.equal(save().getAttribute("title"), "Choose a team");
  await press(save());
  assert.equal(toasts().at(-1), "Choose a team");
  assert.equal(writes().length, 1);
  sheet().querySelector('[data-option-value="t-x1"]').focus();
  await press(sheet().querySelector('[data-option-value="t-x1"]'));
  assert.ok(document.activeElement === sheet().querySelector('[data-option-value="t-x1"]'), "the choice keeps the focus: the sheet is patched");

  // A refusal stays in the sheet, the choice kept.
  api.reply("POST /api/season/admin/entries", 409, { error: { code: "ENTRY_ALREADY_COMMITTED" } });
  await press(save());
  assert.ok(sheet()?.isModal);
  assert.equal(words(sheet().querySelector('.g-resultsheet__alert[role="alert"]')), t("error.ENTRY_ALREADY_COMMITTED"));
  assert.equal(sheet().querySelector('[data-option-value="t-x1"]').getAttribute("aria-checked"), "true");

  const entered = seasonWith({ entries: [...ENTRIES.slice(1), entry(["e9", "u10", "lilit", "Black Orcs"])], gone: [GONE] });
  api.reply("POST /api/season/admin/entries", 201, entered);
  const gate = api.hold("POST /api/season/admin/entries");
  fireEvent(save(), "click");
  await flush();
  fireEvent(save(), "click");
  gate.release();
  await flush();
  assert.deepEqual(writes().map(({ key, body }) => [key, body]).slice(1), [
    ["POST /api/season/admin/entries", { teamId: "t-x1" }], ["POST /api/season/admin/entries", { teamId: "t-x1" }],
  ], "the refused one and the one that went: never two on their way");
  assert.equal(sheet(), null, "the sheet closes");
  assert.ok(rowOf("e9"));
  assert.ok(document.activeElement === view.querySelector("[data-entries-add]"), "the focus back on «+ Entry»");
  api.assertAnswered();
});

it("every coach in the season: «+ Entry» says why it opens nothing", async () => {
  await visit({ season: seasonWith({ gone: [], savedTeams: SAVED.filter((team) => team.id.startsWith("t-e")) }) });
  const add = view.querySelector("[data-entries-add]");
  assert.deepEqual([add.getAttribute("aria-disabled"), add.getAttribute("title")], ["true", "Every coach's team is already entered"]);
  await press(add);
  assert.equal(toasts().at(-1), "Every coach's team is already entered");
  assert.equal(sheet(), null);
});

it("the withdrawn are folded, and open", async () => {
  await visit();
  const card = view.querySelector(".g-adminentries__gone");
  assert.equal(words(card.querySelector(".g-adminseason__pastname")), "Withdrawn · 1");
  const toggle = () => view.querySelector("[data-entries-gone]");
  assert.deepEqual([toggle().textContent, toggle().getAttribute("aria-expanded")], ["Show", "false"]);
  assert.equal(view.querySelector("#season-withdrawn").getAttribute("hidden"), "");
  toggle().focus();
  await press(toggle());
  assert.deepEqual([toggle().textContent, toggle().getAttribute("aria-expanded")], ["Hide", "true"]);
  const gone = view.querySelectorAll("#season-withdrawn .g-adminentries__row");
  assert.deepEqual(gone.map((row) => [words(row.querySelector(".g-adminentries__team")), words(row.querySelector(".g-adminentries__coach"))]), [["Old Guard", "veteran"]]);
  assert.equal(gone[0].querySelector("button"), null, "a withdrawn team enters again by «+ Entry»");
  assert.ok(document.activeElement === toggle(), "the toggle keeps the focus");
  // None withdrawn: no card.
  await visit({ season: seasonWith({ gone: [] }) });
  assert.equal(view.querySelector(".g-adminentries__gone"), null);
});

it("no entries yet", async () => {
  await visit({ season: seasonWith({ entries: [], gone: [] }) });
  assert.equal(words(view.querySelector(".g-adminentries h2")), "Entries · 0");
  assert.ok(words(view.querySelector(".g-adminentries")).includes("No entries yet"));
});

it("a refusal is the server's words; a lost answer reads the season again and sends nothing twice", async () => {
  await visit();
  api.reply("POST /api/teams/t-e7/activate", 404, { error: { code: "TEAM_NOT_FOUND" } });
  await press(rowOf("e7").querySelector("[data-entries-activate]"));
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("error.TEAM_NOT_FOUND"));
  assert.deepEqual(keys(), ["GET /api/season", "POST /api/teams/t-e7/activate"], "a refusal changed nothing: nothing read again");

  await visit();
  api.fail("POST /api/teams/t-e7/activate");
  await press(rowOf("e7").querySelector("[data-entries-activate]"));
  assert.deepEqual(keys(), ["GET /api/season", "POST /api/teams/t-e7/activate", "GET /api/season"]);
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("administration.mayHaveWritten"));

  // A lost answer of the sheet: the sheet closes, and the screen says to check.
  await press(view.querySelector("[data-entries-add]"));
  await press(sheet().querySelector('[data-option-value="t-x1"]'));
  api.fail("POST /api/season/admin/entries");
  await press(sheet().querySelector("[data-entry-save]"));
  assert.equal(sheet(), null);
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("administration.mayHaveWritten"));
  assert.equal(writes().filter(({ key }) => key === "POST /api/season/admin/entries").length, 1);

  // Another tab's token: nothing sent, its words said.
  await visit();
  api.items.set(TOKEN, "another");
  await savePlaces("5");
  assert.equal(words(view.querySelector('.g-adminseason__alert[role="alert"]')), t("auth.otherTab"));
  assert.equal(writes().length, 0);
});

it("a coach who is no admin is told the section is the admin's, and nothing is read", async () => {
  await visit({ user: COACH });
  assert.equal(view.querySelector(".g-callout__title").textContent, t("administration.only"));
  assert.equal(view.querySelector(".g-adminentries"), null);
  assert.deepEqual(api.calls, []);
});

// ---------------------------------------------------------------------------
// The width, leaving, and the rules every screen owes
// ---------------------------------------------------------------------------

it("crossing 900px draws the other form, the focus kept or on the title", async () => {
  const cross = await visit({ phone: true });
  assert.ok(view.querySelector(".g-admin__head .g-pagehead--phone"), "a phone's title stands");
  rowOf("e7").querySelector("[data-entries-activate]").focus();
  cross(false);
  assert.equal(view.querySelector(".g-admin__head .g-pagehead--phone"), null);
  assert.ok(document.activeElement === rowOf("e7").querySelector("[data-entries-activate]"), "the focus kept");
  assert.equal(api.calls.length, 1, "nothing read again");
});

it("leaving stops listening", async () => {
  await visit();
  assert.equal(pendingScreenCleanupCount(), 1);
  releaseCurrentScreen();
  assert.equal(pendingScreenCleanupCount(), 0);
  fireEvent(view.querySelector("[data-entries-add]"), "click");
  fireEvent(rowOf("e7").querySelector("[data-entries-activate]"), "click");
  await flush();
  assert.equal(sheet(), null, "a press opens nothing");
  assert.equal(writes().length, 0, "and sends nothing");
});

it("names are text; no inline style; styled", async () => {
  const hostile = ENTRIES.map((one) => ({ ...one, user: { ...one.user, login: HOSTILE }, team: { ...one.team, name: HOSTILE } }));
  const savedTeams = SAVED.map((team) => ({ ...team, name: HOSTILE, owner: { ...team.owner, login: HOSTILE } }));
  const season = seasonWith({ entries: hostile, gone: [{ ...GONE, team: { ...GONE.team, name: HOSTILE }, user: { ...GONE.user, login: HOSTILE } }], savedTeams });
  for (const phone of [true, false]) {
    await visit({ season, phone });
    await press(view.querySelector("[data-entries-gone]"));
    await savePlaces("два");
    await press(view.querySelector("[data-entries-add]"));
    assert.equal(view.querySelector("img"), null);
    assert.equal(words(rowOf("e1").querySelector(".g-adminentries__team")), HOSTILE);
    assert.equal(words(rowOf("e1").querySelector(".g-adminentries__coach")), HOSTILE);
    assert.ok(words(sheet()).includes(HOSTILE));
    assertCspSafe(view);
    assertStyled(view, CSS, "src/screens/admin/admin.css", "page-head.css", "segmented-control.css", "sheet.css", "option-card.css", "text-field.css", "button.css", "callout.css");
  }
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/admin/season-entries.mjs", "src/screens/admin/season.mjs");
  const [en, ru] = ["en", "ru"].map(dictionary);
  const own = Object.keys(en).filter((key) => key.startsWith("adminSeason."));
  assert.deepEqual(Object.keys(ru).filter((key) => key.startsWith("adminSeason.")), own, "the same keys in the same order");
  for (const gone of ["adminSeason.entriesSoon", "adminSeason.toLeague"]) assert.equal(en[gone], undefined, `${gone}: its reader went with Task 12`);
  // The plan's words (decision 20) and DeskAdminEntries.html's: the Russian a coach of the league reads.
  assert.deepEqual(["playoff", "playoffPlaces", "playoffNote", "entriesCount", "addEntry", "entryActive", "entryBuild", "activate", "withdraw", "withdrawn", "noCandidates", "entriesNote"]
    .map((key) => ru[`adminSeason.${key}`]), ["Плей-офф", "Мест в плей-офф", "Таблица проведёт черту после этого места. Пусто — зоны нет.", "Участники · {count}", "+ Участник",
    "в сезоне", "набор · потрачено {spent} из {budget}", "Перевести в сезон", "Снять с сезона", "Сняты с сезона · {count}", "Все команды тренеров уже заявлены",
    "Снятая команда остаётся в таблице и истории, но не попадает в новые туры. Перевод из набора в сезон закрывает Start Re-rolls и открывает Team Re-rolls."]);
});

test("readable: the statuses, the coach, the buttons, in every palette", () => {
  assertReadable(CSS, ".g-adminentries__status--active", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminentries__status--draft", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminentries__coach", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-adminentries__team", "color", ["--surface"], 4.5);
});

test("nothing is cut with «…»; long names wrap; the 900/901 breakpoints only", () => {
  assert.doesNotMatch(text(CSS), /ellipsis|nowrap|@media \((?!max-width: 900px|min-width: 901px)/);
  for (const selector of [".g-adminentries__team", ".g-adminentries__coach", ".g-adminentries__status"]) {
    assert.ok(valuesOf(CSS, selector, "overflow-wrap").length, `${selector} wraps`);
  }
});

test("the prototype's measures: the rows, the card, the statuses; D2 — 44 on a phone, 24 and more from 901px", () => {
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__row", "min-height").slice(0, 1), ["60px"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries", "gap"), ["var(--space-6)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__team", "font"), ["700 16px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__coach", "font"), ["400 13px/1.4 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__status", "font"), ["600 14px/1.35 var(--font-body)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__status--active", "color"), ["var(--on-accent-tint)"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__status--draft", "color"), ["var(--on-warn-tint)"]);
  // A narrow desk (901px beside the SideNav) or a phone: the status and the buttons go under the team rather than squeeze
  // its name and its coach's login into their letters; the buttons keep to the right.
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__row", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(CSS, ".g-adminentries__who", "flex"), ["1 1 220px"]);
  assert.deepEqual(inMedia(CSS, "max-width: 900px", ".g-adminentries__who", "flex-basis"), ["100%"]);
  assert.deepEqual([valuesOf(CSS, ".g-adminentries__actions", "margin-left"), valuesOf(CSS, ".g-adminentries__actions", "min-width")], [["auto"], ["0"]]);
  const px = (value) => (value === "var(--size-touch)" ? 44 : Number(String(value).replace("px", "")));
  // The cards' buttons are season.css's: 40 from 901px, 44 on a phone (admin-season.test.mjs); the field is the kit's 48.
  assert.ok(px(valuesOf(CSS, ".g-adminseason__btn", "min-height")[0]) >= 24);
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-adminseason__btn", "min-height")[0]) >= 44);
  assert.ok(px(valuesOf("src/ui/text-field.css", ".g-field__input", "height")[0]) >= 44);
});
