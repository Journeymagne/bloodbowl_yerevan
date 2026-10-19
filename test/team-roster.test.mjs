import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { mountView, useLocale, withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The window's own events, for the whole file: the save queue's unload guard and the screen's `online` listen on it.
const page = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = page[name].bind(page);

// The view is found once, when core/view.mjs loads, and the API client picks up `fetch` the same way: both come first.
const api = installFakeApi();
mountView();
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
const { renderTeamRoster } = await import("../src/screens/team/roster/index.mjs");
const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const save = await import("../src/screens/team/roster/save.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { teamPlayerUrl } = await import("../src/core/routes.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { invalidateGames, loadGames } = await import("../src/data/games.mjs");
const { SPP_EVENT_COUNTERS } = await import("../src/domain/post-match/events.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = async (turns = 6) => { for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

// Human's rows: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 5 Ogre. Only the captain has SPP: 3, a random skill's worth at the first rank.
const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true, extraSkills: [{ name: "Mighty Blow", access: "primary" }], spp: { touchdowns: 1 } },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade", statMods: { ag: 1 } },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", skipNextGame: true },
  { id: "p5", rowIndex: 1, number: "5", name: "Edda" },
  { id: "p6", rowIndex: 0, number: "6", name: "Finn" },
  { id: "p7", rowIndex: 5, number: "7", name: "Grom" },
];
const KEYS = PLAYERS.map(({ id }, index) => `${id}#${index}`);
const NAMES = PLAYERS.map(({ name }) => name);
const team = (over = {}) => ({ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 4, roster: { players: PLAYERS }, ...over });

/**
 * A coach on a page that has read his teams and the reference; the server answers the roster, its events and the games.
 * What a test before left in the save queue is given up, and the messages it left are taken away.
 */
function coach({ teamAnswer = team(), events = [] } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  if (save.saveState("t1").status !== "idle") save.takeServerTeam(team());
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  // The memory lives as long as the page, which is the whole file: each test starts from the roster's order, no choice and taps of the match.
  Object.assign(rosterMemory("t1"), { sort: null, selected: null, outside: null });
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [team()], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams/t1", 200, { team: teamAnswer });
  api.reply("GET /api/teams/t1/events", 200, { events, revision: teamAnswer.revision });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

const PATCH = "PATCH /api/teams/t1";
const patches = () => api.calls.filter(({ key }) => key === PATCH);
const callKeys = () => api.calls.map(({ key }) => key);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
/** Whether the browser would ask before the tab closes. */
const leaving = () => {
  const event = new Event("beforeunload", { cancelable: true });
  page.dispatchEvent(event);
  return event.defaultPrevented;
};
/** t1 with one player's counters as the server holds them. */
const withSpp = (id, spp, over = {}) => team({ roster: { players: PLAYERS.map((player) => (player.id === id ? { ...player, spp } : player)) }, ...over });
const conflictOf = (elsewhere) => ({ error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere });
const refusalOf = (violations) => ({ error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations });
// A league match of round 3 that t1 plays now: begun, its post-match not done (isMatchLive).
const LIVE_GAME = {
  id: "g2", kind: "league", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 }, resultStatus: "pending", preparationStatus: "in_progress",
  postMatchStatus: "draft", updatedAt: "2026-10-10T10:00:00Z", home: { user: { id: "u1" }, team: { id: "t1" } }, away: { user: { id: "u9" }, team: { id: "r1" } },
};
// The same round's match of t1 before its start: the preparation is under way.
const PREP_GAME = { ...LIVE_GAME, id: "g1", preparationStatus: "preparing", postMatchStatus: "not_started" };
const EVENTS = "POST /api/teams/t1/events";
const posts = () => api.calls.filter(({ key }) => key === EVENTS);
/** A row as POST …/events answers it: by default the match's +1 TD of Ann. */
const rowOf = (over = {}) => ({ id: "e1", pairingId: "g2", playerId: "p1", counter: "touchdowns", delta: 1, injury: null, settledAt: null, ...over });
const refused = (code) => ({ error: { code, params: {}, message: "x" } });
/** The games the server answers with from now on. */
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
/** The banner of a preparation or a match, the first of the notices. */
const banner = () => view.querySelector(".g-roster__notices .g-callout");
const titleOf = (callout) => callout.querySelector(".g-callout__title").textContent;
const subOf = (callout) => callout.querySelector(".g-callout__sub").textContent;
const outsideSwitch = () => view.querySelector('[role="switch"]');
/** The «+N» a count shows for the match: in a counter, or in the table's cell. */
const deltaOf = (counter, root) => stepper(counter, root).querySelector(".g-stepper__delta")?.textContent ?? null;
const SIDE_LOCKED = "This match's statistics are already saved in your post-match. Change them on its Players step.";
const READING = "Reading the records…";
const AFTER_POST = "Advancement — after the post-match";

const bodies = () => view.querySelectorAll("tbody.g-rtable__player");
const order = () => bodies().map((body) => body.querySelector(".g-rtable__name").textContent);
const toggle = (key) => view.querySelector(`[data-row-key="${key}"]`);
const bodyOf = (key) => bodies().find((body) => body.getAttribute("data-key") === key);
const aside = () => view.querySelector(".g-roster__aside");
/** The chips of a skill under a player's name in the table (the desk's copy) or in the panel. */
const chipIn = (root, name) => root.querySelectorAll("[data-skill]").find((chip) => chip.getAttribute("data-skill") === name);
const sheet = () => view.querySelector("dialog#roster-skill");
const openRow = () => view.querySelector(".g-rtable__panelrow");
/** A counter's cell: the desk panel's by default, or the open row's. */
const stepper = (counter, root = aside()) => root.querySelectorAll("[data-action-key]").find((cell) => cell.getAttribute("data-action-key") === counter);
const plus = (counter, root) => stepper(counter, root).querySelector('[data-action-step="1"]');
const minus = (counter, root) => stepper(counter, root).querySelector('[data-action-step="-1"]');
const countOf = (counter, root) => stepper(counter, root).querySelector(".g-stepper__value").textContent;
const labelOf = (cell) => cell.querySelector(".g-stepper__label").textContent;
const stepButtons = () => view.querySelectorAll("[data-action-step]");
/** The save's status at the right of «Active roster». */
const status = () => view.querySelector(".g-roster__status").textContent;
/** The SPP line: what it is about, and the SPP since the screen opened. */
const sppLine = (root) => root.querySelector(".g-roster__sppline").childNodes.filter((part) => part.nodeType === 1).map((part) => part.textContent);
const notice = (tone) => view.querySelector(`.g-roster__notices .g-callout--${tone}`);

test("the roster of a team: a band «Roster» with its counts, «Active roster» with the number, a row per player in the roster's order", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(view.querySelector("h1").textContent, "Roster");
  assert.equal(document.activeElement, view.querySelector("h1"), "the title takes the focus");
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "On the roster: 7 · missing a match: 1 · can advance: 1");
  assert.match(view.querySelector("#roster-heading").textContent, /^Active roster 7$/);
  assert.equal(view.querySelector("[data-screen]").getAttribute("data-screen"), "team-roster");
  assert.equal(view.querySelector("table.g-rtable").getAttribute("aria-label"), "Players of Ashgrove Wardens");
  assert.deepEqual(order(), NAMES);
  assert.deepEqual(bodies().map((body) => body.getAttribute("data-key")), KEYS);
  assert.deepEqual(view.querySelectorAll(".g-rtable__groups .g-rtable__g").map((cell) => cell.textContent), ["", "Characteristics", "Career", "SPP"]);
  api.assertAnswered();
});

test("before the roster comes the screen says it is loading it", async () => {
  coach();
  const held = api.hold("GET /api/teams/t1");
  const drawing = renderTeamRoster("t1");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the roster…");
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector(".g-pagehead__sub"), null, "no counts before there is a roster to count");
  held.release();
  await drawing;
  assert.equal(view.querySelector(".g-roster__loading"), null);
  assert.equal(bodies().length, 7);
});

