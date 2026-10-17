import test from "node:test";
import assert from "node:assert/strict";

import { callApi, loggingErrors, recording, seedCoach, seedTeam, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const NOBODY = "44444444-4444-4444-8444-444444444444";
const death = (id, pid, token, body = {}) => callApi("POST", `/api/teams/${id}/players/${pid}/death`, { token, body: { cause: "Crushed by a Rat Ogre", revision: 1, ...body } });
const undo = (id, fid, token) => callApi("DELETE", `/api/teams/${id}/fallen/${fid}`, { token });
const fallen = (id, token) => callApi("GET", `/api/teams/${id}/fallen`, { token });
/** The team's `updated_at` as Postgres writes it, to the microsecond: a JS Date keeps milliseconds, and two writes can share one. */
const clock = async (client, id) => (await client.query("SELECT updated_at::text AS at FROM saved_teams WHERE id = $1", [id])).rows[0].at;
const movedOn = async (client, id, since) => (await client.query("SELECT updated_at > $2::timestamptz AS later FROM saved_teams WHERE id = $1", [id, since])).rows[0].later;
const fallenRows = async (client, id) => (await client.query("SELECT player->>'id' AS player, from_match FROM team_fallen_players WHERE saved_team_id = $1", [id])).rows;
const allFallen = async (client, id) => (await client.query("SELECT * FROM team_fallen_players WHERE saved_team_id = $1 ORDER BY id", [id])).rows;
const insertFallen = (client, id, player, fromMatch) => client.query(
  "INSERT INTO team_fallen_players (saved_team_id, player, cause, from_match) VALUES ($1, $2, 'old', $3) RETURNING id", [id, player, fromMatch]).then((result) => result.rows[0].id);
/** How each request of a race ended, and a rejected one rethrown: a TypeError on `.value` would hide why it was rejected. */
const answers = (results) => results.map((result) => { if (result.status === "rejected") throw result.reason; return result.value; });

test("marking a death takes the player off the roster and keeps him as he was, with the cause, as a manual mark", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, spp: { touchdowns: 4 } }, { id: "p1", rowIndex: 0 }] } });
  const { status, body } = await death(id, "p0", coach.token);
  assert.equal(status, 201);
  assert.deepEqual(body.team.roster.players.map((player) => player.id), ["p1"]);
  assert.equal(body.team.revision, 2);
  assert.deepEqual([body.fallen.player.id, body.fallen.player.spp.touchdowns, body.fallen.cause, body.fallen.fromMatch], ["p0", 4, "Crushed by a Rat Ogre", false]);
  const list = await callApi("GET", `/api/teams/${id}/fallen`, { token: coach.token });
  assert.deepEqual(list.body.fallen.map((item) => item.id), [body.fallen.id]);
}));

test("a death needs a cause, a player of this roster and the revision the coach saw; a refusal writes nothing", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), id = await seedTeam(client, coach.id);
  assert.equal((await death(id, "p0", coach.token, { cause: "  " })).body.error.params.field, "cause");
  assert.equal((await death(id, "ghost", coach.token)).body.error.code, "PLAYER_NOT_FOUND");
  assert.equal((await death(id, "p0", coach.token, { revision: 7 })).body.error.code, "TEAM_SAVED_ELSEWHERE");
  assert.equal((await death(id, "p0", other.token)).body.error.code, "TEAM_NOT_FOUND");
  assert.deepEqual(await fallenRows(client, id), []);
  assert.equal((await teamRow(client, id)).roster.players.length, 11);
}));

test("a death marked twice at once is one death: one fallen row, one player gone, the second hears the team changed", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const results = await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 }, [() => death(id, "p0", coach.token), () => death(id, "p0", coach.token)]);
  assert.deepEqual(results.map((result) => result.value.status).sort(), [201, 409]);
  assert.deepEqual(await fallenRows(client, id), [{ player: "p0", from_match: false }]);
  assert.equal((await teamRow(client, id)).roster.players.length, 10);
}));

test("undoing a manual mark brings the player back and forgets the death; a second undo finds nothing", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const { body } = await death(id, "p3", coach.token);
  const undone = await callApi("DELETE", `/api/teams/${id}/fallen/${body.fallen.id}`, { token: coach.token });
  assert.equal(undone.status, 200);
  assert.ok(undone.body.team.roster.players.some((player) => player.id === "p3"));
  assert.deepEqual(await fallenRows(client, id), []);
  assert.equal((await callApi("DELETE", `/api/teams/${id}/fallen/${body.fallen.id}`, { token: coach.token })).body.error.code, "FALLEN_NOT_FOUND");
}));

