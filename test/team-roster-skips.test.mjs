import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { mountView, withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { expandCollections } from "../src/data/reference.mjs";

// Stage 07b, Task 6: the roster's sections «Missing the match» and «Fallen», a fallen player's row and his profile in the
// desk panel. The page is set up as test/team-roster.test.mjs sets it up (lines 1–80): the window's events, the fake API
// before the imports, the view.

const page = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = page[name].bind(page);

const api = installFakeApi();
mountView();
globalThis.location = { hash: "#/t/t1/roster", replace() {} };
const { renderTeamRoster } = await import("../src/screens/team/roster/index.mjs");
const { rosterMemory } = await import("../src/screens/team/roster/memory.mjs");
const save = await import("../src/screens/team/roster/save.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { teamPlayerUrl } = await import("../src/core/routes.mjs");
const { formatDay } = await import("../src/core/format.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = async (turns = 6) => { for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

// Human's rows: 0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 5 Ogre. Three play the next match, four miss it, each for his reason.
const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade" },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", skipNextGame: true, absence: { code: "lasting", stat: "ma" }, statMods: { ma: -1 } },
  { id: "p5", rowIndex: 1, number: "5", name: "Edda", skipNextGame: true },
  { id: "p6", rowIndex: 0, number: "6", name: "Finn", skipNextGame: true, temporarilyRetired: true },
  { id: "p7", rowIndex: 5, number: "7", name: "Grom", skipNextGame: true, absence: { code: "other", note: "Suspended" } },
];
const team = (over = {}) => ({ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 4, roster: { players: PLAYERS }, ...over });
const withPlayers = (players, over = {}) => team({ roster: { players }, ...over });

/** A record as GET /api/teams/:id/fallen sends it. */
const died = (id, player, over = {}) => ({ id, player, cause: null, pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false, ...over });
// A Blitzer a coach marked dead by hand, with a cause; a Lineman the post-match of round 2 recorded, with none.
const PIKE = died("f1", { id: "d1", rowIndex: 3, number: "8", name: "Pike", spp: { touchdowns: 2 } }, { cause: "Foul by the Raiders" });
const JOE = died("f2", { id: "d2", rowIndex: 0, number: "9", name: "Joe" }, { pairingId: "g7", roundNumber: 2, diedAt: "2026-10-12T10:00:00Z", fromMatch: true });
const FALLEN = [PIKE, JOE];

/** A coach on a page that has read his teams and the reference; the server answers the roster, its events, its fallen and the games. */
function coach({ teamAnswer = team(), fallen = FALLEN } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  view.innerHTML = "";
  if (save.saveState("t1").status !== "idle") save.takeServerTeam(team());
  for (const node of document.querySelectorAll("output")) node.parentNode.removeChild(node);
  Object.assign(rosterMemory("t1"), { sort: null, selected: null, outside: null });
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: [team()], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/teams/t1", 200, { team: teamAnswer });
  api.reply("GET /api/teams/t1/events", 200, { events: [], revision: teamAnswer.revision });
  api.reply("GET /api/teams/t1/fallen", 200, { fallen });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
}

const callKeys = () => api.calls.map(({ key }) => key);
const headingText = (id) => view.querySelector(`#${id}`)?.textContent ?? null;
const tables = () => view.querySelectorAll("table.g-rtable");
const namesIn = (root) => root.querySelectorAll("tbody.g-rtable__player").map((body) => body.querySelector(".g-rtable__name").textContent);
const bodyOf = (key) => view.querySelectorAll("tbody.g-rtable__player").find((body) => body.getAttribute("data-key") === key);
const toggle = (key) => view.querySelector(`[data-row-key="${key}"]`);
const subOf = (key) => bodyOf(key).querySelector(".g-rtable__sub");
const aside = () => view.querySelector(".g-roster__aside");
const openRow = () => view.querySelector(".g-rtable__panelrow");
const nextLine = () => aside().querySelector(".g-roster__next").textContent;
const words = (root) => root.querySelectorAll("p, span, h2, h3, a, small, dd, dt").map((node) => node.textContent);
const READING = "Reading the records…";
const LIVE_GAME = {
  id: "g2", kind: "league", roundStatus: "started", roundNumber: 3, season: { currentRound: 3 }, resultStatus: "pending", preparationStatus: "in_progress",
  postMatchStatus: "draft", updatedAt: "2026-10-10T10:00:00Z", home: { user: { id: "u1" }, team: { id: "t1" } }, away: { user: { id: "u9" }, team: { id: "r1" } },
};
const STYLES = ["src/screens/team/roster/roster.css", "src/screens/team/roster/marks.css", "page-head.css", "roster-table.css", "number-badge.css", "skill-chip.css",
  "stat-strip.css", "progress-dots.css", "button.css", "callout.css", "sheet.css", "src/screens/ref/prose.css", "action-stepper.css", "status-chip.css",
  "src/screens/team/manage/strip.css"];

test("the roster in three: those who play, those who miss the next match with why, and the fallen; the counts are the roster's", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.match(headingText("roster-heading"), /^Active roster 3$/);
  assert.match(headingText("roster-skips-heading"), /^Missing the match 4$/);
  assert.match(headingText("roster-fallen-heading"), /^Fallen 2$/);
  assert.equal(view.querySelector(".g-pagehead__sub").textContent, "On the roster: 7 · missing a match: 4 · can advance: 0", "the dead are not on the roster");
  const sections = view.querySelectorAll("section.g-roster__section");
  assert.deepEqual(sections.map((section) => section.getAttribute("aria-labelledby")), ["roster-heading", "roster-skips-heading", "roster-fallen-heading"]);
  assert.ok(sections[2].classList.contains("g-roster__section--fallen"));
  assert.ok(!sections[0].classList.contains("g-roster__section--fallen"));
  assert.ok(sections[0].querySelector(".g-roster__status"), "the save's status stands by «Active roster»");
  assert.equal(view.querySelectorAll(".g-roster__status").length, 1);
  assert.deepEqual(tables().map((table) => table.getAttribute("aria-label")),
    ["Players of Ashgrove Wardens", "Players of Ashgrove Wardens who miss the next match", "The fallen of Ashgrove Wardens"]);
  assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
  assert.deepEqual(tables()[2].querySelectorAll("tbody").map((body) => body.getAttribute("data-key")), ["fallen-f1", "fallen-f2"]);
  assert.ok(callKeys().includes("GET /api/teams/t1/fallen"), "the fallen are read with the roster");
  api.assertAnswered();
});

