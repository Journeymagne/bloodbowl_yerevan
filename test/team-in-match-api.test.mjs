import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { callApi, seedCoach, seedTeam, sessionFor, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { G, act, coaches, homeScores, id, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { lockRow, scratchSkip } from "./helpers/scratch-db.mjs";

// Stage 09a, Task 1: while a team plays a match (`LIVE_MATCH`: started, its post-match not completed), a coach's write of
// that team is refused with TEAM_IN_MATCH — the roster save, a death, its undo, a treasury entry and a site roll — under
// the team's lock and after the revision, for that team alone (and its opponent's, in the same match). The admin's save
// (/api/admin, the repair path), a tap and an edit outside the match are not; the undo on the coach's route is refused to
// an admin too (the Task 1 review, M-2).

const db = { skip: scratchSkip };
const sleep = (ms) => new Promise((resolve) => { setTimeout(resolve, ms); });
/** The roster save a coach's page sends: the team as it is, on the revision given. */
const saveBody = (row, revision = row.revision) => ({ name: row.name, baseTeamSlug: "teams/human", revision, roster: row.roster });
const refusedInMatch = (answer, label) => assert.deepEqual([answer.status, answer.body?.error?.code], [422, "TEAM_IN_MATCH"], label);
const WAITING_ON_A_LOCK = `SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;

test("while its match is on, a coach's save, a death, an undo, a treasury entry and a site roll are refused with TEAM_IN_MATCH, and nothing is written", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const before = await teamRow(client, teams.home);
  const body = { name: "home", baseTeamSlug: "teams/human", revision: before.revision, roster: before.roster };
  for (const [method, path, payload] of [
    ["PATCH", `/api/teams/${teams.home}`, body],
    ["POST", `/api/teams/${teams.home}/players/home-1/death`, { cause: "smoke", revision: before.revision }],
    ["POST", `/api/teams/${teams.home}/treasury`, { delta: 5, reason: "sponsor", revision: before.revision }],
    ["POST", `/api/teams/${teams.home}/players/home-1/rolls`, { purpose: "stat" }],
  ]) {
    const answer = await callApi(method, path, { token, body: payload });
    assert.deepEqual([answer.status, answer.body.error.code], [422, "TEAM_IN_MATCH"], `${method} ${path}`);
  }
  const after = await teamRow(client, teams.home);
  assert.deepEqual([after.revision, after.roster], [before.revision, before.roster]);
  for (const table of ["team_ledger", "team_fallen_players", "dice_rolls"]) {
    assert.equal((await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE saved_team_id = $1`, [teams.home])).rows[0].n, 0, table);
  }
}));

test("an undo of a hand-marked death is refused while the match is on, to the coach and to an admin alike: the repair path is /api/admin", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id), boss = await seedCoach(client, "boss", { admin: true });
  // Player 7 died outside the match before it began, marked by hand: kept as he was, gone from the blob.
  const kept = (await teamRow(client, teams.home)).roster.players[6];
  assert.deepEqual([kept.id, kept.rowIndex], ["home-6", 0]);
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players}', (roster->'players') - 6) WHERE id = $1", [teams.home]);
  const { rows: [dead] } = await client.query(`INSERT INTO team_fallen_players (saved_team_id, player, cause, recorded_by, from_match)
    VALUES ($1, $2, 'smoke', $3, false) RETURNING id`, [teams.home, JSON.stringify(kept), coaches.home.id]);
  const before = await teamRow(client, teams.home);
  const undo = (as) => callApi("DELETE", `/api/teams/${teams.home}/fallen/${dead.id}`, { token: as });
  refusedInMatch(await undo(token), "the coach's undo");
  const fallen = async () => (await client.query("SELECT id FROM team_fallen_players WHERE saved_team_id = $1", [teams.home])).rows.map((row) => row.id);
  assert.deepEqual(await fallen(), [dead.id], "the death is kept");
  assert.deepEqual((await teamRow(client, teams.home)).revision, before.revision);
  // The coach's route is no repair path, for an admin either (the Task 1 review, M-2): only /api/admin/* is.
  refusedInMatch(await undo(boss.token), "an admin's undo on the coach's route");
  assert.deepEqual(await fallen(), [dead.id]);
  // Once the match is over the same undo lands.
  await client.query("UPDATE season_pairings SET result_status = 'confirmed' WHERE id = $1", [G]);
  const admin = await undo(boss.token);
  assert.equal(admin.status, 200, "after the match");
  assert.ok(admin.body.team.roster.players.some((player) => player.id === "home-6"));
  assert.deepEqual(await fallen(), []);
}));

