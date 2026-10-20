import test from "node:test";
import assert from "node:assert/strict";

import { callApi, seedCoach, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { G, act, coaches, homeScores, id, startedFriendly, teams, toPlayersStep, toReady } from "./helpers/match-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const list = async (token) => {
  const { status, body } = await callApi("GET", "/api/games", { token });
  assert.equal(status, 200);
  return body.games;
};
const mvpsOf = (games, pairingId) => {
  const game = games.find((one) => one.id === pairingId);
  return [game.homeMvps, game.awayMvps];
};

/** A confirmed friendly of the two teams, 2-0, whose post-match the database holds as `state`, written as it is. */
async function storedPost(client, n, state) {
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id,
    friendly_away_team_id, result_status, result_type, home_touchdowns, away_touchdowns, home_casualties, away_casualties)
    VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed', 'played', 2, 0, 0, 0)`, [id(n), n, coaches.home.id, coaches.away.id, teams.home, teams.away]);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2::jsonb)", [id(n), JSON.stringify(state)]);
}

test("the games list names each finished match's MVPs side by side, by the names the match's roster gave them; a post-match still open names nobody", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  assert.deepEqual(mvpsOf(await list(home), G), [[], []], "a match on, no post-match yet");
  const ready = await toReady(await toPlayersStep(), homeScores);
  assert.deepEqual([ready.home.mvps, ready.away.mvps], [["home-6"], ["away-6"]]);
  assert.deepEqual(mvpsOf(await list(home), G), [[], []], "picked, but the post-match is not finished: they may change yet");
  assert.equal((await act("home", ready, null, true)).status, "completed");
  const named = [[{ id: "home-6", name: "Player 7" }], [{ id: "away-6", name: "Player 7" }]];
  assert.deepEqual(mvpsOf(await list(home), G), named);
  assert.deepEqual(mvpsOf(await list(away), G), named, "the other coach reads the same match the same way");
}));

test("an MVP named twice is listed twice, in the order picked; a stored state the list cannot read names nobody, and the list is still answered", db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const players = [{ id: "home-6", name: "Gruk" }, { id: "home-2", name: "Vane" }];
  await storedPost(client, 61, { status: "completed", home: { mvps: ["home-6", "home-2", "home-6"], snapshot: { players } }, away: { mvps: [], snapshot: { players: [] } } });
  await storedPost(client, 62, { status: "completed", home: { mvps: "home-6", snapshot: { players } }, away: { mvps: ["ghost", null], snapshot: { players: "none" } } });
  await storedPost(client, 63, "a state that is no object");
  await storedPost(client, 64, { status: "draft", home: { mvps: ["home-6"], snapshot: { players } }, away: { mvps: [] } });
  const games = await list(await sessionFor(client, coaches.home.id));
  assert.deepEqual(mvpsOf(games, id(61)), [[{ id: "home-6", name: "Gruk" }, { id: "home-2", name: "Vane" }, { id: "home-6", name: "Gruk" }], []]);
  assert.deepEqual(mvpsOf(games, id(62)), [[], [{ id: "ghost", name: "" }]], "a list that is no list names nobody; an id the roster does not hold has no name");
  assert.deepEqual(mvpsOf(games, id(63)), [[], []]);
  assert.deepEqual(mvpsOf(games, id(64)), [[], []], "a post-match not completed");
  const stranger = await seedCoach(client, "stranger");
  assert.deepEqual(await list(stranger.token), [], "a coach with no games");
}));