test("one sort for the three tables: a header of any of them sorts all three", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(tables()[2].querySelector('[data-sort-key="ma"]'), "click");
  // MA: Cade 8, Bors 7, Ann 6 · Edda 6, Finn 6, Dell 5 (lowered), Grom 5 · Pike 7, Joe 6.
  assert.deepEqual(tables().map(namesIn), [["Cade", "Bors", "Ann"], ["Edda", "Finn", "Dell", "Grom"], ["Pike", "Joe"]]);
  for (const table of tables()) assert.equal(table.querySelector('[data-sort-key="ma"]').closest("th").getAttribute("aria-sort"), "descending");
  fireEvent(tables()[0].querySelector('[data-sort-key="player"]'), "click");
  assert.deepEqual(tables().map(namesIn), [["Ann", "Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
});

test("a reason in words under a name: an injury, another reason, the season's retirement, none from 2.x", async () => {
  coach();
  await renderTeamRoster("t1");
  const subs = ["p4#3", "p5#4", "p6#5", "p7#6"].map(subOf);
  assert.deepEqual(subs.map((sub) => sub.textContent), ["Lasting Injury (MA)", "Misses the next match", "Temporarily retired for the season", "Suspended"]);
  for (const sub of subs) assert.ok(sub.classList.contains("g-rtable__sub--alert"));
  assert.deepEqual(["p1#0", "p2#1", "p3#2"].map((key) => [subOf(key).textContent, subOf(key).classList.contains("g-rtable__sub--alert")]),
    [["Human Lineman", false], ["Blitzer", false], ["Catcher", false]]);
  // The other injuries, and another reason with no words written (K10): the 2.x line, never an empty red one.
  coach({
    teamAnswer: withPlayers([
      { id: "q1", rowIndex: 0, number: "1", name: "Hal", skipNextGame: true, absence: { code: "miss" } },
      { id: "q2", rowIndex: 0, number: "2", name: "Ida", skipNextGame: true, absence: { code: "niggling" } },
      { id: "q3", rowIndex: 0, number: "3", name: "Jon", skipNextGame: true, absence: { code: "other" } },
      { id: "q4", rowIndex: 0, number: "4", name: "Kai", skipNextGame: true, absence: { code: "other", note: "   " } },
      { id: "q5", rowIndex: 0, number: "5", name: "Lev", skipNextGame: true, absence: { code: "lasting" } },
    ]),
    fallen: [],
  });
  await renderTeamRoster("t1");
  assert.deepEqual(["q1#0", "q2#1", "q3#2", "q4#3", "q5#4"].map((key) => subOf(key).textContent),
    ["Seriously Hurt", "Serious Injury", "Misses the next match", "Misses the next match", "Lasting Injury"]);
});

test("the labels repeat once, at the end of the list", async () => {
  coach();
  await renderTeamRoster("t1");
  assert.equal(view.querySelectorAll("tfoot").length, 1);
  assert.ok(tables()[2].querySelector("tfoot"), "under the last table");
  coach({ fallen: [] });
  await renderTeamRoster("t1");
  assert.equal(tables().length, 2, "no section for nobody");
  assert.ok(!headingText("roster-fallen-heading"));
  assert.equal(view.querySelectorAll("tfoot").length, 1);
  assert.ok(tables()[1].querySelector("tfoot"));
  coach({ teamAnswer: withPlayers(PLAYERS.map((player) => ({ ...player, skipNextGame: false, temporarilyRetired: false, absence: null }))), fallen: [] });
  await renderTeamRoster("t1");
  assert.equal(tables().length, 1);
  assert.ok(!headingText("roster-skips-heading"));
  assert.ok(tables()[0].querySelector("tfoot"), "one table keeps its foot");
});

test("a fallen row: a grey number, grey numbers and «Fallen · cause»; open on a phone it says why, when, and leads to his profile", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    const pike = bodyOf("fallen-f1");
    assert.ok(pike.querySelector(".g-num--fallen"));
    assert.ok(!pike.querySelector(".g-num--blitzer"), "no position's colour");
    assert.equal(subOf("fallen-f1").textContent, "Fallen · Foul by the Raiders");
    assert.ok(!subOf("fallen-f1").classList.contains("g-rtable__sub--alert"), "grey, not red");
    assert.deepEqual(pike.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["7", "3", "3+", "4+", "9+"]);
    assert.ok(!pike.querySelector(".g-rtable__delta"));
    fireEvent(toggle("fallen-f1"), "click");
    const row = openRow();
    assert.ok(row, "his row opens");
    assert.ok(bodyOf("fallen-f1").classList.contains("is-expanded"));
    assert.ok(words(row).includes("Cause of death"));
    assert.ok(words(row).includes("Foul by the Raiders"));
    assert.ok(words(row).includes(`Career: 6 SPP · marked by hand · ${formatDay(PIKE.diedAt)}`));
    const profile = row.querySelector("a.g-btn");
    assert.equal(profile.textContent, "Player's profile");
    assert.equal(profile.getAttribute("href"), teamPlayerUrl("t1", "d1"));
    assert.ok(words(row).includes("The mark can be undone in the profile"));
    assert.ok(!row.querySelector("[data-action-key]"), "no counters for the dead");
    assert.ok(!pike.querySelector("[data-action-key]"));
    assert.ok(!words(row).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
  });
});

