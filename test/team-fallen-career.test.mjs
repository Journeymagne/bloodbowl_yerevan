import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import {
  PIKE, PLAYERS, STYLES, api, aside, callKeys, coach, died, renderTeamRoster, settle, state, team, toggle, view, withPlayers,
} from "./helpers/roster-page.mjs";
import { counters, match, rowWordsIn } from "./helpers/career.mjs";

const { renderTeamPlayer } = await import("../src/screens/team/player/index.mjs");

// Stage 07e, Task 5: a fallen player's career by match, where PlayerDead.html puts it — after the card of his death,
// before «Skills» — as PlayerCareer's block (the owner's question 2, its default): on his page (stage 07b), a phone's
// block on either width; on the roster's player page on a phone; and in a desk's panel, the desk's block (decision 2).
// A record with no id keeps its one number: no read could name him.

const READ = (id) => `GET /api/teams/t1/players/${id}/history`;
const UNDO = "DELETE /api/teams/t1/fallen/f1";
const callsTo = (key) => callKeys().filter((each) => each === key).length;
const histories = () => callKeys().filter((key) => key.endsWith("/history"));
const block = () => view.querySelector(".g-career");
const careerToggle = () => view.querySelector("[data-player-career]");
const list = () => view.querySelector("#player-career-list");
const press = () => fireEvent(careerToggle(), "click");
const totals = () => block().querySelectorAll(".g-career__total").map((cell) => [cell.querySelector("dt").textContent, cell.querySelector("dd").textContent]);
const firstClasses = (root) => root.childNodes.map((node) => node.getAttribute("class").split(" ")[0]);
/**
 * Joe, a Lineman the post-match of round 2 (g7) recorded dead with no tap of his: the history has no counters for him
 * there, the injury from the post-match's side; then the team's next two matches, where he is on no roster.
 */
const JOE_DEATH = match({ pairingId: "g7", roundNumber: 2, played: true, source: "none", counters: null, injury: { code: "dead" } });
const AFTER = [
  match({ pairingId: "g8", roundNumber: 3, played: false, source: "none", counters: null, opponent: { teamId: "r8", name: "Karak Hold Hammers" } }),
  match({ pairingId: "g9", roundNumber: 4, played: false, source: "none", counters: null, opponent: { teamId: "r9", name: "Tombway Kings" } }),
];
const JOE_HISTORY = { playerId: "d2", matches: [JOE_DEATH, ...AFTER], outside: counters() };

test("a fallen player's page (07b) on a phone: «Career» after his card, before «Skills», read once; the totals from what the roster held when he died; the list on a press", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    api.reply(READ("d2"), 200, { history: JOE_HISTORY });
    await renderTeamPlayer("t1", "d2");
    await settle();
    const fallen = view.querySelector(".g-fallen");
    assert.deepEqual(firstClasses(fallen), ["g-fallen__stats", "g-fallen__card", "g-career", "g-roster__pblock", "g-fallen__rules"], "PlayerDead.html's order");
    assert.ok(!block().classList.contains("g-career--desk"), "PlayerCareer's block");
    assert.ok(!view.querySelector(".g-fallen__career"), "in place of «Career: N SPP»");
    const heading = careerToggle().parentNode;
    assert.equal(heading.tagName, "H3", "as «Skills» there");
    assert.equal(careerToggle().getAttribute("data-player-career"), "d2");
    assert.equal(block().querySelector(".g-career__sub").textContent, "0 SPP · by match");
    assert.deepEqual(totals(), [["GP", "1"], ["TD", "0"], ["CAS", "0"], ["COMP", "0"], ["KO", "0"], ["INT", "0"], ["MVP", "0"]], "the death's match is one he played");
    assert.equal(callsTo(READ("d2")), 1);
    assert.ok(document.activeElement === view.querySelector("h1"), "his name keeps the focus of the first draw");
    // The list: the death's match alone — the team's matches after it add no row (pre-flight L6).
    careerToggle().focus();
    press();
    assert.deepEqual(list().querySelector(".g-career__listhead").childNodes.map((node) => node.textContent), ["All matches · 1", "SPP"]);
    assert.deepEqual(rowWordsIn(list()), [["Round 2 · Grimtusk Raiders", "W 2–1", "Dead", "—", ""]]);
    assert.ok(list().querySelector(".g-career__note"), "the footnote");
    assert.ok(document.activeElement === careerToggle(), "the focus stays on the button");
    assert.equal(callsTo(READ("d2")), 1);
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("the page read when the games answer before the fallen: one read of his history", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    api.reply(READ("d2"), 200, { history: JOE_HISTORY });
    const fallen = api.hold("GET /api/teams/t1/fallen");
    const drawing = renderTeamPlayer("t1", "d2");
    await settle();
    assert.equal(histories().length, 0, "nothing while the fallen are read");
    fallen.release();
    await drawing;
    await settle();
    assert.equal(callsTo(READ("d2")), 1, "the first draw of his profile asks for it (pre-flight L7)");
    assert.ok(block());
    api.assertAnswered();
  });
});

