import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), H = id(11), A = id(12), GAME = id(41);
const BEFORE_016 = ["touchdowns", "casualties", "knockouts", "completions", "catches", "interceptions", "throws", "landings", "bonus"];

async function friendly(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/human')", [H, A, U1, U2]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id, result_status) VALUES ($1, 'friendly', 1, $2, $3, $4, $5, 'pending')`, [GAME, U1, U2, H, A]);
}

const insert = (client, [team, pairing, player, counter, delta, injury = null]) => client.query(
  "INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_at) VALUES ($1, $2, $3, $4, $5, $6, clock_timestamp())",
  [team, pairing, player, counter, delta, injury]);
const rows = async (client) => (await client.query(
  "SELECT id, saved_team_id, pairing_id, player_id, counter, delta, injury, settled_at, created_at FROM match_events ORDER BY created_at, id")).rows;
const counterCheck = async (client) => (await client.query(`SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint
  WHERE conrelid = 'match_events'::regclass AND conname = 'match_events_counter_check'`)).rows.map((row) => row.definition);

test("016 widens the counter's CHECK by the MVP and leaves every row 014 took as it was", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await friendly(client);
    for (const counter of BEFORE_016) await insert(client, [H, GAME, "p1", counter, 1]);
    await insert(client, [H, null, "p1", "touchdowns", -1]);
    await insert(client, [H, GAME, "p1", "injury", 1, { code: "lasting", stat: "ag" }]);
    assert.equal((await counterCheck(client)).length, 1, "014's inline CHECK carries the name 016 drops");
    const before = await rows(client);
    await runMigration(client, "016_match_event_mvps.sql");
    assert.deepEqual(await rows(client), before);
    const [definition] = await counterCheck(client);
    assert.deepEqual(definition.match(/'([a-z]+)'/g).map((quoted) => quoted.slice(1, -1)), [...BEFORE_016, "mvps", "injury"]);
  }, { through: "015_backfill_fallen_players.sql" });
});

test("after 016 an MVP is a row, and the table still refuses what 014 refused", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await friendly(client);
    await insert(client, [H, null, "a", "mvps", 1]);
    await insert(client, [H, GAME, "a", "mvps", -1]); // the table takes it: refusing a match's MVP is the endpoint's (checkTap, server/routes/team-events.mjs)
    for (const [counter, delta, constraint] of [["stray", 1, "match_events_counter_check"], ["mvps", 2, "match_events_delta_check"],
      ["mvps", 0, "match_events_delta_check"], ["crowdCasualties", 1, "match_events_counter_check"]]) {
      await assert.rejects(insert(client, [H, null, "a", counter, delta]), { code: "23514", constraint }, `${counter} ${delta}`);
    }
  }, { through: "016_match_event_mvps.sql" });
});

test("016 alters the table and touches no row: no row is written or deleted", () => {
  const sql = readFileSync(new URL("../server/db/migrations/016_match_event_mvps.sql", import.meta.url), "utf8").replace(/--.*$/gm, "");
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|SELECT|TRUNCATE|DROP\s+TABLE)\b/i);
  assert.match(sql, /ALTER TABLE match_events\s+DROP CONSTRAINT match_events_counter_check,\s+ADD CONSTRAINT match_events_counter_check CHECK \(counter IN \(/);
});
