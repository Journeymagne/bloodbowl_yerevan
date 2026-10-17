import test from "node:test";
import assert from "node:assert/strict";

import { accessPostMatch } from "../server/season/post-match.mjs";
import { loadWaitingOutsideEdits, settleOutsideEdits } from "../server/season/match-events-store.mjs";
import { callApi, recording, seedCoach, seedTeam, sessionFor, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { G, act, coaches, homeScores, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { lockRow, raceInOrder, scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const outside = async (client, team) => (await client.query(
  "SELECT player_id, counter, delta, settled_at IS NOT NULL AS settled FROM match_events WHERE saved_team_id = $1 AND pairing_id IS NULL ORDER BY created_at, id", [team])).rows;
const edit = (token, playerId, counter = "completions", delta = 1) => callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { playerId, counter, delta } });
const keys = (team) => Object.keys(team).sort();

test("a roster save that changes SPP writes the change as settled edits outside a match; MVP, a refused save and no change write none", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 1 } }] } });
  const save = (revision, spp) => callApi("PATCH", `/api/teams/${id}`, { token: coach.token,
    body: { name: "Lions", baseTeamSlug: "teams/human", revision, roster: { teamSlug: "teams/human", treasury: 100, players: [{ id: "a", rowIndex: 0, spp }] } } });
  assert.equal((await save(1, { touchdowns: 3, casualties: 1, mvps: 1 })).status, 200);
  assert.equal((await save(1, { touchdowns: 9 })).status, 409);
  assert.equal((await save(2, { touchdowns: 3, casualties: 1, mvps: 1 })).status, 200);
  assert.deepEqual(await outside(client, id), [
    { player_id: "a", counter: "touchdowns", delta: 1, settled: true }, { player_id: "a", counter: "touchdowns", delta: 1, settled: true },
    { player_id: "a", counter: "casualties", delta: 1, settled: true }]);
  const { rows: [stamp] } = await client.query("SELECT bool_and(settled_at = created_at) AS same FROM match_events WHERE saved_team_id = $1", [id]);
  assert.equal(stamp.same, true, "a row written settled is settled the moment it is written");
}));

test("an admin's roster save writes its SPP change too, as the admin's, and a coach's as the coach's", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 2 } }] } });
  const body = (revision, spp) => ({ name: "Lions", baseTeamSlug: "teams/human", revision, roster: { teamSlug: "teams/human", treasury: 100, players: [{ id: "a", rowIndex: 0, spp }] } });
  assert.equal((await callApi("PATCH", `/api/admin/teams/${id}`, { token: boss.token, body: body(1, { touchdowns: 1, interceptions: 1 }) })).status, 200);
  assert.equal((await callApi("PATCH", `/api/teams/${id}`, { token: coach.token, body: body(2, { touchdowns: 1 }) })).status, 200);
  const { rows } = await client.query(`SELECT player_id, counter, delta, created_by, settled_at IS NOT NULL AS settled FROM match_events
    WHERE saved_team_id = $1 AND pairing_id IS NULL ORDER BY created_at, id`, [id]);
  assert.deepEqual(rows, [{ player_id: "a", counter: "touchdowns", delta: -1, created_by: boss.id, settled: true },
    { player_id: "a", counter: "interceptions", delta: 1, created_by: boss.id, settled: true },
    { player_id: "a", counter: "interceptions", delta: -1, created_by: coach.id, settled: true }]);
}));

test("a PATCH that lands answers with the team as GET reads it, inActiveSeason included, read after the write — the owner's and the admin's", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true }), id = await seedTeam(client, coach.id);
  const { body: { team: read } } = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  const body = (revision, name) => ({ name, baseTeamSlug: read.baseTeamSlug, roster: read.roster, revision });
  const owner = await callApi("PATCH", `/api/teams/${id}`, { token: coach.token, body: body(1, "Lions II") });
  assert.equal(owner.status, 200);
  assert.ok(keys(read).includes("inActiveSeason"), "the shape compared is the one that says whether the team is in a season");
  assert.deepEqual(keys(owner.body.team), keys(read));
  assert.deepEqual([owner.body.team.name, owner.body.team.revision, owner.body.team.inActiveSeason], ["Lions II", 2, false]);
  const { rows: [season] } = await client.query("INSERT INTO seasons (name, status) VALUES ('Now', 'active') RETURNING id");
  await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3)", [season.id, coach.id, id]);
  const admin = await callApi("PATCH", `/api/admin/teams/${id}`, { token: boss.token, body: body(2, "Lions III") });
  assert.equal(admin.status, 200);
  assert.deepEqual(keys(admin.body.team), keys(read));
  assert.deepEqual([admin.body.team.name, admin.body.team.revision, admin.body.team.inActiveSeason], ["Lions III", 3, true]);
  assert.deepEqual(admin.body.team, (await callApi("GET", `/api/teams/${id}`, { token: coach.token })).body.team, "what GET then says");
}));

