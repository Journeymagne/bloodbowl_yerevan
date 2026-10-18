import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { mountView, withWindow } from "./helpers/ref-screen.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// The view is found once, when core/view.mjs loads, and the API client picks up `fetch` the same way: both come first.
const api = installFakeApi();
mountView();
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
const { renderTeamRoster } = await import("../src/screens/team/roster/index.mjs");
const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { teamPlayerUrl } = await import("../src/core/routes.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
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

/** A coach on a page that has read his teams and the reference; the server answers the roster, its events and the games. */
function coach({ teamAnswer = team() } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  // The memory lives as long as the page, which is the whole file: each test starts from the roster's order and no choice.
  Object.assign(rosterMemory("t1"), { sort: null, selected: null });
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [team()], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams/t1", 200, { team: teamAnswer });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: teamAnswer.revision });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

const bodies = () => view.querySelectorAll("tbody.g-rtable__player");
const order = () => bodies().map((body) => body.querySelector(".g-rtable__name").textContent);
const toggle = (key) => view.querySelector(`[data-row-key="${key}"]`);
const bodyOf = (key) => bodies().find((body) => body.getAttribute("data-key") === key);
const aside = () => view.querySelector(".g-roster__aside");
/** The chips of a skill under a player's name in the table (the desk's copy) or in the panel. */
const chipIn = (root, name) => root.querySelectorAll("[data-skill]").find((chip) => chip.getAttribute("data-skill") === name);
const sheet = () => view.querySelector("dialog#roster-skill");

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
  const { invalidateGames } = await import("../src/data/games.mjs");
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

test("the panel and the open row show the career's counters as text until they can be changed", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("p2#1"), "click");
  const tally = aside().querySelectorAll(".g-roster__tallyitem").map((item) => [item.querySelector(".g-roster__tallyk").textContent, item.querySelector(".g-roster__tallyv").textContent]);
  assert.deepEqual(tally.slice(0, 2), [["TDtouchdown", "1"], ["CAScasualty", "0"]]);
  assert.equal(tally.length, 9, "six main counters and three narrow ones: Human's catches earn nothing");
  assert.equal(aside().querySelector(".g-roster__tallyk span").getAttribute("aria-hidden"), "true", "the abbreviation for the eye, the name for a screen reader");
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
  fireEvent(retry, "click");
  assert.equal(view.querySelector(".g-roster__loading").textContent, "Loading the roster…");
  assert.equal(document.activeElement, view.querySelector("h1"), "the button is gone: the focus is on the title");
  await settle();
  assert.equal(view.querySelector(".g-callout--danger"), null);
  assert.equal(bodies().length, 7);
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
    "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css"];
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

test("the words of the screen are readable in every palette, on the page, the panel and its SPP block", () => {
  const sheet = "src/screens/team/roster/roster.css";
  for (const selector of [".g-roster__count", ".g-roster__loading"]) assertReadable(sheet, selector, "color", ["--page"], 4.5);
  for (const selector of [".g-roster__pline", ".g-roster__access", ".g-roster__next", ".g-roster__tallyk"]) assertReadable(sheet, selector, "color", ["--surface"], 4.5);
  for (const selector of [".g-roster__ledger", ".g-roster__cheapest", ".g-roster__availl"]) assertReadable(sheet, selector, "color", ["--surface-2"], 4.5);
  // 40px bold: large text, 3:1.
  assertReadable(sheet, ".g-roster__availn", "color", ["--surface-2"], 3);
  // The open row's counters stand on its tint, the sheet's lines on the sheet.
  assertReadable(sheet, ".g-roster__tallyv", "color", ["--surface"], 4.5);
  for (const selector of [".g-roster__from", ".g-roster__nopage"]) assertReadable(sheet, selector, "color", ["--surface"], 4.5);
});

test("the player's address still draws the 2.x editor until stage 07d", () => {
  const router = text("src/core/router.mjs");
  assert.ok(router.includes("teamRoster: ({ teamId }) => renderTeamRoster(teamId),"));
  assert.ok(router.includes("teamPlayer: ({ teamId }) => renderSavedRoster(teamId),"));
});