test("a death a match recorded is the admin's to undo, not the coach's", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), admin = await seedCoach(client, "boss", { admin: true }), id = await seedTeam(client, coach.id);
  const fid = await insertFallen(client, id, { id: "m1", rowIndex: 0, spp: {} }, true);
  const refused = await callApi("DELETE", `/api/teams/${id}/fallen/${fid}`, { token: coach.token });
  assert.deepEqual([refused.status, refused.body.error.code], [403, "FALLEN_FROM_MATCH"]);
  assert.deepEqual((await callApi("GET", `/api/teams/${id}/fallen`, { token: coach.token })).body.fallen.map((item) => item.fromMatch), [true]);
  assert.equal((await callApi("DELETE", `/api/teams/${id}/fallen/${fid}`, { token: admin.token })).status, 200);
  assert.ok((await teamRow(client, id)).roster.players.some((player) => player.id === "m1"));
}));

test("a player does not come back over the roster limit, and the death stays recorded", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { players: 14 });
  const fid = await insertFallen(client, id, { id: "x", rowIndex: 0, spp: {} }, false);
  const refused = await callApi("DELETE", `/api/teams/${id}/fallen/${fid}`, { token: coach.token });
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.violations.map((item) => item.code)], [422, "ROSTER_BREAKS_THE_RULES", ["ROSTER_MAX_PLAYERS"]]);
  assert.equal((await fallenRows(client, id)).length, 1);
  assert.equal((await teamRow(client, id)).roster.players.length, 14);
}));

test("a roster under the minimum of seven is a roster in progress, and no reason to refuse a death or an undo", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { players: 7 });
  const died = await death(id, "p0", coach.token);
  assert.deepEqual([died.status, died.body.team.roster.players.length], [201, 6]);
  const second = await death(id, "p1", coach.token, { revision: 2 });
  assert.deepEqual([second.status, second.body.team.roster.players.length], [201, 5]);
  const back = await undo(id, died.body.fallen.id, coach.token);
  assert.deepEqual([back.status, back.body.team.roster.players.length], [200, 6]);
}));

test("a player does not come back over a position's limit either, whoever asks, and the refusal says which position", db, () => withApiDatabase(async ({ client }) => {
  const OGRE = 5; // the Human Ogre: 0-1 in the roster table, so a second one is over the limit
  const coach = await seedCoach(client, "lion"), admin = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "g1", rowIndex: OGRE }, ...Array.from({ length: 7 }, (_, n) => ({ id: `p${n}`, rowIndex: 0 }))] } });
  const manual = await insertFallen(client, id, { id: "g0", rowIndex: OGRE, spp: {} }, false);
  const fromMatch = await insertFallen(client, id, { id: "g2", rowIndex: OGRE, spp: {} }, true);
  for (const [who, token, fid] of [["the coach", coach.token, manual], ["the admin", admin.token, fromMatch]]) {
    const refused = await undo(id, fid, token);
    assert.deepEqual([refused.status, refused.body.error.code, refused.body.violations], [422, "ROSTER_BREAKS_THE_RULES", [{ code: "POSITION_MAX", params: { position: "Ogre", max: 1, count: 2 } }]], who);
  }
  assert.equal((await allFallen(client, id)).length, 2);
  assert.equal((await teamRow(client, id)).roster.players.length, 8);
}));

test("a death undone twice at once is one return: the player is back once, the second hears there is no such death", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const fid = await insertFallen(client, id, { id: "x", rowIndex: 0, spp: {} }, false);
  const results = answers(await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 }, [() => undo(id, fid, coach.token), () => undo(id, fid, coach.token)]));
  assert.deepEqual(results.map((result) => result.status).sort(), [200, 404]);
  assert.equal(results.find((result) => result.status === 404).body.error.code, "FALLEN_NOT_FOUND");
  const row = await teamRow(client, id);
  assert.deepEqual([row.roster.players.filter((player) => player.id === "x").length, row.roster.players.length, row.revision], [1, 12, 2]);
  assert.deepEqual(await fallenRows(client, id), []);
}));

test("a death and a roster save on one revision at once: one of them, never both", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const save = () => callApi("PATCH", `/api/teams/${id}`, { token: coach.token,
    body: { name: "Lions", baseTeamSlug: "teams/human", revision: 1, roster: { teamSlug: "teams/human", players: [], treasury: 130 } } });
  const results = answers(await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 }, [() => death(id, "p0", coach.token), save]));
  const [marked, saved] = results.map((result) => result.status);
  assert.ok((marked === 201 && saved === 409) || (marked === 409 && saved === 200), `${marked} ${saved}`);
  const row = await teamRow(client, id);
  assert.deepEqual([row.revision, row.roster.players.length, row.roster.treasury], marked === 201 ? [2, 10, 100] : [2, 0, 130]);
  assert.equal((await fallenRows(client, id)).length, marked === 201 ? 1 : 0);
}));