test("a row: the number on the position's colour, the captain's «C», the name, the position and the five characteristics; a changed one says so; one who misses the match says that instead", async () => {
  coach();
  await renderTeamRoster("t1");
  const captain = bodyOf("p2#1");
  assert.ok(captain.querySelector(".g-num--blitzer .g-num__captain"));
  assert.equal(captain.querySelector(".g-rtable__sub").textContent, "Blitzer");
  assert.deepEqual(captain.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["7", "3", "3+", "4+", "9+"]);
  const agility = bodyOf("p3#2").querySelectorAll(".g-rtable__row td")[2];
  assert.ok(agility.classList.contains("g-rtable__c--up"));
  assert.equal(agility.textContent, "2+ improved");
  const skipping = bodyOf("p4#3").querySelector(".g-rtable__sub");
  assert.ok(skipping.classList.contains("g-rtable__sub--alert"));
  assert.equal(skipping.textContent, "Misses the next match");
  // The career and the SPP: a zero is quiet, what he may spend is strong.
  const cells = captain.querySelectorAll(".g-rtable__row td");
  assert.equal(cells[5].textContent, "1");
  assert.ok(cells[6].classList.contains("g-rtable__c--zero"));
  assert.deepEqual([cells[11].textContent, cells[12].textContent], ["3", "3"]);
  assert.ok(cells[12].classList.contains("g-rtable__c--strong"));
});

test("on a desk the first player stands in the panel; a press on another moves him there and marks his row, and a second press keeps him", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    assert.ok(bodyOf("p1#0").classList.contains("is-selected"));
    fireEvent(toggle("p2#1"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#1");
    assert.ok(bodyOf("p2#1").classList.contains("is-selected"));
    assert.equal(bodyOf("p1#0").classList.contains("is-selected"), false);
    fireEvent(toggle("p2#1"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#1", "a second press keeps him");
    assert.equal(view.querySelector(".g-rtable__panelrow"), null, "a desk opens no row");
  });
});

test("on a desk a player's button chooses him for the panel: it names the panel and marks the one in it, and says nothing of opening (R11)", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("id"), "roster-aside");
    assert.equal(aside().getAttribute("aria-label"), "The player");
    for (const key of KEYS) {
      assert.equal(toggle(key).getAttribute("aria-controls"), "roster-aside");
      assert.equal(toggle(key).hasAttribute("aria-expanded"), false);
    }
    assert.deepEqual(KEYS.filter((key) => toggle(key).getAttribute("aria-current") === "true"), ["p1#0"]);
  });
});

test("on a phone a press opens the player's row and the next press closes it; one row is open at a time", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    const open = () => bodies().filter((body) => body.querySelector(".g-rtable__panelrow")).map((body) => body.getAttribute("data-key"));
    assert.deepEqual(open(), [], "nothing is open at first");
    assert.equal(toggle("p1#0").getAttribute("aria-expanded"), "false");
    assert.equal(toggle("p1#0").hasAttribute("aria-current"), false, "a phone marks no player for a panel it does not show");
    fireEvent(toggle("p2#1"), "click");
    assert.deepEqual(open(), ["p2#1"]);
    assert.equal(toggle("p2#1").getAttribute("aria-expanded"), "true");
    assert.equal(toggle("p2#1").getAttribute("aria-controls"), view.querySelector(".g-rtable__panelrow").getAttribute("id"));
    fireEvent(toggle("p3#2"), "click");
    assert.deepEqual(open(), ["p3#2"]);
    assert.equal(toggle("p2#1").getAttribute("aria-expanded"), "false");
    fireEvent(toggle("p3#2"), "click");
    assert.deepEqual(open(), []);
  });
});

test("the row's button follows the width: crossing 900px draws the screen again, and a screen left listens no more (R11)", async () => {
  const listeners = new Set();
  const media = { matches: false, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  try {
    coach();
    await renderTeamRoster("t1");
    assert.equal(listeners.size, 1);
    fireEvent(toggle("p2#1"), "click");
    assert.equal(toggle("p2#1").getAttribute("aria-current"), "true");
    media.matches = true;
    listeners.forEach((listener) => listener());
    assert.equal(toggle("p2#1").getAttribute("aria-expanded"), "true", "the player chosen on the desk is the row open on the phone");
    assert.ok(bodyOf("p2#1").querySelector(".g-rtable__panelrow"));
    releaseCurrentScreen();
    assert.equal(listeners.size, 0);
  } finally {
    delete globalThis.matchMedia;
  }
});

test("another team's roster starts at the top of the page; the same team's drawn again stays where the coach was", async () => {
  await withWindow({ phone: false }, async ({ scrolls, scrollPage }) => {
    coach();
    await renderTeamRoster("t1");
    scrollPage(600);
    scrolls.length = 0;
    // The same roster drawn again (a language switch) keeps the place.
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    assert.deepEqual(scrolls, []);
    // The switcher opens the other team's roster from this one: a page of its own.
    api.reply("GET /api/teams/t2", 200, { team: team({ id: "t2", name: "Grimtusk Raiders" }) });
    api.reply("GET /api/teams/t2/events", 200, { events: [], revision: 4 });
    releaseCurrentScreen();
    await renderTeamRoster("t2");
    assert.deepEqual(scrolls.at(-1), [0, 0]);
    assert.equal(view.querySelector("table").getAttribute("aria-label"), "Players of Grimtusk Raiders");
  });
});

test("a header sorts the table, the next press turns it round, and the order stays when the screen is drawn again and after a visit elsewhere", async () => {
  coach();
  await renderTeamRoster("t1");
  const head = () => view.querySelector('[data-sort-key="ma"]').closest("th");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.deepEqual(order(), ["Cade", "Bors", "Ann", "Dell", "Edda", "Finn", "Grom"]);
  assert.equal(head().getAttribute("aria-sort"), "descending");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.deepEqual(order(), ["Grom", "Ann", "Dell", "Edda", "Finn", "Bors", "Cade"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  await renderTeamRoster("t1");
  assert.deepEqual(order(), ["Grom", "Ann", "Dell", "Edda", "Finn", "Bors", "Cade"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  // The player's column puts them back by their numbers, the lowest first.
  fireEvent(view.querySelector('[data-sort-key="player"]'), "click");
  assert.deepEqual(order(), NAMES);
});

test("a skill chip opens its rule: the name as written, its category and type, the rule, the player and where the skill came from; closed, the focus is back on the chip", async () => {
  coach();
  await renderTeamRoster("t1");
  const chip = chipIn(bodyOf("p2#1").querySelector(".g-rtable__skills--desk"), "Mighty Blow");
  fireEvent(chip, "click");
  const dialog = sheet();
  assert.ok(dialog?.isModal, "the sheet is open, modally");
  assert.equal(dialog.querySelector("h2").textContent, "Mighty Blow");
  assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "Strength · Active");
  assert.ok(dialog.querySelector(".g-sheet__body .g-prose").textContent.length > 20, "the rule from the reference");
  assert.equal(dialog.querySelector(".g-roster__from").textContent, "Bors · primary");
  fireEvent(dialog.querySelector("[data-sheet-close]"), "click");
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, chip);
});

test("a chip in the panel opens the same rule; a skill with a number in it opens its template's rule under the name the player has", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("p7#6"), "click");
  const loner = chipIn(aside(), "Loner (3+)");
  assert.ok(loner.classList.contains("g-skill--card"));
  fireEvent(loner, "click");
  assert.equal(sheet().querySelector("h2").textContent, "Loner (3+)");
  assert.equal(sheet().querySelector(".g-roster__from").textContent, "Grom · starting");
  assert.ok(sheet().querySelector(".g-prose"), "Loner (X+)'s rule");
  // A redraw while it is open (the games came again) keeps it open.
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  const { invalidateGames, loadGames } = await import("../src/data/games.mjs");
  await invalidateGames();
  assert.ok(sheet()?.isModal);
  fireEvent(sheet(), "keydown", { key: "Escape" });
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, loner);
});

test("a skill the reference has no page for opens all the same and says so", async () => {
  coach({ teamAnswer: team({ roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann", extraSkills: [{ name: "No Such Skill" }] }] } }) });
  await renderTeamRoster("t1");
  fireEvent(chipIn(bodyOf("p1#0"), "No Such Skill"), "click");
  assert.equal(sheet().querySelector("h2").textContent, "No Such Skill");
  assert.equal(sheet().querySelector(".g-roster__nopage").textContent, "The reference has no page for this skill.");
  assert.equal(sheet().querySelector(".g-sheet__sub"), null);
  assert.equal(sheet().querySelector(".g-roster__from").textContent, "Ann · primary");
});

test("«Profile and advancement» on a phone, «Advance» and the pencil on a desk lead to the player's page — the 2.x editor until stage 07d", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#1"), "click");
    const profile = view.querySelector(".g-rtable__panelrow a.g-btn--dark");
    assert.equal(profile.textContent, "Profile and advancement");
    assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "p2"));
  });
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#1"), "click");
    const advance = aside().querySelector("a.g-btn--primary");
    assert.equal(advance.textContent, "Advance");
    assert.equal(advance.getAttribute("href"), teamPlayerUrl("t1", "p2"));
    const pencil = aside().querySelector("a.g-roster__edit");
    assert.equal(pencil.getAttribute("aria-label"), "Edit Bors");
    assert.equal(pencil.getAttribute("href"), "#/t/t1/roster/p2");
  });
});

