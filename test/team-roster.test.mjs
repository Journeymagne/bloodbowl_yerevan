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
const { INJURIES } = await import("../src/domain/post-match/rules.mjs");
const { renderTreasuryStrip } = await import("../src/screens/team/manage/strip.mjs");

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
const KEYS = PLAYERS.map(({ id }) => `${id}#0`);
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
  api.reply("GET /api/teams/t1/fallen", 200, { fallen: [] });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

const PATCH = "PATCH /api/teams/t1";
const patches = () => api.calls.filter(({ key }) => key === PATCH);
// The fallen are read with the roster (stage 07b) and are not what these tests count.
const callKeys = () => api.calls.map(({ key }) => key).filter((key) => key !== "GET /api/teams/t1/fallen");
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
const UNSURE = "The records could not be read: whether the injury was recorded is not known.";
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
  assert.match(view.querySelector("#roster-heading").textContent, /^Active roster 6$/);
  assert.equal(view.querySelector("[data-screen]").getAttribute("data-screen"), "team-roster");
  assert.equal(view.querySelector("table.g-rtable").getAttribute("aria-label"), "Players of Ashgrove Wardens");
  // Dell misses the next match: he is in «Missing the match», under the others (stage 07b).
  const last = (list) => [...list.slice(0, 3), ...list.slice(4), list[3]];
  assert.deepEqual(order(), last(NAMES));
  assert.deepEqual(bodies().map((body) => body.getAttribute("data-key")), last(KEYS));
  assert.deepEqual(view.querySelector("table.g-rtable").querySelectorAll(".g-rtable__groups .g-rtable__g").map((cell) => cell.textContent), ["", "Characteristics", "Career", "SPP"]);
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
  const captain = bodyOf("p2#0");
  assert.ok(captain.querySelector(".g-num--blitzer .g-num__captain"));
  assert.equal(captain.querySelector(".g-rtable__sub").textContent, "Blitzer");
  assert.deepEqual(captain.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["7", "3", "3+", "4+", "9+"]);
  const agility = bodyOf("p3#0").querySelectorAll(".g-rtable__row td")[2];
  assert.ok(agility.classList.contains("g-rtable__c--up"));
  assert.equal(agility.textContent, "2+ improved");
  const skipping = bodyOf("p4#0").querySelector(".g-rtable__sub");
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
    fireEvent(toggle("p2#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#0");
    assert.ok(bodyOf("p2#0").classList.contains("is-selected"));
    assert.equal(bodyOf("p1#0").classList.contains("is-selected"), false);
    fireEvent(toggle("p2#0"), "click");
    assert.equal(aside().getAttribute("data-panel-player"), "p2#0", "a second press keeps him");
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
    fireEvent(toggle("p2#0"), "click");
    assert.deepEqual(open(), ["p2#0"]);
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "true");
    assert.equal(toggle("p2#0").getAttribute("aria-controls"), view.querySelector(".g-rtable__panelrow").getAttribute("id"));
    fireEvent(toggle("p3#0"), "click");
    assert.deepEqual(open(), ["p3#0"]);
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "false");
    fireEvent(toggle("p3#0"), "click");
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
    fireEvent(toggle("p2#0"), "click");
    assert.equal(toggle("p2#0").getAttribute("aria-current"), "true");
    media.matches = true;
    listeners.forEach((listener) => listener());
    assert.equal(toggle("p2#0").getAttribute("aria-expanded"), "true", "the player chosen on the desk is the row open on the phone");
    assert.ok(bodyOf("p2#0").querySelector(".g-rtable__panelrow"));
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
    api.reply("GET /api/teams/t2/fallen", 200, { fallen: [] });
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
  // Dell, who misses the next match, is sorted in his own table under the others (stage 07b).
  assert.deepEqual(order(), ["Cade", "Bors", "Ann", "Edda", "Finn", "Grom", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "descending");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.deepEqual(order(), ["Grom", "Ann", "Edda", "Finn", "Bors", "Cade", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  releaseCurrentScreen();
  view.innerHTML = "<p>elsewhere</p>";
  await renderTeamRoster("t1");
  assert.deepEqual(order(), ["Grom", "Ann", "Edda", "Finn", "Bors", "Cade", "Dell"]);
  assert.equal(head().getAttribute("aria-sort"), "ascending");
  // The player's column puts them back by their numbers, the lowest first.
  fireEvent(view.querySelector('[data-sort-key="player"]'), "click");
  assert.deepEqual(order(), ["Ann", "Bors", "Cade", "Edda", "Finn", "Grom", "Dell"]);
});

test("a skill chip opens its rule: the name as written, its category and type, the rule, the player and where the skill came from; closed, the focus is back on the chip", async () => {
  coach();
  await renderTeamRoster("t1");
  const chip = chipIn(bodyOf("p2#0").querySelector(".g-rtable__skills--desk"), "Mighty Blow");
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
  fireEvent(toggle("p7#0"), "click");
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
    fireEvent(toggle("p2#0"), "click");
    const profile = view.querySelector(".g-rtable__panelrow a.g-btn--dark");
    assert.equal(profile.textContent, "Profile and advancement");
    assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "p2"));
  });
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
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
  fireEvent(toggle("p2#0"), "click");
  assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => [card.getAttribute("data-skill"), card.querySelector(".g-skill__source").textContent]),
    [["Block", "starting"], ["Tackle", "starting"], ["Mighty Blow", "primary"], ["Pro", "the captain's"]]);
  assert.ok(aside().querySelector('.g-skill--card.g-skill--gained[data-skill="Mighty Blow"]'));
  assert.equal(aside().querySelector(".g-roster__availn").textContent, "3");
  fireEvent(toggle("p4#0"), "click");
  assert.equal(aside().querySelector(".g-roster__next").textContent, "Next match: sits it out");
});

