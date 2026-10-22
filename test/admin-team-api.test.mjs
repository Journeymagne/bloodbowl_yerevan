import test from "node:test";
import assert from "node:assert/strict";

import { callApi, loggingErrors, recording, seedCoach, seedTeam, sessionFor, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { coaches, startedFriendly, teams } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

// Stage 12, Task 5: the administration's own way into a coach's team — the treasury set to a sum with its reason (an
// `admin` line of the ledger), a death and its undo, and a fallen player added afterwards — on /api/admin/teams/:id/*.
// It is the repair path (the owner's answer to question 2 of the 09a plan): what a coach's route refuses while the team
// plays (TEAM_IN_MATCH), these take. `GET /api/admin/teams/:id` says whether the team plays and lists its matches.

const db = { skip: scratchSkip };
const NOBODY = "44444444-4444-4444-8444-444444444444";
const treasury = (teamId, token, body) => callApi("POST", `/api/admin/teams/${teamId}/treasury`, { token, body });
const death = (teamId, playerId, token, body) => callApi("POST", `/api/admin/teams/${teamId}/players/${playerId}/death`, { token, body });
const undo = (teamId, fallenId, token) => callApi("DELETE", `/api/admin/teams/${teamId}/fallen/${fallenId}`, { token });
const addFallen = (teamId, token, body) => callApi("POST", `/api/admin/teams/${teamId}/fallen`, { token, body });
const ledger = async (client, teamId) => (await client.query(`SELECT kind, reason, note, delta::float AS delta, balance_after::float AS balance_after,
    pairing_id, actor_user_id FROM team_ledger WHERE saved_team_id = $1 ORDER BY created_at`, [teamId])).rows;
const fallenRows = async (client, teamId) => (await client.query("SELECT * FROM team_fallen_players WHERE saved_team_id = $1 ORDER BY died_at, id", [teamId])).rows;
const refused = (answer, field, label) => assert.deepEqual([answer.status, answer.body?.error?.code, answer.body?.error?.params?.field], [400, "FIELD_INVALID", field], label);

/** A started friendly (both match rosters, no post-match yet), and an admin: the home team plays. */
async function liveMatchTeam(client) {
  await startedFriendly(client);
  const admin = await seedCoach(client, "boss", { admin: true });
  return { admin, coach: coaches.home, teamId: teams.home, playerId: "home-1" };
}

/** A friendly between two teams, its result as given (confirmed 2–1 by default). Returns the pairing's id. */
async function friendly(client, home, away, { status = "confirmed", score = [2, 1], confirmedAt = "2025-03-01T18:00:00Z" } = {}) {
  const { rows } = await client.query(`INSERT INTO season_pairings (match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id, result_status, home_touchdowns, away_touchdowns, home_casualties, away_casualties, confirmed_at)
    VALUES ('friendly', 1, $1, $2, $3, $4, $5, $6, $7, 0, 0, $8) RETURNING id`,
  [home.user, away.user, home.team, away.team, status, score?.[0] ?? null, score?.[1] ?? null, status === "confirmed" ? confirmedAt : null]);
  return rows[0].id;
}

/** A season with a started round `roundNumber`, both teams entered, and their league pairing as given. Returns the pairing's id. */
async function leaguePairing(client, home, away, { roundNumber = 3, status = "confirmed", score = [0, 3], confirmedAt = "2025-04-01T18:00:00Z" } = {}) {
  const { rows: [season] } = await client.query("INSERT INTO seasons (current_round, status) VALUES ($1, 'active') RETURNING id", [roundNumber]);
  const { rows: [round] } = await client.query("INSERT INTO season_rounds (season_id, round_number, status) VALUES ($1, $2, 'started') RETURNING id", [season.id, roundNumber]);
  const entry = async ({ user, team }) => (await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3) RETURNING id",
    [season.id, user, team])).rows[0].id;
  const [homeEntry, awayEntry] = [await entry(home), away ? await entry(away) : null];
  const { rows } = await client.query(`INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id, result_status,
      home_touchdowns, away_touchdowns, home_casualties, away_casualties, confirmed_at)
    VALUES ($1, 1, $2, $3, $4, $5, $6, 0, 0, $7) RETURNING id`,
  [round.id, homeEntry, awayEntry, status, score?.[0] ?? null, score?.[1] ?? null, status === "confirmed" ? confirmedAt : null]);
  return rows[0].id;
}

