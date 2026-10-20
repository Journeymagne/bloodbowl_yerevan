import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PLAYERS, STYLES, api, aside, callKeys, coach, renderTeamRoster, save, settle, text, toggle, view, withPlayers,
} from "./helpers/roster-page.mjs";
import { CADE, FRIENDLY, HISTORY, ROUND_1, ROUND_2, ROUND_3, ROWS, TAPS, coachCade, counters, match, rowWordsIn } from "./helpers/career.mjs";

// Stage 07e, Task 4: «Career» in a desk's roster panel (DeskRosterCareer.html), its last block, under the pair of
// actions: the heading's button with «by match» and the chevron, and on a press the rows — no totals, no list head and
// no footnote (the table carries TD to MVP). It is read only while its list is open, for the player in the panel; each
// player's rows his own, and read again when the server has moved on (decision 5).

const CAREER = "src/screens/team/roster/career.css";
const READ = (id) => `GET /api/teams/t1/players/${id}/history`;
const HISTORY_READ = READ("p3");
const EVENTS = "POST /api/teams/t1/events";
const PATCH = "PATCH /api/teams/t1";
const callsTo = (key) => callKeys().filter((each) => each === key).length;
const block = () => aside()?.querySelector(".g-career") ?? null;
const careerToggle = () => aside().querySelector("[data-player-career]");
const list = () => aside().querySelector("#player-career-list");
const press = () => fireEvent(careerToggle(), "click");
const choose = (key) => fireEvent(toggle(key), "click");
const rowWords = () => rowWordsIn(list());
const stateOf = () => list().querySelector(".g-career__state");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const gamesAre = (games) => api.reply("GET /api/games", 200, { games, currentGames: [] });
const FAILED = { error: { code: "INTERNAL", params: {}, message: "x" } };
/** Ann, a Lineman, as her history tells her: a casualty in round 1. */
const ANN = { playerId: "p1", matches: [match({ counters: counters({ casualties: 1 }) })], outside: counters() };
const ANN_ROWS = [["Round 1 · Grimtusk Raiders", "W 2–1", "CAS 1", "+2", ""]];

/** The desk's roster with Cade in the panel, the server holding `history` for him and `games` on. */
async function deskWithCade({ history = HISTORY, events, games = [] } = {}) {
  coachCade(events ? { events } : {});
  gamesAre(games);
  api.reply(HISTORY_READ, 200, { history });
  await renderTeamRoster("t1");
  await settle();
  choose("p3#0");
}

