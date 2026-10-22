import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import {
  LIVE_GAME, PLAYERS, api, callKeys, coach, openRow, releaseCurrentScreen, renderTeamRoster, save, settle, text, withPlayers,
} from "./helpers/roster-page.mjs";

// Stage 09a, Task 1 (Review Focus 1): the roster was drawn before the match began — the opponent pressed «Start the
// match» a moment ago — and the coach's «+» on touchdowns is a save of the roster. The server refuses it, TEAM_IN_MATCH:
// the roster gives the step up, says the server's words and reads the games again, which bring the match.

const PATCH = "PATCH /api/teams/t1";
const GAMES = "GET /api/games";
const EN = JSON.parse(text("src/i18n/en.json"));
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);

test("a step the server refuses because the match has begun is given up in the server's words, and the games are read again", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    coach({ open: "p1#0" });
    await renderTeamRoster("t1");
    api.reply(PATCH, 422, { error: { code: "TEAM_IN_MATCH", params: {}, message: "x" } });
    // What the games say once read again: the match has begun.
    api.reply(GAMES, 200, { games: [LIVE_GAME], currentGames: [] });
    fireEvent(openRow().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
    await settle();
    const keys = callKeys();
    assert.equal(keys.filter((key) => key === PATCH).length, 1, "one save, never sent again");
    assert.ok(keys.lastIndexOf(GAMES) > keys.indexOf(PATCH), `the games are read after the refusal: ${keys.join(", ")}`);
    // One toast (the Task 1 review, M-3): what was not saved, which says what to do — not the server's words besides.
    assert.deepEqual(toasts(), [EN["teamRoster.matchDropped"].replace("{count}", "1")]);
    assert.equal(save.saveState("t1").waiting, 0, "no step waits");
    api.assertAnswered();
  }));
});

test("a refusal for a match the games do not show yet is said in the server's words, once", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    coach({ open: "p1#0" });
    await renderTeamRoster("t1");
    const before = toasts().length;
    api.reply(PATCH, 422, { error: { code: "TEAM_IN_MATCH", params: {}, message: "x" } });
    fireEvent(openRow().querySelector('[data-action-key="touchdowns"] [data-action-step="1"]'), "click");
    await settle();
    assert.deepEqual(toasts().slice(before), [EN["error.TEAM_IN_MATCH"]]);
    api.assertAnswered();
  }));
});

// Stage 13, Task 10 (07a's hand-offs, plan 09a's decision 25): a read of the team and its records is made before the
// games are (`readWithGames`), so a match that ends or begins between the two would lay a team from before it on games
// from after it. The match's phase is asked before the team's read and after the games': moved, the team is read again
// — at most twice more, then the last read is taken. And a tap whose answer comes once the coach has left is no reason
// for that visit to read anything: the next visit reads the records afresh.

const TEAM = "GET /api/teams/t1";
const RECORDS = "GET /api/teams/t1/events";
const TAP = "POST /api/teams/t1/events";
/** The same match, its post-match finished on another device: over. */
const OVER = { ...LIVE_GAME, postMatchStatus: "completed", resultStatus: "confirmed" };
const gamesAre = (games) => api.reply(GAMES, 200, { games, currentGames: [] });
/** t1 at `revision`, Ann with `touchdowns` in the roster. */
const annWith = (touchdowns, revision) => withPlayers(PLAYERS.map((player) => (player.id === "p1" ? { ...player, spp: { touchdowns } } : player)), { revision });
/** The server answers the team and its records at `revision`, Ann with `touchdowns`, from now on. */
const serverHas = (touchdowns, revision) => {
  api.reply(TEAM, 200, { team: annWith(touchdowns, revision) });
  api.reply(RECORDS, 200, { events: [], revision });
};
const plus = (counter) => openRow().querySelector(`[data-action-key="${counter}"] [data-action-step="1"]`);
const countOf = (counter) => openRow().querySelector(`[data-action-key="${counter}"] .g-stepper__value`).textContent;
/** The «+N» a counter shows for the match. */
const deltaOf = (counter) => openRow().querySelector(`[data-action-key="${counter}"] .g-stepper__delta`)?.textContent ?? null;
const teamReads = () => callKeys().filter((key) => key === TEAM).length;
/** Ann's touchdown in the match, as POST …/events answers it. */
const ROW = { id: "e1", pairingId: "g2", playerId: "p1", counter: "touchdowns", delta: 1, injury: null, settledAt: null };