test("a request the team refuses is rolled back whole: a stale revision, a missing player, a death a match recorded, a player who does not fit, a death that is not this team's", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const id = await seedTeam(client, coach.id, { players: 14 }), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  const fromMatch = await insertFallen(client, id, { id: "m1", rowIndex: 0, spp: {} }, true);
  const tooMany = await insertFallen(client, id, { id: "m2", rowIndex: 0, spp: {} }, false);
  const alien = await insertFallen(client, theirs, { id: "w1", rowIndex: 0, spp: {} }, false);
  const before = [await teamRow(client, id), await allFallen(client, id), await teamRow(client, theirs), await allFallen(client, theirs)];
  const stale = ["1", true, [1], null, 1.5, 2, 0, undefined].map((revision) => [`a revision of ${JSON.stringify(revision)} when the team is at 1`, () => death(id, "p0", coach.token, { revision }), "TEAM_SAVED_ELSEWHERE"]);
  for (const [label, send, code] of [...stale,
    ["a player who is not on the roster", () => death(id, "ghost", coach.token), "PLAYER_NOT_FOUND"],
    ["a stale revision, which is told before a missing player", () => death(id, "ghost", coach.token, { revision: 7 }), "TEAM_SAVED_ELSEWHERE"],
    ["a death a match recorded, undone by the coach", () => undo(id, fromMatch, coach.token), "FALLEN_FROM_MATCH"],
    ["a player who would not fit", () => undo(id, tooMany, coach.token), "ROSTER_BREAKS_THE_RULES"],
    ["a death of another team, named through this one", () => undo(id, alien, coach.token), "FALLEN_NOT_FOUND"],
    ["a death that is not there", () => undo(id, NOBODY, coach.token), "FALLEN_NOT_FOUND"]]) {
    const { result, log } = await recording(send);
    assert.equal(result.body.error.code, code, label);
    assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"], label);
    assert.ok(!log.includes("COMMIT"), label);
    assert.ok(!log.some((sql) => /^(UPDATE|INSERT|DELETE)/.test(sql)), `${label}: nothing was written before it was refused`);
    assert.deepEqual([await teamRow(client, id), await allFallen(client, id), await teamRow(client, theirs), await allFallen(client, theirs)], before, label);
  }
}));

test("a failure after the roster moved takes the roster back for real, on a death and on an undo: the team is exactly as it was and the connection is given back", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const fid = await insertFallen(client, id, { id: "x", rowIndex: 0, spp: {} }, false);
  await client.query("CREATE FUNCTION refuse_row() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disk full'; END $$");
  const before = [await teamRow(client, id), await allFallen(client, id)];
  for (const [label, event, send] of [["a death", "INSERT", () => death(id, "p0", coach.token)], ["an undo", "DELETE", () => undo(id, fid, coach.token)]]) {
    await client.query(`CREATE TRIGGER refuse BEFORE ${event} ON team_fallen_players FOR EACH ROW EXECUTE FUNCTION refuse_row()`);
    const { result: { result, log }, logged } = await loggingErrors(() => recording(send));
    assert.deepEqual([result.status, result.body.error.code], [500, "SERVER_ERROR"], label);
    assert.ok(log.some((sql) => sql.startsWith("UPDATE saved_teams")), `${label}: the roster had moved when the write failed`);
    assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"], label);
    assert.deepEqual([await teamRow(client, id), await allFallen(client, id)], before, label);
    assert.deepEqual(logged.map(([error]) => error.message), ["disk full"], `${label}: the failure is logged once, and says what it was`);
    await client.query("DROP TRIGGER refuse ON team_fallen_players");
  }
}));

