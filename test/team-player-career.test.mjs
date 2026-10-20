import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { PLAYERS, STYLES, api, callKeys, coach, playerPage, releaseCurrentScreen, renderTeamRoster, settle, state, text, view, withPlayers } from "./helpers/roster-page.mjs";

const { careerRows, gamesPlayed } = await import("../src/screens/team/roster/career.mjs");
const { EXTRA_COUNTERS, MAIN_COUNTERS } = await import("../src/screens/team/roster/model.mjs");

// Stage 07d, owner's review (2026-10-20), Task 24: a player's career on a phone's profile, right after «Skills»
// (PlayerCareer.html). The totals stand from the roster's line at once; GP and the matches are read once a visit from
// GET /api/teams/:id/players/:pid/history, and drawn on a press of the heading's button, newest first, the edits outside
// a match last. A desk's career is stage 07e's (DeskRosterCareer.html); so is a fallen player's.

const PROFILE = "src/screens/team/roster/profile.css";
const HISTORY_READ = "GET /api/teams/t1/players/p3/history";
const TEAM_READ = "GET /api/teams/t1";
const NOTE = "Actions are recorded by taps on the roster and in the post-match. A line that waits for the post-match is in the career already, "
  + "and stays once both coaches finish the match. Edits outside a match are a line of their own. Matches before the site's records are not listed.";
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const callsTo = (key) => callKeys().filter((each) => each === key).length;
const career = () => view.querySelector(".g-profile__career");
const careerToggle = () => view.querySelector("[data-player-career]");
const list = () => view.querySelector("#player-career-list");
const press = () => fireEvent(careerToggle(), "click");
const totals = () => career().querySelectorAll(".g-profile__careertotal").map((cell) => [cell.querySelector("dt").textContent, cell.querySelector("dd").textContent]);
const rowWords = () => list().querySelectorAll(".g-profile__careerrow").map((row) => [
  row.querySelector(".g-profile__careername").textContent,
  row.querySelector(".g-profile__careerresult")?.textContent ?? "",
  row.querySelector(".g-profile__careerevents")?.textContent ?? "",
  row.querySelector(".g-profile__careerspp").textContent,
  row.querySelector(".g-profile__careerpending")?.textContent ?? "",
]);

/** Every counter of a roster's, nought unless said. */
const counters = (over = {}) => ({ touchdowns: 0, casualties: 0, knockouts: 0, completions: 0, catches: 0, interceptions: 0, throws: 0, landings: 0, bonus: 0, mvps: 0, ...over });
/** A row of the history as the server sends it: what the player did, and what the match was from the team's side. */
const match = (over = {}) => ({
  pairingId: "g1", played: true, source: "applied", counters: counters(), injury: null, pending: false,
  kind: "league", seasonId: "s1", roundNumber: 1, status: "confirmed", opponent: { teamId: "r1", name: "Grimtusk Raiders" }, score: { own: 2, opponent: 1 }, ...over,
});
const ROUND_1 = match({ counters: counters({ touchdowns: 2, mvps: 1 }) });
const FRIENDLY = match({ pairingId: "g2", kind: "friendly", seasonId: null, roundNumber: null, played: null, source: "none", counters: null, opponent: { teamId: "r2", name: "Duskspire Knives" }, score: { own: 1, opponent: 1 } });
const ROUND_2 = match({ pairingId: "g3", roundNumber: 2, played: false, opponent: { teamId: "r3", name: "Mirefen Rotters" }, score: { own: 0, opponent: 2 } });
const ROUND_3 = match({
  pairingId: "g4", roundNumber: 3, status: "in_progress", score: null, source: "events", pending: true, counters: counters({ touchdowns: 1, completions: 1 }),
  opponent: { teamId: "r4", name: "Silverbrook Rangers" },
});
/** Oldest first, as the server sends them; one edit outside a match. */
const HISTORY = { playerId: "p3", matches: [ROUND_1, FRIENDLY, ROUND_2, ROUND_3], outside: counters({ touchdowns: 1 }) };
/**
 * Cade, a Catcher of the humans, as the history tells him (M3: the two agree): round 1's TD 2 and MVP and the edit
 * outside a match's TD 1 on the roster, and round 3's TD 1 and COMP 1 among the records not settled yet — the line
 * counts both (`careerCounters`): TD 4 · COMP 1 · MVP 1, 18 SPP, which the rows add up to (+4, +11, +3).
 */