test("the open row has six counters in two columns and a row of three, each with its worth; a team whose catches earn SPP has a fourth", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
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
    assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
      "progress-dots.css", "button.css", "callout.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css");
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

// Final review, Minor 1: a team is never taken on games older than it, so the games are asked for once the roster has answered.
test("the games are read after the roster has answered — on entry, on «Try again» and on a read again — and the counters wait for both", async () => {
  await withoutTimers(async () => {
    /** A tap is told to wait for the games, and sends nothing. */
    const waits = () => {
      const said = toasts().length;
      fireEvent(plus("casualties"), "click");
      assert.deepEqual(toasts().slice(said), ["Loading the matches…"]);
    };
    /**
     * `act` reads the roster: no games are asked for until it has answered, and a tap waits for both. A roster drawn
     * by the read (`drawn`: the first, or the one «Try again» brings) has its counters drawn closed until the games answer.
     */
    const gamesAfterRoster = async (act, { during = () => {}, drawn = false } = {}) => {
      api.calls.length = 0;
      const roster = api.hold("GET /api/teams/t1");
      const acting = act();
      await settle();
      assert.equal(roster.count, 1);
      assert.ok(!callKeys().includes("GET /api/games"), "no games while the roster is read");
      during();
      const games = api.hold("GET /api/games");
      roster.release();
      await settle();
      assert.equal(games.count, 1, "the games once the roster has answered");
      if (drawn) assert.equal(plus("casualties").getAttribute("title"), "Loading the matches…", "the counters drawn closed");
      waits();
      games.release();
      await acting;
      await settle();
      assert.equal(plus("casualties").hasAttribute("aria-disabled"), false);
      assert.equal(patches().filter(({ body }) => body.roster.players[0].spp?.casualties).length, 0, "no tap was sent");
    };
    coach();
    await gamesAfterRoster(() => renderTeamRoster("t1"), { drawn: true });
    // A read again, here a refusal's.
    api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
    await gamesAfterRoster(() => fireEvent(plus("touchdowns"), "click"), { during: waits });
    assert.equal(patches().length, 1, "the refused step, and nothing after it");
    // «Try again» after a read that failed.
    coach();
    api.fail("GET /api/teams/t1");
    await renderTeamRoster("t1");
    api.reply("GET /api/teams/t1", 200, { team: team() });
    await gamesAfterRoster(() => fireEvent(view.querySelector("[data-roster-retry]"), "click"), { drawn: true });
    api.assertAnswered();
  });
});

