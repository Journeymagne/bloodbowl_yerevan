import test from "node:test";
import assert from "node:assert/strict";

import { applyPostMatchRoster, applyPreMatchTreasury } from "../server/season/finance-store.mjs";
import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

function fakeClient({ updated = true } = {}) {
  const log = [];
  return { log, async query(sql, values = []) {
    log.push({ sql: sql.trim(), values });
    if (sql.trim().startsWith("UPDATE saved_teams")) return { rows: updated ? [{ id: "t1" }] : [] };
    return { rows: [] };
  } };
}
const journal = (db) => db.log.filter((entry) => entry.sql.startsWith("INSERT INTO team_ledger")).map((entry) => entry.values);
const snapshot = (used, after) => ({ team: { id: "t1", revision: 3, roster: { players: [] } }, budget: { treasuryUsed: used, treasuryAfter: after } });
const side = (overrides = {}) => ({ team: { id: "t1" }, baseRevision: 2, gamesPlayed: 4, injuries: {},
  baseRoster: { treasury: 150, players: [] }, ...overrides });

test("starting a match journals what it spent, after the team is written", async () => {
  const db = fakeClient();
  await applyPreMatchTreasury(db, "g1", "home", snapshot(10, 140.5), "u1");
  assert.deepEqual(journal(db), [["t1", -10, 140.5, "match_spend", null, null, "g1", "u1"]]);
  const sql = db.log.map((entry) => entry.sql);
  assert.ok(sql.findIndex((text) => text.startsWith("UPDATE saved_teams")) < sql.findIndex((text) => text.startsWith("INSERT INTO team_ledger")));
});

test("a match that spends nothing journals nothing", async () => {
  const db = fakeClient();
  await applyPreMatchTreasury(db, "g1", "home", snapshot(0, 150.5), "u1");
  assert.deepEqual(journal(db), []);
});

test("a team that changed under the start journals nothing", async () => {
  const db = fakeClient({ updated: false });
  await assert.rejects(applyPreMatchTreasury(db, "g1", "home", snapshot(10, 140.5), "u1"), { code: "MATCH_ROSTER_CHANGED" });
  assert.deepEqual(journal(db), []);
});

test("finishing a post-match journals income, roster operations, the safe and the mistake, ending at the new treasury", async () => {
  const db = fakeClient();
  const accounting = { opening: 150, winnings: 50, deposit: 20, loss: 30, closing: 132.5,
    transactions: [{ type: "sell", amount: 7.5 }, { type: "hire", amount: -15 }, { type: "staff", amount: -10 }] };
  await applyPostMatchRoster(db, "g1", "home", side(), { roster: { players: [], treasury: 132.5 }, accounting }, "u2");
  assert.deepEqual(journal(db), [
    ["t1", 50, 200, "match_income", null, null, "g1", "u2"],
    ["t1", 7.5, 207.5, "sale", null, null, "g1", "u2"],
    ["t1", -15, 192.5, "hire", null, null, "g1", "u2"],
    ["t1", -10, 182.5, "staff", null, null, "g1", "u2"],
    ["t1", -20, 162.5, "safe", null, null, "g1", "u2"],
    ["t1", -30, 132.5, "mistake", null, null, "g1", "u2"],
  ]);
});

test("a post-match whose team changed journals nothing", async () => {
  const db = fakeClient({ updated: false });
  await assert.rejects(applyPostMatchRoster(db, "g1", "home", side(),
    { roster: { players: [], treasury: 200 }, accounting: { winnings: 50, deposit: 0, loss: 0, transactions: [] } }, "u2"),
  { code: "POST_TEAM_CHANGED" });
  assert.deepEqual(journal(db), []);
});

const ID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = ID(1), U2 = ID(2), T1 = ID(11), T2 = ID(12), G = ID(41);

async function friendly(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'a', 'a', '@a', 'x'), ($2, 'b', 'b', '@b', 'x')", [U1, U2]);
  await client.query(`INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $3, 'A', 'teams/human', $5), ($2, $4, 'B', 'teams/human', $5)`,
    [T1, T2, U1, U2, JSON.stringify({ treasury: 150.5, players: [] })]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
    friendly_home_team_id, friendly_away_team_id) VALUES ($1, 'friendly', 1, $2, $3, $4, $5)`, [G, U1, U2, T1, T2]);
}

test("on a real database: the start and the finish write their journal rows", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await friendly(client);
    await client.query("BEGIN");
    await applyPreMatchTreasury(client, G, "home", { team: { id: T1, revision: 1, roster: { players: [] } },
      budget: { treasuryUsed: 10, treasuryAfter: 140.5 } }, U1);
    await applyPostMatchRoster(client, G, "home", { team: { id: T1 }, baseRevision: 2, gamesPlayed: 4, injuries: {},
      baseRoster: { treasury: 140.5, players: [] } }, { roster: { players: [], treasury: 190.5 },
      accounting: { winnings: 50, deposit: 0, loss: 0, transactions: [] } }, U1);
    await client.query("COMMIT");
    const { rows } = await client.query("SELECT kind, delta::text, balance_after::text, pairing_id, actor_user_id FROM team_ledger ORDER BY created_at");
    assert.deepEqual(rows, [
      { kind: "match_spend", delta: "-10.000", balance_after: "140.500", pairing_id: G, actor_user_id: U1 },
      { kind: "match_income", delta: "50.000", balance_after: "190.500", pairing_id: G, actor_user_id: U1 },
    ]);
    assert.equal((await client.query("SELECT revision FROM saved_teams WHERE id = $1", [T1])).rows[0].revision, 3);
  });
});
