import test from "node:test";
import assert from "node:assert/strict";

import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

async function twoTeams(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'a', 'a', '@a', 'x'), ($2, 'b', 'b', '@b', 'x')", [id(1), id(2)]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'A', 'teams/human'), ($2, $4, 'B', 'teams/human')",
    [id(11), id(12), id(1), id(2)]);
}

test("011: a fallen player outlives the match record, and goes with the team", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id) VALUES ($1, 'friendly', 1, $2, $3, $4, $5)`, [id(41), id(1), id(2), id(11), id(12)]);
    await client.query("INSERT INTO team_fallen_players (saved_team_id, player, pairing_id) VALUES ($1, '{\"id\": \"p\"}', $2)", [id(11), id(41)]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [id(41)]);
    assert.deepEqual((await client.query("SELECT pairing_id, cause FROM team_fallen_players")).rows, [{ pairing_id: null, cause: null }]);
    await client.query("DELETE FROM saved_teams WHERE id = $1", [id(11)]);
    assert.equal((await client.query("SELECT count(*)::int AS n FROM team_fallen_players")).rows[0].n, 0);
  }, { through: "011_fallen_players.sql" });
});

test("012: a roll is for a random skill or a stat, unused until an advancement takes it", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    await client.query(`INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result) VALUES ($1, 'p', 'stat', '{"die": 8}', '{"roll": 8}')`, [id(11)]);
    assert.deepEqual((await client.query("SELECT used_at, rolled_by FROM dice_rolls")).rows, [{ used_at: null, rolled_by: null }]);
    await assert.rejects(client.query(`INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result) VALUES ($1, 'p', 'mvp', '{}', '{}')`, [id(11)]),
      { code: "23514" });
  }, { through: "012_dice_rolls.sql" });
});