// R8: no step of the roster's queue leaves during a match.
// Carry T7 (d) and its correction: takeServerTeam says null while a request is in the air, and the take that had to wait
// is made on the state the request comes to (final review, T10). A tap while the roster is read sends nothing (Minor 1,
// Minor 5), so the request in the air here is the refused step, which the queue is asked to send again.
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
      const sending = api.hold(PATCH);
      const retrying = save.retrySaves("t1");
      await settle();
      assert.equal(sending.count, 1, "the refused step is in the air when the read comes");
      reading.release();
      await settle();
      assert.equal(countOf("touchdowns"), "1", "the roster is not swapped under the step in the air");
      api.calls.length = 0;
      if (saved) api.reply(PATCH, 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 6 }) });
      sending.release(saved ? undefined : { error: new TypeError("Failed to fetch") });
      await retrying;
      await settle();
      const reads = callKeys().filter((key) => key.startsWith("GET /api/teams/")).sort();
      if (saved) {
        assert.deepEqual(reads, [], "a save that landed makes the take needless: an older roster would be laid over it");
        assert.deepEqual([status(), countOf("touchdowns")], ["Saved", "1"]);
      } else {
        assert.deepEqual(reads, ["GET /api/teams/t1", "GET /api/teams/t1/events"], "read again, not the copy from before the step");
        assert.deepEqual([status(), countOf("touchdowns"), save.saveState("t1").waiting], ["", "0", 0]);
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

// Fix round 1, Important 1: a 409 is often how the coach learns that a match has begun. The final review's Minor 3: so a
// fresh conflict reads the games, and a match they name settles the step R8's way, without the coach pressing first.
test("another device's save that was a match's start: the 409 reads the games, the server's roster is taken with the match's words and no press, and the next tap saves nothing (R8)", async () => {
  await withoutTimers(async () => {
    // Ann has a touchdown in the blob: outside a match her minus would take it back (Minor 7).
    coach({ teamAnswer: withSpp("p1", { touchdowns: 1 }) });
    await renderTeamRoster("t1");
    assert.equal(minus("touchdowns").hasAttribute("disabled"), false, "outside a match the stored touchdown can be taken back");
    // The match began elsewhere: the start moved the team's revision, and the games now say so.
    const started = withSpp("p1", { touchdowns: 1 }, { revision: 5 });
    api.reply(PATCH, 409, conflictOf(started));
    api.reply("GET /api/teams/t1", 200, { team: started });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    gamesAre([LIVE_GAME]);
    api.calls.length = 0;
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(callKeys(), [PATCH, "GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events", "GET /api/games"],
      "the conflict reads the games; they name a match, so the roster is read, and the games after it");
    assert.ok(!view.querySelector("[data-roster-reload]"), "nothing is left for the coach to press");
    assert.equal(view.querySelector(".g-callout--danger"), null);
    assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
    assert.ok(minus("touchdowns").hasAttribute("disabled"), "the match's own rule: its records for him add up to nothing");
    api.reply(EVENTS, 201, { event: rowOf() });
    fireEvent(plus("touchdowns"), "click");
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(patches().length, 1, "the step that met the 409: no save of the roster during the match");
    assert.deepEqual(posts().map(({ body }) => [body.pairingId, body.counter]), [["g2", "touchdowns"], ["g2", "casualties"]], "records of the match instead");
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

// Final review, Minor 2: the server's roster may hold another device's SPP changes too; they are no steps of the coach's.
test("the edits a match gives up are never counted above the steps that waited: another device's SPP change is not one of them", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    // Another device gave Bors two casualties; then the match begins.
    const elsewhere = PLAYERS.map((player) => (player.id === "p2" ? { ...player, spp: { touchdowns: 1, casualties: 2 } } : player));
    api.reply("GET /api/teams/t1", 200, { team: team({ revision: 6, roster: { players: elsewhere } }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    assert.equal(toasts().at(-1), "A match has begun, so the edits that were waiting were not saved (1). Make them again as an edit outside the match.");
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

// Final wave re-review: a 422 whose re-read failed left no way forward on the screen.
test("a step refused for a 422 whose re-read failed: the next tap reads the roster again, so the coach is never stuck", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, refusalOf([{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 50 } }]));
    api.fail("GET /api/teams/t1");
    fireEvent(plus("touchdowns"), "click");
    await settle();
    api.calls.length = 0;
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", {}, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(patches().length, 0, "the refused step is not sent again");
    assert.ok(callKeys().includes("GET /api/teams/t1"), "the roster is read again");
    api.reply(PATCH, 200, { team: withSpp("p1", { casualties: 1 }, { revision: 6 }) });
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(patches().length, 1, "on the server's roster the next tap saves");
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
    fireEvent(toggle("p2#0"), "click");
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
    assert.equal(toggle("p2#0"), null, "he has left the roster");
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
    assert.equal(described.textContent, "fix an old mistake without touching this match (round 3)");
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
    assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
      "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css");
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
    fireEvent(toggle("p4#0"), "click");
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
      fireEvent(toggle("p2#0"), "click");
      const profile = openRow().querySelector(".g-roster__closed");
      assert.equal(profile.textContent, "Profile and advancement");
      check(profile);
      assert.equal(openRow().querySelector("a"), null);
      assertCspSafe(view);
      assertStyled(view, "src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
        "progress-dots.css", "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "src/screens/team/manage/strip.css");
    });
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p2#0"), "click");
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
    const reading = api.hold("GET /api/teams/t1");
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(toasts().at(-1), "There is no match in progress to record this in.");
    // The roster and its records are read again, and the games once they have answered (final review, Minor 1); the
    // roster read during the match is no roster to save until the read answers (fix round 2, N2).
    assert.equal(reading.count, 1);
    assert.ok(!callKeys().includes("GET /api/games"), "the games after the roster");
    assert.equal(plus("touchdowns").getAttribute("title"), READING);
    fireEvent(plus("touchdowns"), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.equal(patches().length, 0, "nothing saved on the roster read during the match");
    reading.release();
    await settle();
    assert.deepEqual(callKeys(), [EVENTS, "GET /api/teams/t1", "GET /api/teams/t1/events", "GET /api/games"]);
    assert.ok(!view.querySelector(".g-roster__notices"), "no banner of a match");
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

// Fix round 2, N1: a read made while a tap was in the air is not trusted, though the tap has answered before it lands.
test("a read made while a tap was in the air is made again once it has answered: a finish between them has the tap in the roster, not twice", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const sending = api.hold(EVENTS);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    // The match is finished elsewhere: the touchdown is in the roster the finish wrote, its record settled.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    api.reply("GET /api/teams/t1", 200, { team: withSpp("p1", { touchdowns: 1 }, { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    const reading = api.hold("GET /api/teams/t1/events");
    await invalidateGames();
    await settle();
    // The tap's answer comes first, as it was before the finish: a record not settled yet.
    sending.release({ status: 201, body: { event: rowOf() } });
    await settle();
    api.calls.length = 0;
    reading.release();
    const again = api.hold("GET /api/teams/t1/events");
    await settle();
    // Taken, the first read's roster (the touchdown in it) and the tap's row (added on top) would show 2.
    assert.equal(countOf("touchdowns"), "1", "the first read is not taken");
    assert.equal(again.count, 1, "read again: the first read may or may not have the tap");
    assert.equal(minus("touchdowns").getAttribute("title"), READING);
    fireEvent(minus("touchdowns"), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.equal(patches().length, 0, "no save lowers the roster meanwhile");
    again.release();
    await settle();
    assert.equal(countOf("touchdowns"), "1", "the server's one touchdown, not the roster's and the record's");
    assert.equal(minus("touchdowns").hasAttribute("aria-disabled"), false);
    assert.equal(patches().length, 0);
  });
});

// Fix round 2, N3: the read that replaces one made while a tap was in the air does what the first was asked to.
test("«Load the new one» pressed while a tap is in the air takes the server's roster once the tap has answered", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    // A save of the roster is on its way when the match begins; a record of it follows.
    const saving = api.hold(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    gamesAre([LIVE_GAME]);
    await invalidateGames();
    await settle();
    const sending = api.hold(EVENTS);
    fireEvent(plus("casualties"), "click");
    await settle();
    assert.equal(sending.count, 1);
    // The match ends elsewhere; the save meets another device's roster.
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    const elsewhere = withSpp("p1", { touchdowns: 4 }, { revision: 6 });
    api.reply("GET /api/teams/t1", 200, { team: elsewhere });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 6 });
    await invalidateGames();
    await settle();
    saving.release({ status: 409, body: conflictOf(elsewhere) });
    await settle();
    assert.ok(notice("danger"));
    fireEvent(view.querySelector("[data-roster-reload]"), "click");
    await settle();
    assert.ok(notice("danger"), "not taken while the record is in the air");
    sending.release({ status: 409, body: refused("MATCH_NOT_LIVE") });
    await settle();
    assert.ok(!notice("danger"), "the server's roster, as «Load the new one» asked");
    assert.equal(countOf("touchdowns"), "4");
    assert.equal(save.saveState("t1").waiting, 0);
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
    api.reply("GET /api/teams/t2/fallen", 200, { fallen: [] });
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

// ---------------------------------------------------------------------------
// An injury in the match (Task 12)
// ---------------------------------------------------------------------------

const injurySheet = () => view.querySelector("dialog#roster-injury");
/** «Injury in the match…»: the desk panel's by default, or the open row's. */
const injuryButton = (root = aside()) => root.querySelector("[data-roster-injury]");
const injuryOptions = () => injurySheet().querySelectorAll('.g-option[role="radio"]');
const optionFor = (code) => injuryOptions().find((card) => card.getAttribute("data-option-value") === code);
const statChips = () => injurySheet().querySelectorAll('[data-chip-group="injury-stat"] .g-chip');
const chipFor = (stat) => statChips().find((chip) => chip.getAttribute("data-chip-value") === stat);
const recordButton = () => injurySheet().querySelector('[data-injury-step="1"]');
const removeButton = () => injurySheet().querySelector('[data-injury-step="-1"]');
/** The line under a player's name in the table. */
const subLine = (key) => bodyOf(key).querySelector(".g-rtable__sub");
/** An injury row of the match as POST …/events answers it: Ann's. */
const injuryRow = (injury, over = {}) => rowOf({ counter: "injury", injury, ...over });
const INJURY_SHEETS = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css", "progress-dots.css",
  "button.css", "callout.css", "toggle.css", "action-stepper.css", "status-chip.css", "sheet.css", "option-card.css", "filter-chips.css",
  "src/screens/team/manage/strip.css"];

test("«Injury in the match…» opens a sheet of five injuries; a lasting one asks for the characteristic; «Record in the match» sends one injury row", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const opener = injuryButton();
    assert.equal(opener.textContent, "Injury in the match…");
    assert.equal(opener.getAttribute("data-roster-injury"), "p1#0");
    assert.equal(opener.getAttribute("aria-haspopup"), "dialog");
    opener.focus();
    fireEvent(opener, "click");
    const dialog = injurySheet();
    assert.ok(dialog?.isModal, "the sheet is open, modally");
    assert.equal(dialog.querySelector("h2").textContent, "Injury in the match");
    assert.equal(dialog.querySelector(".g-sheet__sub").textContent, "#1 Ann · Human Lineman");
    assert.equal(dialog.querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Injury");
    assert.deepEqual(injuryOptions().map((card) => [card.querySelector(".g-option__title").textContent, card.querySelector(".g-option__sub").textContent, card.getAttribute("aria-checked")]), [
      ["Badly Hurt", "no lasting effect after the match", "false"],
      ["Seriously Hurt", "misses the next match", "false"],
      ["Serious Injury", "a Niggling Injury and a missed match", "false"],
      ["Lasting Injury", "−1 to a characteristic and a missed match", "false"],
      ["Dead", "the player died", "false"],
    ]);
    assert.equal(dialog.querySelector(".g-roster__injurynote").textContent,
      "It is recorded in this match (round 3) and fills in the post-match's Players step, where the injury is applied to the roster. While the team has played fewer than 3 matches, any injury becomes Badly Hurt.");
    assert.equal(recordButton().textContent, "Record in the match");
    assert.ok(recordButton().classList.contains("g-btn--primary"));
    assert.ok(recordButton().hasAttribute("disabled"), "nothing chosen yet");
    assert.ok(!removeButton(), "no injury stands to take back");
    assert.equal(statChips().length, 0, "no characteristic but for a lasting injury");
    fireEvent(optionFor("lasting"), "click");
    assert.equal(dialog.querySelector(".g-roster__injurylabel").textContent, "Which characteristic");
    assert.equal(dialog.querySelector('[data-chip-group="injury-stat"]').getAttribute("aria-label"), "Which characteristic");
    assert.deepEqual(statChips().map((chip) => [chip.textContent, chip.getAttribute("aria-checked")]), [["MA", "false"], ["ST", "false"], ["AG", "false"], ["PA", "false"], ["AR", "false"]]);
    assert.ok(recordButton().hasAttribute("disabled"), "a lasting injury needs its characteristic");
    fireEvent(chipFor("ag"), "click");
    assert.equal(recordButton().hasAttribute("disabled"), false);
    assertCspSafe(view);
    assertStyled(view, ...INJURY_SHEETS);
    api.reply(EVENTS, 201, { event: injuryRow({ code: "lasting", stat: "ag" }) });
    fireEvent(recordButton(), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "ag" } }]);
    assert.equal(patches().length, 0);
    assert.ok(!injurySheet(), "closed once written");
    assert.ok(document.activeElement === injuryButton(), "the focus back on the button that opened it");
    assert.equal(subLine("p1#0").textContent, "Lasting Injury (AG) · round 3");
    assert.ok(subLine("p1#0").classList.contains("g-rtable__sub--alert"));
    assert.equal(titleOf(banner()), "Match on · round 3 · records: 1");
    api.assertAnswered();
  });
});

