import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TECHNICAL_REASONS } from "../src/domain/league-rules.mjs";
import { runMigration, scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const SEASON = id(21), ROUND = id(51), PLAYED = id(41), TECHNICAL = id(42);
const migrationText = (name) => readFileSync(new URL(`../server/db/migrations/${name}`, import.meta.url), "utf8").replace(/--.*$/gm, "");

/** Two coaches, a team each, both entered in a season whose round 1 has a played 2–1 and a technical 2–0. */
async function seasonWithResults(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'h', 'h', '@h', 'x'), ($2, 'a', 'a', '@a', 'x')",
    [id(1), id(2)]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $3, 'Home', 'teams/human'), ($2, $4, 'Away', 'teams/orc')",
    [id(11), id(12), id(1), id(2)]);
  await client.query("INSERT INTO seasons (id, name, status, current_round) VALUES ($1, 'Season 1', 'active', 1)", [SEASON]);
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'started')", [ROUND, SEASON]);
  await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $3, $4, $5), ($2, $3, $6, $7)",
    [id(31), id(32), SEASON, id(1), id(11), id(2), id(12)]);
  await client.query(`INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, home_touchdowns, away_touchdowns,
    home_casualties, away_casualties, result_type, home_points, away_points, result_status, confirmed_at) VALUES
    ($1, $3, 1, $4, $5, 2, 1, 1, 0, 'played', 3, 0, 'confirmed', now()),
    ($2, $3, 2, $5, $4, 2, 0, 0, 0, 'technical', 2, 0, 'confirmed', now())`, [PLAYED, TECHNICAL, ROUND, id(31), id(32)]);
}

const rows = async (client) => [
  ...(await client.query("SELECT * FROM seasons ORDER BY id")).rows,
  ...(await client.query("SELECT * FROM season_pairings ORDER BY id")).rows,
];

const viewColumns = async (client) => (await client.query(`SELECT column_name FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'match_pairing_context' ORDER BY ordinal_position`)).rows.map((row) => row.column_name);
const viewDefinition = async (client) => (await client.query("SELECT pg_get_viewdef('match_pairing_context'::regclass, true) AS sql")).rows[0].sql;
const viewRows = async (client) => (await client.query("SELECT * FROM match_pairing_context ORDER BY id")).rows;

test("017 gives a season its playoff places and a technical result its reason, and changes no row", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seasonWithResults(client);
    const before = await rows(client);
    await runMigration(client, "017_season_admin.sql");
    const after = await rows(client);
    assert.deepEqual(after.map(({ playoff_places, technical_reason, ...rest }) => rest), before);
    assert.ok(after.every((row) => row.playoff_places === null || row.playoff_places === undefined));
    assert.deepEqual((await client.query("SELECT technical_reason FROM season_pairings ORDER BY table_number")).rows,
      [{ technical_reason: null }, { technical_reason: null }], "a technical result stored before 017 has no reason");
  }, { through: "016_match_event_mvps.sql" });
});