test("a player the roster stores no id for has no way to a page: an empty id would make the roster's own address", async () => {
  const players = [{ rowIndex: 0, number: "1", name: "Nobody" }];
  await withWindow({ phone: true }, async () => {
    coach({ teamAnswer: team({ roster: { players } }) });
    await renderTeamRoster("t1");
    fireEvent(toggle("#0"), "click");
    assert.ok(view.querySelector(".g-roster__rowpanel"));
    assert.equal(view.querySelector(".g-rtable__panelrow a"), null);
  });
  coach({ teamAnswer: team({ roster: { players } }) });
  await renderTeamRoster("t1");
  assert.equal(aside().querySelector("a"), null, "neither «Advance» nor the pencil");
  assert.ok(aside().querySelector(".g-roster__cheapest"));
  // Nor can a save name him: his counters are closed, and say why.
  const steps = aside().querySelectorAll("[data-action-step]");
  assert.equal(steps.length, 18);
  for (const button of steps) {
    assert.equal(button.getAttribute("aria-disabled"), "true");
    assert.equal(button.getAttribute("title"), "This player has no id in the roster, so his counters cannot be saved. Ask the league administrator to fix the roster.");
  }
});

test("the desk panel: badge, name, position and value, the characteristics, SPP available, earned and spent, the advancements, the cheapest one, the skills as cards with their source, the access, the next match", async () => {
  coach();
  await renderTeamRoster("t1");
  const panel = aside();
  assert.equal(panel.getAttribute("data-panel-player"), "p1#0");
  assert.ok(panel.querySelector(".g-num--lg.g-num--lineman"));
  assert.equal(panel.querySelector(".g-roster__pname").textContent, "Ann");
  assert.equal(panel.querySelector(".g-roster__pline").textContent, "Human Lineman · 50k");
  assert.deepEqual(panel.querySelectorAll("dl.g-stats .g-stat__v").map((value) => value.textContent), ["6", "3", "3+", "4+", "9+"]);
  assert.deepEqual([panel.querySelector(".g-roster__availn").textContent, panel.querySelector(".g-roster__availl").textContent], ["0", "SPP available"]);
  assert.deepEqual(panel.querySelectorAll(".g-roster__ledgerline").map((line) => line.textContent), ["earned 0", "spent 0"]);
  assert.equal(panel.querySelector(".g-progress__caption").textContent, "Advancements: 0 of 6");
  assert.equal(panel.querySelector(".g-roster__cheapest").textContent, "Cheapest — 3 SPP");
  assert.equal(panel.querySelector(".g-skills-none").textContent, "no skills");
  assert.equal(panel.querySelector(".g-roster__access").textContent, "Primary: General · Secondary: Agility, Strength, Devious");
  assert.equal(panel.querySelector(".g-roster__next").textContent, "Next match: plays");
  // The captain: his skills as cards, each with where it came from; the one who sits out says so.
  fireEvent(toggle("p2#1"), "click");
  assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]),
    [["Block", "starting"], ["Tackle", "starting"], ["Mighty Blow", "primary"], ["Pro", "the captain's"]]);
  assert.ok(aside().querySelector('.g-skill--card.g-skill--gained[data-skill="Mighty Blow"]'));
  assert.equal(aside().querySelector(".g-roster__availn").textContent, "3");
  fireEvent(toggle("p4#3"), "click");
  assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: sits it out");
});

test("the open row has six counters in two columns and a row of three, each with its worth; a team whose catches earn SPP has a fourth", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#1"), "click");
    const main = openRow().querySelectorAll(".g-roster__counters .g-stepper");
    assert.deepEqual(main.map(labelOf), ["TD +3", "CAS +2", "COMP +1", "KO +1", "INT +2", "MVP +5"]);
    assert.ok(main.every((cell) => !cell.classList.contains("g-stepper--compact")), "the main ones in full");
    assert.deepEqual(openRow().querySelectorAll(".g-roster__extra .g-stepper--compact").map(labelOf), ["TTM +1", "Landing +1", "Bonus +1"]);
    assert.deepEqual([countOf("touchdowns", openRow()), countOf("casualties", openRow())], ["1", "0"], "the career's counts");
    assert.equal(plus("touchdowns", openRow()).getAttribute("aria-label"), "Add: touchdown, Bors");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "no changes yet"]);
    coach({ teamAnswer: team({ baseTeamSlug: "teams/wood-elves", roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann" }] } }) });
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    const narrow = openRow().querySelectorAll(".g-roster__extra .g-stepper--compact");
    assert.equal(narrow.length, 4, "Passing Virtuosos: catches earn SPP");
    assert.equal(labelOf(narrow.at(-1)), "CATCH +1");
    assert.equal(labelOf(openRow().querySelector(".g-roster__counters .g-stepper")), "TD +2");
  });
});

test("a tap on «+» writes the roster at once: the count, the row's SPP and «+3 SPP» since the screen opened change; the status says saving, then saved", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(status(), "", "nothing to say before a step");
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · manual edit", "no changes yet"]);
    const held = api.hold(PATCH);
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    fireEvent(plus("touchdowns", openRow()), "click");
    assert.equal(countOf("touchdowns", openRow()), "1");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"]);
    assert.equal(status(), "Saving…");
    assert.ok(view.querySelector(".g-roster__status .g-status--wait"));
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 1]], "one PATCH: the stored counter plus one");
    held.release();
    await settle();
    assert.equal(status(), "Saved");
    assert.ok(view.querySelector(".g-roster__status .g-status--live"));
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · manual edit", "+3 SPP"], "still since the screen opened");
    // A step down takes it back; the screen counts from the same start.
    api.reply(PATCH, 200, { team: team({ revision: 6 }) });
    fireEvent(minus("touchdowns", openRow()), "click");
    await settle();
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · manual edit", "no changes yet"]);
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 1], [5, 0]]);
  });
});

// Review Focus 4: the count is the career, the minus is the roster's.
test("the minus stops at the stored zero though the career says more", async () => {
  coach({ events: [{ playerId: "p1", counter: "touchdowns", delta: 1, pairingId: null, settledAt: null, injury: null }] });
  await renderTeamRoster("t1");
  assert.equal(countOf("touchdowns"), "1", "an edit outside a match waiting for its finish");
  assert.ok(minus("touchdowns").hasAttribute("disabled"));
  assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false, "a plain stop, not a refusal to explain");
  fireEvent(minus("touchdowns"), "click");
  await settle();
  assert.equal(patches().length, 0);
});

test("a desk coach edits the same counters in the panel: nine tiles «SPP · manual edit»", async () => {
  coach();
  await renderTeamRoster("t1");
  const block = aside().querySelector(".g-roster__manual");
  assert.equal(block.querySelector("h3").textContent, "SPP · manual edit");
  assert.deepEqual(sppLine(block), ["SPP · manual edit", "no changes yet"]);
  assert.equal(block.querySelectorAll(".g-stepper--compact").length, 9);
  assert.equal(aside().querySelectorAll(".g-stepper").length, 9, "every tile of the panel is a narrow one");
  api.reply(PATCH, 200, { team: withSpp("p1", { casualties: 1 }, { revision: 5 }) });
  fireEvent(plus("casualties"), "click");
  await settle();
  assert.deepEqual(patches().map(({ body }) => body.roster.players[0].spp), [{ casualties: 1 }]);
  assert.equal(countOf("casualties"), "1");
  assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "+2 SPP"]);
  assert.equal(bodyOf("p1#0").querySelectorAll(".g-rtable__row td")[6].textContent, "1", "the table's CAS column");
  api.assertAnswered();
});

