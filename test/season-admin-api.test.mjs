/**
 * The admin's season on the server (stage 12, Task 3): the season's playoff places, every score awaiting
 * confirmation, each team's stage and treasury in the admin's block, and a pairing's post-match status in
 * `/api/season` (pre-flight L5). On a scratch database, through the API chain.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { callApi, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { id } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const SEASON = id(61), OLD_SEASON = id(60), ROUNDS = { closed: id(71), current: id(72), old: id(70) };
const P = { closed: id(81), current: id(82), friendly: id(83), confirmed: id(84), pending: id(85), old: id(86), friendlyPending: id(87) };

const settings = (token, body) => callApi("PATCH", "/api/season/admin/settings", { token, body });
const seasonRow = async (client) => (await client.query("SELECT * FROM seasons WHERE status = 'active'")).rows[0];
const refusal = (answer) => [answer.status, answer.body.error.code, answer.body.error.params];

/** A row of `season_pairings` with exactly `fields`. */
async function pairing(client, pairingId, fields) {
  const columns = Object.keys(fields);
  await client.query(`INSERT INTO season_pairings (id, ${columns.join(", ")}) VALUES ($1, ${columns.map((_, n) => `$${n + 2}`).join(", ")})`,
    [pairingId, ...Object.values(fields)]);
}

/** A score a coach proposed and the other side has not answered yet. */
const awaiting = (by, [home, away], at) => ({ result_status: "awaiting_confirmation", proposed_by_user_id: by, proposed_home_touchdowns: home,
  proposed_away_touchdowns: away, proposed_home_casualties: 1, proposed_away_casualties: 0, proposed_at: at });

test("an admin sets the playoff places, and takes them away; the season says them to everyone", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  const coach = await seedCoach(client, "orc");
  assert.equal((await callApi("GET", "/api/season")).body.season.playoffPlaces, null, "no zone until the admin sets one");

  const before = await seasonRow(client);
  const set = await settings(admin.token, { playoffPlaces: 4 });
  assert.equal(set.status, 200);
  assert.equal(set.body.season.playoffPlaces, 4);
  assert.ok(set.body.admin, "the answer is the admin's season");
  const after = await seasonRow(client);
  assert.equal(after.playoff_places, 4);
  assert.ok(after.updated_at > before.updated_at, "the season's stamp moves");
  assert.deepEqual({ ...after, playoff_places: null, updated_at: null }, { ...before, playoff_places: null, updated_at: null }, "nothing else");
  for (const token of [undefined, coach.token]) {
    assert.equal((await callApi("GET", "/api/season", { token })).body.season.playoffPlaces, 4, "a guest and a coach read it too");
  }

  for (const playoffPlaces of [0, 65, -1, 2.5, "4", true, ""]) {
    assert.deepEqual(refusal(await settings(admin.token, { playoffPlaces })), [400, "FIELD_INVALID", { field: "playoffPlaces" }], `${JSON.stringify(playoffPlaces)} is refused`);
  }
  assert.deepEqual(refusal(await settings(admin.token, {})), [400, "FIELD_INVALID", { field: "playoffPlaces" }], "a body without the field is no setting");
  assert.deepEqual(refusal(await settings(coach.token, { playoffPlaces: 8 })), [403, "ADMIN_REQUIRED", {}]);
  assert.deepEqual(refusal(await settings(undefined, { playoffPlaces: 8 })), [401, "NOT_AUTHORIZED", {}]);
  assert.deepEqual(await seasonRow(client), after, "a refusal writes nothing");

  for (const playoffPlaces of [1, 64]) {
    assert.equal((await settings(admin.token, { playoffPlaces })).body.season.playoffPlaces, playoffPlaces, `${playoffPlaces} is a place count`);
  }
  const cleared = await settings(admin.token, { playoffPlaces: null });
  assert.equal(cleared.status, 200);
  assert.equal(cleared.body.season.playoffPlaces, null);
  assert.equal((await seasonRow(client)).playoff_places, null);
  assert.equal((await callApi("GET", "/api/season")).body.season.playoffPlaces, null, "the zone is gone for everyone");
}));