test("during a live match an edit outside it waits unsettled; without a live match it is refused, and so is an injury or a player not on the roster", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const made = await edit(token, "home-2");
  assert.deepEqual([made.status, made.body.event.pairingId, made.body.event.settledAt], [201, null, null]);
  assert.equal((await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { playerId: "home-2", counter: "injury", delta: 1, injury: { code: "miss" } } })).body.error.params.field, "counter");
  assert.equal((await edit(token, "journeyman-9")).body.error.code, "POST_PLAYER");
  await client.query("UPDATE season_pairings SET preparation_status = 'not_started' WHERE id = $1", [G]);
  assert.equal((await edit(token, "home-2")).body.error.code, "MATCH_NOT_LIVE");
  assert.equal((await outside(client, teams.home)).length, 1);
}));

test("an edit outside a match is waited on only while a match of the team's own is live: not once it is finished, nor for a match the team does not play", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [G, { status: "ready", home: {}, away: {} }]);
  assert.equal((await edit(home, "home-2")).status, 201, "a post-match that is not completed is a match still on");
  await client.query("DELETE FROM match_roster_snapshots WHERE pairing_id = $1 AND side = 'home'", [G]);
  assert.equal((await edit(home, "home-2")).body.error.code, "MATCH_NOT_LIVE", "a match the team has no roster in is not its match");
  const awayEdit = () => callApi("POST", `/api/teams/${teams.away}/events`, { token: away, body: { playerId: "away-2", counter: "completions", delta: 1 } });
  assert.equal((await awayEdit()).status, 201, "the other side's team still plays it");
  await client.query("UPDATE match_post_games SET state = $2 WHERE pairing_id = $1", [G, { status: "completed", home: {}, away: {} }]);
  const late = await awayEdit();
  assert.deepEqual([late.status, late.body.error.code], [409, "MATCH_NOT_LIVE"], "a completed post-match is a match over");
}));

test("an edit outside a match takes only its own team's row, waits on nothing after it, and writes its one row under it; a body it cannot take, or a team not his, opens no transaction", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  await accessPostMatch(G, coaches.home); // the post-match is open: there is a row it could have locked
  const { result, log } = await recording(() => edit(token, "home-2", "completions", -1));
  assert.equal(result.body.error.code, "EVENT_BELOW_ZERO", "a step down reads what it is checked against under the same lock");
  const made = await recording(() => edit(token, "home-2"));
  assert.equal(made.result.status, 201);
  for (const run of [log, made.log]) {
    const locks = run.filter((sql) => /FOR (UPDATE|NO KEY UPDATE|SHARE|KEY SHARE)/.test(sql));
    assert.equal(locks.length, 1, locks.join("\n"));
    assert.match(locks[0], /^SELECT id, base_team_slug, roster, revision FROM saved_teams WHERE id = \$1 .* FOR UPDATE$/);
    assert.equal(run.indexOf(locks[0]), 1, "the team's row is the transaction's first statement");
  }
  assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
  assert.ok(!log.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), "a refusal writes nothing");
  const writes = made.log.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql));
  assert.equal(writes.length, 1);
  assert.match(writes[0], /^INSERT INTO match_events .* clock_timestamp\(\)\) RETURNING \*$/);
  assert.deepEqual([made.log[0], ...made.log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  for (const [label, send, status] of [
    ["an injury", () => callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { playerId: "home-2", counter: "injury", delta: 1, injury: { code: "miss" } } }), 400],
    ["a team not his, with a body that is no good either", () => callApi("POST", `/api/teams/${teams.home}/events`, { token: away, body: { playerId: "home-2", counter: "injury", delta: 1 } }), 404],
  ]) {
    const refused = await recording(send);
    assert.equal(refused.result.status, status, label);
    assert.deepEqual(refused.log, [], `${label}: no transaction was opened`);
  }
}));

