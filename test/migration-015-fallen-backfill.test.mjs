import test from "node:test";
import assert from "node:assert/strict";

import { readMigrations } from "../server/db/migrate.mjs";
import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const H = id(11), A = id(12), GAME = id(41), EMPTY = id(42);
const player = (pid, name) => ({ id: pid, rowIndex: 0, number: "1", name });
const fallenOne = player("h-dead", "Fallen");

/** One finished friendly: a death, a lasting injury, dead temporaries, a protected rookie; and an application with no players. */
async function seed(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')", [id(1), id(2)]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/human')", [H, A, id(1), id(2)]);
  for (const [pairing, table] of [[GAME, 1], [EMPTY, 2]]) {
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed')`,
    [pairing, table, id(1), id(2), H, A]);
  }
  const state = { status: "completed",
    home: { gamesPlayed: 4, injuries: { "h-dead": { code: "dead" }, "h-lasting": { code: "lasting", stat: "ma" },
      "journeyman-8": { code: "dead" }, "star-griff": { code: "dead" } } },
    away: { gamesPlayed: 2, injuries: { "a-rookie": { code: "dead" } } } };
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2), ($3, $4)",
    [GAME, state, EMPTY, { home: { gamesPlayed: 5, injuries: { x: { code: "dead" } } } }]);
  const homeBefore = { treasury: 50, players: [fallenOne, player("h-lasting", "Hurt"), player("h-ok", "Fine")] };
  const homeAfter = { treasury: 80, players: [player("h-lasting", "Hurt"), player("h-ok", "Fine")] };
  const away = { treasury: 90, players: [player("a-rookie", "Rookie")] };
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster, created_at) VALUES
    ($1, 'home', $2, $3, $4, '2026-09-01T18:00:00Z'), ($1, 'away', $5, $6, $6, '2026-09-01T18:00:00Z'),
    ($7, 'home', $2, '{}', '{}', '2026-09-08T18:00:00Z')`, [GAME, H, homeBefore, homeAfter, A, away, EMPTY]);
}

const fallen = async (client) => (await client.query(
  "SELECT saved_team_id, player, cause, pairing_id, recorded_by, died_at, from_match FROM team_fallen_players ORDER BY died_at")).rows;

test("a roster player who died is carried over once, as before_roster held them; nobody else is", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await fallen(client), [{ saved_team_id: H, player: fallenOne, cause: null, pairing_id: GAME, recorded_by: null,
      died_at: new Date("2026-09-01T18:00:00Z"), from_match: true }]);
    // Not carried: a lasting injury, a journeyman and a star (never on the roster), a protected rookie, a roster with no players.
  }, { through: "011_fallen_players.sql" });
});

test("running the backfill again adds nothing", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await runMigration(client, "015_backfill_fallen_players.sql");
    const { sql } = (await readMigrations()).find((migration) => migration.name === "015_backfill_fallen_players.sql");
    await client.query(sql); // straight past the migration log, as a repeated run would be
    assert.equal((await fallen(client)).length, 1);
  }, { through: "011_fallen_players.sql" });
});

test("a death the 3.0 post-match already recorded is not repeated", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await client.query("INSERT INTO team_fallen_players (saved_team_id, player, pairing_id, recorded_by) VALUES ($1, $2, $3, $4)",
      [H, fallenOne, GAME, id(1)]);
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual((await fallen(client)).map((row) => row.recorded_by), [id(1)]);
  }, { through: "011_fallen_players.sql" });
});

test("from_match: a match death stays one when its pairing is deleted; a manual mark is not one", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await runMigration(client, "015_backfill_fallen_players.sql");
    const { rows: [column] } = await client.query(`SELECT data_type, is_nullable, column_default FROM information_schema.columns
      WHERE table_name = 'team_fallen_players' AND column_name = 'from_match'`);
    assert.deepEqual(column, { data_type: "boolean", is_nullable: "NO", column_default: "false" });
    await client.query("INSERT INTO team_fallen_players (saved_team_id, player, cause, recorded_by) VALUES ($1, $2, 'Eaten', $3)",
      [A, player("a-marked", "Marked"), id(2)]);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [GAME]);
    const { rows } = await client.query("SELECT player->>'id' AS player, pairing_id, from_match FROM team_fallen_players ORDER BY player->>'id'");
    assert.deepEqual(rows, [{ player: "a-marked", pairing_id: null, from_match: false }, { player: "h-dead", pairing_id: null, from_match: true }]);
  }, { through: "011_fallen_players.sql" });
});

/** One more friendly on top of the seed: its post-match state and, unless `applied` is false, one side's application. */
async function another(client, { pairing, table, side = "home", team = H, state, before = [], after = [], applied = true }) {
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', $2, $3, $4, $5, $6, 'confirmed')`,
  [pairing, table, id(1), id(2), H, A]);
  await client.query("INSERT INTO match_post_games (pairing_id, state) VALUES ($1, $2)", [pairing, state]);
  if (!applied) return;
  await client.query(`INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster, created_at)
    VALUES ($1, $2, $3, $4, $5, '2026-09-15T18:00:00Z')`, [pairing, side, team, { players: before }, { players: after }]);
}
const carried = async (client) => (await fallen(client)).map((row) => row.player.id);

test("a protected rookie who left the roster in the same post-match, sold, is not carried", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await another(client, { pairing: id(43), table: 3, side: "away", team: A,
      state: { away: { gamesPlayed: 2, injuries: { "a-sold": { code: "dead" } } } }, before: [player("a-sold", "Sold")], after: [] });
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await carried(client), ["h-dead"]);
  }, { through: "011_fallen_players.sql" });
});

test("a post-match that was started but never finished carries nobody", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await another(client, { pairing: id(43), table: 3, applied: false,
      state: { home: { gamesPlayed: 5, injuries: { "h-ok": { code: "dead" } } } } });
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await carried(client), ["h-dead"]);
  }, { through: "011_fallen_players.sql" });
});

test("a state without a whole-number gamesPlayed carries nobody", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    for (const [n, gamesPlayed] of [[43, undefined], [44, "four"]]) {
      await another(client, { pairing: id(n), table: n, state: { home: { gamesPlayed, injuries: { [`h-${n}`]: { code: "dead" } } } },
        before: [player(`h-${n}`, "Unknown")], after: [] });
    }
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await carried(client), ["h-dead"]);
  }, { through: "011_fallen_players.sql" });
});

test("a gamesPlayed too large for an integer still counts, and never stops the migration", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    await another(client, { pairing: id(43), table: 3, state: { home: { gamesPlayed: "99999999999", injuries: { "h-veteran": { code: "dead" } } } },
      before: [player("h-veteran", "Veteran")], after: [] });
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await carried(client), ["h-dead", "h-veteran"]);
  }, { through: "011_fallen_players.sql" });
});

test("a dead player the post-match kept on the roster is not carried, whatever the games played", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    const kept = player("h-kept", "Kept");
    await another(client, { pairing: id(43), table: 3, state: { home: { gamesPlayed: 5, injuries: { "h-kept": { code: "dead" } } } },
      before: [kept], after: [kept] });
    await runMigration(client, "015_backfill_fallen_players.sql");
    assert.deepEqual(await carried(client), ["h-dead"]);
  }, { through: "011_fallen_players.sql" });
});