test("the refusal is the team's: the coach's other team and another coach's team still save, the opponent's team is refused too", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id), awayToken = await sessionFor(client, coaches.away.id);
  // Seeded after the start, while the home team's match is on.
  const second = await seedTeam(client, coaches.home.id, { name: "Second" });
  const lion = await seedCoach(client, "lion"), stranger = await seedTeam(client, lion.id);
  for (const [team, as, label] of [[second, token, "the coach's other team"], [stranger, lion.token, "another coach's team"]]) {
    const row = await teamRow(client, team);
    const answer = await callApi("PATCH", `/api/teams/${team}`, { token: as, body: saveBody(row) });
    assert.equal(answer.status, 200, label);
    assert.equal((await callApi("POST", `/api/teams/${team}/treasury`, { token: as, body: { delta: 5, reason: "sponsor", revision: row.revision + 1 } })).status, 201, `${label}: an entry`);
  }
  const away = await teamRow(client, teams.away);
  refusedInMatch(await callApi("PATCH", `/api/teams/${teams.away}`, { token: awayToken, body: saveBody(away) }), "the opponent's team, in the same match");
  refusedInMatch(await callApi("POST", `/api/teams/${teams.away}/treasury`, { token: awayToken, body: { delta: 5, reason: "sponsor", revision: away.revision } }), "the opponent's entry");
}));