test("a standing injury can be taken back by its own −1", async () => {
  await withoutTimers(async () => {
    coach({ events: [injuryRow({ code: "miss" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3");
    fireEvent(injuryButton(), "click");
    assert.equal(removeButton().textContent, "Remove the record");
    assert.ok(removeButton().classList.contains("g-btn--danger-quiet"));
    assert.ok(removeButton().closest(".g-sheet__foot-start"), "the quiet control beside the sheet's button");
    assert.ok(recordButton().hasAttribute("disabled"), "a new one is still to be chosen");
    api.reply(EVENTS, 201, { event: injuryRow({ code: "miss" }, { id: "e2", delta: -1 }) });
    fireEvent(removeButton(), "click");
    await settle();
    assert.deepEqual(posts().map(({ body }) => body), [{ pairingId: "g2", playerId: "p1", counter: "injury", delta: -1, injury: { code: "miss" } }]);
    assert.ok(!injurySheet());
    assert.equal(subLine("p1#0").textContent, "Human Lineman");
    assert.equal(subLine("p1#0").classList.contains("g-rtable__sub--alert"), false);
    // A friendly names itself in the line.
    coach({ events: [injuryRow({ code: "dead" })] });
    gamesAre([{ ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null }]);
    await renderTeamRoster("t1");
    assert.equal(subLine("p1#0").textContent, "Dead · friendly");
  });
});

// Final review, Minor 4: a friendly's {match} is the adjective «товарищеский», so the Russian sentences name the match around it.
test("in Russian a friendly keeps its noun: the switch's description and the injury's note say «этот матч (товарищеский)»", async () => {
  const FRIENDLY = { ...LIVE_GAME, kind: "friendly", season: null, roundStatus: null, roundNumber: null };
  const described = () => view.querySelector(`#${outsideSwitch().getAttribute("aria-describedby")}`).textContent;
  try {
    for (const [game, match] of [[FRIENDLY, "товарищеский"], [LIVE_GAME, "тур 3"]]) {
      coach();
      gamesAre([game]);
      useLocale("ru");
      await renderTeamRoster("t1");
      assert.equal(described(), `исправить старую ошибку, не трогая этот матч (${match})`);
      fireEvent(injuryButton(), "click");
      assert.ok(injurySheet().querySelector(".g-roster__injurynote").textContent.startsWith(`Запишется в этот матч (${match}) и подставится в итоги`));
    }
  } finally {
    useLocale("en");
  }
});

test("the choice keeps the focus on the card it moved to", async () => {
  coach();
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  fireEvent(injuryButton(), "click");
  const cards = injuryOptions();
  assert.deepEqual(cards.map((card) => card.getAttribute("tabindex")), ["0", "-1", "-1", "-1", "-1"], "Tab enters the group at the first");
  cards[0].focus();
  fireEvent(cards[0], "keydown", { key: "ArrowDown" });
  assert.ok(document.activeElement === cards[1], "the next card");
  assert.ok(injuryOptions()[1] === cards[1], "the same node after the redraw");
  assert.equal(cards[1].getAttribute("aria-checked"), "true");
  assert.equal(recordButton().hasAttribute("disabled"), false);
  fireEvent(cards[1], "keydown", { key: "ArrowDown" });
  fireEvent(cards[2], "keydown", { key: "ArrowDown" });
  assert.ok(document.activeElement === cards[3] && injuryOptions()[3] === cards[3], "a lasting injury's characteristics drawn under it, the focus kept");
  assert.equal(statChips().length, 5);
  assert.ok(recordButton().hasAttribute("disabled"));
  assert.ok(injurySheet()?.isModal);
});

test("a refused record says why and the sheet stays open", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.reply(EVENTS, 409, refused("EVENT_SIDE_LOCKED"));
    fireEvent(recordButton(), "click");
    await settle();
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    assert.ok(injurySheet()?.isModal, "open, the choice still in it");
    assert.equal(optionFor("dead").getAttribute("aria-checked"), "true");
    assert.equal(subLine("p1#0").textContent, "Human Lineman", "nothing written");
    // The button says it before the next press, as the match's steppers behind the sheet do; it stays in reach to say why.
    assert.equal(recordButton().getAttribute("aria-disabled"), "true");
    assert.equal(recordButton().getAttribute("title"), SIDE_LOCKED);
    assert.equal(recordButton().hasAttribute("disabled"), false);
    assert.ok(recordButton().classList.contains("g-roster__closed"));
    // Pressed again it says why, and sends nothing: the side is locked until the records are read again.
    for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
    fireEvent(recordButton(), "click");
    assert.equal(toasts().at(-1), SIDE_LOCKED);
    await settle();
    assert.equal(posts().length, 1);
    fireEvent(injurySheet().querySelector("[data-sheet-close]"), "click");
    assert.ok(!injurySheet());
    assert.ok(document.activeElement === injuryButton());
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), SIDE_LOCKED);
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "a locked side opens no sheet");
    assert.equal(toasts().at(-1), SIDE_LOCKED);
  });
});