test("a death the post-match recorded says the administrator corrects it, and offers no undo", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(subOf("fallen-f2").textContent, "Fallen", "no cause, the state alone");
    fireEvent(toggle("fallen-f2"), "click");
    const row = openRow();
    assert.ok(words(row).includes("No cause was recorded."));
    assert.ok(words(row).includes(`Career: 0 SPP · in a match · round 2 · ${formatDay(JOE.diedAt)}`));
    assert.ok(words(row).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
    assert.ok(!words(row).includes("The mark can be undone in the profile"));
    assert.equal(row.querySelector("a.g-btn").getAttribute("href"), teamPlayerUrl("t1", "d2"));
  });
  // A friendly has no round: «in a match · <date>».
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [{ ...JOE, roundNumber: null }] });
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f2"), "click");
    assert.equal(aside().querySelector(".g-fallen__when").textContent, `in a match · ${formatDay(JOE.diedAt)}`);
    assert.ok(words(aside()).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
    assert.ok(!aside().querySelector("[data-roster-undo]"));
  });
});

test("on a desk a fallen player chosen stands in the panel as his profile", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0", "the first who plays, by default");
    assert.equal(toggle("fallen-f1").getAttribute("aria-controls"), "roster-aside");
    fireEvent(toggle("fallen-f1"), "click");
    const panel = view.querySelector('.g-roster__aside[data-panel-player="fallen-f1"]');
    assert.ok(panel);
    assert.ok(bodyOf("fallen-f1").classList.contains("is-selected"));
    assert.ok(panel.querySelector(".g-num--fallen.g-num--lg"));
    assert.equal(panel.querySelector("h2.g-roster__pname").textContent, "Pike");
    assert.equal(panel.querySelector(".g-roster__pline").textContent, "Blitzer · Human · fallen");
    assert.ok(panel.querySelector(".g-fallen__stats dl.g-stats"));
    assert.deepEqual(panel.querySelectorAll(".g-stat__v").map((value) => value.textContent), ["7", "3", "3+", "4+", "9+"]);
    assert.equal(panel.querySelector(".g-fallen__state .g-status").textContent, "Fallen");
    assert.equal(panel.querySelector(".g-fallen__when").textContent, `marked by hand · ${formatDay(PIKE.diedAt)}`);
    assert.ok(words(panel).includes("Cause of death"));
    assert.equal(panel.querySelector(".g-fallen__cause").textContent, "Foul by the Raiders");
    assert.ok(words(panel).includes("Career: 6 SPP"));
    assert.deepEqual(panel.querySelectorAll(".g-skill--card").map((card) => card.getAttribute("data-skill")), ["Block", "Tackle"]);
    assert.ok(words(panel).includes("A fallen player plays no matches, takes no advancements and is not in TV."));
    assert.ok(!panel.querySelector("[data-action-key]"), "no counters");
    assert.ok(!panel.querySelector(".g-roster__edit"), "no pencil");
    assert.ok(!panel.querySelector(".g-roster__next"), "no next match");
    assert.ok(!words(panel).includes("A death the post-match recorded is not undone here: the league administrator corrects it."));
  });
});

