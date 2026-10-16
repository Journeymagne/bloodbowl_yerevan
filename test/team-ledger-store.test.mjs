import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { writeLedgerEntries } from "../server/api/team-ledger.mjs";
import { LEDGER_KINDS } from "../src/domain/roster/ledger.mjs";
import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

const fakeClient = () => {
  const log = [];
  return { log, async query(sql, values) { log.push({ sql, values }); return { rows: [] }; } };
};

test("each entry is one row with its running balance, stamped by the clock so one transaction keeps its order", async () => {
  const client = fakeClient();
  const count = await writeLedgerEntries(client, { teamId: "t1", opening: 100, actorId: "u1",
    entries: [{ kind: "hire", delta: -50 }, { kind: "manual", delta: 7.5 }] });
  assert.equal(count, 2);
  assert.deepEqual(client.log.map((entry) => entry.values),
    [["t1", -50, 50, "hire", null, null, null, "u1"], ["t1", 7.5, 57.5, "manual", null, null, null, "u1"]]);
  assert.ok(client.log.every((entry) => /INSERT INTO team_ledger/.test(entry.sql) && /clock_timestamp\(\)/.test(entry.sql)));
});

test("no entries, no statement", async () => {
  const client = fakeClient();
  assert.equal(await writeLedgerEntries(client, { teamId: "t1", opening: 0, entries: [] }), 0);
  assert.deepEqual(client.log, []);
});

test("the kinds are the ones migration 010 allows", () => {
  const sql = readFileSync(new URL("../server/db/migrations/010_team_ledger.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(kind IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...LEDGER_KINDS]);
});

test("on a real database: thousands with their gold, only known kinds, and one transaction's order", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    const user = "00000000-0000-4000-8000-000000000001", team = "00000000-0000-4000-8000-000000000011";
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'u', 'u', '@u', 'x')", [user]);
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $2, 'T', 'teams/human')", [team, user]);
    await client.query("BEGIN");
    await writeLedgerEntries(client, { teamId: team, opening: 100, actorId: user,
      entries: [{ kind: "sale", delta: 37.5 }, { kind: "hire", delta: -50 }, { kind: "manual", delta: 0.1 }] });
    await client.query("COMMIT");
    const { rows } = await client.query("SELECT kind, delta::text, balance_after::text, actor_user_id FROM team_ledger ORDER BY created_at");
    assert.deepEqual(rows, [
      { kind: "sale", delta: "37.500", balance_after: "137.500", actor_user_id: user },
      { kind: "hire", delta: "-50.000", balance_after: "87.500", actor_user_id: user },
      { kind: "manual", delta: "0.100", balance_after: "87.600", actor_user_id: user },
    ]);
    await assert.rejects(client.query("INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind) VALUES ($1, 1, 1, 'bonus')", [team]),
      { code: "23514" });
  });
});

test("an entry that moves less than a gold is not a line, and the lines after it still count from the right balance", async () => {
  const client = fakeClient();
  const count = await writeLedgerEntries(client, { teamId: "t1", opening: 100,
    entries: [{ kind: "manual", delta: 0 }, { kind: "hire", delta: -50 }, { kind: "manual", delta: 0.0004 }, { kind: "sale", delta: 37.5 }] });
  assert.equal(count, 2);
  assert.deepEqual(client.log.map((entry) => entry.values.slice(1, 4)), [[-50, 50, "hire"], [37.5, 87.5, "sale"]]);
});