test("an admin's death and undo land while the team plays; a coach's are still refused", db, () => withApiDatabase(async ({ client }) => {
  const { admin, coach, teamId, playerId } = await liveMatchTeam(client); // a started match, both snapshots, no post-match
  const token = await sessionFor(client, admin.id);
  const revision = (await teamRow(client, teamId)).revision;
  const died = await callApi("POST", `/api/admin/teams/${teamId}/players/${playerId}/death`, { token, body: { cause: "Crowd", revision } });
  assert.equal(died.status, 201);
  const undo = await callApi("DELETE", `/api/admin/teams/${teamId}/fallen/${died.body.fallen.id}`, { token });
  assert.equal(undo.status, 200);
  const coachTry = await callApi("POST", `/api/teams/${teamId}/players/${playerId}/death`, { token: await sessionFor(client, coach.id), body: { cause: "x", revision: undo.body.team.revision } });
  assert.equal(coachTry.body.error.code, "TEAM_IN_MATCH");
}));

test("while the team plays, the admin's death is the admin's, a match's death is undone by the admin, the treasury is set; the coach's routes refuse each", db, () => withApiDatabase(async ({ client }) => {
  const { admin, coach, teamId } = await liveMatchTeam(client);
  const coachToken = await sessionFor(client, coach.id);
  const stale = await death(teamId, "home-2", admin.token, { cause: "Smoke", revision: 0 });
  assert.deepEqual([stale.status, stale.body.error.code, stale.body.team?.id], [409, "TEAM_SAVED_ELSEWHERE", teamId], "the revision is asked first");
  const died = await death(teamId, "home-2", admin.token, { cause: "Smoke", revision: 1 });
  assert.equal(died.status, 201);
  assert.deepEqual(Object.keys(died.body).sort(), ["fallen", "team"]);
  assert.deepEqual([died.body.fallen.player.id, died.body.fallen.fromMatch, died.body.team.revision], ["home-2", false, 2]);
  const [row] = await fallenRows(client, teamId);
  assert.deepEqual([row.recorded_by, row.from_match, row.pairing_id], [admin.id, false, null], "the admin recorded it, by hand");
  assert.ok(!(await teamRow(client, teamId)).roster.players.some((player) => player.id === "home-2"));
  // A death a match recorded: the coach may not undo it at all, and the admin may, while the team plays too.
  const { rows: [kept] } = await client.query(`INSERT INTO team_fallen_players (saved_team_id, player, cause, from_match)
    VALUES ($1, $2, 'match', true) RETURNING id`, [teamId, JSON.stringify({ id: "home-9", rowIndex: 0, number: "9", name: "Nine", spp: {} })]);
  const coachUndo = await callApi("DELETE", `/api/teams/${teamId}/fallen/${kept.id}`, { token: coachToken });
  assert.deepEqual([coachUndo.status, coachUndo.body.error.code], [422, "TEAM_IN_MATCH"], "the coach's route still refuses while the team plays");
  const back = await undo(teamId, kept.id, admin.token);
  assert.equal(back.status, 200);
  assert.deepEqual(Object.keys(back.body), ["team"]);
  assert.equal(back.body.team.roster.players.at(-1).id, "home-9");
  const set = await treasury(teamId, admin.token, { treasury: 170, note: "Fixed by the league", revision: back.body.team.revision });
  assert.deepEqual([set.status, set.body.team.roster.treasury, set.body.entry.delta], [200, 170, 20]);
  const coachEntry = await callApi("POST", `/api/teams/${teamId}/treasury`, { token: coachToken, body: { delta: 5, reason: "sponsor", revision: set.body.team.revision } });
  assert.deepEqual([coachEntry.status, coachEntry.body.error.code], [422, "TEAM_IN_MATCH"]);
  // The coach still may not undo a match's death once the match is over: FALLEN_FROM_MATCH, as before.
  const { rows: [again] } = await client.query(`INSERT INTO team_fallen_players (saved_team_id, player, cause, from_match)
    VALUES ($1, $2, 'match', true) RETURNING id`, [teamId, JSON.stringify({ id: "home-8", rowIndex: 0, spp: {} })]);
  await client.query("UPDATE season_pairings SET result_status = 'confirmed'");
  const settled = await callApi("DELETE", `/api/teams/${teamId}/fallen/${again.id}`, { token: coachToken });
  assert.deepEqual([settled.status, settled.body.error.code], [403, "FALLEN_FROM_MATCH"]);
}));