test("the default in the panel: the first who plays, else the first who misses the match, else the first of the fallen", async () => {
  await withWindow({ phone: false }, async () => {
    coach({ teamAnswer: withPlayers(PLAYERS.filter(({ skipNextGame }) => skipNextGame)) });
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "p4#0");
    assert.match(headingText("roster-heading"), /^Active roster 0$/);
    assert.equal(view.querySelector(".g-roster__section .g-roster__empty").textContent, "Everyone on the roster misses the next match.");
    assert.ok(view.querySelector("section.g-roster__section .g-roster__status"), "the status keeps its place");
    assert.deepEqual(tables().map(namesIn), [["Dell", "Edda", "Finn", "Grom"], ["Pike", "Joe"]]);
    coach({ teamAnswer: withPlayers([]) });
    await renderTeamRoster("t1");
    assert.equal(aside().getAttribute("data-panel-player"), "fallen-f1");
    assert.equal(view.querySelector(".g-roster__empty").textContent, "No players on the roster yet.");
    assert.deepEqual(tables().map(namesIn), [["Pike", "Joe"]]);
    coach({ teamAnswer: withPlayers([]), fallen: [] });
    await renderTeamRoster("t1");
    assert.ok(!aside());
    assert.equal(tables().length, 0);
    assert.equal(view.querySelector(".g-roster__empty").textContent, "No players on the roster yet.");
  });
});

test("a skipper's panel says why he sits the next match out", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("p4#3"), "click");
    assert.equal(nextLine(), "Next match: sits it out · Lasting Injury (MA)");
    fireEvent(toggle("p6#5"), "click");
    assert.equal(nextLine(), "Next match: sits it out · Temporarily retired for the season");
    fireEvent(toggle("p7#6"), "click");
    assert.equal(nextLine(), "Next match: sits it out · Suspended");
    // A 2.x skip says no why, and the line does not say it twice (K3).
    fireEvent(toggle("p5#4"), "click");
    assert.equal(nextLine(), "Next match: sits it out");
    fireEvent(toggle("p1#0"), "click");
    assert.equal(nextLine(), "Next match: plays");
  });
});