test("an edit outside a match for an id two players of a 2.x roster share is refused, naming both, and writes nothing; a number for an id is the path's", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players}', (roster->'players')
    || '[{"id": "x", "name": "Alpha", "rowIndex": 0}, {"id": "x", "name": "Bravo", "rowIndex": 0}, null, {"id": 5, "rowIndex": 0}]'::jsonb) WHERE id = $1`, [teams.home]);
  const before = await teamRow(client, teams.home);
  const refused = await edit(token, "x");
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.violations],
    [422, "ROSTER_BREAKS_THE_RULES", [{ code: "DUPLICATE_PLAYER_ID", params: { playerId: "x", names: "Alpha, Bravo" } }]]);
  assert.deepEqual([await outside(client, teams.home), await teamRow(client, teams.home)], [[], before]);
  assert.equal((await edit(token, "5")).status, 201);
}));

test("outside a match a step down is refused once the blob and the edits waiting on it add up to zero, and writes nothing; the match's taps are not the blob's", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players,3,spp}', '{"touchdowns": 1}') WHERE id = $1`, [teams.home]);
  const refused = await edit(token, "home-2", "completions", -1);
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.params], [409, "EVENT_BELOW_ZERO", { playerId: "home-2", counter: "completions" }]);
  const tapped = await callApi("POST", `/api/teams/${teams.home}/events`, { token, body: { pairingId: G, playerId: "home-2", counter: "completions", delta: 1 } });
  assert.equal(tapped.status, 201);
  assert.equal((await edit(token, "home-2", "completions", -1)).body.error?.code, "EVENT_BELOW_ZERO", "a tap of the match goes into the blob through the match");
  assert.equal((await edit(token, "home-2")).status, 201);
  assert.equal((await edit(token, "home-2", "catches", -1)).body.error?.code, "EVENT_BELOW_ZERO", "another counter");
  assert.equal((await edit(token, "home-2", "completions", -1)).status, 201, "a step up, then down");
  assert.equal((await edit(token, "home-2", "completions", -1)).body.error?.code, "EVENT_BELOW_ZERO", "and no further");
  assert.equal((await edit(token, "home-3", "touchdowns", -1)).status, 201, "what the blob holds can be taken back");
  assert.equal((await edit(token, "home-3", "touchdowns", -1)).body.error?.code, "EVENT_BELOW_ZERO", "but not below it");
  assert.deepEqual((await outside(client, teams.home)).map((row) => [row.player_id, row.counter, row.delta]),
    [["home-2", "completions", 1], ["home-2", "completions", -1], ["home-3", "touchdowns", -1]]);
}));

test("the finish carries an edit made outside the match into the blob and settles it; the match's own record does not hold it", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await edit(token, "home-2");
  const ready = await toReady(await toPlayersStep(), homeScores);
  assert.equal((await act("home", ready, null, true)).status, "completed");
  const player = (await teamRow(client, teams.home)).roster.players.find((item) => item.id === "home-2");
  assert.equal(player.spp.completions, 1);
  assert.deepEqual(await outside(client, teams.home), [{ player_id: "home-2", counter: "completions", delta: 1, settled: true }]);
  const { rows: [applied] } = await client.query("SELECT after_roster FROM match_post_applications WHERE pairing_id = $1 AND side = 'home'", [G]);
  assert.equal(applied.after_roster.players.find((item) => item.id === "home-2").spp.completions ?? 0, 0);
}));