test("another device: a red banner and «Load the new one», which reads the team and its records again; the edit is not sent again", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const elsewhere = withSpp("p1", { touchdowns: 4 }, { revision: 5 });
    api.reply(PATCH, 409, conflictOf(elsewhere));
    fireEvent(plus("touchdowns"), "click");
    await settle();
    const callout = notice("danger");
    assert.equal(callout.querySelector(".g-callout__title").textContent, "The roster was changed on another device");
    assert.equal(callout.querySelector(".g-callout__sub").textContent, "Your last edit was not saved: the server has a newer version. Load it and make the edit again.");
    assert.equal(status(), "Not saved");
    assert.ok(view.querySelector(".g-roster__status .g-status--danger"));
    assert.ok(stepButtons().length > 0);
    for (const button of stepButtons()) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), "The roster was changed on another device");
    }
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), "The roster was changed on another device", "a tap while it stands is told why it is not taken");
    assertStyled(view, "src/screens/team/roster/roster.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
      "progress-dots.css", "button.css", "callout.css", "action-stepper.css", "status-chip.css");
    api.calls.length = 0;
    api.reply("GET /api/teams/t1", 200, { team: elsewhere });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    const reload = view.querySelector("[data-roster-reload]");
    assert.equal(reload.textContent, "Load the new one");
    fireEvent(reload, "click");
    await settle();
    assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the games with the team: it is not taken on games older than it");
    assert.equal(countOf("touchdowns"), "4", "the server's");
    assert.equal(view.querySelector(".g-callout--danger"), null);
    assert.equal(status(), "");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "no changes yet"], "the coach's edit was given up, another's is not his");
    await settle();
    assert.equal(patches().length, 0);
  });
});

test("no network: a yellow banner with the edits waiting, the status at the heading; the browser asks before the tab closes; back online, they go", async () => {
  coach();
  await renderTeamRoster("t1");
  api.fail(PATCH);
  fireEvent(plus("touchdowns"), "click");
  await settle();
  const callout = notice("warn");
  assert.equal(callout.querySelector(".g-callout__title").textContent, "No network");
  assert.equal(callout.querySelector(".g-callout__sub").textContent, "Edits waiting: 1. They go once the connection is back. Do not close the page.");
  assert.equal(status(), "Waiting for the network · edits: 1");
  assert.equal(countOf("touchdowns"), "1", "the step stays on the screen");
  assert.equal(leaving(), true);
  api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
  api.calls.length = 0;
  page.dispatchEvent(new Event("online"));
  await settle();
  assert.equal(status(), "Saved");
  assert.equal(view.querySelector(".g-roster__notices .g-callout"), null);
  assert.equal(leaving(), false);
  assert.deepEqual(callKeys(), ["GET /api/games", PATCH], "the games are read first: no step goes into a match begun meanwhile (R8)");
});

test("a refusal names the rule, and the roster is read again", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.calls.length = 0;
    api.reply(PATCH, 422, refusalOf([{ code: "SPP_OUT_OF_RANGE", params: { player: "Ann", counter: "TD" } }]));
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.match(toasts().at(-1), /Ann/);
    assert.match(document.querySelectorAll("output").at(-1).className, /toast-error/);
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1").length, 1);
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1);
    assert.equal(countOf("touchdowns"), "0", "the server's roster");
    assert.equal(status(), "");
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

// Review Focus 2: the server takes a PATCH during a match, and it would break the match's finish.
test("while the games are unread no tap writes the roster", async () => {
  await withoutTimers(async () => {
    coach();
    const held = api.hold("GET /api/games");
    const drawing = renderTeamRoster("t1");
    await settle();
    assert.ok(stepButtons().length > 0);
    for (const button of stepButtons()) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), "Loading the matches…");
    }
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    await settle();
    assert.equal(patches().length, 0);
    held.release();
    await drawing;
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
    // A counter drawn open while the games are read again (the tab seen again) is asked again when it is tapped.
    const again = api.hold("GET /api/games");
    const reading = loadGames(true);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), "Loading the matches…");
    await settle();
    assert.equal(patches().length, 0);
    again.release();
    await reading;
    // Games that could not be read say why.
    coach();
    api.fail("GET /api/games");
    await renderTeamRoster("t1");
    assert.equal(plus("touchdowns").getAttribute("title"), "No connection to the server. Check the internet and try again.");
    assert.equal(minus("touchdowns").getAttribute("aria-disabled"), "true");
  });
});

// R8: no step of the roster's queue leaves during a match.
// Carry T7 (d) and its correction: takeServerTeam says null while a request is in the air.
test("the server's roster is not taken over a step in the air: it is read and taken again once the step has answered, and not at all if it was saved", async () => {
  await withoutTimers(async () => {
    for (const saved of [false, true]) {
      coach();
      await renderTeamRoster("t1");
      api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
      const reading = api.hold("GET /api/teams/t1");
      fireEvent(plus("touchdowns"), "click");
      await settle();
      assert.equal(reading.count, 1, "the refusal reads the roster again");
      // The coach taps again before it comes: the refused step and his new one go out.
      const sending = api.hold(PATCH);
      fireEvent(plus("casualties"), "click");
      await settle();
      reading.release();
      await settle();
      assert.equal(countOf("casualties"), "1", "the roster is not swapped under the step in the air");
      api.calls.length = 0;
      if (saved) api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1, casualties: 1 }, { revision: 6 }) });
      sending.release(saved ? undefined : { error: new TypeError("Failed to fetch") });
      await settle();
      const reads = callKeys().filter((key) => key.startsWith("GET /api/teams/")).sort();
      if (saved) {
        assert.deepEqual(reads, [], "a save that landed makes the take needless: an older roster would be laid over it");
        assert.deepEqual([status(), countOf("casualties")], ["Saved", "1"]);
      } else {
        assert.deepEqual(reads, ["GET /api/teams/t1", "GET /api/teams/t1/events"], "read again, not the copy from before the step");
        assert.deepEqual([status(), countOf("casualties"), save.saveState("t1").waiting], ["", "0", 0]);
      }
    }
  });
});

test("a match that began while the network was gone: back online, the edits that wait are not sent but given up, and the coach is told", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    // The match began on another device meanwhile; a server that would take the step answers it.
    api.calls.length = 0;
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(patches().length, 0, "no step leaves during a match");
    assert.equal(callKeys()[0], "GET /api/games", "the games first");
    assert.deepEqual(callKeys().slice(1).sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "then the server's roster, the games with it");
    assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
    assert.equal(save.saveState("t1").waiting, 0);
    assert.equal(leaving(), false, "nothing waits: nothing to ask about");
    assert.equal(countOf("touchdowns"), "0", "the server's count");
    assert.equal(status(), "");
    assert.ok(!view.querySelector(".g-roster__offline"), "no network is no longer the news");
  });
});

test("a match learned of on the screen gives up the edits that wait as well; the network back during it sends nothing (R8)", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 2);
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    await invalidateGames();
    await settle();
    assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (2). Make them again as an edit outside the match.");
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(patches().length, 1, "the one try before the network went: the second step waited behind it, and neither went again");
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

test("a step in the air when a match is learned of is let be; what still waits once it has answered is given up (R8)", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const held = api.hold(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(held.count, 1);
    api.calls.length = 0;
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    await invalidateGames();
    await settle();
    assert.deepEqual(callKeys(), ["GET /api/games"], "nothing is read nor taken while the step is in the air");
    held.release({ error: new TypeError("Failed to fetch") });
    await settle();
    assert.match(toasts().at(-1), /^A match has begun/);
    assert.deepEqual([save.saveState("t1").waiting, patches().length], [0, 0]);
    assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"]);
  });
});

// Fix round 1, Important 1: a 409 is often how the coach learns that a match has begun.
test("another device's save that was a match's start: «Load the new one» reads the games with the team, and the next tap saves nothing (R8)", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    // The match began elsewhere: the start moved the team's revision, and the games now say so.
    const started = team({ revision: 5 });
    api.reply(PATCH, 409, conflictOf(started));
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.ok(notice("danger"));
    api.calls.length = 0;
    api.reply("GET /api/teams/t1", 200, { team: started });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
    fireEvent(view.querySelector("[data-roster-reload]"), "click");
    await settle();
    assert.ok(callKeys().includes("GET /api/games"));
    assert.equal(view.querySelector(".g-callout--danger"), null);
    assert.ok(minus("touchdowns").hasAttribute("disabled"), "the match's own rule: its records for him add up to nothing");
    api.reply(EVENTS, 201, { event: rowOf() });
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(patches().length, 0, "no save of the roster during the match");
    assert.deepEqual(posts().map(({ body }) => [body.pairingId, body.counter]), [["g2", "touchdowns"], ["g2", "casualties"]], "records of the match instead");
    assert.equal(toasts().some((text) => text.startsWith("A match has begun")), true, "the edit the 409 met is said lost");
  });
});