test("the scores awaiting confirmation: the league's of any round and the friendlies', nothing else", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  const coaches = {};
  const teams = {};
  for (const login of ["orc", "elf", "dwarf", "skaven"]) {
    coaches[login] = await seedCoach(client, login);
    teams[login] = await seedTeam(client, coaches[login].id, { name: `${login} team` });
  }
  await client.query("INSERT INTO seasons (id, name, status, current_round) VALUES ($1, 'Season 0', 'completed', 1), ($2, 'Season 1', 'active', 2)", [OLD_SEASON, SEASON]);
  await client.query(`INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $4, 1, 'started'), ($2, $5, 1, 'started'),
    ($3, $5, 2, 'started')`, [ROUNDS.old, ROUNDS.closed, ROUNDS.current, OLD_SEASON, SEASON]);
  const entries = {};
  for (const [seasonId, logins] of [[SEASON, Object.keys(coaches)], [OLD_SEASON, ["orc", "elf"]]]) {
    for (const login of logins) {
      const { rows } = await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3) RETURNING id",
        [seasonId, coaches[login].id, teams[login]]);
      entries[`${seasonId}/${login}`] = rows[0].id;
    }
  }
  const league = (round, table, [home, away], seasonId = SEASON) => ({ round_id: round, table_number: table,
    home_entry_id: entries[`${seasonId}/${home}`], away_entry_id: entries[`${seasonId}/${away}`] });
  const friendly = (table, [home, away]) => ({ match_kind: "friendly", table_number: table, friendly_home_user_id: coaches[home].id,
    friendly_away_user_id: coaches[away].id, friendly_home_team_id: teams[home], friendly_away_team_id: teams[away] });
  // Created in this order, so neither the creation nor the table gives the order the list must have.
  await pairing(client, P.closed, { ...league(ROUNDS.closed, 1, ["orc", "elf"]), ...awaiting(coaches.orc.id, [2, 1], "2026-10-03T10:00:00Z") });
  await pairing(client, P.pending, league(ROUNDS.closed, 2, ["dwarf", "skaven"]));
  await pairing(client, P.confirmed, { ...league(ROUNDS.current, 1, ["orc", "dwarf"]), result_status: "confirmed", home_touchdowns: 1,
    away_touchdowns: 0, home_casualties: 0, away_casualties: 0, home_points: 3, away_points: 0, confirmed_at: "2026-10-04T10:00:00Z" });
  await pairing(client, P.current, { ...league(ROUNDS.current, 2, ["elf", "skaven"]), ...awaiting(coaches.skaven.id, [0, 3], "2026-10-01T10:00:00Z") });
  await pairing(client, P.friendly, { ...friendly(1, ["dwarf", "elf"]), ...awaiting(coaches.elf.id, [1, 1], "2026-10-02T10:00:00Z") });
  await pairing(client, P.friendlyPending, friendly(2, ["orc", "skaven"]));
  await pairing(client, P.old, { ...league(ROUNDS.old, 1, ["orc", "elf"], OLD_SEASON), ...awaiting(coaches.elf.id, [4, 0], "2026-09-01T10:00:00Z") });
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, '{\"status\": \"draft\"}')", [P.closed]);

  const answer = await callApi("GET", "/api/admin/awaiting", { token: admin.token });
  assert.equal(answer.status, 200);
  const { games } = answer.body;
  assert.deepEqual(games.map((game) => game.id), [P.current, P.friendly, P.closed],
    "the current round's, the friendly and the closed round's, by when they were proposed; not the other season's, the confirmed or the pending");
  assert.deepEqual(games.map((game) => [game.kind, game.roundNumber, game.resultStatus]),
    [["league", 2, "awaiting_confirmation"], ["friendly", 0, "awaiting_confirmation"], ["league", 1, "awaiting_confirmation"]]);
  assert.deepEqual(games.map((game) => [game.proposedHomeTouchdowns, game.proposedAwayTouchdowns, game.proposedByUserId]),
    [[0, 3, coaches.skaven.id], [1, 1, coaches.elf.id], [2, 1, coaches.orc.id]]);
  assert.deepEqual(games.map((game) => [game.home.team.name, game.away.team.name, game.home.user.login]),
    [["elf team", "skaven team", "elf"], ["dwarf team", "elf team", "dwarf"], ["orc team", "elf team", "orc"]]);
  assert.deepEqual(games.map((game) => game.season?.name ?? null), ["Season 1", null, "Season 1"]);
  assert.deepEqual(games.map((game) => game.postMatchStatus), ["not_started", "not_started", "draft"], "a game says whether its post-match is open");

  assert.deepEqual(refusal(await callApi("GET", "/api/admin/awaiting", { token: coaches.orc.token })), [403, "ADMIN_REQUIRED", {}]);
  assert.deepEqual(refusal(await callApi("GET", "/api/admin/awaiting")), [401, "NOT_AUTHORIZED", {}]);
}));