test("the panel's career, closed, under the pair of actions: «Career», «by match», the chevron; nothing is read", async () => {
  await withWindow({ phone: false }, async () => {
    await deskWithCade();
    const children = aside().childNodes;
    assert.ok(block() && children.at(-1) === block(), "the panel's last block");
    assert.equal(block().tagName, "SECTION");
    assert.equal(block().getAttribute("class"), "g-career g-career--desk");
    assert.ok(children.at(-2).classList.contains("g-roster__nextblock"), "under the next match and the pair of actions");
    const heading = careerToggle().parentNode;
    assert.equal(heading.tagName, "H3", "the panel's blocks are h3 under the name's h2");
    assert.ok(heading.classList.contains("g-career__head") && heading.parentNode === block());
    assert.equal(careerToggle().tagName, "BUTTON");
    assert.equal(careerToggle().getAttribute("data-player-career"), "p3");
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.ok(!careerToggle().hasAttribute("aria-controls"), "nothing to name while the list is closed (K14)");
    assert.equal(block().querySelector(".g-career__title").textContent, "Career");
    assert.equal(block().querySelector(".g-career__sub").textContent, "by match");
    assert.ok(careerToggle().querySelector("svg.g-icon"), "the chevron");
    assert.ok(!block().querySelector(".g-career__totals"), "the table carries TD to MVP");
    assert.ok(!list());
    assert.equal(callsTo(HISTORY_READ), 0);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("opened: read once for the panel's player; «Reading the matches…» meanwhile; the rows newest first, the plate before the SPP; no list head, no footnote", async () => {
  await withWindow({ phone: false }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    const gate = api.hold(HISTORY_READ);
    await renderTeamRoster("t1");
    await settle();
    choose("p3#0");
    careerToggle().focus();
    press();
    assert.ok(document.activeElement === careerToggle(), "the focus stays on the button");
    assert.equal(careerToggle().getAttribute("aria-expanded"), "true");
    assert.equal(careerToggle().getAttribute("aria-controls"), "player-career-list");
    assert.ok(list().closest(".g-career--desk"));
    assert.equal(stateOf().textContent, "Reading the matches…");
    assert.equal(stateOf().getAttribute("role"), "status");
    assert.equal(callsTo(HISTORY_READ), 1);
    gate.release();
    await settle();
    assert.deepEqual(rowWords(), ROWS, "07d's rows, newest first");
    assert.equal(list().querySelector(".g-career__rows").tagName, "UL");
    const live = list().querySelectorAll(".g-career__row")[0];
    assert.deepEqual(live.querySelector(".g-career__side").childNodes.map((node) => node.getAttribute("class").split(" ")[0]),
      ["g-career__pending", "g-career__spp"], "DeskRosterCareer.html: the plate, then the SPP");
    assert.ok(!list().querySelector(".g-career__listhead"), "no list head");
    assert.ok(!list().querySelector(".g-career__note"), "no footnote");
    assert.ok(!block().querySelector(".g-career__totals"));
    assert.ok(document.activeElement === careerToggle(), "and once the answer is drawn");
    assert.equal(callsTo(HISTORY_READ), 1);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    // Closed again: the rows go, nothing is read.
    press();
    assert.ok(!list());
    assert.equal(careerToggle().getAttribute("aria-expanded"), "false");
    assert.equal(callsTo(HISTORY_READ), 1);
    api.assertAnswered();
  });
});

test("another player chosen with the list open: his own read and rows; an answer for the one left draws nowhere; back to the first, nothing is read again", async () => {
  await withWindow({ phone: false }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    api.reply(READ("p1"), 200, { history: ANN });
    const gate = api.hold(HISTORY_READ);
    await renderTeamRoster("t1");
    await settle();
    choose("p3#0");
    press();
    assert.equal(callsTo(HISTORY_READ), 1);
    // Ann chosen while Cade's read is in the air: the list stays open (DeskRosterCareer.html), and is hers.
    choose("p1#0");
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    assert.equal(careerToggle().getAttribute("data-player-career"), "p1");
    assert.equal(careerToggle().getAttribute("aria-expanded"), "true");
    assert.equal(stateOf().textContent, "Reading the matches…");
    assert.equal(callsTo(READ("p1")), 1);
    await settle();
    assert.deepEqual(rowWords(), ANN_ROWS);
    gate.release();
    await settle();
    assert.equal(aside().getAttribute("data-panel-player"), "p1#0");
    assert.deepEqual(rowWords(), ANN_ROWS, "Cade's answer draws nowhere");
    // Back to Cade: his rows, as his read brought them; nothing read again.
    choose("p3#0");
    assert.deepEqual(rowWords(), ROWS);
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.equal(callsTo(READ("p1")), 1);
    choose("p1#0");
    await settle();
    assert.deepEqual(rowWords(), ANN_ROWS);
    assert.equal(callsTo(READ("p1")), 1);
    api.assertAnswered();
  });
});

test("closed, nothing more is read; opened over a read that failed, read again", async () => {
  await withWindow({ phone: false }, async () => {
    coachCade();
    api.reply(HISTORY_READ, 500, FAILED);
    await renderTeamRoster("t1");
    await settle();
    choose("p3#0");
    press();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.match(stateOf().textContent, /^The matches did not load: ./);
    assert.equal(stateOf().getAttribute("role"), "alert");
    assert.ok(stateOf().classList.contains("g-career__state--bad"));
    // Closed: nothing read. Opened: read again, «Reading the matches…» meanwhile.
    press();
    assert.equal(callsTo(HISTORY_READ), 1);
    api.reply(HISTORY_READ, 200, { history: HISTORY });
    press();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.equal(stateOf().textContent, "Reading the matches…");
    await settle();
    assert.deepEqual(rowWords(), ROWS);
    // Closed, the server moves on — a save of the queue lands — and nothing is read; opened, it is read again.
    press();
    api.reply(PATCH, 200, { team: withPlayers(PLAYERS.map((each) => (each.id === "p3" ? { ...CADE, spp: { touchdowns: 4, mvps: 1 } } : each)), { revision: 5 }) });
    assert.deepEqual(save.stepSpp("t1", "p3", "touchdowns", 1), { ok: true });
    await settle();
    assert.equal(callsTo(PATCH), 1);
    assert.equal(callsTo(HISTORY_READ), 2, "the list closed: nothing read");
    press();
    assert.deepEqual(rowWords(), ROWS, "the rows read before stand until the new answer");
    assert.equal(callsTo(HISTORY_READ), 3);
    await settle();
    api.assertAnswered();
  });
});

/** HISTORY while LIVE_GAME is on: round 3 is its match (the friendly another pairing's). */
const LIVE_ROUND = { ...ROUND_3, pairingId: LIVE_GAME.id };
const IN_MATCH = { ...HISTORY, matches: [ROUND_1, { ...FRIENDLY, pairingId: "g5" }, ROUND_2, LIVE_ROUND] };
const LIVE_TAPS = TAPS.map((tap) => ({ ...tap, pairingId: LIVE_GAME.id }));

// Review Focus 2: a desk in a match, the list open, the coach taps.
test("in a match with the list open: a tap heard reads it again, none while it is in the air; «Before the site's records» holds", async () => {
  await withoutTimers(() => withWindow({ phone: false }, async () => {
    await deskWithCade({ history: IN_MATCH, events: LIVE_TAPS, games: [LIVE_GAME] });
    press();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    assert.deepEqual(rowWords(), ROWS, "18 SPP, which the rows add up to");
    // A touchdown of Cade's in the match, from his panel: the line counts it at once, 21 SPP; its answer is held.
    const tap = api.hold(EVENTS);
    api.reply(EVENTS, 201, { event: { id: "e3", pairingId: LIVE_GAME.id, playerId: "p3", counter: "touchdowns", delta: 1, injury: null, settledAt: null } });
    fireEvent(aside().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
    await settle();
    assert.equal(tap.count, 1);
    assert.equal(callsTo(HISTORY_READ), 1, "none while the tap is in the air");
    assert.deepEqual(rowWords(), ROWS, "and no rest of +3 for the tap on its way");
    // Heard: read again; the rows read before stand meanwhile, their rest counted from the SPP of their read's moment.
    const again = api.hold(HISTORY_READ);
    tap.release();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 2);
    assert.equal(again.count, 1);
    assert.deepEqual(rowWords(), ROWS, "no «Before the site's records · +3» while the new read is in the air");
    assert.ok(!list().querySelector(".g-career__state"), "no «Reading the matches…»");
    // The server has the tap in round 3: TD 2 · COMP 1, +7; the rows add up to 21.
    const tapped = { ...LIVE_ROUND, counters: counters({ touchdowns: 2, completions: 1 }) };
    api.reply(HISTORY_READ, 200, { history: { ...IN_MATCH, matches: [...IN_MATCH.matches.slice(0, 3), tapped] } });
    again.release();
    await settle();
    assert.deepEqual(rowWords(), [["Round 3 · Silverbrook Rangers", "", "TD 2 · COMP 1", "+7", "waits for the post-match"], ...ROWS.slice(1)]);
    assert.equal(callsTo(HISTORY_READ), 2);
    api.assertAnswered();
  }));
});

test("a player stored with no id has no career in the panel", async () => {
  await withWindow({ phone: false }, async () => {
    const bare = { rowIndex: 2, number: "3", name: "Cade" };
    coach({ teamAnswer: withPlayers([bare, ...PLAYERS.filter(({ id }) => id !== "p3")]) });
    await renderTeamRoster("t1");
    await settle();
    assert.equal(aside().querySelector(".g-roster__pname").textContent, "Cade", "the table's first, in the panel");
    assert.ok(!block(), "no read could name him");
    assert.ok(!callKeys().some((key) => key.endsWith("/history")));
    // Another player chosen has his.
    choose("p1#0");
    assert.ok(block());
    api.assertAnswered();
  });
});

test("a search that hides everyone draws no panel and reads nothing", async () => {
  await withWindow({ phone: false }, async () => {
    await deskWithCade();
    press();
    await settle();
    assert.equal(callsTo(HISTORY_READ), 1);
    const field = view.querySelector("#roster-query");
    field.focus();
    field.value = "zzzz";
    fireEvent(field, "input");
    assert.ok(!aside(), "no panel");
    // The server moves on (a match begun): no panel, no player of it, nothing read.
    gamesAre([LIVE_GAME]);
    globalThis.dispatchEvent(new Event("online"));
    await settle();
    assert.ok(!aside());
    assert.equal(callsTo(HISTORY_READ), 1);
    // The search cleared: Cade in the panel again, his list open, read again for the match begun.
    field.value = "";
    fireEvent(field, "input");
    assert.ok(list());
    assert.equal(callsTo(HISTORY_READ), 2);
    await settle();
    api.assertAnswered();
  });
});

test("sizes as DeskRosterCareer (D2), readable, wrapping", () => {
  const desk = (selector) => `.g-career--desk ${selector}`;
  // The section: a column 8px apart, 14 over it and a 1px rule (#E6EBE8, --line), as the next match's block over it.
  assert.deepEqual(valuesOf(CAREER, ".g-career--desk", "gap"), ["var(--space-8)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career--desk", "padding-top"), ["var(--space-14)"]);
  assert.deepEqual(valuesOf(CAREER, ".g-career--desk", "border-top"), ["1px solid var(--line)"]);
  // The button 40px (D2: from 901px at least 24), «Career» Oswald 22/700.
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__toggle"), "min-height"), ["40px"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__title"), "font"), ["700 22px/normal var(--font-display)"]);
  // The list's 12px corners; a row 48px of content, 6 12 and its rule — 61px drawn — 8 apart; its column 1px apart.
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__rows"), "border-radius"), ["var(--radius-lg)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__row"), "min-height"), ["61px"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__row"), "padding"), ["var(--space-6) var(--space-12)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__row"), "gap"), ["var(--space-8)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__main"), "gap"), ["1px"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__name"), "font"), ["700 13px/normal var(--font-body)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__events"), "font"), ["400 12px/normal var(--font-body)"]);
  // At the right, in a row 6 apart and centred: the plate, then the SPP Oswald 17/700.
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__side"), "flex-direction"), ["row"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__side"), "gap"), ["var(--space-6)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__side"), "align-items"), ["center"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__spp"), "font"), ["700 17px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(CAREER, desk(".g-career__state"), "font"), ["400 13px/normal var(--font-body)"]);
  // The panel is the page's fill: what the desk's block says in colour is readable on it, in every palette.
  for (const selector of [".g-career__title", ".g-career__sub", ".g-career__name", ".g-career__result--won", ".g-career__result--drawn",
    ".g-career__result--lost", ".g-career__events", ".g-career__spp", ".g-career__quiet", ".g-career__state", ".g-career__state--bad"]) {
    assertReadable(CAREER, selector, "color", ["--surface"], 4.5);
  }
  assertReadable(CAREER, ".g-career__pending", "color", ["--warn-tint"], 4.5);
  const deskColours = text(CAREER).replace(/\/\*[\s\S]*?\*\//g, "").match(/\.g-career--desk[^{]*\{[^}]*\}/g).join("\n");
  assert.ok(!/(?:^|[;\s{])color\s*:/.test(deskColours), "the desk's rules are sizes: its colours are the block's");
  // Nothing is cut with «…»: a long opponent wraps.
  const css = text(CAREER).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.ok(!/ellipsis/.test(css));
  assert.ok(!/white-space\s*:\s*nowrap/.test(css));
  assertDictionaryCovers("src/screens/team/roster/career.mjs");
  assert.equal(dictionary("en")["teamPlayer.career.byMatch"], "by match");
  assert.equal(dictionary("ru")["teamPlayer.career.byMatch"], "по матчам");
});