test("a death changes the players, their counts, the revision and the clock and nothing else of the team; its undo does the same the other way", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { coachesSafe: 12, notes: "keep me", roster: { 0: 11 } } });
  await insertFallen(client, id, { id: "z", rowIndex: 0, spp: {} }, true); // another death of the team, which neither request has any business with
  const [bystander] = await allFallen(client, id);
  const before = await teamRow(client, id), beforeAt = await clock(client, id);
  const rest = (row) => ({ ...row.roster, players: undefined, roster: undefined });
  const same = (row) => [row.user_id, row.name, row.base_team_slug, row.logo_data, row.stage, row.created_at];
  const marked = await recording(() => death(id, "p0", coach.token));
  assert.equal(marked.result.status, 201);
  assert.deepEqual(Object.keys(marked.result.body).sort(), ["fallen", "team"]);
  assert.match(marked.log[1], /^SELECT .* FROM saved_teams .* FOR UPDATE$/, "the team is locked first");
  assert.deepEqual([marked.log[0], ...marked.log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  assert.deepEqual([marked.log.filter((sql) => sql.startsWith("UPDATE")).length, marked.log.filter((sql) => sql.startsWith("INSERT")).length], [1, 1], "one death is one write of the roster and one row");
  const dead = await teamRow(client, id);
  assert.deepEqual(rest(dead), rest(before), "every other field of the roster is as it was");
  assert.deepEqual([dead.roster.players.map((player) => player.id), dead.roster.roster, dead.revision], [["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10"], { 0: 10 }, 2]);
  assert.equal(await movedOn(client, id, beforeAt), true, "the clock moved on, to the microsecond");
  const deadAt = await clock(client, id);
  assert.deepEqual(same(dead), same(before));
  const written = (await allFallen(client, id)).filter((row) => row.id !== bystander.id);
  assert.deepEqual(written.map(({ player, cause, recorded_by, from_match, pairing_id, saved_team_id }) => ({ player, cause, recorded_by, from_match, pairing_id, saved_team_id })),
    [{ player: { id: "p0", rowIndex: 0, spp: {} }, cause: "Crushed by a Rat Ogre", recorded_by: coach.id, from_match: false, pairing_id: null, saved_team_id: id }], "the row is the player as he was, the cause and who wrote it");
  const returned = await recording(() => undo(id, marked.result.body.fallen.id, coach.token));
  assert.equal(returned.result.status, 200);
  assert.deepEqual(Object.keys(returned.result.body), ["team"]);
  assert.match(returned.log[1], /^SELECT .* FROM saved_teams .* FOR UPDATE$/, "the team is locked first");
  assert.deepEqual([returned.log[0], ...returned.log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  assert.deepEqual([returned.log.filter((sql) => sql.startsWith("UPDATE")).length, returned.log.filter((sql) => sql.startsWith("DELETE")).length], [1, 1]);
  const back = await teamRow(client, id);
  assert.deepEqual(rest(back), rest(before));
  assert.deepEqual([back.roster.players.at(-1), back.roster.players.length, back.roster.roster, back.revision], [{ id: "p0", rowIndex: 0, spp: {} }, 11, { 0: 11 }, 3]);
  assert.equal(await movedOn(client, id, deadAt), true);
  assert.deepEqual(same(back), same(before));
  assert.deepEqual(await allFallen(client, id), [bystander], "only that death is forgotten");
}));

test("the team a death and an undo answer with has the keys every other answer about a team has, inActiveSeason included, and is read after the write", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const keys = (team) => Object.keys(team).sort();
  const { body: { team: read } } = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  const refused = await callApi("PATCH", `/api/teams/${id}`, { token: coach.token, body: { name: read.name, baseTeamSlug: read.baseTeamSlug, roster: read.roster, revision: 0 } });
  assert.equal(refused.status, 409);
  const died = await death(id, "p0", coach.token);
  assert.equal(died.status, 201);
  assert.deepEqual(keys(died.body.team), keys(refused.body.team), "PATCH's own answer to a stale save");
  assert.deepEqual(keys(died.body.team), keys(read), "and what GET says");
  assert.equal(died.body.team.inActiveSeason, false, "the question the raw row of the UPDATE cannot answer");
  assert.deepEqual([died.body.team.revision, died.body.team.roster.players.length], [2, 10]);
  const { rows: [season] } = await client.query("INSERT INTO seasons (name, status) VALUES ('Now', 'active') RETURNING id");
  await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3)", [season.id, coach.id, id]);
  const back = await undo(id, died.body.fallen.id, coach.token);
  assert.equal(back.status, 200);
  assert.deepEqual(keys(back.body.team), keys(read));
  assert.equal(back.body.team.inActiveSeason, true);
  assert.deepEqual([back.body.team.revision, back.body.team.roster.players.length], [3, 11]);
}));

test("deaths follow one another on the revision each answer gives, and the list names the latest first, as the death answered it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  let revision = 1, answer;
  const ids = [];
  for (const pid of ["p0", "p1", "p2"]) {
    answer = await death(id, pid, coach.token, { revision });
    assert.equal(answer.status, 201, pid);
    revision = answer.body.team.revision;
    ids.push(answer.body.fallen.id);
  }
  assert.equal(revision, 4);
  const { status, body } = await fallen(id, coach.token);
  assert.equal(status, 200);
  assert.deepEqual(body.fallen.map((item) => [item.id, item.player.id]), [[ids[2], "p2"], [ids[1], "p1"], [ids[0], "p0"]]);
  assert.deepEqual(body.fallen[0], answer.body.fallen, "the fallen a death answers with is the one the list shows");
}));