const CADE = { ...PLAYERS[2], spp: { touchdowns: 3, mvps: 1 } };
const TAPS = [
  { id: "e1", pairingId: "g4", playerId: "p3", counter: "touchdowns", delta: 1, injury: null, settledAt: null },
  { id: "e2", pairingId: "g4", playerId: "p3", counter: "completions", delta: 1, injury: null, settledAt: null },
];
const withCade = (player = CADE) => withPlayers(PLAYERS.map((each) => (each.id === "p3" ? player : each)));
/** The coach, his roster holding Cade as `player`, and the records `events` not settled. */
function coachCade({ player = CADE, events = TAPS } = {}) {
  coach({ teamAnswer: withCade(player) });
  api.reply("GET /api/teams/t1/events", 200, { events, revision: 4 });
}
const human = () => state.data.teams.find((team) => team.slug === "teams/human");
const ROWS = [
  ["Round 3 · Silverbrook Rangers", "", "TD 1 · COMP 1", "+4", "waits for the post-match"],
  ["Round 2 · Mirefen Rotters", "L 0–2", "missed the match", "—", ""],
  ["Friendly · Duskspire Knives", "D 1–1", "no details", "—", ""],
  ["Round 1 · Grimtusk Raiders", "W 2–1", "TD 2 · MVP", "+11", ""],
  ["Edits outside a match", "", "TD 1", "+3", ""],
];

/** Cade's profile on a phone, the server holding `history` for him. */
async function openCade(history = HISTORY, cade = {}) {
  coachCade(cade);
  api.reply(HISTORY_READ, 200, { history });
  await playerPage("p3");
  await settle();
}

test("the career stands right after the skills: «Career», «N SPP · by match», the totals GP TD CAS COMP KO INT MVP", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    const gate = api.hold(HISTORY_READ);
    await playerPage("p3");
    await settle();
    const body = view.querySelector(".g-profile__body");
    const blocks = body.childNodes.map((node) => node.getAttribute("class").split(" ")[0]);
    assert.deepEqual(blocks.slice(-3), ["g-profile__skills", "g-profile__career", "g-profile__injuries"], "PlayerCareer.html: after «Skills», before «Injuries»");
    assert.equal(career().tagName, "SECTION");
    assert.equal(career().querySelector(".g-profile__careertitle").textContent, "Career");
    assert.equal(career().querySelector(".g-profile__careersub").textContent, "18 SPP · by match");
    assert.ok(careerToggle().querySelector("svg.g-icon"), "the chevron");
    // The totals from the roster's line at once; GP waits for the history (Review Focus 4).
    assert.deepEqual(totals(), [["GP", "–"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]]);
    gate.release();
    await settle();
    assert.deepEqual(totals(), [["GP", "1"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]], "the one confirmed match the site knows he played");
    const quiet = career().querySelectorAll(".g-profile__careervalue").map((value) => value.classList.contains("g-profile__careerzero"));
    assert.deepEqual(quiet, [false, false, true, false, true, true, false], "a nought is quiet");
    assert.equal(careerToggle().tagName, "BUTTON");
    assert.equal(careerToggle().getAttribute("type"), "button");
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.ok(!careerToggle().hasAttribute("aria-controls"), "nothing to name while the list is closed (K14)");
    assert.ok(!list(), "the list closed");
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("the list opens on a press: newest first — the round, the opponent, the result, what the player did, the SPP; a match on waits for its post-match; a missed one; one without details; the edits outside a match last", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade();
    press();
    assert.equal(careerToggle().getAttribute("aria-expanded"), "true");
    assert.equal(careerToggle().getAttribute("aria-controls"), "player-career-list");
    assert.ok(list().closest(".g-profile__career"), "in the section");
    assert.deepEqual(list().querySelector(".g-profile__careerlisthead").childNodes.map((node) => node.textContent), ["All matches · 4", "SPP"]);
    assert.deepEqual(rowWords(), ROWS, "18 SPP, and the rows add up to it: no «Before the site's records»");
    assert.equal(list().querySelector(".g-profile__careerrows").tagName, "UL");
    const results = list().querySelectorAll(".g-profile__careerresult").map((result) => result.getAttribute("class"));
    assert.deepEqual(results, ["g-profile__careerresult g-profile__careerresult--lost", "g-profile__careerresult g-profile__careerresult--drawn", "g-profile__careerresult g-profile__careerresult--won"]);
    const quiet = list().querySelectorAll(".g-profile__careerrow").map((row) => row.querySelector(".g-profile__careerevents").classList.contains("g-profile__careerquiet"));
    assert.deepEqual(quiet, [false, true, true, false, false], "a missed match and one without details are quiet");
    assert.equal(list().querySelector(".g-profile__careernote").textContent, NOTE);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    // Closed again: the totals stay, the list goes.
    press();
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.ok(!list());
    assert.ok(!careerToggle().hasAttribute("aria-controls"));
    api.assertAnswered();
  });
});