// Review M5: L7's other half — the fallen answer first, and the first draw asks nothing while the games are read.
test("the page read when the fallen answer before the games: no read of his history until the games answer, then one", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    api.reply(READ("d2"), 200, { history: JOE_HISTORY });
    const games = api.hold("GET /api/games");
    const drawing = renderTeamPlayer("t1", "d2");
    await settle();
    await settle();
    assert.ok(block(), "his profile is drawn: the fallen have answered");
    assert.deepEqual(totals()[0], ["GP", "–"]);
    assert.equal(histories().length, 0, "nothing while the games are read (pre-flight L1)");
    games.release();
    await drawing;
    await settle();
    assert.equal(callsTo(READ("d2")), 1, "the games' answer asks for it, once");
    assert.deepEqual(totals()[0], ["GP", "1"]);
    api.assertAnswered();
  });
});

// Fidelity E1 (PlayerDead.html): a nought of the counter row is quiet, each number that is not keeps the ink.
test("the fallen player's counter row: a nought is quiet, as on his profile", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    api.reply(READ("d1"), 200, { history: { playerId: "d1", matches: [match({ counters: counters({ touchdowns: 2 }) })], outside: counters() } });
    await renderTeamPlayer("t1", "d1");
    await settle();
    const values = block().querySelectorAll(".g-career__value");
    assert.deepEqual(values.map((value) => [value.textContent, value.classList.contains("g-career__zero")]),
      [["1", false], ["2", false], ["0", true], ["0", true], ["0", true], ["0", true], ["0", true]]);
    api.assertAnswered();
  });
});

