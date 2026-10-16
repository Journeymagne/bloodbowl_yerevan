import test from "node:test";
import assert from "node:assert/strict";

import { migrateThrough, runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";
import { compareSnapshots, takeSnapshot } from "../scripts/rehearsal/snapshot.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

// One reason for a stage per team; the name says which.
const TEAMS = {
  entered: { id: id(11), user: 1, stage: "active" },
  withdrawn: { id: id(12), user: 2, stage: "draft" },
  "old season": { id: id(13), user: 2, stage: "draft" },
  "played then withdrew": { id: id(14), user: 3, stage: "active" },
  "played away, then withdrew": { id: id(20), user: 1, stage: "active" },
  "friendly home": { id: id(15), user: 3, stage: "active" },
  "friendly away": { id: id(16), user: 1, stage: "active" },
  "post-match only": { id: id(17), user: 2, stage: "active" },
  "pending league": { id: id(18), user: 3, stage: "draft" },
  reserve: { id: id(19), user: 1, stage: "draft" },
};

async function seed(client) {
  for (const n of [1, 2, 3]) {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, $2, $2, '@c', 'x')", [id(n), `coach-${n}`]);
  }
  for (const [name, team] of Object.entries(TEAMS)) {
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', $4)",
      [team.id, id(team.user), name, JSON.stringify({ treasury: 10, players: [] })]);
  }
  await client.query("INSERT INTO seasons (id, name, status) VALUES ($1, 'Now', 'active'), ($2, 'Before', 'completed')", [id(21), id(22)]);
  const entries = [[31, 21, 1, "entered", false], [32, 21, 2, "withdrawn", true], [33, 22, 2, "old season", false],
    [34, 21, 3, "played then withdrew", true], [35, 21, 3, "pending league", true], [36, 21, 1, "played away, then withdrew", true]];
  for (const [entry, season, user, team, withdrawn] of entries) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id, withdrawn_at) VALUES ($1, $2, $3, $4, $5)",
      [id(entry), id(season), id(user), TEAMS[team].id, withdrawn ? "2026-10-01T00:00:00Z" : null]);
  }
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'completed')", [id(51), id(21)]);
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, result_status)
    VALUES ($1, $3, 1, $4, $5, 'confirmed'), ($2, $3, 2, $6, $7, 'pending')`, [id(41), id(42), id(51), id(34), id(31), id(35), id(32)]);
  await client.query("INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, result_status) VALUES ($1, $2, 3, $3, $4, 'confirmed')",
    [id(45), id(51), id(34), id(36)]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id, result_status)
    VALUES ($1, 'friendly', 1, $3, $4, $5, $6, 'confirmed'), ($2, 'friendly', 2, $7, $4, $8, $9, 'pending')`,
  [id(43), id(44), id(3), id(1), TEAMS["friendly home"].id, TEAMS["friendly away"].id, id(2), TEAMS["post-match only"].id, TEAMS.reserve.id]);
  await client.query("INSERT INTO match_post_applications (pairing_id, side, saved_team_id, before_roster, after_roster) VALUES ($1, 'home', $2, '{}', '{}')",
    [id(44), TEAMS["post-match only"].id]);
}

test("existing teams get the stage the rule gives them, and nothing else about them changes", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seed(client);
    const before = await takeSnapshot(client);
    const kept = (await client.query("SELECT id, revision, updated_at FROM saved_teams ORDER BY id")).rows;
    await runMigration(client, "009_team_stage.sql");
    const { rows } = await client.query("SELECT name, stage, activated_at FROM saved_teams ORDER BY name");
    assert.deepEqual(Object.fromEntries(rows.map((row) => [row.name, row.stage])),
      Object.fromEntries(Object.entries(TEAMS).map(([name, team]) => [name, team.stage])));
    assert.ok(rows.every((row) => row.activated_at === null), "teams made active by the migration have no activation date");
    assert.deepEqual((await client.query("SELECT id, revision, updated_at FROM saved_teams ORDER BY id")).rows, kept);
    // The rehearsal's own copy of the rule (snapshot.mjs, stages) agrees with the migration.
    assert.deepEqual(compareSnapshots(before, await takeSnapshot(client)).problems, []);
  }, { through: "008_withdraw_season_entries.sql" });
});

test("a team created afterwards starts active, and a stage outside draft and active is refused", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'n', 'n', '@n', 'x')", [id(1)]);
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $2, 'New', 'teams/human')", [id(11), id(1)]);
    assert.deepEqual((await client.query("SELECT stage, activated_at FROM saved_teams")).rows, [{ stage: "active", activated_at: null }]);
    await assert.rejects(client.query("UPDATE saved_teams SET stage = 'archived'"), { code: "23514" });
  }, { through: "009_team_stage.sql" });
});

// A misspelt `through` used to apply every migration and carry on, so a test could
// pass against a schema newer than the one it meant to start from.
test("migrateThrough refuses a name that is not a migration file, before it touches the database", async () => {
  const untouched = { query() { throw new Error("the database was touched"); } };
  await assert.rejects(migrateThrough(untouched, "008_withdraw_season_entries"), /no migration 008_withdraw_season_entries/);
  await assert.rejects(migrateThrough(untouched, "010_nothing_yet.sql"), /no migration 010_nothing_yet\.sql/);
});