// Fix round 1, Important 2: a step whose answer was lost may be on the server; it is not counted lost.
test("the edits a match gives up are counted against the server's roster: a step that landed with its answer lost is not one of them", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 2);
    // The server has the touchdown (its answer was lost), not the casualty; then the match begins.
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    await invalidateGames();
    await settle();
    assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
    assert.deepEqual([countOf("touchdowns"), countOf("casualties")], ["1", "0"]);
    assert.equal(save.saveState("t1").waiting, 0);
  });
});

// Fix round 1, Minor 4: after a refusal the server holds the coach's saved steps as they were.
test("a refusal takes the server's roster but keeps what the coach's saved edits have moved since the screen opened", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "+3 SPP"]);
    api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.deepEqual([countOf("touchdowns"), countOf("casualties")], ["1", "0"], "the server's roster");
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "+3 SPP"], "his saved touchdown still counts");
  });
});

test("edits that wait when the roster is entered again go once the games say no match is on (R8)", async () => {
  coach();
  await renderTeamRoster("t1");
  api.fail(PATCH);
  fireEvent(plus("touchdowns"), "click");
  await settle();
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  api.calls.length = 0;
  api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
  await renderTeamRoster("t1");
  await settle();
  assert.equal(patches().length, 1, "no online event came: the screen sends them itself");
  assert.ok(callKeys().indexOf("GET /api/games") < callKeys().indexOf(PATCH), "once the games are read");
  assert.equal(status(), "Saved");
  assert.equal(countOf("touchdowns"), "1", "the step drawn while it waited");
});

test("a counter at the most a roster takes says why its plus is refused, without a request", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: withSpp("p1", { touchdowns: 999 }) });
    await renderTeamRoster("t1");
    const refusal = "Ann: SPP counter TD must be a whole number from 0 to 999.";
    assert.equal(plus("touchdowns").getAttribute("aria-disabled"), "true");
    assert.equal(plus("touchdowns").getAttribute("title"), refusal);
    assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), refusal);
    await settle();
    assert.equal(patches().length, 0);
  });
});

// Carry T9 (a): a redraw that takes the focused element away puts the focus somewhere sensible, never on the body.
test("a redraw that takes the focused button away: the minus stopped at zero gives it to its plus; a sheet whose player has gone, to the title", async () => {
  await withoutTimers(async () => {
    coach({ teamAnswer: withSpp("p1", { touchdowns: 1 }) });
    await renderTeamRoster("t1");
    api.reply(PATCH, 200, { team: team({ revision: 5 }) });
    minus("touchdowns").focus();
    fireEvent(minus("touchdowns"), "click");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    // Compared by identity: a failed deepEqual of two fake elements would print the whole page.
    assert.ok(document.activeElement === plus("touchdowns"), "the plus beside it");
    await settle();
    // Bors's sheet is open when the roster is read again without him (a refusal reads it).
    fireEvent(toggle("p2#1"), "click");
    const held = api.hold(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(held.count, 1, "his step is in the air");
    fireEvent(chipIn(aside(), "Block"), "click");
    sheet().querySelector("[data-sheet-close]").focus();
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 6, roster: { players: PLAYERS.filter(({ id }) => id !== "p2") } }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
    held.release({ status: 422, body: refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]) });
    await settle();
    assert.equal(sheet(), null);
    assert.equal(toggle("p2#1"), null, "he has left the roster");
    assert.ok(document.activeElement === view.querySelector("h1"), "the title, not the body");
  });
});

// ---------------------------------------------------------------------------
// A preparation and a match (Task 11)
// ---------------------------------------------------------------------------

test("a preparation that is on: a yellow banner, the round, what any save resets, and the way to it; the counters still write the roster", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([PREP_GAME]);
    await renderTeamRoster("t1");
    const callout = notice("warn");
    assert.ok(callout && callout === banner(), "the first banner");
    assert.equal(titleOf(callout), "Preparation for round 3 is on");
    // R12: the steps as the pre-match names them; resetChangedRosters keeps the fans and the weather only.
    assert.equal(subOf(callout), "Any save of the roster, SPP included, resets the steps «Roster», «Inducements» and «Kick / receive». Fans and weather stay.");
    const link = callout.querySelector(".g-callout__action .g-roster__calloutlink");
    assert.equal(link.getAttribute("href"), "#/games/g1/pre-match");
    assert.equal(link.textContent, "To the preparation →");
    assert.equal(outsideSwitch(), null, "nothing is a match's yet");
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual([patches().length, posts().length], [1, 0], "a save of the roster, as outside a match");
    assert.equal(aside().querySelector("a.g-btn--primary").textContent, "Advance", "a preparation closes nothing");
    // A friendly has no round.
    coach();
    gamesAre([{ ...PREP_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
    await renderTeamRoster("t1");
    assert.equal(titleOf(notice("warn")), "Preparation for a friendly is on");
    // The steps in Russian are the pre-match's own words.
    coach();
    gamesAre([PREP_GAME]);
    useLocale("ru");
    try {
      await renderTeamRoster("t1");
      assert.equal(titleOf(notice("warn")), "Идёт подготовка к туру 3");
      assert.match(subOf(notice("warn")), /«Индусменты» и «Удар \/ приём»/);
    } finally {
      useLocale("en");
    }
  });
});

test("a match on: a green banner with the round and the records, the switch and the post-match; a tap is a record of the match, and the count shows «+1» for it in the table and in the counter", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const callout = banner();
    assert.equal(callout.getAttribute("class"), "g-callout", "the accent tone, the banner's base look");
    assert.equal(titleOf(callout), "Match on · round 3 · records: 0");
    assert.equal(subOf(callout), "Taps are recorded in the match: they count in the career at once and fill in the post-match. Hiring, sales, advancements and the treasury — after the post-match.");
    // K9: the action is the switch and the link; the switch's caption is what describes it, not a part of its name.
    const action = callout.querySelector(".g-callout__action");
    assert.deepEqual(action.querySelectorAll("button, a").map((node) => node.tagName), ["BUTTON", "A"]);
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(outsideSwitch().textContent, "Edit outside the match");
    const described = view.querySelector(`#${outsideSwitch().getAttribute("aria-describedby")}`);
    assert.equal(described.textContent, "fix an old mistake without touching the round 3");
    assert.ok(described.hasAttribute("hidden"), "read to a screen reader as the switch's description, not drawn in the banner");
    const link = action.querySelector("a.g-roster__calloutlink");
    assert.deepEqual([link.getAttribute("href"), link.textContent], ["#/games/g2/post-match", "Post-match →"]);
    api.reply(EVENTS, 201, { event: rowOf() });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "touchdowns", delta: 1 }]);
    assert.equal(patches().length, 0, "no save of the roster during a match (R8)");
    const cell = bodyOf("p1#0").querySelectorAll(".g-rtable__row td")[5];
    assert.equal(cell.querySelector("sup.g-rtable__delta").textContent, ", this match +1");
    assert.equal(cell.childNodes[0].textContent, "1", "the career counts it at once");
    assert.equal(deltaOf("touchdowns"), "+1");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
    // The panel's block is the match's records, worth +3 SPP; the MVP and the advancements wait for the post-match.
    const block = aside().querySelector(".g-roster__manual");
    assert.deepEqual(sppLine(block), ["Match records · round 3", "+3 SPP in the match"]);
    assert.equal(block.querySelector(".g-roster__matchnote").textContent, "MVP — in the post-match. Advancement and sales — after it.");
    assert.equal(aside().querySelector(".g-roster__availn").textContent, "3", "SPP available at once");
    assertStyled(view, "src/screens/team/roster/roster.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
      "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css");
    api.assertAnswered();
  });
});

test("on a phone the open row of a match says what the match has given him: «SPP 3 · round 3 · counts at once» and its SPP", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ events: [rowOf()] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.deepEqual(sppLine(openRow()), ["SPP 3 · round 3 · counts at once", "+3 SPP"]);
    assert.equal(deltaOf("touchdowns", openRow()), "+1");
    // A friendly is named so.
    coach({ events: [] });
    gamesAre([{ ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.deepEqual(sppLine(openRow()), ["SPP 0 · friendly · counts at once", "no changes yet"]);
    assert.equal(titleOf(banner()), "Match on · friendly · records: 0");
  });
});

