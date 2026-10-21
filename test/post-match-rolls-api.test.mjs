/**
 * The site's dice in the post-match (stage 09b): `POST /api/games/:id/post-match/rolls`, the advancement that
 * names a roll, checked under the post-match's locks, and the finish that uses it.
 *
 * A friendly that has started (test/helpers/match-db.mjs): the post-match takes the home roster as it is when
 * it is first read, so a player's SPP are set before that.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

import { matchReference } from "../server/domain/match-reference.mjs";
import { loadTeamReference } from "../server/domain/roster.mjs";
import { accessPostMatch, rollInPostMatch } from "../server/season/post-match.mjs";
import { postPoints } from "../src/domain/post-match/score.mjs";
import { callApi, seedCoach, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { G, SIDES, act, coaches, homeScores, id, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

// The race the server's dice read a player through, loaded as the server loads it at boot.
await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const db = { skip: scratchSkip };
const ask = (token, body) => callApi("POST", `/api/games/${G}/post-match/rolls`, { token, body });
const RANDOM = { purpose: "random_skill", category: "General" };
/** The home team's rolls, in the order they were rolled. */
const rollsOf = async (client) => (await client.query(
  "SELECT id, player_id, purpose, used_at FROM dice_rolls WHERE saved_team_id = $1 ORDER BY created_at, id", [teams.home])).rows;
/** Bonus SPP for a home player, before the post-match is first read. */
const withSpp = (client, index, bonus) => client.query("UPDATE saved_teams SET roster = jsonb_set(roster, $2::text[], $3::jsonb) WHERE id = $1",
  [teams.home, `{players,${index},spp}`, JSON.stringify({ bonus })]);
const revision = async () => (await accessPostMatch(G, coaches.home)).postMatch.revision;
/** The home side's Players step saved as the events read it, a TD for home-0 and home-6 its MVP. */
const saveHome = (state) => act("home", state, { type: "statistics", statistics: homeScores("home", state.home), mvps: ["home-6"] });
const site = (roll) => ({ id: roll.id, via: "site" });
const takeRandom = (state, playerId, roll, skill = roll.result.dice[0].skill) =>
  act("home", state, { type: "advance", playerId, advancementType: "random", grant: { skill }, roll: site(roll) });
const general = async () => (await matchReference()).skillGroups.find((group) => group.category === "General").skills;

/** Every step after the Players step, both sides at it, up to ready. */
async function lockedToReady(state) {
  for (const name of SIDES) state = await act(name, state, { type: "lock-roster" });
  for (const name of SIDES) state = await act(name, state, { type: "finance", deposit: 0, mistake: { roll: 6 } });
  for (const name of SIDES) state = await act(name, state, { type: "next", captain: `${name}-0` });
  for (const name of SIDES) state = await act(name, state, { type: "confirm" });
  assert.equal(state.status, "ready");
  return state;
}

