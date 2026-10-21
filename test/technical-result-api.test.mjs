import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { matchPoints } from "../src/domain/league-rules.mjs";
import { callApi, seedCoach, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { G, SIDES, coaches, id, startedFriendly, teams } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const L = id(44), BYE = id(45), SEASON = id(61), ROUND = id(62), ENTRIES = { home: id(63), away: id(64) };

/**
 * The two coaches of match-db in a season's started round: L their league match, on, both match rosters saved
 * (the friendly is not on), and BYE the home team's bye. Answers an admin's session.
 */
async function season(client) {
  await startedFriendly(client);
  await client.query("UPDATE season_pairings SET preparation_status = 'not_started' WHERE id = $1", [G]);
  await client.query("INSERT INTO seasons (id, name, current_round, status) VALUES ($1, 'Season 1', 1, 'active')", [SEASON]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [ROUND, SEASON]);
  for (const name of SIDES) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [ENTRIES[name], SEASON, coaches[name].id, teams[name]]);
  }
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, preparation_status)
    VALUES ($1, $2, 1, $3, $4, 'in_progress')`, [L, ROUND, ENTRIES.home, ENTRIES.away]);
  await client.query(`INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot)
    SELECT $2, side, saved_team_id, snapshot FROM match_roster_snapshots WHERE pairing_id = $1`, [G, L]);
  await client.query("INSERT INTO season_pairings (id, round_id, table_number, home_entry_id) VALUES ($1, $2, 2, $3)", [BYE, ROUND, ENTRIES.home]);
  return (await seedCoach(client, "boss", { admin: true })).token;
}

const pairing = async (client, pairingId) => (await client.query("SELECT * FROM season_pairings WHERE id = $1", [pairingId])).rows[0];
const pairings = async (client) => (await client.query("SELECT * FROM season_pairings ORDER BY id")).rows;
const postRow = async (client, pairingId) => (await client.query("SELECT * FROM match_post_games WHERE pairing_id = $1", [pairingId])).rows[0];
const RESULT = ["home_touchdowns", "away_touchdowns", "home_casualties", "away_casualties", "home_points", "away_points", "result_type", "technical_reason", "result_status"];
const resultOf = (row) => Object.fromEntries(RESULT.map((column) => [column, row[column]]));
/** A row without what a change of reason may change. */
const rest = ({ technical_reason, home_points, away_points, updated_at, ...others }) => others;
const technical = (winner, technicalReason) => ({ mode: "technical", winner, technicalReason });
const reasonOf = (token, pairingId, body) => callApi("PATCH", `/api/season/admin/pairings/${pairingId}/technical-reason`, { token, body });
const listed = (season, pairingId) => season.rounds.flatMap((round) => round.pairings).find((one) => one.id === pairingId);

/** One coach's step of L's post-match, through the server function the route calls. */
const step = async (name, state, action, finish = false) =>
  (await accessPostMatch(L, coaches[name], { revision: state.revision, ...(finish ? {} : { action }) }, finish)).postMatch;

/** An agreed technical result's every later step, up to ready: nothing tapped, the winner's two MVPs, no deposit. */
async function technicalToReady(state, winner) {
  for (const name of SIDES) state = await step(name, state, { type: "fans", roll: 3, technicalRoll: name === winner ? 2 : "" });
  for (const name of SIDES) state = await step(name, state, { type: "statistics", statistics: state[name].statistics, mvps: name === winner ? [`${name}-5`, `${name}-6`] : [] });
  for (const type of ["lock-players", "lock-roster"]) for (const name of SIDES) state = await step(name, state, { type });
  for (const name of SIDES) state = await step(name, state, { type: "finance", deposit: 0, mistake: { roll: 6 } });
  for (const name of SIDES) state = await step(name, state, { type: "next", captain: `${name}-0` });
  for (const name of SIDES) state = await step(name, state, { type: "confirm" });
  assert.equal(state.status, "ready");
  return state;
}

test("the admin's technical result: 2–0, CAS 0–0, 4 or 2 to the winner, 0 to the loser, the reason stored", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  const game = await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("away", "no_team") });
  assert.equal(game.status, 200);
  assert.deepEqual(resultOf(await pairing(client, L)), { home_touchdowns: 0, away_touchdowns: 2, home_casualties: 0, away_casualties: 0,
    home_points: 0, away_points: 4, result_type: "technical", technical_reason: "no_team", result_status: "confirmed" });
  assert.ok((await pairing(client, L)).confirmed_at);
  const answered = game.body.game;
  assert.deepEqual([answered.resultType, answered.technicalReason, answered.homePoints, answered.awayPoints, answered.resultStatus],
    ["technical", "no_team", 0, 4, "confirmed"]);

  const bundle = await callApi("PATCH", `/api/season/admin/pairings/${L}`, { token: admin, body: technical("home", "other") });
  assert.equal(bundle.status, 200);
  assert.deepEqual(resultOf(await pairing(client, L)), { home_touchdowns: 2, away_touchdowns: 0, home_casualties: 0, away_casualties: 0,
    home_points: 2, away_points: 0, result_type: "technical", technical_reason: "other", result_status: "confirmed" });
  const shown = listed(bundle.body, L);
  assert.deepEqual([shown.resultType, shown.technicalReason, shown.homePoints, shown.awayPoints], ["technical", "other", 2, 0]);
  const points = Object.fromEntries(bundle.body.standings.map((standing) => [standing.entryId, standing.points]));
  assert.deepEqual([points[ENTRIES.home], points[ENTRIES.away]], [2, 0], "the table adds the server's points");

  const friendly = await callApi("PATCH", `/api/games/${G}`, { token: admin, body: technical("home", "no_team") });
  assert.equal(friendly.status, 200);
  assert.deepEqual(resultOf(await pairing(client, G)), { home_touchdowns: 2, away_touchdowns: 0, home_casualties: 0, away_casualties: 0,
    home_points: 0, away_points: 0, result_type: "technical", technical_reason: "no_team", result_status: "confirmed" }, "a friendly gives no points");
}));

test("a played result carries no reason, and takes one away", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("away", "no_team") });
  const played = await callApi("PATCH", `/api/games/${L}`, { token: admin,
    body: { mode: "played", winner: "away", technicalReason: "no_team", homeTouchdowns: 1, awayTouchdowns: 1, homeCasualties: 3, awayCasualties: 0 } });
  assert.equal(played.status, 200);
  assert.deepEqual(resultOf(await pairing(client, L)), { home_touchdowns: 1, away_touchdowns: 1, home_casualties: 3, away_casualties: 0,
    home_points: matchPoints({ touchdownsFor: 1, touchdownsAgainst: 1, casualtiesFor: 3 }), away_points: matchPoints({ touchdownsFor: 1, touchdownsAgainst: 1 }),
    result_type: "played", technical_reason: null, result_status: "confirmed" }, "the reason sent with a played result is dropped");
  assert.deepEqual([played.body.game.resultType, played.body.game.technicalReason], ["played", null]);

  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("home", "other") });
  const noMode = await callApi("PATCH", `/api/season/admin/pairings/${L}`, { token: admin, body: { homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 } });
  assert.equal(noMode.status, 200);
  assert.deepEqual(resultOf(await pairing(client, L)), { home_touchdowns: 3, away_touchdowns: 0, home_casualties: 0, away_casualties: 0,
    home_points: matchPoints({ touchdownsFor: 3, touchdownsAgainst: 0 }), away_points: 0, result_type: "played", technical_reason: null,
    result_status: "confirmed" }, "a body without a mode is a played result, as 2.x sends it");
}));

test("a technical result needs both sides, a winner and a reason", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: { homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 } });
  const before = await pairings(client);
  const cases = [
    [`/api/games/${BYE}`, technical("home", "other"), "mode"],
    [`/api/season/admin/pairings/${BYE}`, technical("home", "no_team"), "mode"],
    [`/api/games/${L}`, { mode: "forfeit", winner: "home", technicalReason: "other" }, "mode"],
    [`/api/games/${L}`, { mode: "", homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 }, "mode"],
    [`/api/games/${L}`, technical("x", "other"), "winner"],
    [`/api/season/admin/pairings/${L}`, { mode: "technical", technicalReason: "other" }, "winner"],
    [`/api/games/${L}`, technical("home", "late"), "technicalReason"],
    [`/api/games/${L}`, { mode: "technical", winner: "away" }, "technicalReason"],
    [`/api/season/admin/pairings/${L}`, technical("away", null), "technicalReason"],
  ];
  for (const [path, body, field] of cases) {
    const refused = await callApi("PATCH", path, { token: admin, body });
    assert.deepEqual([refused.status, refused.body.error?.code, refused.body.error?.params], [400, "FIELD_INVALID", { field }], `${path} ${JSON.stringify(body)}`);
  }
  assert.deepEqual(await pairings(client), before, "nothing written");
}));

test("a reason changed afterwards recounts the points and nothing else, a post-match's result too", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("away", "other") });
  const state = { status: "completed", result: { mode: "technical", winner: "away", reason: "other" }, home: {}, away: {} };
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [L, JSON.stringify(state)]);
  const [before, post] = [await pairing(client, L), await postRow(client, L)];

  const changed = await reasonOf(admin, L, { technicalReason: "no_team" });
  assert.equal(changed.status, 200);
  const after = await pairing(client, L);
  assert.deepEqual([after.technical_reason, after.home_points, after.away_points], ["no_team", 0, 4]);
  assert.deepEqual(rest(after), rest(before), "the score, the status, the confirmation as they were");
  assert.deepEqual(await postRow(client, L), post, "the post-match is sealed: its record untouched");
  const shown = listed(changed.body, L);
  assert.deepEqual([shown.technicalReason, shown.awayPoints, shown.homeTouchdowns, shown.awayTouchdowns], ["no_team", 4, 0, 2], "the season comes back");
  assert.equal(changed.body.standings.find((standing) => standing.entryId === ENTRIES.away).points, 4);
  await reasonOf(admin, L, { technicalReason: "other" });
  assert.deepEqual([(await pairing(client, L)).technical_reason, (await pairing(client, L)).away_points], ["other", 2], "and back");

  const coach = await sessionFor(client, coaches.home.id);
  const unsettled = await reasonOf(admin, BYE, { technicalReason: "no_team" });
  assert.deepEqual([unsettled.status, unsettled.body.error?.code], [409, "RESULT_NOT_TECHNICAL"], "no result yet");
  await callApi("PATCH", `/api/games/${BYE}`, { token: admin, body: { homeTouchdowns: 0, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0 } });
  assert.equal((await pairing(client, BYE)).result_status, "confirmed");
  const settled = await pairings(client);
  const refusals = [
    ["a coach", await reasonOf(coach, L, { technicalReason: "no_team" }), 403, "ADMIN_REQUIRED"],
    ["a guest", await reasonOf(undefined, L, { technicalReason: "no_team" }), 401, "NOT_AUTHORIZED"],
    ["a played result", await reasonOf(admin, BYE, { technicalReason: "no_team" }), 409, "RESULT_NOT_TECHNICAL"],
    ["a reason outside the two", await reasonOf(admin, L, { technicalReason: "late" }), 400, "FIELD_INVALID"],
    ["no reason", await reasonOf(admin, L, {}), 400, "FIELD_INVALID"],
    ["a friendly", await reasonOf(admin, G, { technicalReason: "no_team" }), 404, "PAIRING_NOT_FOUND"],
    ["no such pairing", await reasonOf(admin, id(99), { technicalReason: "no_team" }), 404, "PAIRING_NOT_FOUND"],
  ];
  for (const [label, answer, status, code] of refusals) assert.deepEqual([answer.status, answer.body.error?.code], [status, code], label);
  assert.deepEqual(refusals[3][1].body.error.params, { field: "technicalReason" });
  assert.deepEqual(await pairings(client), settled, "a refusal writes nothing");
}));

test("the post-match's finish writes the reason it holds, and its points; a reason changed later is the table's alone", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  let state = (await accessPostMatch(L, coaches.home)).postMatch;
  state = await step("home", state, { type: "result", mode: "technical", winner: "away", reason: "no_team" });
  state = await step("away", state, { type: "agree-result" });
  assert.equal(state.result.reason, "no_team");
  state = await step("home", await technicalToReady(state, "away"), null, true);
  assert.equal(state.status, "completed");
  assert.deepEqual(resultOf(await pairing(client, L)), { home_touchdowns: 0, away_touchdowns: 2, home_casualties: 0, away_casualties: 0,
    home_points: 0, away_points: 4, result_type: "technical", technical_reason: "no_team", result_status: "confirmed" });
  const game = await callApi("GET", `/api/games/${L}`, { token: await sessionFor(client, coaches.away.id) });
  assert.deepEqual([game.body.game.resultType, game.body.game.technicalReason, game.body.game.awayPoints], ["technical", "no_team", 4]);

  const post = await postRow(client, L);
  assert.equal((await reasonOf(admin, L, { technicalReason: "other" })).status, 200);
  assert.deepEqual([(await pairing(client, L)).technical_reason, (await pairing(client, L)).away_points], ["other", 2]);
  assert.deepEqual(await postRow(client, L), post, "the finished post-match is as it was");
}));

test("a post-match opened on the admin's technical result takes its reason, and the reason is not changed while it is open", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("away", "no_team") });
  let state = (await accessPostMatch(L, coaches.home)).postMatch;
  assert.deepEqual([state.result.official, state.result.mode, state.result.winner, state.result.reason], [true, "technical", "away", "no_team"]);
  const before = await pairing(client, L);
  const open = await reasonOf(admin, L, { technicalReason: "other" });
  assert.deepEqual([open.status, open.body.error?.code], [409, "POST_RESULT_LOCKED"], "the finish would write the reason the post-match holds over it");
  assert.deepEqual(await pairing(client, L), before);
  state = await step("home", await technicalToReady(state, "away"), null, true);
  assert.deepEqual([(await pairing(client, L)).technical_reason, (await pairing(client, L)).away_points], ["no_team", 4]);
}));

test("a technical result confirmed before stage 12 has no reason: the post-match reads it as the other kind", db, () => withApiDatabase(async ({ client }) => {
  await season(client);
  await client.query(`UPDATE season_pairings SET result_status = 'confirmed', result_type = 'technical', home_touchdowns = 2, away_touchdowns = 0,
    home_casualties = 0, away_casualties = 0, home_points = 2, away_points = 0, confirmed_at = now() WHERE id = $1`, [L]);
  const state = (await accessPostMatch(L, coaches.away)).postMatch;
  assert.deepEqual([state.result.official, state.result.winner, state.result.reason], [true, "home", "other"]);
  const season12 = await callApi("GET", "/api/season");
  const shown = listed(season12.body, L);
  assert.deepEqual([shown.resultType, shown.technicalReason, shown.homePoints], ["technical", null, 2]);
}));

test("the season's pairing says the result's type and reason", db, () => withApiDatabase(async ({ client }) => {
  const admin = await season(client);
  await callApi("PATCH", `/api/games/${L}`, { token: admin, body: technical("home", "no_team") });
  const guest = await callApi("GET", "/api/season");
  assert.equal(guest.status, 200);
  assert.deepEqual([listed(guest.body, L).resultType, listed(guest.body, L).technicalReason], ["technical", "no_team"]);
  assert.deepEqual([listed(guest.body, BYE).resultType, listed(guest.body, BYE).technicalReason], ["played", null], "no result yet: played, no reason");
  const games = await callApi("GET", "/api/games", { token: await sessionFor(client, coaches.home.id) });
  const mine = games.body.games.find((one) => one.id === L);
  assert.deepEqual([mine.resultType, mine.technicalReason, mine.homePoints], ["technical", "no_team", 4]);
}));