test("no injury for a player who sits the match out, nor with the switch on, nor outside a match", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(injuryButton(openRow()).textContent, "Injury in the match…", "in the open row on a phone");
    fireEvent(toggle("p4#0"), "click");
    assert.ok(!injuryButton(openRow()), "Dell sits it out");
    fireEvent(toggle("p1#0"), "click");
    fireEvent(outsideSwitch(), "click");
    assert.ok(!injuryButton(openRow()), "an edit outside the match deals no injury");
    assertStyled(view, ...INJURY_SHEETS);
  });
  coach();
  await renderTeamRoster("t1");
  assert.ok(!view.querySelector("[data-roster-injury]"), "no match, no injury");
});

test("every injury the table knows has its words in both languages", () => {
  const codes = INJURIES.filter((code) => code !== "none");
  assert.equal(codes.length, 5);
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const code of codes) {
      assert.ok(words[`teamRoster.injury.${code}`], `${locale} teamRoster.injury.${code}`);
      assert.ok(words[`teamRoster.injuryCaption.${code}`], `${locale} teamRoster.injuryCaption.${code}`);
    }
  }
  // The vault's Casualties page names them so; Badly Hurt stays English (docs/i18n-glossary.md).
  assert.deepEqual(codes.map((code) => dictionary("ru")[`teamRoster.injury.${code}`]), ["Badly Hurt", "Серьёзная травма", "Тяжёлое повреждение", "Стойкая травма", "Смерть"]);
});