test("a roll of the post-match is the side's coach's, on the Players step, for a roster player, by the roster the post-match holds", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,1,spp}', '{\"bonus\": 30}') WHERE id = $1", [teams.home]);
  await toPlayersStep(); // both sides at stage 2; the post-match takes the roster as it is now
  const token = await sessionFor(client, coaches.home.id);
  const answer = await ask(token, { playerId: "home-1", ...RANDOM });
  assert.equal(answer.status, 200, JSON.stringify(answer.body));
  assert.equal(answer.body.roll.playerId, "home-1");
  assert.equal(answer.body.roll.result.dice.length, 2);
  assert.equal(answer.body.roll.usedAt, null);
  const away = await sessionFor(client, coaches.away.id);
  assert.equal((await ask(away, { side: "home", playerId: "home-1", purpose: "stat" })).status, 403);
  const admin = await sessionFor(client, (await seedCoach(client, "boss", { admin: true })).id);
  assert.equal((await ask(admin, { side: "home", playerId: "home-1", purpose: "stat" })).status, 403);
  assert.equal((await ask(admin, { playerId: "home-1", purpose: "stat" })).status, 403, "an admin rolls for neither side");
  assert.equal((await ask(token, { side: "moon", playerId: "home-1", purpose: "stat" })).status, 403);
  assert.equal((await ask(token, { playerId: "nobody", purpose: "stat" })).body.error.code, "PLAYER_NOT_FOUND");
  assert.equal((await ask(token, { playerId: "away-1", purpose: "stat" })).body.error.code, "PLAYER_NOT_FOUND", "a player of the other side");
  assert.equal((await ask(undefined, { playerId: "home-1", purpose: "stat" })).status, 401);
  const badBody = await callApi("POST", `/api/games/${G}/post-match/rolls`, { token, raw: "[]" });
  assert.deepEqual([badBody.status, badBody.body.error.code, badBody.body.error.params], [400, "FIELD_INVALID", { field: "body" }]);
  const noPurpose = await ask(token, { playerId: "home-1" });
  assert.deepEqual([noPurpose.status, noPurpose.body.error.params], [400, { field: "purpose" }]);
  assert.equal((await callApi("GET", `/api/games/${G}/post-match/rolls`, { token })).status, 405);
  // The team's own route stays shut while the team plays: the post-match's dice are the post-match's.
  const team = await callApi("POST", `/api/teams/${teams.home}/players/home-1/rolls`, { token, body: RANDOM });
  assert.deepEqual([team.status, team.body.error.code], [422, "TEAM_IN_MATCH"]);
  // A player dead in this match — the team past rookie protection — advances no more, so no roll waits for him.
  await client.query("UPDATE match_post_games SET state = jsonb_set(state, '{home,gamesPlayed}', '3') WHERE pairing_id = $1", [G]);
  const opened = (await accessPostMatch(G, coaches.home)).postMatch;
  await act("home", opened, { type: "statistics", statistics: homeScores("home", opened.home), mvps: ["home-6"], injuries: { "home-2": { code: "dead" } } });
  assert.equal((await ask(token, { playerId: "home-2", purpose: "stat" })).body.error.code, "PLAYER_NOT_FOUND");
  assert.deepEqual((await rollsOf(client)).map((row) => row.id), [answer.body.roll.id]);
}));

test("asked again it is the same roll; asked for the other purpose it is DICE_ROLL_WAITING", db, () => withApiDatabase(async ({ client, url }) => {
  await startedFriendly(client);
  await toPlayersStep();
  const token = await sessionFor(client, coaches.home.id), before = await revision();
  const first = await ask(token, { playerId: "home-1", ...RANDOM });
  assert.equal((await ask(token, { playerId: "home-1", ...RANDOM })).body.roll.id, first.body.roll.id);
  const other = await ask(token, { playerId: "home-1", purpose: "stat" });
  assert.deepEqual([other.status, other.body.error.code, other.body.error.params], [409, "DICE_ROLL_WAITING", { purpose: "random_skill" }]);
  // Two asks at once queue on the pairing, the post-match's first lock: one roll.
  const both = await withForcedOverlap(url, { lock: lockRow("season_pairings", G), waiting: 2 },
    [() => ask(token, { playerId: "home-2", purpose: "stat" }), () => ask(token, { playerId: "home-2", purpose: "stat" })]);
  assert.deepEqual(both.map((result) => result.value?.status), [200, 200]);
  assert.equal(both[0].value.body.roll.id, both[1].value.body.roll.id);
  assert.deepEqual((await rollsOf(client)).map((row) => row.player_id), ["home-1", "home-2"]);
  assert.equal(await revision(), before, "a roll leaves the post-match as it was");
}));