test("the list is newest first by the time and then the id, holds this team's fallen only, and says of each what the whitelist says", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), other = await seedTeam(client, coach.id, { name: "Wolves" });
  const row = (n) => `00000000-0000-4000-8000-00000000000${n}`;
  const insert = (team, n, name, at) => client.query(
    "INSERT INTO team_fallen_players (id, saved_team_id, player, cause, died_at, recorded_by) VALUES ($1, $2, $3, $4, $5, $6)", [row(n), team, { id: name, rowIndex: 0 }, `cause ${n}`, at, coach.id]);
  assert.deepEqual((await fallen(id, coach.token)).body, { fallen: [] });
  await insert(id, 1, "a", "2026-10-01 10:00:00+00");
  await insert(id, 2, "c", "2026-10-02 10:00:00+00");
  await insert(id, 3, "b", "2026-10-02 10:00:00+00"); // the moment of 2, and inserted after it: the larger id comes first all the same
  await insert(id, 4, "d", "2026-09-30 10:00:00+00");
  await insert(other, 9, "z", "2026-10-03 10:00:00+00");
  const { status, body } = await fallen(id, coach.token);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body), ["fallen"]);
  assert.deepEqual(body.fallen.map((item) => item.id), [row(3), row(2), row(1), row(4)]);
  assert.deepEqual(body.fallen[0], { id: row(3), player: { id: "b", rowIndex: 0 }, cause: "cause 3", pairingId: null, roundNumber: null, diedAt: "2026-10-02T10:00:00.000Z", fromMatch: false });
  assert.ok(body.fallen.every((item) => Object.keys(item).sort().join() === "cause,diedAt,fromMatch,id,pairingId,player,roundNumber"), "who recorded it, and for which team, stay on the server");
}));

test("a death says in which round a match recorded it, none for a friendly or a mark by hand, and it stays a match's when its pairing is gone", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), rival = await seedCoach(client, "wolf");
  const id = await seedTeam(client, coach.id), rivalTeam = await seedTeam(client, rival.id, { name: "Wolves" });
  const { rows: [season] } = await client.query("INSERT INTO seasons (name, status) VALUES ('Now', 'active') RETURNING id");
  const { rows: [round] } = await client.query("INSERT INTO season_rounds (season_id, round_number) VALUES ($1, 3) RETURNING id", [season.id]);
  const { rows: [league] } = await client.query("INSERT INTO season_pairings (round_id, table_number) VALUES ($1, 1) RETURNING id", [round.id]);
  const { rows: [friendly] } = await client.query(`INSERT INTO season_pairings (match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id) VALUES ('friendly', 1, $1, $2, $3, $4) RETURNING id`, [coach.id, rival.id, id, rivalTeam]);
  const insert = (name, pairing, at) => client.query(
    "INSERT INTO team_fallen_players (saved_team_id, player, pairing_id, from_match, died_at) VALUES ($1, $2, $3, true, $4)", [id, { id: name, rowIndex: 0 }, pairing, at]);
  await insert("l", league.id, "2020-01-02 10:00:00+00"); // long ago, so that the mark made now is the newest whatever the clock says
  await insert("f", friendly.id, "2020-01-01 10:00:00+00");
  const marked = await death(id, "p0", coach.token);
  const where = async () => (await fallen(id, coach.token)).body.fallen.map((item) => [item.player.id, item.pairingId, item.roundNumber, item.fromMatch]);
  assert.deepEqual(marked.body.fallen.roundNumber, null);
  assert.deepEqual(await where(), [["p0", null, null, false], ["l", league.id, 3, true], ["f", friendly.id, null, true]]);
  await client.query("DELETE FROM season_pairings WHERE id = $1", [league.id]);
  assert.deepEqual(await where(), [["p0", null, null, false], ["l", null, null, true], ["f", friendly.id, null, true]], "the death is a match's still: from_match says so, not the pairing");
  const lost = (await fallen(id, coach.token)).body.fallen.find((item) => item.player.id === "l");
  const refused = await undo(id, lost.id, coach.token);
  assert.deepEqual([refused.status, refused.body.error.code], [403, "FALLEN_FROM_MATCH"]);
  const manual = await client.query("UPDATE team_fallen_players SET pairing_id = $2 WHERE saved_team_id = $1 AND player->>'id' = 'p0'", [id, friendly.id]);
  assert.equal(manual.rowCount, 1);
  assert.equal((await undo(id, marked.body.fallen.id, coach.token)).status, 200, "a mark by hand is undone by the coach whatever its pairing says");
}));

test("a cause is kept trimmed, and 500 characters of it are the most", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const long = "ы".repeat(500);
  const first = await death(id, "p0", coach.token, { cause: `  ${long}\n` });
  assert.deepEqual([first.status, first.body.fallen.cause], [201, long]);
  const second = await death(id, "p1", coach.token, { cause: "  Rat Ogre\t", revision: first.body.team.revision });
  assert.equal(second.body.fallen.cause, "Rat Ogre");
  const { rows } = await client.query("SELECT cause FROM team_fallen_players WHERE saved_team_id = $1 ORDER BY died_at", [id]);
  assert.deepEqual(rows.map((row) => row.cause), [long, "Rat Ogre"]);
}));