// R14: the injury is a tap of the match, and its answer is heard as every tap's is (Task 11).
test("an injury in the air keeps the sheet busy: a second press sends nothing", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("miss"), "click");
    const held = api.hold(EVENTS);
    recordButton().focus();
    fireEvent(recordButton(), "click");
    assert.equal(recordButton().getAttribute("aria-busy"), "true", "busy while it is in the air");
    assert.ok(!recordButton().hasAttribute("disabled"), "not disabled: a focused button that is drops the focus (button.mjs)");
    // «Remove the record» is drawn before it now (the injury on its way is counted), so the button is drawn anew.
    assert.ok(document.activeElement === optionFor("miss"), "the focus stays in the sheet, on the choice");
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3", "counted at once, as every tap on its way");
    assert.equal(removeButton().getAttribute("aria-busy"), "true", "nothing taken back while it is in the air either");
    fireEvent(removeButton(), "click");
    fireEvent(recordButton(), "click");
    await settle();
    assert.deepEqual([held.count, posts().length], [1, 1]);
    held.release({ status: 201, body: { event: injuryRow({ code: "miss" }) } });
    await settle();
    assert.equal(posts().length, 1);
    assert.ok(!injurySheet());
    assert.equal(subLine("p1#0").textContent, "Seriously Hurt · round 3");
  });
});

test("an injury whose answer was lost: the sheet closes and the records are read again before another can be recorded", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    api.calls.length = 0;
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.fail(EVENTS);
    // It was written after all; its answer never came.
    const reading = api.hold("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(!injurySheet(), "closed: whether it was written is not known");
    assert.equal(toasts().at(-1), "The answer to the record did not arrive: the records are read again to see whether it was written.");
    assert.ok(document.activeElement === injuryButton());
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), READING);
    assert.ok(!notice("danger"), "nothing to read again while the read is in the air");
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "no second injury before the read says whether the first was written");
    assert.equal(toasts().at(-1), READING);
    reading.release({ status: 200, body: { events: [injuryRow({ code: "dead" })], revision: 4 } });
    await settle();
    assert.equal(posts().length, 1, "not sent again");
    assert.equal(callKeys().filter((key) => key === "GET /api/teams/t1/events").length, 1, "read once");
    assert.equal(subLine("p1#0").textContent, "Dead · round 3", "what the server has");
    assert.equal(injuryButton().hasAttribute("aria-disabled"), false);
  });
});

test("while the records are read the sheet's buttons say so, and a press sends nothing", async () => {
  await withoutTimers(async () => {
    coach({ events: [injuryRow({ code: "miss" })] });
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("badly-hurt"), "click");
    // The server has the match over before the games say so: the refusal reads the records again, and the sheet stays.
    api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
    const reading = api.hold("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(injurySheet()?.isModal, "a refusal leaves it open");
    for (const button of [recordButton(), removeButton()]) {
      assert.equal(button.getAttribute("aria-disabled"), "true");
      assert.equal(button.getAttribute("title"), READING);
      assert.equal(button.hasAttribute("disabled"), false, "in reach, to say why");
    }
    fireEvent(removeButton(), "click");
    assert.equal(toasts().at(-1), READING);
    await settle();
    assert.equal(posts().length, 1, "nothing taken back while the records are read");
    reading.release();
    await settle();
    assert.ok(injurySheet()?.isModal);
    for (const button of [recordButton(), removeButton()]) assert.equal(button.hasAttribute("aria-disabled") || button.hasAttribute("disabled"), false);
  });
});

// R14: «never a second injury before the read says whether the first was written» — a read that fails says nothing.
test("an injury whose answer was lost, and whose read then failed, stays closed until a read succeeds; «Try again» reads", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("dead"), "click");
    api.fail(EVENTS);
    api.fail("GET /api/teams/t1/events");
    fireEvent(recordButton(), "click");
    await settle();
    assert.ok(!injurySheet());
    assert.equal(toasts().at(-1), "No connection to the server. Check the internet and try again.");
    assert.equal(injuryButton().getAttribute("aria-disabled"), "true");
    assert.equal(injuryButton().getAttribute("title"), UNSURE);
    fireEvent(injuryButton(), "click");
    assert.ok(!injurySheet(), "no second injury while it is not known whether the first was written");
    assert.equal(toasts().at(-1), UNSURE);
    const callout = notice("danger");
    assert.equal(titleOf(callout), UNSURE);
    const again = callout.querySelector("[data-roster-reread]");
    assert.equal(again.textContent, "Try again");
    // The match's other taps keep Task 11's rule: a read that failed opens them.
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
    // Read again while the network is still gone: still closed.
    fireEvent(again, "click");
    await settle();
    assert.equal(injuryButton().getAttribute("title"), UNSURE);
    api.reply("GET /api/teams/t1/events", 200, { events: [injuryRow({ code: "dead" })], revision: 4 });
    fireEvent(notice("danger").querySelector("[data-roster-reread]"), "click");
    await settle();
    assert.ok(!notice("danger"));
    assert.equal(injuryButton().hasAttribute("aria-disabled"), false);
    assert.equal(subLine("p1#0").textContent, "Dead · round 3", "what the server has");
    assert.equal(posts().length, 1);
  });
});

test("an open injury sheet is its match's: another match on, or none, closes it, the focus back on its button or on the title", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("miss"), "click");
    optionFor("miss").focus();
    // Round 3's post-match was finished elsewhere, and round 4's match has begun.
    const ended = { ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" };
    const next = { ...LIVE_GAME, id: "g7", roundNumber: 4, season: { currentRound: 4 } };
    gamesAre([ended, next]);
    await invalidateGames();
    await settle();
    assert.ok(!injurySheet(), "not a sheet of round 4's match");
    assert.equal(titleOf(banner()), "Match on · round 4 · records: 0");
    assert.ok(document.activeElement === injuryButton(), "back on the button that opened it");
    // Opened for round 4, which then ends: no button to go back to, and the title takes the focus.
    fireEvent(injuryButton(), "click");
    assert.match(injurySheet().querySelector(".g-roster__injurynote").textContent, /^It is recorded in this match \(round 4\)/);
    optionFor("dead").focus();
    gamesAre([ended, { ...next, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    await invalidateGames();
    await settle();
    assert.ok(!injurySheet());
    assert.ok(!view.querySelector("[data-roster-injury]"));
    assert.ok(document.activeElement === view.querySelector("h1"), "the title, not the body");
  });
});