test("the MVP is no tap of the match: its plus says why; with the switch on it is an edit outside the match", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(plus("mvps").getAttribute("aria-disabled"), "true");
    assert.equal(plus("mvps").getAttribute("title"), "The MVP is picked in the post-match");
    fireEvent(plus("mvps"), "click");
    assert.equal(toasts().at(-1), "The MVP is picked in the post-match");
    await settle();
    assert.deepEqual([posts().length, patches().length], [0, 0]);
    fireEvent(outsideSwitch(), "click");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "true");
    assert.equal(plus("mvps").hasAttribute("aria-disabled"), false);
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, counter: "mvps" }) });
    fireEvent(plus("mvps"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: null, playerId: "p1", counter: "mvps", delta: 1 }]);
    assert.equal(patches().length, 0);
  });
});

test("a player who sits the match out takes no tap of it, and says why; with the switch on he does", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p4#3"), "click");
    const steps = aside().querySelectorAll("[data-action-step]");
    assert.equal(steps.length, 18);
    for (const button of steps) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), "Not playing this match");
    }
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), "Not playing this match");
    await settle();
    assert.equal(posts().length, 0);
    fireEvent(outsideSwitch(), "click");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, playerId: "p4" }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: null, playerId: "p4", counter: "touchdowns", delta: 1 }]);
  });
});

// Review Focus 4: the minus of an edit outside the match stops where the roster and the edits waiting add up to nothing.
test("with the switch on a tap is an edit outside the match: no pairing, the banner turns yellow, the minus stops at the roster and the edits waiting", async () => {
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(countOf("touchdowns").startsWith("1"), true);
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "a tap of the match takes back the match's record");
    // A record of the match made on this visit is no manual edit (fix round 1, Minor 4).
    api.reply(EVENTS, 201, { event: rowOf({ id: "e9", counter: "casualties" }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    fireEvent(outsideSwitch(), "click");
    const callout = notice("warn");
    assert.ok(callout && callout === banner(), "the first banner");
    assert.equal(titleOf(callout), "Match on · round 3 · records: 2");
    assert.equal(subOf(callout), "Taps change the career and do not go into the match: for an old mistake.");
    assert.ok(minus("touchdowns").hasAttribute("disabled"), "the roster's 0 and no edit waiting: an edit has nothing to take back");
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "no changes yet"], "the casualty of the match is not counted");
    api.reply(EVENTS, 201, { event: rowOf({ id: "e1", pairingId: null }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g2", null]);
    assert.equal(patches().length, 0);
    assert.equal(countOf("touchdowns").startsWith("2"), true, "the career counts the edit");
    assert.equal(deltaOf("touchdowns"), "+1", "the match's own: the edit is not one of its records");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 2");
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "the edit waiting can be taken back");
    assert.deepEqual(sppLine(aside().querySelector(".g-roster__manual")), ["SPP · manual edit", "+3 SPP"], "the edit's touchdown alone");
    await withWindow({ phone: true }, async () => {
      fireEvent(toggle("p1#0"), "click");
      assert.deepEqual(sppLine(openRow()), ["SPP 8 · manual edit", "+3 SPP"]);
    });
    // Off again: the match's rule.
    fireEvent(outsideSwitch(), "click");
    assert.equal(banner().getAttribute("class"), "g-callout");
  });
});

test("advancement waits for the post-match: «Profile and advancement», «Advance» and the pencil say so", async () => {
  await withoutTimers(async () => {
    const check = (control) => {
      assert.equal(control.tagName, "BUTTON");
      assert.equal(control.hasAttribute("href"), false);
      assert.equal(control.getAttribute("aria-disabled"), "true");
      assert.equal(control.getAttribute("title"), AFTER_POST);
      fireEvent(control, "click");
      assert.equal(toasts().at(-1), AFTER_POST);
    };
    await withWindow({ phone: true }, async () => {
      coach();
      gamesAre([LIVE_GAME]);
      await renderTeamRoster("t1");
      fireEvent(toggle("p2#1"), "click");
      const profile = openRow().querySelector(".g-roster__closed");
      assert.equal(profile.textContent, "Profile and advancement");
      check(profile);
      assert.equal(openRow().querySelector("a"), null);
      assertCspSafe(view);
      assertStyled(view, "src/screens/team/roster/roster.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
        "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css");
    });
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#1"), "click");
    const [pencil, advance] = aside().querySelectorAll(".g-roster__closed");
    assert.equal(pencil.getAttribute("aria-label"), "Edit Bors");
    check(pencil);
    assert.equal(advance.textContent, "Advance");
    check(advance);
    assert.equal(aside().querySelector(".g-roster__cheapest").textContent, AFTER_POST);
    assert.equal(aside().querySelector("a"), null);
    // The switch edits the career, not the roster's advancements: they stay closed.
    fireEvent(outsideSwitch(), "click");
    assert.equal(aside().querySelectorAll(".g-roster__closed").length, 2);
  });
});

// Review Focus 1: a step down in the match waits for the step up it takes back, and is open as soon as the plus is taken.
test("a minus right after a plus counts the plus still on its way", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "open at once: the plus on its way counts");
    assert.equal(deltaOf("touchdowns"), "+1");
    fireEvent(minus("touchdowns"), "click");
    assert.equal(deltaOf("touchdowns"), null);
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    await settle();
    assert.deepEqual([held.count, posts().length], [1, 1], "the minus waits for the plus");
    api.reply(EVENTS, 201, { event: rowOf({ id: "e2", delta: -1 }) });
    held.release({ status: 201, body: { event: rowOf({ id: "e1" }) } });
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.delta), [1, -1]);
    assert.equal(countOf("touchdowns"), "0");
    assert.equal(deltaOf("touchdowns"), null);
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
    assert.equal(bodyOf("p1#0").querySelectorAll(".g-rtable__row td")[5].textContent, "0");
    api.assertAnswered();
  });
});

// Review Focus 2: a match that ended (or never began) as the server counts it.
test("a match that ended elsewhere: the tap is refused, the screen reads the games and the records again and leaves the match mode", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "There is no match in progress to record this in.");
    assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events", EVENTS]);
    assert.equal(view.querySelector(".g-roster__notices"), null, "no banner of a match");
    assert.equal(countOf("touchdowns"), "0", "the refused step is gone");
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual([posts().length, patches().length], [1, 1], "a save of the roster now");
  });
});

test("a side that saved its Players step: the refusal is said, and the match's steppers say it before the next tap; the switch still works", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.reply(EVENTS, 409, refused("EVENT_SIDE_LOCKED"));
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    assert.equal(posts().length, 1);
    for (const button of aside().querySelectorAll("[data-action-step]")) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), SIDE_LOCKED);
    }
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(posts().length, 1, "said, not sent");
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("casualties").hasAttribute("aria-disabled"), false, "an edit outside the match is no step of the post-match");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: null, counter: "casualties" }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g2", null]);
    // Off again, the match's steppers still say it: nothing has been read since.
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("touchdowns").getAttribute("title"), SIDE_LOCKED);
    // The records read again (an edit whose answer was lost), the next tap of the match asks the server again.
    fireEvent(outsideSwitch(), "click");
    api.fail(EVENTS);
    api.calls.length = 0;
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.ok(callKeys().includes("GET /api/teams/t1/events"));
    fireEvent(outsideSwitch(), "click");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
  });
});

test("a tap whose answer was lost: the records are read again, not the tap sent again — once for the taps behind it, which are not sent", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], ["+1", "+1"]);
    await settle();
    // The touchdown was written after all; its answer never came.
    const reading = api.hold("GET /api/teams/t1/events");
    held.release({ error: new TypeError("Failed to fetch") });
    await settle();
    // While the records are read again no tap is taken: what they hold is not known (fix round 1, Minor 1).
    for (const button of aside().querySelectorAll("[data-action-step]")) assert.equal(button.getAttribute("title"), READING);
    fireEvent(plus("knockouts"), "click");
    assert.equal(toasts().at(-1), READING);
    reading.release({ status: 200, body: { events: [rowOf()], revision: 4 } });
    await settle();
    assert.equal(plus("knockouts").hasAttribute("aria-disabled"), false, "open once they are read");
    assert.equal(posts().length, 1, "neither sent again nor the casualty sent, nor the knockout tapped meanwhile");
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1, "read once for both");
    assert.deepEqual(toasts().filter((text) => text.startsWith("The answer") || text.startsWith("Not sent")),
      ["The answer to the record did not arrive: the records are read again to see whether it was written."]);
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], ["+1", null], "what the server has");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
  });
});