test("a league match on refuses as a friendly does: the predicate holds the season's pairings too", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const L = id(44), token = await sessionFor(client, coaches.home.id);
  // Only the league match is on: the friendly is set back.
  await client.query("UPDATE season_pairings SET preparation_status = 'not_started' WHERE id = $1", [G]);
  await client.query("INSERT INTO seasons (id, current_round, status) VALUES ($1, 1, 'active')", [id(61)]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [id(62), id(61)]);
  for (const [entry, name] of [[id(63), "home"], [id(64), "away"]]) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [entry, id(61), coaches[name].id, teams[name]]);
  }
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, preparation_status)
    VALUES ($1, $2, 1, $3, $4, 'in_progress')`, [L, id(62), id(63), id(64)]);
  const save = async () => callApi("PATCH", `/api/teams/${teams.home}`, { token, body: saveBody(await teamRow(client, teams.home)) });
  assert.equal((await save()).status, 200, "started, but with no match roster of the team: not its match");
  await client.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) SELECT $2, side, saved_team_id, snapshot FROM match_roster_snapshots WHERE pairing_id = $1", [G, L]);
  refusedInMatch(await save(), "the league match on");
  await client.query("UPDATE season_pairings SET result_status = 'confirmed' WHERE id = $1", [L]);
  assert.equal((await save()).status, 200, "its score confirmed, no post-match: over");
}));

test("the revision is asked first: a stale save still hears TEAM_SAVED_ELSEWHERE with the team", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const row = await teamRow(client, teams.home), stale = row.revision - 1;
  for (const [method, path, payload] of [
    ["PATCH", `/api/teams/${teams.home}`, saveBody(row, stale)],
    ["POST", `/api/teams/${teams.home}/players/home-1/death`, { cause: "smoke", revision: stale }],
    ["POST", `/api/teams/${teams.home}/treasury`, { delta: 5, reason: "sponsor", revision: stale }],
  ]) {
    const answer = await callApi(method, path, { token, body: payload });
    // The team rides with the 409 so that a save whose answer was lost is known as that very save.
    assert.deepEqual([answer.status, answer.body.error.code, answer.body.team?.id], [409, "TEAM_SAVED_ELSEWHERE", teams.home], `${method} ${path}`);
  }
}));

test("a tap and an edit outside the match are taken as before", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const tap = await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { pairingId: G, playerId: "home-1", counter: "touchdowns", delta: 1 } });
  assert.equal(tap.status, 201, "a tap of the match");
  const edit = await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { playerId: "home-2", counter: "completions", delta: 1 } });
  assert.equal(edit.status, 201, "an edit outside the match");
}));

test("the admin's save of a team in a match lands", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const boss = await seedCoach(client, "boss", { admin: true });
  const row = await teamRow(client, teams.home);
  const answer = await callApi("PATCH", `/api/admin/teams/${teams.home}`, { token: boss.token, body: { ...saveBody(row), name: "home repaired" } });
  assert.equal(answer.status, 200, "the repair path (owner, M2 question 2)");
  const after = await teamRow(client, teams.home);
  assert.deepEqual([after.name, after.revision], ["home repaired", row.revision + 1]);
}));

test("outside a live match the same writes land: no match, a finished one, a score confirmed without a post-match", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion"), free = await seedTeam(client, lion.id);
  const freeRow = await teamRow(client, free);
  assert.equal((await callApi("PATCH", `/api/teams/${free}`, { token: lion.token, body: saveBody(freeRow) })).status, 200, "no match");
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const save = async () => callApi("PATCH", `/api/teams/${teams.home}`, { token, body: saveBody(await teamRow(client, teams.home)) });
  await client.query("UPDATE season_pairings SET result_status = 'confirmed' WHERE id = $1", [G]);
  assert.equal((await save()).status, 200, "a score confirmed around a post-match never opened: not live");
  await client.query("UPDATE season_pairings SET result_status = 'pending' WHERE id = $1", [G]);
  refusedInMatch(await save(), "started again, no post-match: live");
  const ready = await toReady(await toPlayersStep(), homeScores);
  refusedInMatch(await save(), "a post-match that is not completed: live");
  assert.equal((await act("home", ready, null, true)).status, "completed");
  assert.equal((await save()).status, 200, "a finished match");
  const roll = await callApi("POST", `/api/teams/${teams.home}/players/home-1/rolls`, { token, body: { purpose: "stat" } });
  assert.equal(roll.status, 200, "a site roll after the post-match");
}));

test("the check is made under the team's lock: a save that waited for the start is refused", db, () => withApiDatabase(async ({ client, url }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  // Ready, not started yet: no match rosters.
  const { rows: snapshots } = await client.query("SELECT side, saved_team_id, snapshot FROM match_roster_snapshots WHERE pairing_id = $1 ORDER BY side", [G]);
  await client.query("DELETE FROM match_roster_snapshots WHERE pairing_id = $1", [G]);
  await client.query("UPDATE season_pairings SET preparation_status = 'ready' WHERE id = $1", [G]);
  const before = await teamRow(client, teams.home);
  const holder = new pg.Client({ connectionString: url });
  await holder.connect();
  try {
    await holder.query("BEGIN");
    assert.equal((await holder.query(...lockRow("saved_teams", teams.home))).rowCount, 1);
    const saving = callApi("PATCH", `/api/teams/${teams.home}`, { token, body: saveBody(before) });
    for (const deadline = Date.now() + 15000; (await client.query(WAITING_ON_A_LOCK)).rows[0].n < 1;) {
      if (Date.now() > deadline) throw new Error("the save never waited on the team's lock");
      await sleep(10);
    }
    // The start, as `startPreparedMatch` leaves it, while the save waits on the team: it commits first.
    await holder.query("UPDATE season_pairings SET preparation_status = 'in_progress' WHERE id = $1", [G]);
    for (const { side, saved_team_id: teamId, snapshot } of snapshots) {
      await holder.query("INSERT INTO match_roster_snapshots (pairing_id, side, saved_team_id, snapshot) VALUES ($1, $2, $3, $4)", [G, side, teamId, snapshot]);
    }
    await holder.query("COMMIT");
    refusedInMatch(await saving, "the save that waited");
  } finally {
    await holder.query("ROLLBACK").catch(() => {});
    await holder.end().catch(() => {});
  }
  const after = await teamRow(client, teams.home);
  assert.deepEqual([after.revision, after.roster], [before.revision, before.roster]);
}));