/** Ann's row open on a phone, in the match the games say is on; nothing the page sent before is counted. */
async function inTheMatch() {
  coach({ open: "p1#0" });
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  api.calls.length = 0;
}

test("a match that ends between the team's read and the games' is read again before it is taken", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    await inTheMatch();
    // A tap whose answer is lost: the records are read again (match-taps.mjs), the games still saying the match is on.
    api.fail(TAP);
    const team = api.hold(TEAM);
    const records = api.hold(RECORDS);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(team.count, 1);
    // The read catches the team before the finish; the finish lands, and the games read after the team say so.
    serverHas(1, 5);
    gamesAre([OVER]);
    team.release({ status: 200, body: { team: annWith(0, 4) } });
    records.release({ status: 200, body: { events: [], revision: 4 } });
    await settle();
    assert.equal(teamReads(), 2, "read again: the first may be from before the finish");
    const keys = callKeys().filter((key) => key === TEAM || key === GAMES);
    assert.deepEqual(keys, [TEAM, GAMES, TEAM, GAMES], "the games after the team, each time");
    assert.equal(countOf("touchdowns"), "1", "the roster the finish wrote, not the one before it");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false, "open once it is taken");
    api.assertAnswered();
  }));
});

test("a phase that keeps moving is read at most three times in a row", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    await inTheMatch();
    api.fail(TAP);
    // Each read of the games says the other thing: over, on again, over again.
    serverHas(1, 5);
    let games = api.hold(GAMES);
    fireEvent(plus("touchdowns"), "click");
    for (const [round, said] of [[1, OVER], [2, LIVE_GAME], [3, OVER]]) {
      await settle();
      assert.deepEqual([teamReads(), games.count], [round, 1], `read ${round}: the team, then the games`);
      games.release({ status: 200, body: { games: [said], currentGames: [] } });
      if (round === 3) break;
      serverHas(round + 1, round + 5);
      games = api.hold(GAMES);
    }
    await settle();
    assert.equal(teamReads(), 3, "no fourth read: the third is taken");
    assert.equal(countOf("touchdowns"), "3", "the last read's roster");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false);
    api.assertAnswered();
  }));
});

test("a tap answered after the coach left: the next visit reads the records afresh", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    await inTheMatch();
    const tap = api.hold(TAP);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    assert.equal(tap.count, 1);
    releaseCurrentScreen();
    // Written: the row is the server's, and the visit the tap was sent from is gone.
    api.reply(RECORDS, 200, { events: [ROW], revision: 4 });
    tap.release({ status: 201, body: { event: ROW } });
    await settle();
    assert.deepEqual(callKeys().filter((key) => key !== TAP), [], "a visit that has left reads nothing");
    await renderTeamRoster("t1");
    await settle();
    assert.ok(callKeys().includes(RECORDS), "the next visit reads the records");
    assert.equal(deltaOf("touchdowns"), "+1", "with the row the tap wrote: the match's touchdown");
    api.assertAnswered();
  }));
});

// The other order (07a T11, the Task 10 review): the coach is back — his player's page, the way back — while the tap is
// still in the air. A read of the records made then does not hold its row, and the visit that sent it has gone; were
// it taken, the screen would show no «+1» and a second tap would write the touchdown twice.
test("a tap still in the air when the coach comes back: the new visit takes its row before a counter opens", async () => {
  await withWindow({ phone: true }, () => withoutTimers(async () => {
    await inTheMatch();
    const tap = api.hold(TAP);
    fireEvent(plus("touchdowns"), "click");
    await settle();
    releaseCurrentScreen();
    const entered = renderTeamRoster("t1");
    await settle();
    assert.ok(!openRow() || plus("touchdowns").hasAttribute("aria-disabled"), "no counter takes a step while that tap is in the air");
    // Written now: the records hold the row from here on.
    api.reply(RECORDS, 200, { events: [ROW], revision: 4 });
    tap.release({ status: 201, body: { event: ROW } });
    await entered;
    await settle();
    assert.equal(deltaOf("touchdowns"), "+1", "the row the tap wrote, once");
    assert.equal(plus("touchdowns").hasAttribute("aria-disabled"), false, "open once the records are read after it");
    assert.equal(callKeys().filter((key) => key === TAP).length, 1, "the tap was sent once");
    api.assertAnswered();
  }));
});