// Fix round 1, Important 1: leaving the match by a change of the games reads the roster and the records again (Carry T10).
test("a match that ends while the screen is open: the roster and its records are read again with the games, the counters wait for them, and the next tap saves the roster the finish left", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    // The post-match was finished on another device: the finish wrote the roster (revision 5) and settled the records.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    const reading = api.hold("GET /api/teams/t1/events");
    await invalidateGames();
    await settle();
    assert.equal(view.querySelector(".g-roster__notices"), null, "no banner of a match");
    assert.ok(callKeys().includes("GET /api/teams/t1") && callKeys().includes("GET /api/teams/t1/events"));
    assert.equal(plus("touchdowns").getAttribute("title"), READING);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.equal(patches().length, 0, "nothing on the roster read during the match");
    reading.release();
    await settle();
    assert.equal(countOf("touchdowns"), "1", "the roster the finish wrote");
    api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 2 }, { revision: 6 }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[5, 2]]);
    // Read afresh, the roster is the coach's again: a later read of it (a refusal's) closes nothing (Task 10).
    api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
    const again = api.hold("GET /api/teams/t1");
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(again.count, 1);
    assert.equal(plus("casualties").hasAttribute("aria-disabled"), false);
    again.release();
    await settle();
  });
});

test("a read of the records that fails says why and opens the counters again", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.fail(EVENTS);
    api.fail("GET /api/teams/t1/events");
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "No connection to the server. Check the internet and try again.");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false, "what the screen has is all it has: the counters work on it");
  });
});

// Fix round 1, Minor 1: a read that lands with a tap still in the air may hold its row already.
test("a read that lands while a tap is in the air is not taken: the counters stay closed until the tap has answered and the records are read again, and nothing is sent meanwhile", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const sending = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    // The match is finished elsewhere meanwhile; the roster the finish wrote already has the touchdown.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    await invalidateGames();
    await settle();
    assert.equal(countOf("touchdowns"), "1", "the tap on its way, not the tap twice");
    assert.equal(minus("touchdowns").getAttribute("title"), READING);
    fireEvent(minus("touchdowns"), "click");
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.deepEqual([posts().length, patches().length], [1, 0], "nothing sent");
    api.calls.length = 0;
    sending.release({ status: 201, body: { event: rowOf() } });
    await settle();
    assert.deepEqual(callKeys().filter((key) => key.startsWith("GET /api/teams/")).sort(), ["GET /api/teams/t1", "GET /api/teams/t1/events"], "read again once it has answered");
    assert.equal(countOf("touchdowns"), "1", "the finish's roster; its record is settled");
    assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
  });
});

test("a tap answered while the records are read again is kept though the read was made before it was written", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const sending = api.hold(EVENTS);
    fireEvent(plus("casualties"), "click");
    await settle();
    // Another match of the team is on now (another game): the records are read again while the casualty is on its way.
    gamesAre([{ ...LIVE_GAME, id: "g7" }]);
    const reading = api.hold("GET /api/teams/t1/events");
    await invalidateGames();
    await settle();
    assert.equal(reading.count, 1);
    sending.release({ status: 201, body: { event: rowOf({ id: "e5", counter: "casualties" }) } });
    await settle();
    reading.release({ status: 200, body: { events: [], revision: 4 } });
    await settle();
    assert.equal(countOf("casualties"), "1", "the row the read did not see");
    assert.equal(deltaOf("casualties"), null, "a record of g2, not of g7");
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 0");
  });
});

test("a minus with nothing to take back on the server: said, and the records read again once", async () => {
  await withoutTimers(async () => {
    coach({ events: [rowOf({ id: "e0" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    // Another device of the coach took the touchdown back meanwhile.
    api.reply(EVENTS, 409, refused("EVENT_BELOW_ZERO"));
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 4 });
    fireEvent(minus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "This counter is already at zero, there is nothing to take back.");
    assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events", EVENTS]);
    assert.equal(countOf("touchdowns"), "0");
    assert.ok(minus("touchdowns").hasAttribute("disabled"));
  });
});

test("a refusal the records cannot answer is said once and nothing is read; the taps behind it are given up unsent", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    const held = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    await settle();
    const before = toasts().length;
    held.release({ status: 422, body: refused("POST_PLAYER") });
    await settle();
    assert.deepEqual(toasts().slice(before), ["This player is unavailable for this action."]);
    assert.deepEqual(callKeys(), [EVENTS], "one tap sent, nothing read");
    assert.deepEqual([deltaOf("touchdowns"), deltaOf("casualties")], [null, null]);
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
  });
});

test("the switch is kept per team while the page lives", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME, { ...LIVE_GAME, id: "g3", home: { user: { id: "u1" }, team: { id: "t2" } } }]);
    await renderTeamRoster("t1");
    fireEvent(outsideSwitch(), "click");
    releaseCurrentScreen();
    view.innerHTML = "<p>elsewhere</p>";
    await renderTeamRoster("t1");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "true");
    assert.ok(notice("warn"));
    api.reply("GET /api/teams/t2", 200, { team: team({ id: "t2", name: "Grimtusk Raiders" }) });
    api.reply("GET /api/teams/t2/events", 200, { events: [], revision: 4 });
    releaseCurrentScreen();
    await renderTeamRoster("t2");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(banner().getAttribute("class"), "g-callout");
  });
});

// R13: a switch left on in one match does not send the next match's taps outside it.
test("the switch is kept per match too: the same team's next match starts with it off", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(outsideSwitch(), "click");
    releaseCurrentScreen();
    view.innerHTML = "<p>elsewhere</p>";
    // Round 4's match is on now.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }, { ...LIVE_GAME, id: "g7", roundNumber: 4, season: { currentRound: 4 } }]);
    await renderTeamRoster("t1");
    assert.equal(titleOf(banner()), "Match on · round 4 · records: 0");
    assert.equal(outsideSwitch().getAttribute("aria-checked"), "false");
    assert.equal(banner().getAttribute("class"), "g-callout");
    api.reply(EVENTS, 201, { event: rowOf({ pairingId: "g7" }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body.pairingId), ["g7"]);
  });
});

test("a team whose race the reference does not know: a line that says so, and no table", async () => {
  coach({ teamAnswer: team({ baseTeamSlug: "teams/unknown" }) });
  await renderTeamRoster("t1");
  const callout = view.querySelector(".g-callout--danger");
  assert.equal(callout.querySelector(".g-callout__title").textContent, "The reference does not know this team's race (teams/unknown): the roster cannot be drawn.");
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector(".g-roster__aside"), null);
  assert.equal(view.querySelector("[data-roster-retry]"), null, "reading again would not teach the reference the race");
});

test("a roster that could not be read says why, and reads again on «Try again»", async () => {
  coach();
  api.fail("GET /api/teams/t1");
  await renderTeamRoster("t1");
  const callout = view.querySelector(".g-roster__failed .g-callout--danger");
  assert.ok(callout.querySelector(".g-callout__title").textContent.length > 0);
  assert.equal(view.querySelector("table"), null);
  const retry = view.querySelector("[data-roster-retry]");
  assert.equal(retry.textContent, "Try again");
  api.reply("GET /api/teams/t1", 200, { team: team() });
  retry.focus();
  api.calls.length = 0;
  fireEvent(retry, "click");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the roster…");
  assert.equal(document.activeElement, view.querySelector("h1"), "the button is gone: the focus is on the title");
  await settle();
  assert.equal(view.querySelector(".g-callout--danger"), null);
  assert.equal(bodies().length, 7);
  assert.deepEqual(callKeys().sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the games with the team (R8)");
});

test("a screen left before the roster came draws nothing", async () => {
  coach();
  const held = api.hold("GET /api/teams/t1");
  const drawing = renderTeamRoster("t1");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  held.release();
  await drawing;
  assert.equal(view.querySelector("table"), null);
  assert.equal(view.querySelector("p").textContent, "elsewhere");
});

test("the games are read on entry and when the tab is seen again; a change in them draws the screen again", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  try {
    coach();
    await renderTeamRoster("t1");
    const reads = () => api.calls.filter(({ key }) => key === "GET /api/games").length;
    assert.equal(reads(), 1, "on entry, however fresh the list the page has");
    document.visibilityState = "hidden";
    events.dispatchEvent(new Event("visibilitychange"));
    assert.equal(reads(), 1, "a tab put away reads nothing");
    document.visibilityState = "visible";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(reads(), 2);
    releaseCurrentScreen();
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(reads(), 2, "a screen left reads nothing");
  } finally {
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("a player's and a skill's name are text", async () => {
  coach({ teamAnswer: team({ name: HOSTILE, roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: HOSTILE, extraSkills: [{ name: HOSTILE }] }] } }) });
  await renderTeamRoster("t1");
  assert.equal(bodyOf("p1#0").querySelector(".g-rtable__name").textContent, HOSTILE);
  assert.equal(aside().querySelector(".g-roster__pname").textContent, HOSTILE);
  fireEvent(chipIn(bodyOf("p1#0"), HOSTILE), "click");
  assert.equal(sheet().querySelector("h2").textContent, HOSTILE);
  assert.equal(view.querySelector("img"), null);
  assert.equal(view.querySelector("[onerror]"), null);
  assertCspSafe(view);
});