test("the roll is by the post-match's roster: a skill taken in this post-match is not rolled", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 30);
  let state = await act("home", await toPlayersStep(), { type: "advance", playerId: "home-1", advancementType: "primary", grant: { skill: "Block" } });
  const column = await general(), others = column.filter((skill) => skill !== "Block");
  const face = (skill) => column.indexOf(skill) + 1, faces = [face("Block"), face(others[0]), face(others[1])];
  const roll = await rollInPostMatch(G, coaches.home, RANDOM, { playerId: "home-1" }, { rng: () => faces.shift() });
  assert.deepEqual(roll.result.dice[0].attempts, [{ roll: face("Block"), skill: "Block", duplicate: true }, { roll: face(others[0]), skill: others[0], duplicate: false }]);
  assert.deepEqual(roll.result.dice.map((die) => die.skill), [others[0], others[1]]);
  // The roll was thrown again against Block: an advancement takes it only while the player holds Block.
  state = await act("home", state, { type: "undo-advance", playerId: "home-1" });
  await assert.rejects(takeRandom(state, "home-1", roll), { status: 422, code: "DICE_ROLL_MISMATCH", params: { playerId: "home-1" } });
  state = await act("home", state, { type: "advance", playerId: "home-1", advancementType: "primary", grant: { skill: "Block" } });
  state = await takeRandom(state, "home-1", roll);
  assert.deepEqual(state.home.advancements["home-1"].map((choice) => choice.type), ["primary", "random"]);
}));

test("a roll both of whose skills the player has taken here since comes back stale, not a fresh die", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 60);
  let state = await toPlayersStep();
  const token = await sessionFor(client, coaches.home.id), roll = (await ask(token, { playerId: "home-1", ...RANDOM })).body.roll;
  for (const die of roll.result.dice) state = await act("home", state, { type: "advance", playerId: "home-1", advancementType: "primary", grant: { skill: die.skill } });
  const again = await ask(token, { playerId: "home-1", ...RANDOM });
  assert.deepEqual([again.status, again.body.roll.id, again.body.roll.stale], [200, roll.id, true], "by the roster the post-match holds (the T3 review's M-2)");
  assert.equal((await rollsOf(client)).length, 1);
}));

test("not on the Players step, or the post-match finished: nothing is rolled", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id), refused = async (code) => {
    const answer = await ask(token, { playerId: "home-1", purpose: "stat" });
    assert.deepEqual([answer.status, answer.body.error.code], [409, code]);
  };
  await accessPostMatch(G, coaches.home);
  await refused("POST_ACTION"); // no score yet
  let state = await saveHome(await toPlayersStep());
  await client.query("UPDATE saved_teams SET revision = revision + 1 WHERE id = $1", [teams.home]);
  await refused("POST_TEAM_CHANGED"); // the post-match's roster is no longer the team's: nothing to roll by
  await client.query("UPDATE saved_teams SET revision = revision - 1 WHERE id = $1", [teams.home]);
  state = await act("home", state, { type: "lock-players" });
  await refused("POST_ACTION");
  state = await act("away", state, { type: "statistics", statistics: state.away.statistics, mvps: ["away-6"] });
  state = await lockedToReady(await act("away", state, { type: "lock-players" }));
  await refused("POST_ACTION"); // confirmed
  assert.equal((await act("home", state, null, true)).status, "completed");
  await refused("POST_CLOSED");
  assert.deepEqual(await rollsOf(client), []);
}));

test("the domain's refusal comes before the roll's; a pairing id that is no UUID is no route (the T3 review's M-4, M-6)", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const token = await sessionFor(client, coaches.home.id);
  const bad = await callApi("POST", "/api/games/abc/post-match/rolls", { token, body: { playerId: "home-1", purpose: "stat" } });
  assert.deepEqual([bad.status, bad.body.error.code], [404, "ROUTE_NOT_FOUND"]);
  for (const path of ["/api/games/abc/post-match", "/api/games/0000/finish"]) assert.equal((await callApi("GET", path, { token })).status, 404, path);
  // Past the Players step a site roll named is the step's refusal, not «no such roll».
  const state = await act("home", await saveHome(await toPlayersStep()), { type: "lock-players" });
  const stray = { type: "advance", playerId: "home-1", advancementType: "random", grant: { skill: "Block" }, roll: { id: id(99), via: "site" } };
  await assert.rejects(act("home", state, stray), { code: "POST_ACTION" });
}));