test("the fallen are read with the roster; a list that cannot be read fails the read with words and «Try again»", async () => {
  await withoutTimers(async () => {
    coach();
    api.fail("GET /api/teams/t1/fallen");
    await renderTeamRoster("t1");
    const callout = view.querySelector(".g-roster__failed .g-callout--danger");
    assert.ok(callout);
    assert.ok(callout.querySelector(".g-callout__title").textContent.length > 0);
    assert.equal(tables().length, 0);
    const retry = view.querySelector("[data-roster-retry]");
    assert.equal(retry.textContent, "Try again");
    api.reply("GET /api/teams/t1/fallen", 200, { fallen: FALLEN });
    fireEvent(retry, "click");
    await settle();
    assert.deepEqual(view.querySelectorAll("section.g-roster__section").map((section) => section.getAttribute("aria-labelledby")),
      ["roster-heading", "roster-skips-heading", "roster-fallen-heading"]);
    // A list that is not one is no answer, as an unreadable roster is not.
    coach({ fallen: "nobody" });
    await renderTeamRoster("t1");
    assert.ok(view.querySelector(".g-roster__failed"));
  });
});

test("every read of the team reads the fallen with it: a match that ends brings its dead, and the counters wait for both", async () => {
  await withoutTimers(async () => {
    coach({ fallen: [] });
    api.reply("GET /api/games", 200, { games: [LIVE_GAME], currentGames: [] });
    await renderTeamRoster("t1");
    assert.equal(tables().length, 2);
    api.calls.length = 0;
    // The post-match was finished on another device: Ann died in it.
    api.reply("GET /api/games", 200, { games: [{ ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" }], currentGames: [] });
    api.reply("GET /api/teams/t1", 200, { team: withPlayers(PLAYERS.slice(1), { revision: 5 }) });
    api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 5 });
    api.reply("GET /api/teams/t1/fallen", 200, { fallen: [died("f9", PLAYERS[0], { cause: "Crowd", pairingId: "g2", roundNumber: 3, fromMatch: true })] });
    const fallenRead = api.hold("GET /api/teams/t1/fallen");
    await invalidateGames();
    await settle();
    assert.ok(callKeys().includes("GET /api/teams/t1/fallen"));
    const plus = view.querySelector('[data-action-key="touchdowns"] [data-action-step="1"]');
    assert.equal(plus.getAttribute("title"), READING, "closed while the fallen are read");
    fallenRead.release();
    await settle();
    assert.deepEqual(tables().map(namesIn), [["Bors", "Cade"], ["Dell", "Edda", "Finn", "Grom"], ["Ann"]]);
    assert.equal(subOf("fallen-f9").textContent, "Fallen · Crowd");
    assert.ok(!view.querySelector('[data-action-key="touchdowns"] [data-action-step="1"]').hasAttribute("aria-disabled"));
  });
});

test("a fallen player on the roster as read is drawn once", async () => {
  coach({ fallen: [...FALLEN, died("f3", { id: "p1", rowIndex: 0, number: "1", name: "Ann" })] });
  await renderTeamRoster("t1");
  assert.match(headingText("roster-fallen-heading"), /^Fallen 2$/);
  assert.ok(!bodyOf("fallen-f3"));
  assert.equal(view.querySelectorAll(".g-rtable__name").filter((name) => name.textContent === "Ann").length, 1);
});

test("a fallen record the roster cannot read is drawn with dashes, and the screen stands", async () => {
  await withWindow({ phone: true }, async () => {
    coach({ fallen: [died("f4", { name: "Old Joe", position: "Lineman", number: 5 }, { cause: "Old age" }), died("f5", null)] });
    await renderTeamRoster("t1");
    assert.equal(view.querySelector("h1").textContent, "Roster");
    const old = bodyOf("fallen-f4");
    assert.equal(old.querySelector(".g-rtable__name").textContent, "Old Joe");
    assert.equal(old.querySelector(".g-num").textContent, "5");
    assert.deepEqual(old.querySelectorAll(".g-rtable__row td").slice(0, 5).map((cell) => cell.textContent), ["–", "–", "–", "–", "–"]);
    fireEvent(toggle("fallen-f4"), "click");
    assert.ok(words(openRow()).includes("Old age"));
    assert.ok(!openRow().querySelector("a"), "no id, no profile to lead to");
    assert.ok(bodyOf("fallen-f5"), "a record with no player at all is a row too");
    assert.ok(!view.textContent.includes("undefined"));
    assert.ok(![...view.walk()].some((node) => node.nodeType === 1 && (node.getAttribute("class") ?? "").includes("undefined")));
  });
});

test("a skill chip of a fallen player opens its rule, in his row and in the panel", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    const chip = bodyOf("fallen-f1").querySelectorAll("[data-skill]").find((item) => item.getAttribute("data-skill") === "Block");
    fireEvent(chip, "click");
    const sheet = view.querySelector("dialog#roster-skill");
    assert.ok(sheet);
    assert.equal(sheet.querySelector("h2").textContent, "Block");
    assert.equal(sheet.querySelector(".g-roster__from").textContent, "Pike · starting");
    fireEvent(sheet, "keydown", { key: "Escape" });
    assert.ok(!view.querySelector("dialog#roster-skill"));
    fireEvent(toggle("fallen-f1"), "click");
    fireEvent(aside().querySelectorAll(".g-skill--card").find((card) => card.getAttribute("data-skill") === "Tackle"), "click");
    assert.equal(view.querySelector("dialog#roster-skill h2").textContent, "Tackle");
  });
});