test("a body the site does not accept is a 400 naming the cause, opens no transaction, writes nothing, and comes before a stale revision or a missing player", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const before = await teamRow(client, id);
  const asked = async (send, label, field = "cause") => {
    const { result, log } = await recording(send);
    assert.deepEqual([result.status, result.body.error.code, result.body.error.params], [400, "FIELD_INVALID", { field }], label);
    assert.deepEqual(log, [], `${label}: no transaction was opened`);
  };
  for (const cause of ["", "   ", "\n\t", null, undefined, 7, true, ["x"], { text: "x" }, "x".repeat(501), `  ${"x".repeat(501)}  `]) {
    const said = JSON.stringify(cause) ?? "no cause";
    await asked(() => death(id, "p0", coach.token, { cause }), said);
    await asked(() => death(id, "ghost", coach.token, { cause, revision: 99 }), `${said}, a missing player, a stale revision`);
  }
  // A body that is no object is refused as the body, before any field of it is read (readJson); none at all has no cause.
  for (const [body, field] of [[[], "body"], [null, "body"], ["x", "body"], [5, "body"], [undefined, "cause"]]) {
    await asked(() => callApi("POST", `/api/teams/${id}/players/p0/death`, { token: coach.token, body }), `body ${JSON.stringify(body) ?? "none"}`, field);
  }
  assert.deepEqual(await teamRow(client, id), before);
  assert.deepEqual(await fallenRows(client, id), []);
}));

test("a cause with a NUL in it is refused as the cause, before anything is written", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), before = await teamRow(client, id);
  for (const cause of ["\u0000", "Eaten\u0000 by a Troll", "  \u0000"]) {
    const { result, log } = await recording(() => death(id, "p0", coach.token, { cause }));
    assert.deepEqual([result.status, result.body.error.code, result.body.error.params], [400, "FIELD_INVALID", { field: "cause" }], JSON.stringify(cause));
    assert.deepEqual(log, [], "no transaction was opened");
  }
  assert.deepEqual([await teamRow(client, id), await fallenRows(client, id)], [before, []]);
}));

test("who may do what: nobody without a session, a stranger is told 404 whatever they send, an admin reads and undoes but marks no death", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), admin = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  const manual = await insertFallen(client, id, { id: "m0", rowIndex: 0, spp: {} }, false);
  const alien = await insertFallen(client, theirs, { id: "w0", rowIndex: 0, spp: {} }, false);
  const before = [await teamRow(client, id), await allFallen(client, id), await teamRow(client, theirs), await allFallen(client, theirs)];
  const missing = await fallen(NOBODY, coach.token);
  assert.deepEqual([missing.status, missing.body], [404, { error: { code: "TEAM_NOT_FOUND", params: {}, message: "Team not found." } }]);
  assert.deepEqual([(await fallen(id)).status, (await death(id, "p0", undefined)).status, (await undo(id, manual, undefined)).status], [401, 401, 401]);
  for (const [who, request] of [
    ["a stranger reading", () => fallen(id, other.token)],
    ["a stranger marking a death", () => death(id, "p0", other.token)],
    ["a stranger marking what is no death", () => death(id, "ghost", other.token, { cause: "", revision: 9 })],
    ["a stranger undoing a death that is there", () => undo(id, manual, other.token)],
    ["a stranger undoing a death that is not there", () => undo(id, NOBODY, other.token)],
    ["an admin marking a death", () => death(id, "p0", admin.token)],
    ["an admin marking what is no death", () => death(id, "ghost", admin.token, { cause: "", revision: 9 })],
    ["the owner reading a team that is not there", () => fallen(NOBODY, coach.token)],
    ["the owner marking on a team that is not there", () => death(NOBODY, "p0", coach.token)],
    ["the owner undoing on a team that is not there", () => undo(NOBODY, manual, coach.token)],
  ]) {
    const answer = await request();
    assert.deepEqual([answer.status, answer.body], [missing.status, missing.body], `${who} is told what a team that is not there is told`);
  }
  const wrongTeam = { status: 404, body: { error: { code: "FALLEN_NOT_FOUND", params: {}, message: "Fallen player not found." } } };
  for (const [who, token] of [["the owner", coach.token], ["an admin", admin.token]]) {
    const answer = await undo(id, alien, token);
    assert.deepEqual({ status: answer.status, body: answer.body }, wrongTeam, `${who} naming another team's death through this team's path`);
  }
  assert.deepEqual([await teamRow(client, id), await allFallen(client, id), await teamRow(client, theirs), await allFallen(client, theirs)], before, "nothing of that touched a row");
  const seen = await fallen(id, admin.token);
  assert.deepEqual([seen.status, seen.body.fallen.map((item) => item.id)], [200, [manual]], "an admin reads any team's fallen");
  assert.equal((await fallen(theirs, admin.token)).status, 200);
  const undone = await undo(id, manual, admin.token);
  assert.deepEqual([undone.status, undone.body.team.roster.players.some((player) => player.id === "m0")], [200, true], "and undoes a coach's own mark");
}));