test("the checks: places 1 to 64 or none; a reason only on a technical result, and only one of the two", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seasonWithResults(client);
    const places = (value) => client.query("UPDATE seasons SET playoff_places = $2 WHERE id = $1", [SEASON, value]);
    for (const value of [0, 65, -1]) {
      await assert.rejects(places(value), { code: "23514", constraint: "seasons_playoff_places_check" }, `${value} places`);
    }
    for (const value of [1, 64, 8, null]) {
      await places(value);
      assert.deepEqual((await client.query("SELECT playoff_places FROM seasons")).rows, [{ playoff_places: value }]);
    }
    const reason = (pairing, value) => client.query("UPDATE season_pairings SET technical_reason = $2 WHERE id = $1", [pairing, value]);
    const refused = { code: "23514", constraint: "season_pairings_technical_reason_check" };
    await assert.rejects(reason(TECHNICAL, "late"), refused, "a reason outside the two");
    await assert.rejects(reason(TECHNICAL, ""), refused, "an empty reason");
    for (const value of TECHNICAL_REASONS) await assert.rejects(reason(PLAYED, value), refused, `${value} on a played result`);
    for (const value of [...TECHNICAL_REASONS, null]) {
      await reason(TECHNICAL, value);
      assert.deepEqual((await client.query("SELECT technical_reason FROM season_pairings WHERE id = $1", [TECHNICAL])).rows,
        [{ technical_reason: value }]);
    }
    await reason(TECHNICAL, "no_team");
    await assert.rejects(client.query("UPDATE season_pairings SET result_type = 'played' WHERE id = $1", [TECHNICAL]), refused,
      "a result made played keeps no reason: the write that makes it played clears it");
    await client.query("UPDATE season_pairings SET result_type = 'played', technical_reason = NULL WHERE id = $1", [TECHNICAL]);
    const [definition] = (await client.query(`SELECT pg_get_constraintdef(oid) AS sql FROM pg_constraint
      WHERE conrelid = 'season_pairings'::regclass AND conname = 'season_pairings_technical_reason_check'`)).rows.map((row) => row.sql);
    assert.deepEqual(definition.match(/'([a-z_]+)'::text/g).map((quoted) => quoted.slice(1, -7)).filter((word) => word !== "technical"),
      [...TECHNICAL_REASONS], "the table takes exactly the domain's reasons (src/domain/league-rules.mjs)");
  }, { through: "017_season_admin.sql" });
});

test("the view is 006's, with the reason among the pairing's columns", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seasonWithResults(client);
    const [columns, definition, before] = [await viewColumns(client), await viewDefinition(client), await viewRows(client)];
    await runMigration(client, "017_season_admin.sql");
    const after = await viewColumns(client);
    assert.deepEqual(new Set(after), new Set([...columns, "technical_reason"]));
    assert.deepEqual(after.filter((column) => column !== "technical_reason"), columns, "every other column where it was");
    assert.equal(after.indexOf("technical_reason"), after.indexOf("round_status") - 1, "p.* ends with the new column");
    const recreated = await viewDefinition(client);
    assert.match(recreated, /\bp\.technical_reason,/);
    assert.equal(recreated.replace(/\s*\bp\.technical_reason,/, ""), definition, "the same SELECT, joins and names as before");
    assert.deepEqual((await viewRows(client)).map(({ technical_reason, ...rest }) => rest), before);
    assert.deepEqual((await client.query(`SELECT technical_reason, round_status, home_team_name FROM match_pairing_context
      ORDER BY table_number`)).rows, [
      { technical_reason: null, round_status: "started", home_team_name: "Home" },
      { technical_reason: null, round_status: "started", home_team_name: "Away" },
    ]);
  }, { through: "016_match_event_mvps.sql" });
});

test("017 alters two tables and puts the view back; no row is read, written or deleted", () => {
  const sql = migrationText("017_season_admin.sql");
  assert.doesNotMatch(sql, /\b(INSERT|UPDATE|DELETE|TRUNCATE|DROP\s+TABLE|DROP\s+COLUMN|ALTER\s+COLUMN)\b/i);
  assert.deepEqual(sql.match(/\bALTER\s+TABLE\s+\w+/gi), ["ALTER TABLE seasons", "ALTER TABLE season_pairings"]);
  assert.equal(sql.match(/\bDROP\s+VIEW\b/gi).length, 1);
  assert.equal(sql.match(/\bDROP VIEW match_pairing_context;/g).length, 1);
  assert.equal(sql.match(/\bCREATE\s+(OR\s+REPLACE\s+)?VIEW\b/gi).length, 1);
  assert.equal(sql.match(/\bCREATE VIEW match_pairing_context AS\b/g).length, 1);
  assert.equal(sql.match(/\bSELECT\b/gi).length, 1, "the only SELECT is the view's");
  assert.ok(sql.indexOf("DROP VIEW") < sql.indexOf("CREATE VIEW"));
  const body = (text) => text.match(/CREATE VIEW match_pairing_context AS[\s\S]*?;/)[0].replace(/\s+/g, " ");
  assert.equal(body(sql), body(migrationText("006_friendly_challenges.sql")), "the view's text is 006's, word for word");
});