test("an advancement naming another player's, a used or an unfitting roll is refused and writes nothing", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 30);
  await withSpp(client, 2, 30);
  let state = await saveHome(await toPlayersStep());
  const token = await sessionFor(client, coaches.home.id), roll = (await ask(token, { playerId: "home-1", ...RANDOM })).body.roll;
  const awayRoll = (await ask(await sessionFor(client, coaches.away.id), { playerId: "away-1", purpose: "stat" })).body.roll;
  const mismatch = (playerId) => ({ status: 422, code: "DICE_ROLL_MISMATCH", params: { playerId } });
  const unrolled = (await general()).find((skill) => !roll.result.dice.some((die) => die.skill === skill));
  const advance = (playerId, advancementType, grant, named) => act("home", state, { type: "advance", playerId, advancementType, grant, roll: named });
  await assert.rejects(takeRandom(state, "home-2", roll), mismatch("home-2"));
  await assert.rejects(takeRandom(state, "home-1", roll, unrolled), mismatch("home-1"));
  await assert.rejects(advance("home-1", "stat", { stat: "ma" }, site(roll)), mismatch("home-1"));
  await assert.rejects(advance("home-1", "random", { skill: roll.result.dice[0].skill }, { id: "a-roll", via: "site" }), mismatch("home-1"));
  await assert.rejects(advance("home-1", "random", { skill: roll.result.dice[0].skill }, { id: roll.id.toUpperCase(), via: "site" }), mismatch("home-1"));
  await assert.rejects(advance("home-1", "random", { skill: roll.result.dice[0].skill }, { id: id(99), via: "site" }), mismatch("home-1"));
  await assert.rejects(advance("home-1", "stat", { stat: "ma" }, site(awayRoll)), mismatch("home-1"), "a roll of the other team");
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [roll.id]);
  await assert.rejects(takeRandom(state, "home-1", roll), { status: 409, code: "DICE_ROLL_USED" });
  await client.query("UPDATE dice_rolls SET used_at = NULL WHERE id = $1", [roll.id]);
  assert.equal(await revision(), state.revision, "no refusal moved the post-match");
  state = await takeRandom(state, "home-1", roll);
  await assert.rejects(takeRandom(state, "home-1", roll, roll.result.dice[1].skill), { status: 409, code: "DICE_ROLL_USED" }, "one roll, one advancement");
  assert.ok((await rollsOf(client)).every((row) => row.used_at === null), "the finish uses a roll, not the advancement");
}));

test("a second advancement of the same player gets a fresh roll; the undo of the last frees it, last first", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 60);
  let state = await saveHome(await toPlayersStep());
  const token = await sessionFor(client, coaches.home.id), asking = (body) => ask(token, { playerId: "home-1", ...body });
  const first = (await asking(RANDOM)).body.roll;
  state = await takeRandom(state, "home-1", first);
  const second = await asking({ purpose: "stat" });
  assert.equal(second.status, 200, JSON.stringify(second.body));
  assert.notEqual(second.body.roll.id, first.id);
  assert.equal((await asking({ purpose: "stat" })).body.roll.id, second.body.roll.id);
  const stat = { type: "advance", playerId: "home-1", advancementType: "stat", grant: { stat: second.body.roll.result.stats[0] }, roll: site(second.body.roll) };
  state = await act("home", state, stat);
  assert.deepEqual(state.home.advancements["home-1"].map((choice) => choice.roll.id), [first.id, second.body.roll.id]);
  state = await act("home", state, { type: "undo-advance", playerId: "home-1" });
  assert.deepEqual((await asking(RANDOM)).body.error.params, { purpose: "stat" });
  assert.equal((await asking({ purpose: "stat" })).body.roll.id, second.body.roll.id);
  state = await act("home", state, { type: "undo-advance", playerId: "home-1" });
  assert.deepEqual((await asking({ purpose: "stat" })).body.error.params, { purpose: "random_skill" });
  assert.equal((await asking(RANDOM)).body.roll.id, first.id);
  await assert.rejects(act("home", state, stat), { status: 409, code: "DICE_ROLL_USED" }, "the earlier roll is taken first");
  assert.equal((await rollsOf(client)).length, 2);
}));