test("only a GET lists the fallen, only a POST marks a death and only a DELETE undoes one; ids may be written in capitals, and a path that is no fallen player is no route", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const fid = await insertFallen(client, id, { id: "x", rowIndex: 0, spp: {} }, false);
  const body = { cause: "Crushed", revision: 1 };
  const notRoutes = [["POST", `/api/teams/${id}/fallen`], ["PATCH", `/api/teams/${id}/fallen`], ["PUT", `/api/teams/${id}/fallen`], ["DELETE", `/api/teams/${id}/fallen`],
    ["GET", `/api/teams/${id}/fallen/${fid}`], ["POST", `/api/teams/${id}/fallen/${fid}`], ["PATCH", `/api/teams/${id}/fallen/${fid}`],
    ["GET", `/api/teams/${id}/players/p0/death`], ["PUT", `/api/teams/${id}/players/p0/death`], ["PATCH", `/api/teams/${id}/players/p0/death`], ["DELETE", `/api/teams/${id}/players/p0/death`],
    ["DELETE", `/api/teams/${id}/fallen/not-a-uuid`], ["DELETE", `/api/teams/${id}/fallen/${fid}0`], ["DELETE", `/api/teams/${id}/fallen/${fid}/`], ["GET", `/api/teams/${id}/fallen/`],
    ["POST", `/api/teams/${id}/players//death`], ["POST", `/api/teams/${id}/players/p0/death/`], ["POST", `/api/teams/${id}/players/p%200/death`], ["POST", `/api/teams/${id}/players/p0%2Fx/death`],
    ["POST", `/api/teams/${id}/players/${"x".repeat(201)}/death`], ["POST", "/api/teams/p0/players/p0/death"], ["GET", "/api/teams/p0/fallen"], ["DELETE", `/api/teams/p0/fallen/${fid}`]];
  for (const [method, path] of notRoutes) {
    const answer = await callApi(method, path, { token: coach.token, body: method === "GET" ? undefined : body });
    assert.deepEqual([answer.status, answer.body.error.code], [404, "ROUTE_NOT_FOUND"], `${method} ${path}`);
  }
  assert.deepEqual([await fallenRows(client, id), (await teamRow(client, id)).revision], [[{ player: "x", from_match: false }], 1], "none of them touched the team");
  const upper = id.toUpperCase();
  assert.equal((await fallen(upper, coach.token)).status, 200);
  const marked = await callApi("POST", `/api/teams/${upper}/players/p0/death`, { token: coach.token, body });
  assert.deepEqual([marked.status, marked.body.team.id], [201, id]);
  const undone = await callApi("DELETE", `/api/teams/${upper}/fallen/${fid.toUpperCase()}`, { token: coach.token });
  assert.deepEqual([undone.status, undone.body.team.id], [200, id]);
}));

test("a player may have any id a roster gives him: a UUID, a dotted or a long one", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const ids = ["7f4c2a3e-0b1d-4c55-9a77-5d3e8b1f2a60", "home-0", "player.1_a-B", "z".repeat(200)];
  const id = await seedTeam(client, coach.id, { roster: { players: ids.map((name) => ({ id: name, rowIndex: 0 })) } });
  let revision = 1;
  for (const name of ids) {
    const answer = await death(id, name, coach.token, { revision });
    assert.deepEqual([answer.status, answer.body.fallen?.player.id], [201, name], name);
    revision = answer.body.team.revision;
  }
  assert.deepEqual((await teamRow(client, id)).roster.players, []);
}));

test("a captain who died comes back a captain only while nobody else has been named", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, isCaptain: true }, { id: "p1", rowIndex: 0 }, { id: "p2", rowIndex: 0 }] } });
  const flags = (team) => team.roster.players.map((player) => [player.id, Boolean(player.isCaptain)]);
  const died = await death(id, "p0", coach.token);
  assert.deepEqual(flags(died.body.team), [["p1", false], ["p2", false]]);
  assert.equal(died.body.fallen.player.isCaptain, true, "the record keeps him as he was");
  const back = await undo(id, died.body.fallen.id, coach.token);
  assert.deepEqual(flags(back.body.team), [["p1", false], ["p2", false], ["p0", true]]);
  const again = await death(id, "p0", coach.token, { revision: back.body.team.revision });
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,isCaptain}', 'true') WHERE id = $1", [id]); // a save names p1 meanwhile
  const named = await undo(id, again.body.fallen.id, coach.token);
  assert.deepEqual(flags(named.body.team), [["p1", true], ["p2", false], ["p0", false]]);
  assert.equal(named.body.team.roster.players.filter((player) => player.isCaptain).length, 1);
}));