test("the admin's treasury: the value given, one line of the admin's with its reason, the revision moved; a stale revision is a 409 with the team", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc");
  const teamId = await seedTeam(client, coach.id, { roster: { treasury: 95, coachesSafe: 12, notes: "keep me" } });
  const before = await teamRow(client, teamId);
  const { result: set, log } = await recording(() => treasury(teamId, admin.token, { treasury: 120, note: "  Prize of the cup  ", revision: 1 }));
  assert.equal(set.status, 200);
  assert.deepEqual(Object.keys(set.body).sort(), ["entry", "team"]);
  assert.match(log[1], /^SELECT .* FROM saved_teams .* FOR UPDATE$/, "the team is locked first");
  assert.deepEqual([log[0], ...log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  const after = await teamRow(client, teamId);
  assert.deepEqual([after.roster.treasury, after.revision], [120, 2]);
  assert.deepEqual({ ...after.roster, treasury: 95 }, before.roster, "every other field of the roster is as it was");
  assert.deepEqual(await ledger(client, teamId), [{ kind: "admin", reason: null, note: "Prize of the cup", delta: 25, balance_after: 120, pairing_id: null, actor_user_id: admin.id }]);
  assert.deepEqual([set.body.entry.kind, set.body.entry.delta, set.body.entry.balanceAfter, set.body.entry.note], ["admin", 25, 120, "Prize of the cup"]);
  assert.deepEqual([set.body.team.id, set.body.team.revision, set.body.team.roster.treasury], [teamId, 2, 120]);
  // The same sum: nothing to write — no line, no revision.
  const same = await treasury(teamId, admin.token, { treasury: 120, note: "again", revision: 2 });
  assert.deepEqual([same.status, same.body.entry, same.body.team.revision], [200, null, 2]);
  assert.equal((await ledger(client, teamId)).length, 1);
  assert.equal((await teamRow(client, teamId)).revision, 2);
  // Down is a line too, with its sign.
  const down = await treasury(teamId, admin.token, { treasury: 70.5, note: "A fine", revision: 2 });
  assert.deepEqual([down.status, down.body.entry.delta, down.body.entry.balanceAfter], [200, -49.5, 70.5]);
  const settled = await teamRow(client, teamId);
  for (const [body, field, label] of [
    [{ treasury: 80, revision: 3 }, "note", "no reason"],
    [{ treasury: 80, note: "   ", revision: 3 }, "note", "a blank reason"],
    [{ treasury: 80, note: "a\u0000b", revision: 3 }, "note", "a NUL"],
    [{ treasury: 80, note: "x".repeat(201), revision: 3 }, "note", "201 characters"],
    [{ treasury: 80, note: 5, revision: 3 }, "note", "a reason that is no text"],
    [{ treasury: -5, note: "x", revision: 3 }, "treasury", "below zero"],
    [{ treasury: "80", note: "x", revision: 3 }, "treasury", "a sum as text"],
    [{ treasury: 80.0004, note: "x", revision: 3 }, "treasury", "less than a gold"],
    [{ treasury: 1e9, note: "x", revision: 3 }, "treasury", "more than the ledger holds"],
    [{ note: "x", revision: 3 }, "treasury", "no sum"],
  ]) refused(await treasury(teamId, admin.token, body), field, label);
  assert.ok((await treasury(teamId, admin.token, { treasury: 80, note: "x".repeat(200), revision: 3 })).status === 200, "200 characters are a reason");
  const now = await teamRow(client, teamId);
  const stale = await treasury(teamId, admin.token, { treasury: 10, note: "late", revision: settled.revision });
  assert.deepEqual([stale.status, stale.body.error.code, stale.body.team?.id, stale.body.team?.revision], [409, "TEAM_SAVED_ELSEWHERE", teamId, now.revision]);
  const none = await treasury(teamId, admin.token, { treasury: 10, note: "no revision" });
  assert.equal(none.body.error.code, "TEAM_SAVED_ELSEWHERE", "no revision is a revision that cannot match");
  assert.deepEqual(await teamRow(client, teamId), now, "a refusal writes nothing");
  assert.equal((await ledger(client, teamId)).length, 3);
  assert.equal((await treasury(NOBODY, admin.token, { treasury: 10, note: "x", revision: 1 })).body.error.code, "TEAM_NOT_FOUND");
}));