test("every class the screen draws is styled and nothing the CSP refuses is on it, on a phone and on a desk, with a sheet open", async () => {
  const sheets = ["src/screens/team/roster/roster.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
    "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css", "action-stepper.css", "status-chip.css"];
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach();
      await renderTeamRoster("t1");
      fireEvent(toggle("p2#1"), "click");
      fireEvent(chipIn(bodyOf("p2#1"), "Block"), "click");
      assertCspSafe(view);
      assertStyled(view, ...sheets);
    });
  }
  coach({ teamAnswer: team({ baseTeamSlug: "teams/unknown" }) });
  await renderTeamRoster("t1");
  assertStyled(view, ...sheets);
});

test("every key the screen asks for is in both dictionaries; the counters' and the sources' are walked", () => {
  const dir = "src/screens/team/roster/";
  assertDictionaryCovers(...readdirSync(new URL(`../${dir}`, import.meta.url)).filter((name) => name.endsWith(".mjs")).map((name) => `${dir}${name}`));
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const counter of SPP_EVENT_COUNTERS) {
      assert.ok(words[`teamRoster.counter.${counter}`], `${locale} teamRoster.counter.${counter}`);
      assert.ok(words[`teamRoster.counterName.${counter}`], `${locale} teamRoster.counterName.${counter}`);
    }
    for (const source of ["base", "primary", "secondary", "favoured", "captain"]) assert.ok(words[`teamRoster.source.${source}`], `${locale} teamRoster.source.${source}`);
  }
  // The counters' abbreviations are English in both languages, as TD and CAS are in the glossary.
  for (const counter of SPP_EVENT_COUNTERS) assert.equal(dictionary("ru")[`teamRoster.counter.${counter}`] === dictionary("en")[`teamRoster.counter.${counter}`], !["landings", "bonus"].includes(counter), counter);
});

test("on a phone the open row, on a desk the panel beside the table", () => {
  const sheet = "src/screens/team/roster/roster.css";
  assert.ok(valuesOf(sheet, ".g-roster__aside", "display").includes("none"));
  assert.ok(valuesOf(sheet, ".g-roster__layout", "grid-template-columns").includes("minmax(0, 1fr) 320px"));
  assert.ok(valuesOf(sheet, ".g-roster__aside", "position").includes("sticky"));
  assert.deepEqual(valuesOf(sheet, ".g-roster__heading", "font"), ["700 26px/1.1 var(--font-display)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__heading", "text-transform"), ["none"]);
  const breakpoints = [...text(sheet).matchAll(/@media[^{]+/g)].map(([query]) => query.trim());
  assert.ok(breakpoints.length > 0);
  for (const query of breakpoints) assert.match(query, /^@media \((max-width: 900px|min-width: 901px)\)$/);
  assert.ok(text("src/styles.css").trimEnd().endsWith('@import url("screens/team/roster/roster.css");'));
});

test("the counters: six two to a row (one on the narrowest phone), the narrow ones as many to a row as leave each button a thumb's width; the SPP line quiet, its sum in the accent", () => {
  const sheet = "src/screens/team/roster/roster.css";
  // Two to a row, or one where two do not fit (320px): never more than two.
  assert.deepEqual(valuesOf(sheet, ".g-roster__counters", "grid-template-columns"), ["repeat(auto-fit, minmax(max(var(--roster-full), calc((100% - var(--space-8)) / 2)), 1fr))"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster", "--roster-full"), ["calc(2 * var(--size-touch) + 48px)"]);
  // A narrow tile is two 44px buttons, their gap, the cell's padding and border: three of them do not fit a 320px panel or a 360px phone.
  for (const selector of [".g-roster__extra", ".g-roster__tiles"]) {
    assert.deepEqual(valuesOf(sheet, selector, "grid-template-columns"), ["repeat(auto-fit, minmax(var(--roster-tile), 1fr))"], selector);
  }
  assert.deepEqual(valuesOf(sheet, ".g-roster", "--roster-tile"), ["calc(2 * var(--size-touch) + 10px)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__sppline", "font"), ["400 13px/1.3 var(--font-body)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__sppline", "color"), ["var(--muted)"]);
  assert.deepEqual([valuesOf(sheet, ".g-roster__sppdelta", "font-weight"), valuesOf(sheet, ".g-roster__sppdelta", "color")], [["600"], ["var(--accent-text)"]]);
  // Carry T9: text the 2.x globals could reach says what it is in full.
  for (const selector of [".g-roster__avail", ".g-roster__availn", ".g-roster__availl", ".g-roster__ledger", ".g-roster__cheapest", ".g-roster__access", ".g-roster__next",
    ".g-roster__from", ".g-roster__nopage", ".g-roster__sppline", ".g-roster__manualtitle"]) {
    assert.deepEqual(valuesOf(sheet, selector, "text-transform"), ["none"], selector);
  }
  for (const selector of [".g-roster__avail", ".g-roster__ledger", ".g-roster__cheapest", ".g-roster__access", ".g-roster__nopage"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background")], [["0"], ["none"]], selector);
  }
});

test("the words of the screen are readable in every palette, on the page, the panel and its SPP block", () => {
  const sheet = "src/screens/team/roster/roster.css";
  for (const selector of [".g-roster__count", ".g-roster__loading"]) assertReadable(sheet, selector, "color", ["--page"], 4.5);
  for (const selector of [".g-roster__pline", ".g-roster__access", ".g-roster__next"]) assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  for (const selector of [".g-roster__ledger", ".g-roster__cheapest", ".g-roster__availl"]) assertReadable(sheet, selector, "color", ["--surface-2"], 4.5);
  // 40px bold: large text, 3:1.
  assertReadable(sheet, ".g-roster__availn", "color", ["--surface-2"], 3);
  // The SPP line and its sum stand on the open row's tint and on the panel's block, the sheet's lines on the sheet.
  for (const selector of [".g-roster__sppline", ".g-roster__sppdelta", ".g-roster__sppdelta--none", ".g-roster__manualtitle"]) assertReadable(sheet, selector, "color", ["--surface-2"], 4.5);
  for (const selector of [".g-roster__from", ".g-roster__nopage"]) assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  // The match's note under the panel's tiles, on its block.
  assertReadable(sheet, ".g-roster__matchnote", "color", ["--surface-2"], 4.5);
});

test("the banner's action: up to 900px a line of its own whose switch and link may wrap; the link one line and a thumb tall (K9)", () => {
  const sheet = "src/screens/team/roster/roster.css";
  const phone = [...text(sheet).matchAll(/@media \(max-width: 900px\) \{([\s\S]*?)\n\}/g)].map(([, body]) => body).join("\n");
  assert.match(phone, /\.g-roster__notices \.g-callout__action \{[^}]*white-space: normal;[^}]*flex-basis: 100%;/);
  assert.deepEqual(valuesOf(sheet, ".g-roster__notices .g-callout__action", "white-space"), ["normal"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__notices .g-callout__action", "flex-basis"), ["100%"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutactions", "flex-wrap"), ["wrap"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "min-height"), ["var(--size-touch)"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__calloutlink", "color"), ["inherit"], "the banner's own ink, readable on its tint");
  // A closed «Advance» keeps its resting look under the pointer: button.css lights a primary that is not :disabled.
  assert.deepEqual(valuesOf(sheet, '.g-btn--primary.g-roster__closed[aria-disabled="true"]:hover', "background"), ["var(--disabled)"]);
  for (const selector of [".g-roster__calloutlink", ".g-roster__matchnote"]) assert.deepEqual(valuesOf(sheet, selector, "text-transform"), ["none"], selector);
});

test("the player's address still draws the 2.x editor until stage 07d", () => {
  const router = text("src/core/router.mjs");
  assert.ok(router.includes("teamRoster: ({ teamId }) => renderTeamRoster(teamId),"));
  assert.ok(router.includes("teamPlayer: ({ teamId }) => renderSavedRoster(teamId),"));
});