test("matches before the first one the site knows the player in are not listed", async () => {
  const before = [
    match({ pairingId: "g0", roundNumber: 1, played: false, source: "none", counters: null, opponent: { teamId: "r9", name: "Tombway Kings" } }),
    match({ pairingId: "g00", kind: "friendly", roundNumber: null, played: null, source: "none", counters: null, opponent: { teamId: "r8", name: "Karak Hold Hammers" } }),
  ];
  await withWindow({ phone: true }, async () => {
    await openCade({ ...HISTORY, matches: [...before, ...HISTORY.matches] });
    press();
    assert.deepEqual(rowWords(), ROWS);
    assert.equal(list().querySelector(".g-profile__careerlisthead").childNodes[0].textContent, "All matches · 4");
    // A player with no SPP the site knows in no match yet, nothing outside one: «No matches yet», and the footnote under it (ruling on I1).
    await openCade({ playerId: "p3", matches: before, outside: counters() }, { player: PLAYERS[2], events: [] });
    press();
    assert.equal(list().querySelector(".g-profile__careerstate").textContent, "No matches yet");
    assert.ok(!list().querySelector(".g-profile__careerrows"));
    assert.equal(list().querySelector(".g-profile__careernote").textContent, NOTE);
    assert.deepEqual(totals()[0], ["GP", "0"]);
    assertStyled(view, ...STYLES);
  });
});

test("the history is read once a visit, after the roster; another draw reads nothing more; another visit reads again", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    const team = api.hold(TEAM_READ);
    const drawing = playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 0, "nothing while the roster is read");
    team.release();
    await drawing;
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.ok(callKeys().indexOf(HISTORY_READ) > callKeys().indexOf(TEAM_READ), "after the roster");
    press();
    press();
    press();
    // A draw of the queue's or of the games' reads nothing more.
    api.reply("GET /api/games", 200, { games: [], currentGames: [] });
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(rowWords(), ROWS, "open, as the coach left it");
    // Another visit: read again, and the list closed.
    releaseCurrentScreen();
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.ok(!list());
    api.assertAnswered();
  });
});

test("a read that failed: the totals stand, GP «–», the list says why; opening it again reads again", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await playerPage("p3");
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals(), [["GP", "–"], ["TD", "4"], ["CAS", "0"], ["COMP", "1"], ["KO", "0"], ["INT", "0"], ["MVP", "1"]]);
    assert.ok(career().querySelector(".g-profile__careervalue").classList.contains("g-profile__careerzero"), "«–» is quiet");
    // Opened: read again, «Reading the matches…» meanwhile (K14: a career let go is drawn as read).
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    const reading = list().querySelector(".g-profile__careerstate");
    assert.equal(reading.textContent, "Reading the matches…");
    assert.equal(reading.getAttribute("role"), "status");
    await settle();
    const failed = list().querySelector(".g-profile__careerstate");
    assert.match(failed.textContent, /^The matches did not load: ./);
    assert.equal(failed.getAttribute("role"), "alert");
    assert.ok(failed.classList.contains("g-profile__careerstate--bad"));
    assert.deepEqual(totals()[0], ["GP", "–"]);
    assertStyled(view, ...STYLES);
    // Closed: nothing read. Opened again: read again, and drawn.
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    press();
    assert.equal(callsTo(HISTORY_READ), 3);
    await settle();
    assert.deepEqual(rowWords(), ROWS);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    // A body without the matches is no answer.
    coachCade();
    api.reply(HISTORY_READ, 200, { history: { playerId: "p3" } });
    await playerPage("p3");
    await settle();
    press();
    await settle();
    assert.match(list().querySelector(".g-profile__careerstate").textContent, /^The matches did not load: ./);
  });
});