test("a fallen player added afterwards is a full record the undo can return", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc"), wolf = await seedCoach(client, "wolf");
  const teamId = await seedTeam(client, coach.id), wolves = await seedTeam(client, wolf.id, { name: "Wolves" });
  const pairingId = await leaguePairing(client, { user: coach.id, team: teamId }, { user: wolf.id, team: wolves }, { roundNumber: 4 });
  const before = await teamRow(client, teamId);
  const { result: added, log } = await recording(() => addFallen(teamId, admin.token, { player: { name: "Gorbag", position: "Blitzer", number: 7 }, cause: "Died before 3.0", pairingId, diedAt: "2025-03-01" }));
  assert.equal(added.status, 201);
  // The match named first, its key alone (a tap holds the pairing, then waits on the team: never a cycle), then the team.
  assert.match(log[1], /^SELECT 1 FROM season_pairings WHERE id = \$1 FOR KEY SHARE$/, "the pairing is held first");
  assert.match(log[2], /^SELECT .* FROM saved_teams .* FOR UPDATE$/, "then the team is locked");
  assert.deepEqual([log[0], ...log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  assert.ok(!log.some((sql) => sql.startsWith("UPDATE")), "the roster is not written");
  assert.deepEqual(Object.keys(added.body), ["fallen"]);
  const { fallen } = added.body;
  assert.deepEqual([fallen.cause, fallen.pairingId, fallen.roundNumber, fallen.fromMatch, new Date(fallen.diedAt).toISOString()],
    ["Died before 3.0", pairingId, 4, true, "2025-03-01T12:00:00.000Z"]);
  assert.deepEqual([fallen.player.rowIndex, fallen.player.name, fallen.player.number], [3, "Gorbag", "7"], "a Blitzer of the Humans, his name and number");
  assert.match(fallen.player.id, /^[0-9a-f-]{36}$/, "an id of his own");
  for (const key of ["statMods", "extraSkills", "favouredSkills", "spp", "advancements", "isCaptain", "absence"]) assert.ok(Object.hasOwn(fallen.player, key), `the full record: ${key}`);
  const [row] = await fallenRows(client, teamId);
  assert.deepEqual([row.id, row.from_match, row.pairing_id, row.recorded_by, row.cause, row.player], [fallen.id, true, pairingId, admin.id, "Died before 3.0", fallen.player]);
  assert.deepEqual(await teamRow(client, teamId), before, "the roster is not touched: he is not on it");
  const listed = await callApi("GET", `/api/teams/${teamId}/fallen`, { token: coach.token });
  assert.deepEqual(listed.body.fallen.map((item) => [item.id, item.roundNumber]), [[fallen.id, 4]], "the coach's list has him");
  const back = await undo(teamId, fallen.id, admin.token);
  assert.equal(back.status, 200);
  const returned = back.body.team.roster.players.at(-1);
  assert.deepEqual([returned.id, returned.rowIndex, returned.name, returned.number], [fallen.player.id, 3, "Gorbag", "7"]);
  assert.equal(back.body.team.roster.players.length, 12);
  assert.deepEqual(await fallenRows(client, teamId), []);
}));

