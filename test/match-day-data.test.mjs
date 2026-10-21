import assert from "node:assert/strict";
import test from "node:test";

import "./helpers/ui.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { t } from "../src/core/i18n.mjs";

const api = installFakeApi();
const { readOpponentTeam, readTeamRecords, forgetOpponents } = await import("../src/data/match-day.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { state } = await import("../src/core/state.mjs");

const side = (id, name) => ({ user: { id: `u-${id}`, login: id }, team: { id, name, baseTeamSlug: "teams/human" } });
/** A league match of round 3; t1 at home against the rival. */
const game = (over = {}) => ({ id: "g1", kind: "league", roundNumber: 3, updatedAt: "2026-10-06T10:00:00Z",
  home: side("t1", "Ashgrove Wardens"), away: side("r1", "Rival Team"), ...over });
const RIVAL_TEAM = { id: "r1", name: "Rival Team", baseTeamSlug: "teams/dwarf", roster: { treasury: 60, players: [] } };
const RIVAL_PAGE = "GET /api/players/u-r1/teams/r1";

/** A coach signed in on a fresh visit: nothing remembered of an earlier one. */
function coach(id = "u1") {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id, login: "coach" };
  forgetOpponents();
}
const reads = (key) => api.calls.filter((call) => call.key === key).length;

test("the opponent's team is read from his public page, once for the same game as it stands", async () => {
  coach();
  api.reply(RIVAL_PAGE, 200, { user: { id: "u-r1", login: "r1" }, team: RIVAL_TEAM });
  assert.deepEqual(await readOpponentTeam(game(), "t1"), { team: RIVAL_TEAM });
  assert.deepEqual(await readOpponentTeam(game(), "t1"), { team: RIVAL_TEAM });
  assert.equal(reads(RIVAL_PAGE), 1);
  // The same game seen from the other side reads the home team's page.
  api.reply("GET /api/players/u-t1/teams/t1", 200, { team: { id: "t1" } });
  assert.deepEqual(await readOpponentTeam(game(), "r1"), { team: { id: "t1" } });
  // The game changed (a start, a score): read again.
  await readOpponentTeam(game({ updatedAt: "2026-10-06T11:00:00Z" }), "t1");
  assert.equal(reads(RIVAL_PAGE), 2);
  // Two asks at once for the same game send one request.
  await Promise.all([readOpponentTeam(game({ updatedAt: "x" }), "t1"), readOpponentTeam(game({ updatedAt: "x" }), "t1")]);
  assert.equal(reads(RIVAL_PAGE), 3);
  api.assertAnswered();
});

test("a new visit reads afresh", async () => {
  coach();
  api.reply(RIVAL_PAGE, 200, { team: RIVAL_TEAM });
  await readOpponentTeam(game(), "t1");
  forgetOpponents();
  await readOpponentTeam(game(), "t1");
  assert.equal(reads(RIVAL_PAGE), 2);
});

test("a bye, or a game that is not the team's, is read as nothing; a failed read is said and not kept", async () => {
  coach();
  assert.equal(await readOpponentTeam(game({ away: null }), "t1"), null);
  assert.equal(await readOpponentTeam(game(), "t9"), null);
  assert.equal(await readOpponentTeam(null, "t1"), null);
  assert.equal(api.calls.length, 0);
  api.reply(RIVAL_PAGE, 404, { error: { code: "TEAM_NOT_FOUND" } });
  assert.deepEqual(await readOpponentTeam(game(), "t1"), { error: t("error.TEAM_NOT_FOUND") });
  api.reply(RIVAL_PAGE, 200, {});
  assert.deepEqual(await readOpponentTeam(game(), "t1"), { error: t("request.noAnswer") });
  api.fail(RIVAL_PAGE);
  const offline = await readOpponentTeam(game(), "t1");
  assert.equal(typeof offline.error, "string");
  assert.ok(offline.error);
  api.reply(RIVAL_PAGE, 200, { team: RIVAL_TEAM });
  assert.deepEqual(await readOpponentTeam(game(), "t1"), { team: RIVAL_TEAM });
  assert.equal(reads(RIVAL_PAGE), 4, "every failure was read again");
});

test("another coach signed in reads afresh", async () => {
  coach("u1");
  api.reply(RIVAL_PAGE, 200, { team: RIVAL_TEAM });
  await readOpponentTeam(game(), "t1");
  state.auth.currentUser = { id: "u2", login: "other" };
  await readOpponentTeam(game(), "t1");
  assert.equal(reads(RIVAL_PAGE), 2);
});

test("the team's records are its events as the server sends them", async () => {
  coach();
  const events = [{ pairingId: "g1", playerId: "p1", counter: "touchdowns", delta: 1, settledAt: null }];
  api.reply("GET /api/teams/t1/events", 200, { events, revision: 4 });
  assert.deepEqual(await readTeamRecords("t1"), { events, revision: 4 });
  api.reply("GET /api/teams/t1/events", 200, { events: "x", revision: 4 });
  assert.deepEqual(await readTeamRecords("t1"), { error: t("request.noAnswer") });
  api.reply("GET /api/teams/t1/events", 403, { error: { code: "FORBIDDEN" } });
  const refused = await readTeamRecords("t1");
  assert.equal(typeof refused.error, "string");
  assert.ok(refused.error);
  api.reply("GET /api/teams/a%2Fb/events", 200, { events: [], revision: 1 });
  assert.deepEqual(await readTeamRecords("a/b"), { events: [], revision: 1 });
  api.assertAnswered();
});