test("an undone advancement leaves its roll waiting", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 30);
  let state = await saveHome(await toPlayersStep());
  const token = await sessionFor(client, coaches.home.id), roll = (await ask(token, { playerId: "home-1", ...RANDOM })).body.roll;
  state = await act("home", await takeRandom(state, "home-1", roll), { type: "undo-advance", playerId: "home-1" });
  assert.deepEqual(state.home.advancements["home-1"], []);
  assert.equal((await ask(token, { playerId: "home-1", ...RANDOM })).body.roll.id, roll.id);
  assert.deepEqual((await rollsOf(client)).map((row) => [row.id, row.used_at]), [[roll.id, null]]);
  await takeRandom(state, "home-1", roll);
}));

test("the finish uses the roll once; a refused finish uses none", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  await withSpp(client, 1, 30);
  let state = await saveHome(await toPlayersStep());
  const token = await sessionFor(client, coaches.home.id), roll = (await ask(token, { playerId: "home-1", ...RANDOM })).body.roll;
  const skill = roll.result.dice[1].skill, usedAt = async (named = roll) => (await client.query("SELECT used_at FROM dice_rolls WHERE id = $1", [named.id])).rows[0].used_at;
  // A roll no advancement names waits on through the finish (the T3 review's M-1).
  const unnamed = (await ask(token, { playerId: "home-2", purpose: "stat" })).body.roll;
  state = await act("home", await takeRandom(state, "home-1", roll, skill), { type: "lock-players" });
  state = await act("away", state, { type: "statistics", statistics: state.away.statistics, mvps: ["away-6"] });
  state = await lockedToReady(await act("away", state, { type: "lock-players" }));
  // The home side's roll is used inside the finish before the away side is found changed: all of it goes back.
  await client.query("UPDATE saved_teams SET revision = revision + 1 WHERE id = $1", [teams.away]);
  await assert.rejects(act("home", state, null, true), { code: "POST_TEAM_CHANGED" });
  assert.equal(await usedAt(), null);
  state = await act("away", state, { type: "reset-side" });
  // The reset side goes through its steps again; the home side, put back to the finance step, goes on from there.
  for (const action of [{ type: "fans", roll: 3 }, { type: "statistics", statistics: state.away.statistics, mvps: ["away-6"] }, { type: "lock-players" },
    { type: "lock-roster" }, { type: "finance", deposit: 0, mistake: { roll: 6 } }, { type: "next", captain: "away-0" }, { type: "confirm" }]) state = await act("away", state, action);
  for (const action of [{ type: "finance", deposit: 0, mistake: { roll: 6 } }, { type: "next", captain: "home-0" }, { type: "confirm" }]) state = await act("home", state, action);
  assert.deepEqual(state.home.advancements["home-1"].map((choice) => choice.roll), [site(roll)], "the advancement outlives the other side's reset");
  assert.equal((await act("home", state, null, true)).status, "completed");
  const used = await usedAt();
  assert.ok(used instanceof Date);
  assert.equal((await act("away", state, null, true)).status, "completed", "the other coach's finish answers the finished post-match");
  assert.deepEqual(await usedAt(), used, "and uses nothing again");
  assert.equal(await usedAt(unnamed), null, "only the rolls the advancements name are used");
  const blob = (await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teams.home])).rows[0].roster;
  assert.deepEqual(blob.players.find((player) => player.id === "home-1").advancements, [{ type: "random", grants: { skill }, roll: site(roll) }]);
  const pairing = (await client.query("SELECT home_points, away_points FROM season_pairings WHERE id = $1", [G])).rows[0];
  assert.deepEqual(pairing, { home_points: 0, away_points: 0 }, "a friendly is out of the table");
}));