test("an answer after the coach left draws nothing", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    const gate = api.hold(HISTORY_READ);
    await playerPage("p3");
    await settle();
    press();
    assert.equal(list().querySelector(".g-profile__careerstate").textContent, "Reading the matches…");
    // «‹ Roster»: the router leaves the profile for the roster.
    releaseCurrentScreen();
    await renderTeamRoster("t1");
    await settle();
    const before = view.textContent;
    gate.release({ status: 200, body: { history: HISTORY } });
    await settle();
    assert.equal(view.textContent, before, "the roster as it was");
    assert.ok(view.querySelector('[data-screen="team-roster"]'));
    assert.ok(!career());
    assert.equal(callsTo(HISTORY_READ), 1, "the roster reads no history");
  });
});

// Ruling on review I1: «N SPP · by match» is the roster's career, which holds SPP the history cannot put in a match (matches
// before the site's records, a player who came with SPP): the rest is a last, quiet row, so the rows add up to the heading.
test("a veteran with 28 SPP and no match the site knows: «Before the site's records · +28», under the head and over the footnote", async () => {
  const veteran = { ...PLAYERS[2], spp: { touchdowns: 7, completions: 2, mvps: 1 } };
  const unknown = match({ played: null, source: "none", counters: null });
  await withWindow({ phone: true }, async () => {
    await openCade({ playerId: "p3", matches: [unknown], outside: counters() }, { player: veteran, events: [] });
    assert.equal(career().querySelector(".g-profile__careersub").textContent, "28 SPP · by match");
    assert.deepEqual(totals()[0], ["GP", "0"]);
    press();
    assert.deepEqual(list().querySelector(".g-profile__careerlisthead").childNodes.map((node) => node.textContent), ["All matches · 0", "SPP"]);
    assert.deepEqual(rowWords(), [["Before the site's records", "", "", "+28", ""]], "no match's details: its title and its SPP alone");
    const row = list().querySelector(".g-profile__careerrow");
    assert.ok(!row.querySelector(".g-profile__careerevents"));
    assert.ok(row.querySelector(".g-profile__careerspp").classList.contains("g-profile__careerquiet"), "quiet");
    assert.ok(!list().querySelector(".g-profile__careerstate"), "not «No matches yet»: there is a row to add up");
    assert.equal(list().querySelector(".g-profile__careernote").textContent, NOTE);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
  });
});

test("a phone's profile whose roster read failed reads no history; «Try again» that brings the roster reads it once", async () => {
  await withWindow({ phone: true }, async () => {
    coachCade();
    api.reply(TEAM_READ, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
    await playerPage("p3");
    await settle();
    assert.ok(view.querySelector(".g-roster__failed [data-roster-retry]"));
    assert.equal(callsTo(HISTORY_READ), 0);
    api.reply(TEAM_READ, 200, { team: withCade() });
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    fireEvent(view.querySelector("[data-roster-retry]"), "click");
    await settle();
    assert.ok(career());
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
  });
});

test("the width crossing 900px: a desk reads nothing; the phone's profile reads once, and not again on the way back", async () => {
  await withWindow({ phone: false }, async () => {
    const listeners = new Set();
    const media = { matches: false, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
    globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
    const cross = async (phone) => {
      media.matches = phone;
      listeners.forEach((listener) => listener());
      await settle();
    };
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    await playerPage("p3");
    await settle();
    assert.ok(view.querySelector(".g-roster__aside") && !career(), "a desk: the roster with him in the panel");
    assert.equal(callsTo(HISTORY_READ), 0);
    await cross(true);
    assert.ok(career());
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    await cross(false);
    assert.ok(!career());
    await cross(true);
    assert.equal(callsTo(HISTORY_READ), 1, "the visit's read stands");
    assert.deepEqual(totals()[0], ["GP", "1"]);
    api.assertAnswered();
  });
});

test("a desk draws no career and reads none; a fallen player's page neither", async () => {
  // A desk: the address is the roster with him in the panel (stage 07e draws the desk's career, DeskRosterCareer.html).
  coachCade();
  await playerPage("p3");
  await settle();
  assert.ok(view.querySelector(".g-roster__aside"));
  assert.ok(!career());
  assert.equal(callsTo(HISTORY_READ), 0);
  api.assertAnswered();
  await withWindow({ phone: true }, async () => {
    coach();
    await playerPage("d1");
    await settle();
    assert.equal(view.querySelector("h1").textContent, "Pike");
    assert.ok(!career());
    assert.ok(!callKeys().some((key) => key.endsWith("/history")));
    // An id the roster holds nowhere: the way back, and nothing read.
    coach();
    await playerPage("zz");
    await settle();
    assert.ok(!career());
    assert.ok(!callKeys().some((key) => key.endsWith("/history")));
    api.assertAnswered();
  });
});

test("the toggle keeps the focus; its heading is the section's", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade();
    const heading = careerToggle().parentNode;
    assert.equal(heading.tagName, "H2", "a heading's navigation finds it, as «Skills»");
    assert.ok(heading.classList.contains("g-profile__careerhead"));
    assert.ok(heading.parentNode === career());
    careerToggle().focus();
    press();
    assert.ok(document.activeElement === careerToggle(), "on the button, open");
    const open = view.querySelector('button[aria-controls="player-career-list"][aria-expanded="true"]');
    assert.ok(open === careerToggle() && open.parentNode.tagName === "H2", "the open list named by the heading's button");
    press();
    assert.ok(document.activeElement === careerToggle(), "and closed");
  });
});