test("an injury refused because the match is over: said, and the sheet goes with the match", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    fireEvent(injuryButton(), "click");
    fireEvent(optionFor("badly-hurt"), "click");
    api.reply(EVENTS, 409, refused("MATCH_NOT_LIVE"));
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    fireEvent(recordButton(), "click");
    await settle();
    assert.equal(toasts().at(-1), "There is no match in progress to record this in.");
    assert.ok(!injurySheet(), "no match to record it in");
    assert.ok(!view.querySelector("[data-roster-injury]"));
    assert.equal(posts().length, 1);
  });
});

test("the sheet's player is text", async () => {
  coach({ teamAnswer: team({ roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: HOSTILE }] } }) });
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  fireEvent(injuryButton(), "click");
  assert.equal(injurySheet().querySelector(".g-sheet__sub").textContent, `#1 ${HOSTILE} · Human Lineman`);
  assert.ok(!view.querySelector("img"));
  assertCspSafe(view);
});

// Stage 08's treasury strip over the desk roster (Task 15): what it draws is 08's, where it stands and what it is drawn from the roster's.
const STRIP_HOST = '[data-sheet-host="treasury-money"]';
const moneySheet = () => document.querySelector(`${STRIP_HOST} dialog#treasury-money`);
const stripEdit = () => view.querySelector(".g-roster__strip button.g-funds__edit");
const stripMoney = () => view.querySelector(".g-roster__strip .g-funds__cell--money .g-funds__v").textContent;
const TREASURY = "POST /api/teams/t1/treasury";
const ENTRY = { id: "l9", kind: "manual", delta: 20, balanceAfter: 90, reason: "sponsor", note: null, pairingId: null, createdAt: "2026-10-19T12:00:00Z" };
/** A node as markup draws it: its tag, its attributes and what is in it, nested. */
const shape = (node) => (node.nodeType === 3 ? node.nodeValue : [node.tagName, node.attributes.map(({ name, value }) => `${name}=${value}`), ...node.childNodes.map(shape)]);
/** t1 as a treasury entry of 20k leaves it: 90k, revision 5. */
const funded = (over = {}) => team({ revision: 5, roster: { players: PLAYERS, treasury: 90 }, ...over });
/** An entry of 20k «sponsor» made from the strip, as a coach makes it: the button, the reason, the sheet's own button. */
async function stripEntry() {
  await withoutTimers(async () => {
    fireEvent(stripEdit(), "click");
    fireEvent(moneySheet().querySelector('[data-money-reason="sponsor"]'), "click");
    fireEvent(moneySheet().querySelector("[data-money-apply]"), "click");
    await settle();
  });
}

test("a desk roster has the treasury strip over the table; a phone has none, the Team tab is its place", async () => {
  coach();
  // The coach's list holds the team as 08's writes leave it, the roster's read does not have the entry yet: the strip is the list's (K4 c).
  state.myTeams = { items: [team({ roster: { players: PLAYERS, treasury: 70 } })], loaded: true, loading: false, error: "" };
  gamesAre([PREP_GAME]);
  await renderTeamRoster("t1");
  const parts = view.querySelector(".g-roster").childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class"));
  assert.deepEqual(parts.slice(1), ["g-roster__notices", "g-roster__strip", "g-roster__layout"], "between the banners and the table");
  const strip = view.querySelector(".g-roster__strip");
  const probe = document.createElement("div");
  probe.innerHTML = renderTreasuryStrip({ team: state.myTeams.items[0] });
  assert.deepEqual(strip.childNodes.map(shape), probe.childNodes.map(shape), "08's strip as it is, of the team the list holds");
  assert.equal(strip.querySelector("section.g-funds").getAttribute("data-treasury-strip"), "t1");
  assert.equal(stripMoney(), "70k");
  // The press opens 08's sheet in its own host on the body: a redraw of the roster closes nothing.
  const edit = stripEdit();
  edit.focus();
  fireEvent(edit, "click");
  assert.ok(moneySheet().matches(":modal"));
  assert.equal(moneySheet().querySelector(".g-sheet__title").textContent, "Add to the treasury");
  fireEvent(view.querySelector('[data-sort-key="ma"]'), "click");
  assert.equal(order()[0], "Cade", "the roster drawn again under it");
  assert.ok(moneySheet().matches(":modal"), "and the sheet still open");
  fireEvent(moneySheet().querySelector("[data-sheet-close]"), "click");
  assert.equal(document.activeElement, stripEdit());
  // Drawn again for the same team, the roster shares the one wiring; leaving takes it away.
  await renderTeamRoster("t1");
  assert.equal(document.querySelectorAll(STRIP_HOST).length, 1);
  releaseCurrentScreen();
  assert.equal(document.querySelector(STRIP_HOST), null);
  assert.ok(valuesOf("src/screens/team/roster/roster.css", ".g-roster__strip", "display").includes("none"));
});

test("during a match the strip's button is shut and says why, as on the Team page", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    const edit = stripEdit();
    assert.equal(edit.getAttribute("aria-disabled"), "true");
    assert.equal(edit.getAttribute("title"), "After the match's post-match");
    api.calls.length = 0;
    fireEvent(edit, "click");
    assert.equal(moneySheet(), null);
    assert.equal(toasts().at(-1), "After the match's post-match");
    assert.deepEqual(api.calls, []);
  });
});

