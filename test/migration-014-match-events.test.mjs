import test from "node:test";
import assert from "node:assert/strict";

import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), H = id(11), A = id(12), GAME = id(41), OTHER = id(42);

async function twoTeams(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/human')", [H, A, U1, U2]);
  for (const [pairing, table] of [[GAME, 1], [OTHER, 2]]) {
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed')`,
    [pairing, table, U1, U2, H, A]);
  }
}

/** A friendly finished through the post-match before 3.0, with one death 015 carries over. */
async function finishedFriendly(client) {
  await twoTeams(client);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [GAME,
    { status: "completed", home: { gamesPlayed: 4, injuries: { "h-dead": { code: "dead" } } }, away: { gamesPlayed: 4, injuries: {} } }]);
  const before = { treasury: 50, players: [{ id: "h-dead", rowIndex: 0 }, { id: "h-ok", rowIndex: 0 }] };
  const after = { treasury: 60, players: [{ id: "h-ok", rowIndex: 0 }] };
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster)
    VALUES ($1, 'home', $2, $3, $4), ($1, 'away', $5, $6, $6)`, [GAME, H, before, after, A, { treasury: 0, players: [] }]);
}

/** What either order must leave behind: both tables' columns, constraints and indexes, and the rows. */
async function shape(client) {
  const tables = ["match_events", "team_fallen_players"];
  const query = async (sql) => (await client.query(sql, [tables])).rows;
  return {
    columns: await query(`SELECT table_name, column_name, data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1) ORDER BY table_name, column_name`),
    constraints: await query(`SELECT conrelid::regclass::text AS table_name, conname, pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid::regclass::text = ANY($1) ORDER BY 1, 2`),
    indexes: await query("SELECT tablename, indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' AND tablename = ANY($1) ORDER BY 1, 2"),
    fallen: (await client.query("SELECT saved_team_id, player->>'id' AS player, from_match, recorded_by FROM team_fallen_players ORDER BY 1, 2")).rows,
    events: (await client.query("SELECT count(*)::int AS n FROM match_events")).rows[0].n,
  };
}

async function migratedInOrder(order) {
  let result;
  await withScratchDatabase(async ({ client }) => {
    await finishedFriendly(client);
    for (const name of order) await runMigration(client, name);
    result = await shape(client);
  }, { through: "013_user_preferences.sql" });
  return result;
}

test("014 then 015 (production) and 015 then 014 (the dev database) leave the same schema and the same rows", { skip: scratchSkip }, async () => {
  const production = await migratedInOrder(["014_match_events.sql", "015_backfill_fallen_players.sql"]);
  const development = await migratedInOrder(["015_backfill_fallen_players.sql", "014_match_events.sql"]);
  assert.deepEqual(development, production);
  assert.equal(production.events, 0, "014 backfills nothing");
  assert.deepEqual(production.fallen, [{ saved_team_id: H, player: "h-dead", from_match: true, recorded_by: null }]);
  assert.ok(production.indexes.some((index) => index.indexname === "match_events_open_idx" && /WHERE \(settled_at IS NULL\)/.test(index.indexdef)));
  assert.ok(production.indexes.some((index) => index.indexname === "match_events_team_idx"));
});

const insert = (client, values) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury) VALUES ($1, $2, $3, $4, $5, $6) RETURNING settled_at, created_at",
  values);

test("a row is +1 or -1 on one of the ten counters, and starts unsettled", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    const [row] = (await insert(client, [H, GAME, "journeyman-8", "touchdowns", 1, null])).rows;
    assert.equal(row.settled_at, null);
    assert.ok(row.created_at instanceof Date);
    await insert(client, [H, GAME, "p1", "injury", -1, { code: "lasting", stat: "ag" }]);
    for (const [counter, delta] of [["mvps", 1], ["crowdCasualties", 1], ["touchdowns", 2], ["touchdowns", 0]]) {
      await assert.rejects(insert(client, [H, GAME, "p1", counter, delta, null]), { code: "23514" }, `${counter} ${delta}`);
    }
    await assert.rejects(insert(client, [H, GAME, null, "touchdowns", 1, null]), { code: "23502" });
  }, { through: "014_match_events.sql" });
});

test("a deleted pairing takes its rows, an edit outside a match stays, and a deleted team takes all of its rows", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoTeams(client);
    await insert(client, [H, GAME, "p1", "touchdowns", 1, null]);
    await insert(client, [H, OTHER, "p1", "touchdowns", 1, null]);
    await insert(client, [H, null, "p1", "casualties", 1, null]);
    await insert(client, [A, GAME, "a1", "touchdowns", 1, null]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [GAME]);
    const left = async () => (await client.query("SELECT saved_team_id, pairing_id, counter FROM match_events ORDER BY counter, pairing_id")).rows;
    assert.deepEqual(await left(), [{ saved_team_id: H, pairing_id: null, counter: "casualties" }, { saved_team_id: H, pairing_id: OTHER, counter: "touchdowns" }]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [OTHER]);
    await client.query("DELETE FROM saved_teams WHERE id = $1", [H]);
    assert.deepEqual(await left(), []);
  }, { through: "014_match_events.sql" });
});