test("what an afterwards death must name, and what it may not", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc"), wolf = await seedCoach(client, "wolf"), bear = await seedCoach(client, "bear");
  const teamId = await seedTeam(client, coach.id), wolves = await seedTeam(client, wolf.id, { name: "Wolves" }), bears = await seedTeam(client, bear.id, { name: "Bears" });
  const theirs = await friendly(client, { user: wolf.id, team: wolves }, { user: bear.id, team: bears });
  const pending = await friendly(client, { user: coach.id, team: teamId }, { user: wolf.id, team: wolves }, { status: "pending", score: null });
  const begun = await friendly(client, { user: coach.id, team: teamId }, { user: bear.id, team: bears }, { status: "pending", score: null });
  await client.query("UPDATE season_pairings SET preparation_status = 'in_progress' WHERE id = $1", [begun]);
  const bye = await leaguePairing(client, { user: coach.id, team: teamId }, null, { status: "pending", score: null });
  const good = { player: { name: "Gorbag", position: "Blitzer", number: 7 }, cause: "Died before 3.0" };
  const tomorrow = new Date(Date.now() + 2 * 86400000).toISOString().slice(0, 10);
  for (const [body, field, label] of [
    [{ ...good, player: { ...good.player, position: "Black Orc" } }, "position", "a position of another race"],
    [{ ...good, player: { ...good.player, position: undefined } }, "position", "no position"],
    [{ ...good, player: { ...good.player, number: 0 } }, "number", "number 0"],
    [{ ...good, player: { ...good.player, number: 100 } }, "number", "number 100"],
    [{ ...good, player: { ...good.player, number: 7.5 } }, "number", "a number that is no whole one"],
    [{ ...good, player: { ...good.player, number: "7" } }, "number", "a number as text"],
    [{ ...good, player: { ...good.player, name: "  " } }, "name", "an empty name"],
    [{ ...good, player: { ...good.player, name: "x".repeat(61) } }, "name", "61 characters"],
    [{ ...good, player: { ...good.player, name: "Gor\u0000bag" } }, "name", "a NUL"],
    [{ ...good, player: null }, "player", "no player"],
    [{ ...good, cause: "" }, "cause", "no cause"],
    [{ ...good, pairingId: theirs }, "pairingId", "a pairing of other teams"],
    [{ ...good, pairingId: pending }, "pairingId", "a match not begun"],
    [{ ...good, pairingId: bye }, "pairingId", "a bye: no match"],
    [{ ...good, pairingId: NOBODY }, "pairingId", "no such pairing"],
    [{ ...good, pairingId: "abc" }, "pairingId", "a pairing id that is no UUID"],
    [{ ...good, diedAt: tomorrow }, "diedAt", "a day to come"],
    [{ ...good, diedAt: new Date(Date.now() + 3600000).toISOString() }, "diedAt", "an hour to come"],
    [{ ...good, diedAt: "2025-02-30" }, "diedAt", "a day no calendar has"],
    [{ ...good, diedAt: "2025-03-01T10:00" }, "diedAt", "a time with no zone"],
    [{ ...good, diedAt: "yesterday" }, "diedAt", "no date"],
    [{ ...good, diedAt: 1740787200000 }, "diedAt", "a number"],
  ]) refused(await addFallen(teamId, admin.token, body), field, label);
  assert.deepEqual(await fallenRows(client, teamId), [], "a refusal writes nothing");
  // Without a pairing it is no match's death; a match the team played — its result confirmed, or begun (an abandoned
  // one) — is one.
  const plain = await addFallen(teamId, admin.token, { player: { name: " Ugluk ", position: "Human Lineman" }, cause: "Old age", pairingId: null });
  assert.equal(plain.status, 201);
  assert.deepEqual([plain.body.fallen.fromMatch, plain.body.fallen.pairingId, plain.body.fallen.player.name, plain.body.fallen.player.number, plain.body.fallen.player.rowIndex],
    [false, null, "Ugluk", "", 0], "no number given is none, not a «1» nobody wore");
  assert.ok(Math.abs(new Date(plain.body.fallen.diedAt) - Date.now()) < 60000, "no date is now");
  const inPending = await addFallen(teamId, admin.token, { ...good, pairingId: begun.toUpperCase(), diedAt: "2025-03-01T10:00:00+04:00" });
  assert.equal(inPending.status, 201);
  assert.deepEqual([inPending.body.fallen.fromMatch, inPending.body.fallen.pairingId, new Date(inPending.body.fallen.diedAt).toISOString()], [true, begun, "2025-03-01T06:00:00.000Z"]);
  assert.equal((await addFallen(NOBODY, admin.token, good)).body.error.code, "TEAM_NOT_FOUND");
}));

test("the admin's team says whether it plays and the matches it has played", db, () => withApiDatabase(async ({ client }) => {
  const { admin } = await liveMatchTeam(client);
  const read = async (teamId) => (await callApi("GET", `/api/admin/teams/${teamId}`, { token: admin.token })).body;
  const playing = await read(teams.home);
  assert.deepEqual([playing.inMatch, playing.matches, playing.team.id, playing.owner.id], [true, [], teams.home, coaches.home.id], "the started match is no match played");
  const home = { user: coaches.home.id, team: teams.home }, away = { user: coaches.away.id, team: teams.away };
  const lion = await seedCoach(client, "lion"), lions = await seedTeam(client, lion.id, { name: "Lions" });
  const older = await friendly(client, home, away, { score: [1, 1], confirmedAt: "2025-01-10T18:00:00Z" });
  const newer = await friendly(client, away, home, { score: [3, 0], confirmedAt: "2025-02-10T18:00:00Z" });
  await friendly(client, home, away, { status: "awaiting_confirmation", score: [2, 0] });
  const league = await leaguePairing(client, home, { user: lion.id, team: lions }, { roundNumber: 5, score: [0, 2], confirmedAt: "2025-03-10T18:00:00Z" });
  const { matches, inMatch } = await read(teams.home);
  assert.equal(inMatch, true);
  assert.deepEqual(matches.map((match) => ({ ...match, confirmedAt: new Date(match.confirmedAt).toISOString() })), [
    { id: league, kind: "league", roundNumber: 5, opponent: "Lions", score: [0, 2], confirmedAt: "2025-03-10T18:00:00.000Z" },
    { id: newer, kind: "friendly", roundNumber: null, opponent: "away", score: [0, 3], confirmedAt: "2025-02-10T18:00:00.000Z" },
    { id: older, kind: "friendly", roundNumber: null, opponent: "away", score: [1, 1], confirmedAt: "2025-01-10T18:00:00.000Z" },
  ], "confirmed only, newest first, the score from this team's side");
  const lionsPage = await read(lions);
  assert.deepEqual([lionsPage.inMatch, lionsPage.matches.map((match) => [match.opponent, match.score])], [false, [["home", [2, 0]]]]);
  // The match is over once its score is confirmed with no post-match opened.
  await client.query("UPDATE season_pairings SET result_status = 'confirmed', home_touchdowns = 1, away_touchdowns = 0, confirmed_at = '2025-05-01T18:00:00Z' WHERE match_kind = 'friendly' AND preparation_status = 'in_progress'");
  const over = await read(teams.home);
  assert.deepEqual([over.inMatch, over.matches[0].score, over.matches.length], [false, [1, 0], 4]);
}));