test("the finish's carry skips a player who is no longer on the roster but settles his rows all the same, applies those of one who is, and leaves the match's own rows and the revision alone", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const row = (playerId, pairingId = null) => client.query(`INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, created_at)
    VALUES ($1, $2, $3, 'completions', 1, clock_timestamp())`, [teams.home, pairingId, playerId]);
  const settle = async () => {
    const log = [], spy = { query: (sql, values) => { log.push(sql.trim().split(/\s+/)[0]); return client.query(sql, values); } };
    await client.query("BEGIN");
    try { return { settled: await settleOutsideEdits(spy, teams.home), log }; } finally { await client.query("COMMIT"); }
  };
  await row("home-2", G); // a tap of the match: the match's own record takes it, not this
  const before = await teamRow(client, teams.home);
  await row("home-9"); // he died meanwhile
  assert.equal((await settle()).settled, 1);
  const kept = await teamRow(client, teams.home);
  assert.deepEqual([kept.roster, kept.revision], [before.roster, before.revision], "the roster as it was");
  await row("home-2"); // back through an undo, say
  const waiting = await loadWaitingOutsideEdits(client, teams.home); // what a step down outside a match is checked against
  assert.deepEqual(waiting.map((event) => [event.playerId, event.counter, event.delta, event.settledAt]), [["home-2", "completions", 1, null]]);
  assert.equal((await settle()).settled, 1);
  const { rows: carried } = await client.query("SELECT id FROM match_events WHERE settled_at IS NOT NULL AND player_id = 'home-2' AND pairing_id IS NULL");
  assert.deepEqual(carried.map((item) => item.id), waiting.map((event) => event.id), "and exactly what the finish carries");
  const after = await teamRow(client, teams.home), expected = structuredClone(before.roster);
  expected.players.find((player) => player.id === "home-2").spp = { completions: 1 };
  assert.deepEqual([after.roster, after.revision], [expected, before.revision], "his edit and nothing else; the revision is the finish's");
  assert.deepEqual(await outside(client, teams.home), [{ player_id: "home-9", counter: "completions", delta: 1, settled: true },
    { player_id: "home-2", counter: "completions", delta: 1, settled: true }]);
  const { rows: [tapped] } = await client.query("SELECT settled_at FROM match_events WHERE pairing_id = $1", [G]);
  assert.equal(tapped.settled_at, null, "the match's own row is not this carry's to settle");
  assert.deepEqual(await settle(), { settled: 0, log: ["SELECT"] }, "nothing waiting, nothing written");
}));

test("a finish that fails after carrying home's edits — away's team changed meanwhile — takes the carry back: the edits wait still, the blob is as it was, no match row is settled", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  await edit(token, "home-2");
  const ready = await toReady(await toPlayersStep(), homeScores);
  const before = await teamRow(client, teams.home);
  await client.query("UPDATE saved_teams SET revision = revision + 1 WHERE id = $1", [teams.away]);
  const { log } = await recording(() => assert.rejects(act("home", ready, null, true), { status: 409, code: "POST_TEAM_CHANGED" }));
  assert.ok(log.includes("UPDATE match_events SET settled_at = now() WHERE id = ANY($1::uuid[])"), "home's edits were carried before away was refused");
  assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
  const after = await teamRow(client, teams.home);
  assert.deepEqual([after.roster, after.revision], [before.roster, before.revision]);
  assert.deepEqual(await outside(client, teams.home), [{ player_id: "home-2", counter: "completions", delta: 1, settled: false }]);
  const { rows: [settled] } = await client.query("SELECT count(*)::int AS n FROM match_events WHERE pairing_id = $1 AND settled_at IS NOT NULL", [G]);
  assert.equal(settled.n, 0);
}));

for (const editFirst of [true, false]) {
  test(`an edit outside the match racing the finish, ${editFirst ? "the edit first: it is carried into the blob and settled" : "the finish first: it is refused, and nothing is left behind"}`, db, () => withApiDatabase(async (database) => {
    const { client } = database;
    await startedFriendly(client);
    const token = await sessionFor(client, coaches.home.id);
    const ready = await toReady(await toPlayersStep(), homeScores);
    const editing = () => edit(token, "home-2"), finishing = () => act("home", ready, null, true);
    // Both queue on the home team's row: the edit's only lock, and one the finish takes after the pairing's.
    const answers = await raceInOrder(database, lockRow("saved_teams", teams.home), ...(editFirst ? [editing, finishing] : [finishing, editing]));
    const [edited, finished] = editFirst ? answers : answers.reverse();
    for (const answer of [edited, finished]) if (answer.status === "rejected") throw answer.reason;
    assert.equal(finished.value.status, "completed");
    const completions = (await teamRow(client, teams.home)).roster.players.find((item) => item.id === "home-2").spp.completions ?? 0;
    if (editFirst) {
      assert.equal(edited.value.status, 201);
      assert.deepEqual([completions, await outside(client, teams.home)], [1, [{ player_id: "home-2", counter: "completions", delta: 1, settled: true }]]);
    } else {
      assert.deepEqual([edited.value.status, edited.value.body.error.code], [409, "MATCH_NOT_LIVE"]);
      assert.deepEqual([completions, await outside(client, teams.home)], [0, []]);
    }
  }));
}