test("an opponent's name and the words are text", async () => {
  await withWindow({ phone: true }, async () => {
    await openCade({ ...HISTORY, matches: [match({ opponent: { teamId: "r1", name: HOSTILE } })] });
    press();
    assert.equal(list().querySelector(".g-profile__careername").textContent, `Round 1 · ${HOSTILE}`);
    assert.ok(!view.querySelector("img"));
    assert.ok(!view.querySelector("[onerror]"));
    assertCspSafe(view);
  });
});

test("every key in both dictionaries; styled; D2; wrapping", () => {
  assertDictionaryCovers("src/screens/team/roster/career.mjs");
  // The counters a row names, each by the roster's own short words.
  for (const counter of [...MAIN_COUNTERS, ...EXTRA_COUNTERS, "catches"]) {
    for (const locale of ["en", "ru"]) assert.ok(dictionary(locale)[`teamRoster.counter.${counter}`], `${locale} ${counter}`);
  }
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  const career = (words) => Object.keys(words).filter((key) => key.startsWith("teamPlayer.career."));
  assert.deepEqual(career(ru), career(en));
  for (const key of career(en)) assert.deepEqual(ru[key].match(/\{\w+\}/g), en[key].match(/\{\w+\}/g), key);
  assert.equal(ru["teamPlayer.career.listHead"], "Все матчи · {count}");
  assert.equal(ru["teamPlayer.career.out"], "пропуск матча", "neutral words: no «не играл»");
  assert.equal(ru["teamPlayer.career.note"], "Действия записываются тапами в «Составе» и в итогах матча. Строка «ждёт итогов» уже входит в карьеру и закрепится, "
    + "когда оба тренера завершат матч. Правки вне матча — отдельной строкой. Матчи до записей на сайте не показываются.");
  // D2: the heading's button is a thumb tall.
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careertoggle", "min-height"), ["var(--size-touch)"]);
  // PlayerCareer.html, as it draws (content-box): a row is 56px of content, 8px over and under and a 1px rule — 73px.
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careerrow", "min-height"), ["73px"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careerrow", "padding"), ["var(--space-8) var(--space-12)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careerrow", "grid-template-columns"), ["minmax(0, 1fr) auto"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careertotals", "grid-template-columns"), ["repeat(7, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careertotals", "padding"), ["var(--space-8) 0"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careerrows", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careerpending", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(valuesOf(PROFILE, ".g-profile__careertoggle .g-icon", "transform"), ["rotate(90deg)"], "the chevron points down while closed");
  assert.deepEqual(valuesOf(PROFILE, '.g-profile__careertoggle[aria-expanded="true"] .g-icon', "transform"), ["rotate(-90deg)"], "and turns 180° open");
  // Readable on the page and on the plate, in every palette.
  for (const selector of [".g-profile__careersub", ".g-profile__careerkey", ".g-profile__careervalue", ".g-profile__careerzero", ".g-profile__careerlisthead",
    ".g-profile__careername", ".g-profile__careerresult--won", ".g-profile__careerresult--drawn", ".g-profile__careerresult--lost", ".g-profile__careerevents",
    ".g-profile__careerspp", ".g-profile__careerquiet", ".g-profile__careernote", ".g-profile__careerstate", ".g-profile__careerstate--bad"]) {
    assertReadable(PROFILE, selector, "color", ["--surface"], 4.5);
  }
  assertReadable(PROFILE, ".g-profile__careerpending", "color", ["--warn-tint"], 4.5);
  // A long opponent and a long line of actions wrap; nothing is cut with «…».
  const css = text(PROFILE).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/text-overflow\s*:\s*ellipsis/.test(css));
  for (const selector of [".g-profile__careername", ".g-profile__careerevents"]) assert.deepEqual(valuesOf(PROFILE, selector, "overflow-wrap"), ["anywhere"], selector);
});