test("a player who dies in the post-match keeps his used rolls used, as a death marked by hand does: undone, he is rolled afresh", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  // home-2 took a characteristic on the site's D8 before the match: the roll is used, his advancement names it.
  const { rows: [old] } = await client.query(`INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, used_at)
    VALUES ($1, 'home-2', 'stat', '{"sides": 8}', '{"roll": 2, "stats": ["ma", "pa"]}', now()) RETURNING id`, [teams.home]);
  const advancements = [{ type: "stat", grants: { stat: "ma" }, roll: site(old) }];
  await client.query("UPDATE saved_teams SET roster = jsonb_set(jsonb_set(roster, '{players,2,advancements}', $2::jsonb), '{players,2,spp}', $3::jsonb) WHERE id = $1",
    [teams.home, JSON.stringify(advancements), JSON.stringify({ bonus: 14 })]);
  let state = await toPlayersStep();
  // Past rookie protection: the death stands.
  await client.query("UPDATE match_post_games SET state = jsonb_set(state, '{home,gamesPlayed}', '3') WHERE pairing_id = $1", [G]);
  state = (await accessPostMatch(G, coaches.home)).postMatch;
  state = await act("home", state, { type: "statistics", statistics: homeScores("home", state.home), mvps: ["home-6"], injuries: { "home-2": { code: "dead" } } });
  state = await act("away", state, { type: "statistics", statistics: state.away.statistics, mvps: ["away-6"] });
  for (const name of SIDES) state = await act(name, state, { type: "lock-players" });
  assert.equal((await act("home", await lockedToReady(state), null, true)).status, "completed");
  const usedAt = async () => (await client.query("SELECT used_at FROM dice_rolls WHERE id = $1", [old.id])).rows[0].used_at;
  assert.ok(await usedAt() instanceof Date, "the fallen record names the roll: it stays used");
  const { rows: [fallen] } = await client.query("SELECT id, player FROM team_fallen_players WHERE saved_team_id = $1", [teams.home]);
  assert.deepEqual(fallen.player.advancements, advancements);
  // The administrator undoes the death: the player is back with his advancement, and his next ask is a fresh die.
  const admin = await sessionFor(client, (await seedCoach(client, "boss", { admin: true })).id);
  assert.equal((await callApi("DELETE", `/api/teams/${teams.home}/fallen/${fallen.id}`, { token: admin })).status, 200);
  assert.ok(await usedAt() instanceof Date);
  const token = await sessionFor(client, coaches.home.id);
  const fresh = await callApi("POST", `/api/teams/${teams.home}/players/home-2/rolls`, { token, body: { purpose: "stat" } });
  assert.equal(fresh.status, 200, JSON.stringify(fresh.body));
  assert.notEqual(fresh.body.roll.id, old.id);
}));

test("the points of a finished league match are the domain's", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const season = id(51), round = id(52), entries = { home: id(53), away: id(54) };
  await client.query("INSERT INTO seasons (id, current_round, status) VALUES ($1, 1, 'active')", [season]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [round, season]);
  for (const name of SIDES) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [entries[name], season, coaches[name].id, teams[name]]);
  }
  await client.query(`UPDATE season_pairings SET match_kind = 'league', round_id = $2, home_entry_id = $3, away_entry_id = $4, friendly_home_user_id = NULL,
    friendly_away_user_id = NULL, friendly_home_team_id = NULL, friendly_away_team_id = NULL WHERE id = $1`, [G, round, entries.home, entries.away]);
  const finished = await act("home", await toReady(await toPlayersStep(), homeScores), null, true);
  assert.equal(finished.status, "completed");
  const pairing = (await client.query("SELECT home_points, away_points FROM season_pairings WHERE id = $1", [G])).rows[0];
  const expected = Object.fromEntries(SIDES.map((name) => [`${name}_points`, postPoints(finished, name, "league").total]));
  assert.deepEqual(pairing, expected);
  assert.ok(expected.home_points > expected.away_points, "a 1-0 win is worth more than the loss");
}));