test("the admin's season names each team's stage and treasury", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true });
  const coach = await seedCoach(client, "orc");
  const draft = await seedTeam(client, coach.id, { name: "Grimtusk Raiders", slug: "teams/orc", players: 0, stage: "draft", roster: { treasury: 450 } });
  const active = await seedTeam(client, coach.id, { name: "Lions" });
  const empty = await seedTeam(client, admin.id, { name: "Nobody's", players: 0, stage: "draft", roster: { treasury: undefined } });

  const answer = await callApi("GET", "/api/season", { token: admin.token });
  assert.equal(answer.status, 200);
  const shown = Object.fromEntries(answer.body.admin.savedTeams.map((team) => [team.id, team]));
  assert.deepEqual([shown[draft].stage, shown[draft].treasury], ["draft", 450]);
  assert.deepEqual([shown[active].stage, shown[active].treasury], ["active", 100]);
  assert.deepEqual([shown[empty].stage, shown[empty].treasury], ["draft", 0], "a roster with no treasury holds none");
  assert.deepEqual([shown[draft].name, shown[draft].baseTeamSlug, shown[draft].owner.login], ["Grimtusk Raiders", "teams/orc", "orc"]);
  assert.deepEqual([shown[draft].roster, shown[draft].logoData], [{}, null], "still no roster and no logo in the list");

  for (const token of [coach.token, undefined]) {
    const season = await callApi("GET", "/api/season", { token });
    assert.equal(season.status, 200);
    assert.equal(Object.hasOwn(season.body, "admin"), false, "a coach and a guest get no admin block");
  }
}));

test("a pair with a post-match says so in /api/season", db, () => withApiDatabase(async ({ client }) => {
  const coaches = {};
  const entries = {};
  await client.query("INSERT INTO seasons (id, name, status, current_round) VALUES ($1, 'Season 1', 'active', 1)", [SEASON]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [ROUNDS.current, SEASON]);
  for (const login of ["orc", "elf", "dwarf", "skaven", "gnome", "human"]) {
    coaches[login] = await seedCoach(client, login);
    const team = await seedTeam(client, coaches[login].id, { name: `${login} team` });
    const { rows } = await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3) RETURNING id",
      [SEASON, coaches[login].id, team]);
    entries[login] = rows[0].id;
  }
  const tables = [[P.current, "orc", "elf", "draft"], [P.confirmed, "dwarf", "skaven", "completed"], [P.pending, "gnome", "human", null]];
  for (const [pairingId, home, away, status] of tables) {
    await pairing(client, pairingId, { round_id: ROUNDS.current, table_number: tables.findIndex((row) => row[0] === pairingId) + 1,
      home_entry_id: entries[home], away_entry_id: entries[away] });
    if (status) await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [pairingId, JSON.stringify({ status })]);
  }

  for (const token of [undefined, coaches.orc.token]) {
    const season = (await callApi("GET", "/api/season", { token })).body;
    const statuses = Object.fromEntries(season.rounds.flatMap((round) => round.pairings).map((one) => [one.id, one.postMatchStatus]));
    assert.deepEqual(statuses, { [P.current]: "draft", [P.confirmed]: "completed", [P.pending]: "not_started" });
  }
}));