test("the rows: an MVP is «MVP», two are «MVP 2»; a match's injury; a negative edit outside a match; GP counts no match on", () => {
  coach();
  const race = human();
  const rows = careerRows({
    matches: [
      match({ counters: counters({ mvps: 1, touchdowns: 1 }) }),
      match({ pairingId: "g2", roundNumber: 2, counters: counters({ mvps: 2, casualties: 1, throws: 1, catches: 1 }), injury: { code: "badly-hurt" } }),
      match({ pairingId: "g3", roundNumber: 3, injury: { code: "lasting", stat: "ag" } }),
      match({ pairingId: "g4", roundNumber: 4 }),
      // K15: a match on where the player has no tap yet waits for its post-match; it is no match «without details».
      match({ pairingId: "g5", roundNumber: 5, status: "in_progress", score: null, source: "none", counters: null, pending: false }),
    ],
    outside: counters({ touchdowns: -1 }),
  }, race);
  assert.deepEqual(rows.map(({ key, title, result, outcome, events, spp, quiet, pending }) => [key, title, result, outcome, events, spp, quiet, pending]), [
    ["g5", "Round 5 · Grimtusk Raiders", "", "", "no actions", "—", true, true],
    ["g4", "Round 4 · Grimtusk Raiders", "W 2–1", "won", "no actions", "0", true, false],
    ["g3", "Round 3 · Grimtusk Raiders", "W 2–1", "won", "Lasting Injury (AG)", "0", false, false],
    ["g2", "Round 2 · Grimtusk Raiders", "W 2–1", "won", "CAS 1 · MVP 2 · TTM 1 · CATCH 1 · Badly Hurt", "+13", false, false],
    ["g1", "Round 1 · Grimtusk Raiders", "W 2–1", "won", "TD 1 · MVP", "+8", false, false],
    ["outside", "Edits outside a match", "", "", "TD −1", "−3", false, false],
  ]);
  // Nothing outside a match: no line for it.
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race), []);
  assert.equal(gamesPlayed({ matches: [ROUND_1, FRIENDLY, ROUND_2, ROUND_3, match({ pairingId: "g9", played: true, status: "confirmed" })] }), 2,
    "confirmed and played: not the match on, not one missed, not one the site has no roster for");
});

test("the rows add up to the heading: what they lack is «Before the site's records»; none when they hold it all, or more", () => {
  coach();
  const race = human();
  // 12 earned; the rows hold 7 (+4, +3): the rest, +5, last and quiet.
  const seven = { matches: [match({ counters: counters({ touchdowns: 1, completions: 1 }) }), match({ pairingId: "g2", roundNumber: 2, counters: counters({ touchdowns: 1 }) })], outside: counters() };
  const rows = careerRows(seven, race, { earned: 12 });
  assert.deepEqual(rows.map(({ key, spp, points, quiet }) => [key, spp, points, quiet]), [["g2", "+3", 3, false], ["g1", "+4", 4, false], ["before", "+5", 5, true]]);
  assert.deepEqual(rows.at(-1), { key: "before", title: "Before the site's records", result: "", outcome: "", events: "", spp: "+5", points: 5, quiet: true, pending: false });
  assert.equal(rows.reduce((sum, row) => sum + row.points, 0), 12);
  // After the edits outside a match, which count too; a missed match and one without details count nothing.
  const edits = careerRows({ ...seven, matches: [...seven.matches, match({ pairingId: "g3", played: false })], outside: counters({ bonus: 2 }) }, race, { earned: 12 });
  assert.deepEqual(edits.map(({ key, spp }) => [key, spp]), [["g3", "—"], ["g2", "+3"], ["g1", "+4"], ["outside", "+2"], ["before", "+3"]]);
  // The rows hold it all, or more (a counter the roster holds at nought): no such row.
  assert.ok(!careerRows(seven, race, { earned: 7 }).some(({ key }) => key === "before"));
  assert.ok(!careerRows(seven, race, { earned: 5 }).some(({ key }) => key === "before"));
  // A veteran the site knows in no match: the one row.
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race, { earned: 28 }).map(({ title, spp }) => [title, spp]), [["Before the site's records", "+28"]]);
  assert.deepEqual(careerRows({ matches: [], outside: counters() }, race, { earned: 0 }), []);
});