test("a bye is no match: a confirmed pairing with no opponent is not listed", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc");
  const teamId = await seedTeam(client, coach.id);
  await leaguePairing(client, { user: coach.id, team: teamId }, null, { roundNumber: 2, score: [2, 0] });
  const { body } = await callApi("GET", `/api/admin/teams/${teamId}`, { token: admin.token });
  assert.deepEqual([body.inMatch, body.matches], [false, []]);
}));

test("the admin's writes refuse a coach and a guest", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "orc"), teamId = await seedTeam(client, coach.id);
  const { rows: [kept] } = await client.query(`INSERT INTO team_fallen_players (saved_team_id, player, cause, from_match)
    VALUES ($1, $2, 'old', false) RETURNING id`, [teamId, JSON.stringify({ id: "p20", rowIndex: 0, spp: {} })]);
  const before = await teamRow(client, teamId);
  const routes = [
    ["POST", `/api/admin/teams/${teamId}/treasury`, { treasury: 5, note: "x", revision: 1 }],
    ["POST", `/api/admin/teams/${teamId}/players/p0/death`, { cause: "x", revision: 1 }],
    ["DELETE", `/api/admin/teams/${teamId}/fallen/${kept.id}`, undefined],
    ["POST", `/api/admin/teams/${teamId}/fallen`, { player: { name: "X", position: "Blitzer" }, cause: "x" }],
    ["GET", `/api/admin/teams/${teamId}`, undefined],
  ];
  for (const [method, path, body] of routes) {
    assert.deepEqual(((answer) => [answer.status, answer.body.error.code])(await callApi(method, path, { token: coach.token, body })), [403, "ADMIN_REQUIRED"], `the coach: ${method} ${path}`);
    assert.deepEqual(((answer) => [answer.status, answer.body.error.code])(await callApi(method, path, { body })), [401, "NOT_AUTHORIZED"], `a guest: ${method} ${path}`);
  }
  assert.deepEqual(await teamRow(client, teamId), before);
  assert.deepEqual((await fallenRows(client, teamId)).map((row) => row.id), [kept.id]);
  assert.deepEqual(await ledger(client, teamId), []);
}));

test("a body that is no JSON, or JSON whose root is no object, is a 400 for the body on the admin's writes, and never a 500", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "orc"), teamId = await seedTeam(client, coach.id);
  const before = await teamRow(client, teamId);
  const { result: answers, logged } = await loggingErrors(async () => {
    const all = [];
    for (const path of [`/api/admin/teams/${teamId}/treasury`, `/api/admin/teams/${teamId}/players/p0/death`, `/api/admin/teams/${teamId}/fallen`]) {
      for (const raw of ['{"cause":', "null", "[]", "5", '"x"']) {
        const { status, body } = await callApi("POST", path, { token: admin.token, raw });
        all.push([`${path} ${raw}`, [status, body?.error?.code, body?.error?.params]]);
      }
    }
    return all;
  });
  for (const [label, answer] of answers) assert.deepEqual(answer, [400, "FIELD_INVALID", { field: "body" }], label);
  assert.deepEqual(logged, []);
  assert.deepEqual(await teamRow(client, teamId), before);
}));