test("a change the strip writes reaches the roster's next save: the team is read again, and the next tap goes on its revision with its treasury", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(stripMoney(), "0k");
  api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
  api.reply("GET /api/teams/t1", 200, { team: funded() });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
  api.calls.length = 0;
  const reading = api.hold("GET /api/teams/t1");
  await stripEntry();
  // Until the team is read again no counter takes a step: it would go on the revision before the entry.
  assert.equal(plus("touchdowns").getAttribute("title"), READING);
  await withoutTimers(async () => {
    fireEvent(plus("touchdowns"), "click");
    await settle();
  });
  assert.equal(toasts().at(-1), READING);
  assert.equal(patches().length, 0);
  reading.release();
  await settle();
  assert.equal(api.calls[0].key, TREASURY);
  assert.deepEqual(callKeys().slice(1).sort(), ["GET /api/games", "GET /api/teams/t1", "GET /api/teams/t1/events"], "the announcement is followed by a read with the games");
  assert.equal(stripMoney(), "90k");
  assert.equal(moneySheet(), null);
  api.calls.length = 0;
  api.reply(PATCH, 200, { team: funded({ revision: 6 }) });
  fireEvent(plus("touchdowns"), "click");
  await settle();
  assert.deepEqual(patches().map(({ body }) => [body.revision, Number(body.roster.treasury), body.roster.players[0].spp.touchdowns]), [[5, 90, 1]],
    "the strip's revision and its treasury: nothing of the entry is laid over");
  assert.deepEqual(callKeys(), [PATCH], "the roster's own save is no write to follow");
  api.assertAnswered();
});

test("a change the strip writes while a step waits takes nothing over it: the step keeps its draft and meets the new revision as a conflict", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    api.fail(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(save.saveState("t1").waiting, 1);
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "no read while a step waits: it would take the step's draft away");
    assert.equal(countOf("touchdowns"), "1");
    assert.equal(stripMoney(), "90k");
    api.reply(PATCH, 409, conflictOf(funded()));
    page.dispatchEvent(new Event("online"));
    await settle();
    assert.deepEqual(patches().map(({ body }) => body.revision), [4], "sent on the revision it was taken on");
    assert.equal(titleOf(notice("danger")), "The roster was changed on another device");
    assert.equal(callKeys().includes("GET /api/teams/t1"), false, "the conflict is the coach's to settle");
  });
});

test("a change the strip writes while a step is in the air is followed by nothing: the step's answer settles it", async () => {
  await withoutTimers(async () => {
    coach();
    await renderTeamRoster("t1");
    const held = api.hold(PATCH);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "no team is taken while a request of the roster is in the air");
    held.release({ status: 409, body: conflictOf(funded()) });
    await settle();
    assert.equal(titleOf(notice("danger")), "The roster was changed on another device");
    assert.deepEqual(callKeys(), [TREASURY, "GET /api/games"], "a fresh conflict reads the games (final review, Minor 3), and no team");
  });
});

test("a change the strip writes while the roster is read is followed once the read has answered: a read sent before it does not have it", async () => {
  await withoutTimers(async () => {
    coach();
    gamesAre([LIVE_GAME]);
    await renderTeamRoster("t1");
    assert.equal(stripEdit().getAttribute("aria-disabled"), "true");
    // The match ends elsewhere: the roster is read again, and the strip opens.
    const reading = api.hold("GET /api/teams/t1");
    gamesAre([{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }]);
    await invalidateGames();
    await settle();
    assert.equal(reading.count, 1);
    assert.equal(stripEdit().hasAttribute("aria-disabled"), false);
    api.reply(TREASURY, 201, { team: funded(), entry: ENTRY });
    api.calls.length = 0;
    await stripEntry();
    assert.deepEqual(callKeys(), [TREASURY], "heard while a read is in the air: the read answers first");
    api.reply("GET /api/teams/t1", 200, { team: funded() });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    reading.release({ status: 200, body: { team: team() } });
    await settle();
    assert.deepEqual(callKeys().filter((key) => key === "GET /api/teams/t1"), ["GET /api/teams/t1"], "the read sent before the entry is followed by one after it");
    api.reply(PATCH, 200, { team: funded({ revision: 6 }) });
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, Number(body.roster.treasury)]), [[5, 90]]);
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
  const sheets = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css", "stat-strip.css",
    "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css", "action-stepper.css", "status-chip.css",
    "src/screens/team/manage/strip.css"];
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach();
      await renderTeamRoster("t1");
      fireEvent(toggle("p2#0"), "click");
      fireEvent(chipIn(bodyOf("p2#0"), "Block"), "click");
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
  // The last import is 07b's marks.css, right after the roster's own sheet.
  assert.ok(text("src/styles.css").trimEnd().endsWith('@import url("screens/team/roster/roster.css");\n@import url("screens/team/roster/marks.css");'));
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

test("a skill card in the panel opens the rule, so it is a finger's 44px high: its padding and two lines alone make 43", () => {
  const sheet = "src/screens/team/roster/roster.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__pblock .g-skill--card", "min-height"), ["var(--size-touch)"]);
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

test("the injury's sheet: the characteristic's caption over its five chips in one row, the note quiet and readable", () => {
  const sheet = "src/screens/team/roster/roster.css";
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurystat .g-chips", "grid-template-columns"), ["repeat(5, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurystat .g-chip", "justify-content"), ["center"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurylabel", "text-transform"), ["uppercase"]);
  assert.deepEqual(valuesOf(sheet, ".g-roster__injurynote", "text-transform"), ["none"]);
  for (const selector of [".g-roster__injurylabel", ".g-roster__injurynote"]) {
    assert.deepEqual([valuesOf(sheet, selector, "border"), valuesOf(sheet, selector, "background")], [["0"], ["none"]], selector);
    assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  }
});

test("the player's address: a fallen player's profile, else the 2.x editor until stage 07d", () => {
  const router = text("src/core/router.mjs");
  assert.ok(router.includes("teamRoster: ({ teamId }) => renderTeamRoster(teamId),"));
  assert.ok(router.includes("teamPlayer: ({ teamId, playerId }) => renderTeamPlayer(teamId, playerId),"));
});
