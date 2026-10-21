import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { withWindow } from "./helpers/ref-screen.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { LIVE_GAME, api, callKeys, coach, openRow, renderTeamRoster, save, settle, text } from "./helpers/roster-page.mjs";

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