test("a dead captain wears no «C» and no captain's Pro", async () => {
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [died("f6", { id: "d6", rowIndex: 3, number: "11", name: "Vex", isCaptain: true })] });
    await renderTeamRoster("t1");
    assert.ok(!bodyOf("fallen-f6").querySelector(".g-num__captain"));
    fireEvent(toggle("fallen-f6"), "click");
    assert.deepEqual(aside().querySelectorAll(".g-skill--card").map((card) => card.getAttribute("data-skill")), ["Block", "Tackle"]);
    assert.ok(!aside().querySelector(".g-num__captain"));
  });
});

test("the cause and the note are text", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      coach({
        teamAnswer: withPlayers(PLAYERS.map((player) => (player.id === "p7" ? { ...player, absence: { code: "other", note: HOSTILE } } : player))),
        fallen: [{ ...PIKE, cause: HOSTILE }],
      });
      await renderTeamRoster("t1");
      assert.equal(subOf("p7#6").textContent, HOSTILE);
      assert.equal(subOf("fallen-f1").textContent, `Fallen · ${HOSTILE}`);
      fireEvent(toggle("fallen-f1"), "click");
      const where = phone ? openRow() : aside();
      assert.ok(words(where).includes(HOSTILE));
      if (!phone) {
        fireEvent(toggle("p7#6"), "click");
        assert.equal(nextLine(), `Next match: sits it out · ${HOSTILE}`);
      }
      assert.ok(!view.querySelector("img"));
      assert.ok(!view.querySelector("[onerror]"));
      assertCspSafe(view);
    });
  }
});

test("every key the new files ask for is in both dictionaries", () => {
  assertDictionaryCovers("src/screens/team/roster/fallen-view.mjs", "src/screens/team/roster/panel.mjs", "src/screens/team/roster/view.mjs");
});

test("everything drawn is styled: the three sections, a skipper's row, a fallen row open and a fallen player in the panel", async () => {
  for (const phone of [true, false]) {
    await withWindow({ phone }, async () => {
      for (const key of ["fallen-f1", "fallen-f2", "p4#3"]) {
        coach();
        await renderTeamRoster("t1");
        fireEvent(toggle(key), "click");
        assertCspSafe(view);
        assertStyled(view, ...STYLES);
      }
      coach({ teamAnswer: withPlayers(PLAYERS.filter(({ skipNextGame }) => skipNextGame)) });
      await renderTeamRoster("t1");
      assertStyled(view, ...STYLES);
    });
  }
  assert.ok(text("src/styles.css").includes('@import url("screens/team/roster/marks.css");'));
});

test("the fallen are grey and readable: their cells, the line under the name and the characteristics of the profile", () => {
  const sheet = "src/screens/team/roster/marks.css";
  for (const selector of [".g-roster__section--fallen .g-rtable__c", ".g-roster__section--fallen .g-rtable__sub"]) {
    assert.deepEqual(valuesOf(sheet, selector, "color"), ["var(--muted)"]);
    assertReadable(sheet, selector, "color", ["--surface", "--surface-2", "--page"], 4.5);
  }
  assertReadable(sheet, ".g-fallen__stats .g-stat__v", "color", ["--surface-2"], 4.5);
  for (const selector of [".g-fallen__when", ".g-fallen__label", ".g-fallen__note", ".g-fallen__rules", ".g-fallen__career", ".g-fallen__rowpanel .g-fallen__career", ".g-fallen__cause--none"]) {
    assertReadable(sheet, selector, "color", ["--surface", "--surface-2"], 4.5);
  }
  assertReadable(sheet, ".g-fallen__cause", "color", ["--surface", "--surface-2"], 4.5);
});