test("the page on a desk draws the phone's block: the totals, the list head and the footnote", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    api.reply(READ("d2"), 200, { history: JOE_HISTORY });
    await renderTeamPlayer("t1", "d2");
    await settle();
    assert.ok(view.querySelector(".g-fallen-page"));
    assert.ok(!block().classList.contains("g-career--desk"), "a page of its own, with no table to carry TD to MVP");
    assert.ok(block().querySelector(".g-career__totals"));
    assert.equal(callsTo(READ("d2")), 1);
    press();
    assert.ok(list().querySelector(".g-career__listhead"));
    assert.ok(list().querySelector(".g-career__note"));
    assert.deepEqual(rowWordsIn(list()).map(([title]) => title), ["Round 2 · Grimtusk Raiders"]);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("a fallen player the roster's player mode reads on a phone draws the same block", async () => {
  await withWindow({ phone: true }, async () => {
    // The coach's list still holds Pike on the roster: the address goes to the roster's player mode, whose read has him fallen.
    coach();
    state.myTeams = { ...state.myTeams, items: [team({ roster: { players: [...PLAYERS, PIKE.player] } })] };
    api.reply(READ("d1"), 200, { history: { playerId: "d1", matches: [match({ counters: counters({ touchdowns: 2 }) })], outside: counters() } });
    await renderTeamPlayer("t1", "d1");
    await settle();
    const profile = view.querySelector(".g-profile__fallen");
    assert.ok(profile, "the roster's player mode, his fallen profile");
    const career = profile.querySelector(".g-career");
    assert.ok(career && !career.classList.contains("g-career--desk"));
    assert.equal(careerToggle().parentNode.tagName, "H3");
    assert.deepEqual(firstClasses(profile.querySelector(".g-fallen")), ["g-fallen__stats", "g-fallen__card", "g-career", "g-roster__pblock", "g-fallen__rules"]);
    assert.ok(!profile.querySelector(".g-fallen__career"));
    assert.equal(callsTo(READ("d1")), 1);
    assert.deepEqual(totals()[0], ["GP", "1"]);
    press();
    assert.deepEqual(rowWordsIn(list()), [["Round 1 · Grimtusk Raiders", "W 2–1", "TD 2", "+6", ""]], "6 SPP: the rows hold them all");
    await settle();
    assert.equal(callsTo(READ("d1")), 1);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("the desk's panel of a fallen player: the desk's block in place of the one line, read on opening", async () => {
  await withWindow({ phone: false }, async () => {
    coach();
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f1"), "click");
    const career = aside().querySelector(".g-career--desk");
    assert.ok(career);
    const fallen = aside().querySelector(".g-fallen");
    assert.deepEqual(firstClasses(fallen), ["g-fallen__stats", "g-fallen__card", "g-career", "g-roster__pblock", "g-fallen__rules"], "after the card of his death");
    assert.ok(!aside().querySelector(".g-fallen__career"));
    assert.equal(careerToggle().parentNode.tagName, "H3");
    assert.equal(career.querySelector(".g-career__sub").textContent, "by match");
    assert.ok(!career.querySelector(".g-career__totals"));
    assert.equal(histories().length, 0, "nothing read while the list is closed");
    api.reply(READ("d1"), 200, { history: { playerId: "d1", matches: [match({ counters: counters({ touchdowns: 2 }) })], outside: counters() } });
    press();
    assert.equal(callsTo(READ("d1")), 1);
    await settle();
    assert.deepEqual(rowWordsIn(list()), [["Round 1 · Grimtusk Raiders", "W 2–1", "TD 2", "+6", ""]]);
    assert.ok(!list().querySelector(".g-career__listhead") && !list().querySelector(".g-career__note"), "the desk's list: its rows alone");
    // A player who plays chosen keeps the list open, and has his own read.
    fireEvent(toggle("p1#0"), "click");
    assert.equal(callsTo(READ("p1")), 1);
    fireEvent(toggle("fallen-f1"), "click");
    assert.equal(callsTo(READ("d1")), 1, "back to him: nothing read again");
    await settle();
    assertCspSafe(view);
    assertStyled(view, ...STYLES);
    api.assertAnswered();
  });
});

test("a record with no id keeps «Career: N SPP» and reads nothing", async () => {
  const noId = died("f7", { rowIndex: 0, number: "5", name: "No Id", spp: { touchdowns: 1 } }, { cause: "Foul" });
  await withWindow({ phone: false }, async () => {
    coach({ fallen: [noId] });
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f7"), "click");
    assert.equal(aside().querySelector(".g-fallen__career").textContent, "Career: 3 SPP");
    assert.ok(!aside().querySelector(".g-career"));
    assert.ok(!histories().length);
  });
  await withWindow({ phone: true }, async () => {
    coach({ fallen: [noId] });
    await renderTeamRoster("t1");
    fireEvent(toggle("fallen-f7"), "click");
    assert.match(view.querySelector(".g-rtable__panelrow .g-fallen__career").textContent, /^Career: 3 SPP · /, "his row on a phone, as before");
    assert.ok(!block());
    assert.ok(!histories().length);
    api.assertAnswered();
  });
});

test("rows past what the roster held at the death add no row", async () => {
  // Joe died with no SPP on the roster; the history has a touchdown of his in round 1 the roster never took.
  const history = { playerId: "d2", matches: [match({ pairingId: "g6", counters: counters({ touchdowns: 1 }) }), JOE_DEATH], outside: counters() };
  await withWindow({ phone: true }, async () => {
    coach();
    api.reply(READ("d2"), 200, { history });
    await renderTeamPlayer("t1", "d2");
    await settle();
    press();
    assert.deepEqual(rowWordsIn(list()).map(([title, , events, spp]) => [title, events, spp]), [
      ["Round 2 · Grimtusk Raiders", "Dead", "—"],
      ["Round 1 · Grimtusk Raiders", "TD 1", "+3"],
    ], "no «Before the site's records» under them");
    assert.equal(block().querySelector(".g-career__sub").textContent, "0 SPP · by match", "the heading is what the roster held");
    api.assertAnswered();
  });
});

test("undone while the list is open: the answer that comes after draws nothing", async () => {
  await withWindow({ phone: true }, async () => {
    coach();
    const gate = api.hold(READ("d1"));
    await renderTeamPlayer("t1", "d1");
    await settle();
    press();
    assert.equal(list().querySelector(".g-career__state").textContent, "Reading the matches…");
    // «Undo the mark», asked first: Pike is on the roster again.
    fireEvent(view.querySelector("[data-roster-undo]"), "click");
    api.reply(UNDO, 200, { team: withPlayers([...PLAYERS, PIKE.player], { revision: 5 }) });
    fireEvent(view.querySelector("dialog#roster-undo [data-undo-send]"), "click");
    await settle();
    assert.ok(!view.querySelector(".g-fallen"), "no longer a fallen player's profile");
    assert.ok(!block());
    const before = view.textContent;
    const focused = document.activeElement;
    gate.release({ status: 200, body: { history: { playerId: "d1", matches: [match()], outside: counters() } } });
    await settle();
    assert.equal(view.textContent, before, "the page as it was");
    assert.ok(document.activeElement === focused, "the focus where it was");
    assert.ok(!block());
    assert.equal(callsTo(READ("d1")), 1);
    api.assertAnswered();
  });
});