test("a roster stored with two players under one id (2.x) takes no death for that id: 422 naming both, and the roster and the fallen stay as they were", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const players = [{ id: "x", name: "Alpha", rowIndex: 0 }, { id: "x", name: "Bravo", rowIndex: 0 }, { id: "p2", rowIndex: 0 }];
  const id = await seedTeam(client, coach.id, { roster: { players } }), before = await teamRow(client, id);
  const refused = await recording(() => death(id, "x", coach.token));
  assert.deepEqual([refused.result.status, refused.result.body.error.code, refused.result.body.violations],
    [422, "ROSTER_BREAKS_THE_RULES", [{ code: "DUPLICATE_PLAYER_ID", params: { playerId: "x", names: "Alpha, Bravo" } }]]);
  assert.ok(!refused.log.some((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql)), "refused before any write");
  assert.deepEqual([await teamRow(client, id), await allFallen(client, id)], [before, []]);
  assert.equal((await death(id, "p2", coach.token)).status, 201, "a player of his own id is still his");
}));

test("a player stored the way older rosters left him dies and comes back all the same: a number for an id, a hole in the list beside him", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(roster, '{players}', (roster->'players') || '[null, {"id": 5, "rowIndex": 0}]'::jsonb) WHERE id = $1`, [id]);
  const died = await death(id, "5", coach.token);
  assert.deepEqual([died.status, died.body.fallen?.player.id], [201, 5], "the path's 5 is the roster's 5");
  assert.ok(!(await teamRow(client, id)).roster.players.some((player) => player?.id === 5));
  const back = await undo(id, died.body.fallen.id, coach.token);
  assert.equal(back.status, 200);
  assert.equal((await teamRow(client, id)).roster.players.filter((player) => player?.id === 5).length, 1, "back once");
  assert.deepEqual(await allFallen(client, id), []);
}));

test("a death kept as a player the roster cannot read is not undone: refused, the death stays, the roster as it was", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true }), id = await seedTeam(client, coach.id);
  const before = await teamRow(client, id);
  // Kept without a place on the roster (no rowIndex, or one the race has no row for): normalisation would drop him, and
  // the undo would forget the death of a player nobody then sees.
  for (const player of [{ id: "ghost-a" }, { id: "ghost-b", rowIndex: 99 }, { id: "ghost-c", rowIndex: "x" }]) {
    const fid = await insertFallen(client, id, player, false);
    for (const token of [coach.token, boss.token]) {
      const refused = await recording(() => undo(id, fid, token));
      assert.deepEqual([refused.result.status, refused.result.body.error.code], [422, "FALLEN_NOT_RESTORABLE"], JSON.stringify(player));
      assert.ok(!refused.log.some((sql) => /^(UPDATE|DELETE)/.test(sql)), "nothing written");
    }
    assert.ok((await allFallen(client, id)).some((row) => row.id === fid), "the death is still kept");
  }
  assert.deepEqual(await teamRow(client, id), before);
}));

test("a team has one captain whichever way its roster names him: an old `captain` flag holds the captaincy as `isCaptain` does", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, captain: true }, { id: "p1", rowIndex: 0 }, { id: "p2", rowIndex: 0 }] } });
  const captains = async () => (await teamRow(client, id)).roster.players.filter((player) => player.isCaptain ?? player.captain).map((player) => player.id);
  const kept = await insertFallen(client, id, { id: "p9", rowIndex: 0, isCaptain: true }, false);
  assert.equal((await undo(id, kept, coach.token)).status, 200);
  assert.deepEqual(await captains(), ["p0"], "p0 holds it by the old flag: the one coming back is no captain");
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0}', '{\"id\": \"p0\", \"rowIndex\": 0}') WHERE id = $1", [id]);
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,1,isCaptain}', 'true') WHERE id = $1", [id]);
  const old = await insertFallen(client, id, { id: "p8", rowIndex: 0, captain: true }, false);
  assert.equal((await undo(id, old, coach.token)).status, 200);
  assert.deepEqual(await captains(), ["p1"], "and one who comes back with the old flag does not take it from p1");
}));

test("a player who is already on the roster is not put there twice, and his death is forgotten all the same", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const fid = await insertFallen(client, id, { id: "p3", rowIndex: 0, spp: { touchdowns: 9 } }, false);
  const { status, body } = await undo(id, fid, coach.token);
  assert.equal(status, 200);
  assert.deepEqual([body.team.roster.players.filter((player) => player.id === "p3"), body.team.roster.players.length], [[{ id: "p3", rowIndex: 0, spp: {} }], 11]);
  assert.deepEqual(await allFallen(client, id), []);
}));
