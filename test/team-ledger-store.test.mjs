import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { checkManualEntry, decodeLedgerCursor, encodeLedgerCursor, ledgerSince, readLedgerPage, writeLedgerEntries } from "../server/api/team-ledger.mjs";
import { LEDGER_KINDS, MANUAL_REASONS } from "../src/domain/roster/ledger.mjs";
import { seedCoach, seedTeam } from "./helpers/api-db.mjs";
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

const ROW = "00000000-0000-4000-8000-000000000099";

test("a cursor carries the row's database time to the microsecond and its id, and nothing else reads as one", () => {
  const at = "2026-10-16 18:00:00.123456+00";
  assert.deepEqual(decodeLedgerCursor(encodeLedgerCursor({ at, id: ROW })), { at, id: ROW });
  for (const bad of ["", "x", encodeLedgerCursor({ at: "yesterday", id: ROW }), encodeLedgerCursor({ at, id: "1; DROP" }),
    Buffer.from("[1,2]").toString("base64url"), Buffer.from("{}").toString("base64url")]) assert.equal(decodeLedgerCursor(bad), null, bad);
});

test("a manual entry is a non-zero amount to the gold, one of five reasons and a short note", () => {
  assert.deepEqual(MANUAL_REASONS, ["friendly", "sponsor", "fine", "purchase", "other"]);
  assert.deepEqual(checkManualEntry({ delta: -7.5, reason: "fine", note: "  late  " }), { delta: -7.5, reason: "fine", note: "late" });
  assert.deepEqual(checkManualEntry({ delta: 100000, reason: "other", note: " " }), { delta: 100000, reason: "other", note: null });
  for (const [body, field] of [[{ delta: 0, reason: "fine" }, "delta"], [{ delta: 0.0004, reason: "fine" }, "delta"], [{ delta: "5", reason: "fine" }, "delta"],
    [{ delta: 100000.5, reason: "fine" }, "delta"], [{ delta: 5, reason: "gift" }, "reason"], [{ delta: 5, reason: "fine", note: "x".repeat(201) }, "note"]]) {
    assert.throws(() => checkManualEntry(body), { status: 400, code: "FIELD_INVALID", params: { field } }, JSON.stringify(body));
  }
});

test("the five reasons are the ones migration 010 names, in its order", () => {
  const sql = readFileSync(new URL("../server/db/migrations/010_team_ledger.sql", import.meta.url), "utf8");
  assert.deepEqual(sql.match(/-- manual: ([a-z|]+)/)[1].split("|"), [...MANUAL_REASONS]);
});

test("a cursor is read in every form Postgres writes a time, and only those, from text and nothing but text", () => {
  for (const at of ["2026-10-16 18:00:00+00", "2026-10-16 18:00:00.5+03", "2026-10-16 18:00:00.000001-05", "2026-10-16 18:00:00.123456+05:30", "1893-04-01 00:00:00+00:53:28"]) {
    assert.deepEqual(decodeLedgerCursor(encodeLedgerCursor({ at, id: ROW })), { at, id: ROW }, at);
  }
  assert.ok(decodeLedgerCursor(encodeLedgerCursor({ at: "2026-10-16 18:00:00+00", id: "0A1B2C3D-4E5F-4A6B-8C7D-9E0F1A2B3C4D" })), "a UUID in capitals is a UUID");
  const forged = (parts) => Buffer.from(JSON.stringify(parts)).toString("base64url");
  for (const at of ["2026-10-16T18:00:00Z", "2026-10-16 18:00:00", "2026-10-16 18:00:00.1234567+00", " 2026-10-16 18:00:00+00", "2026-10-16 18:00:00+00\n", "2026-10-16 18:00+00", 20261016, ["2026-10-16 18:00:00+00"]]) {
    assert.equal(decodeLedgerCursor(forged([at, ROW])), null, String(at));
  }
  for (const parts of [[], ["2026-10-16 18:00:00+00"], ["2026-10-16 18:00:00+00", ROW, ROW], ["2026-10-16 18:00:00+00", null], { at: "2026-10-16 18:00:00+00", id: ROW }, "text", 7, null]) {
    assert.equal(decodeLedgerCursor(forged(parts)), null, JSON.stringify(parts));
  }
  const payload = JSON.stringify(["2026-10-16 18:00:00+00", ROW]); // a good cursor's contents, in a shape that is not the text of one
  for (const notText of [null, undefined, 7, {}, [], ["x"], true, Buffer.from(payload), [...Buffer.from(payload)]]) {
    assert.equal(decodeLedgerCursor(notText), null, String(notText));
  }
});

test("a body that is no object at all is a bad amount, not a crash", () => {
  for (const body of [null, undefined, [], [5], "5", 5, true]) {
    assert.throws(() => checkManualEntry(body), { status: 400, code: "FIELD_INVALID", params: { field: "delta" } }, JSON.stringify(body));
  }
});

test("what a manual entry may be: either sign down to one gold, any of the reasons, a note that is optional and only ever text", () => {
  for (const delta of [0.001, -0.001, 12.345, -100000, 100000, 0.3]) {
    assert.deepEqual(checkManualEntry({ delta, reason: "other" }), { delta, reason: "other", note: null }, String(delta));
  }
  for (const reason of MANUAL_REASONS) assert.equal(checkManualEntry({ delta: 1, reason }).reason, reason);
  for (const note of [undefined, null, "", "   "]) assert.equal(checkManualEntry({ delta: 1, reason: "fine", note }).note, null, String(note));
  const edge = "x".repeat(200);
  assert.equal(checkManualEntry({ delta: 1, reason: "fine", note: `  ${edge}  ` }).note, edge);
  for (const delta of [NaN, Infinity, -Infinity, 0.0005, 1e-9, -0, -100000.001, 100000.001, 1e21, null, undefined, true, [5], { valueOf: () => 5 }]) {
    assert.throws(() => checkManualEntry({ delta, reason: "fine" }), { status: 400, code: "FIELD_INVALID", params: { field: "delta" } }, String(delta));
  }
  for (const reason of [undefined, null, "", "FINE", "fine ", ["fine"], 0, "toString"]) {
    assert.throws(() => checkManualEntry({ delta: 1, reason }), { status: 400, code: "FIELD_INVALID", params: { field: "reason" } }, String(reason));
  }
  for (const note of [5, true, {}, ["x"], "x".repeat(201), `  ${"x".repeat(201)}  `]) {
    assert.throws(() => checkManualEntry({ delta: 1, reason: "fine", note }), { status: 400, code: "FIELD_INVALID", params: { field: "note" } }, JSON.stringify(note));
  }
  assert.throws(() => checkManualEntry({ delta: 0, reason: "gift", note: 5 }), { params: { field: "delta" } }, "the first bad field is the one named");
});

/** Every page of the history of `teamId`, `limit` lines at a time, the way a client follows `next`. */
async function pageThrough(client, teamId, limit) {
  const seen = [];
  let next = null;
  do {
    const page = await readLedgerPage(client, teamId, { before: next ? decodeLedgerCursor(next) : null, limit });
    seen.push(...page.entries); next = page.next;
    assert.ok(seen.length < 50, "the pages never end");
  } while (next);
  return seen;
}

test("the history reads thousands back as numbers, to the gold and exactly: 37.5, 150.5 and 0.001 come back as they were written", { skip: scratchSkip }, () => withScratchDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query("BEGIN");
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: [37.5, 113, -150.499, 150.5, -150.5, 0.001].map((delta) => ({ kind: "manual", delta })) });
  await client.query("COMMIT");
  const { entries, next } = await readLedgerPage(client, id);
  assert.equal(next, null);
  assert.deepEqual(entries.map((entry) => entry.delta), [0.001, -150.5, 150.5, -150.499, 113, 37.5]);
  assert.deepEqual(entries.map((entry) => entry.balanceAfter), [0.002, 0.001, 150.501, 0.001, 150.5, 37.5]);
  assert.deepEqual(Object.keys(entries[0]).sort(), ["balanceAfter", "createdAt", "delta", "id", "kind", "note", "pairingId", "reason"],
    "a line says what happened, not who or which team: no actor, no team id, no raw columns");
  assert.ok(entries[0].createdAt instanceof Date);
}));

test("paging a line at a time through lines one transaction wrote, a microsecond apart, and a tie: none twice, none missed", { skip: scratchSkip }, () => withScratchDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), other = await seedTeam(client, coach.id, { name: "Wolves" });
  await client.query("BEGIN");
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: [1, 2, 3].map((delta) => ({ kind: "manual", delta })) });
  await client.query("COMMIT");
  assert.deepEqual((await pageThrough(client, id, 1)).map((entry) => entry.delta), [3, 2, 1]);
  // Times that a millisecond could not tell apart, and two lines at the very same microsecond.
  await client.query(`INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind, created_at) VALUES
    ($1, 11, 11, 'admin', '2020-01-01 00:00:00.000001+00'), ($1, 12, 23, 'admin', '2020-01-01 00:00:00.000002+00'),
    ($1, 13, 36, 'admin', '2020-01-01 00:00:00.000003+00'), ($1, 14, 50, 'admin', '2020-01-01 00:00:00.000003+00')`, [id]);
  await writeLedgerEntries(client, { teamId: other, opening: 0, entries: [{ kind: "manual", delta: 99 }] });
  for (const limit of [1, 2, 3, 7, 20]) {
    const seen = await pageThrough(client, id, limit);
    assert.equal(seen.length, 7, `limit ${limit}`);
    assert.equal(new Set(seen.map((entry) => entry.id)).size, 7, `limit ${limit}`);
    assert.deepEqual(seen.slice(0, 3).map((entry) => entry.delta), [3, 2, 1], `limit ${limit}`);
    const [first, second, ...older] = seen.slice(3);
    assert.deepEqual([first.delta, second.delta].sort(), [13, 14], `limit ${limit}`);
    assert.ok(first.id > second.id, `a tie goes by id, newest first (limit ${limit})`);
    assert.deepEqual(older.map((entry) => entry.delta), [12, 11], `limit ${limit}`);
  }
  assert.deepEqual((await pageThrough(client, other, 1)).map((entry) => entry.delta), [99], "another team's lines are never in the page");
}));

test("a cursor time that is not a time the database takes is a bad cursor, and no other failure is taken for one", { skip: scratchSkip }, () => withScratchDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: [{ kind: "manual", delta: 1 }] });
  for (const at of ["2026-13-45 99:99:99+00", "2026-02-30 00:00:00+00", "2026-10-16 24:00:01+00", "2026-10-16 18:00:00+99", "0000-01-01 00:00:00+00"]) {
    await assert.rejects(readLedgerPage(client, id, { before: { at, id: ROW } }), { status: 400, code: "FIELD_INVALID", params: { field: "before" } }, at);
  }
  assert.equal((await readLedgerPage(client, id, { before: { at: "2000-01-01 00:00:00+00", id: ROW } })).entries.length, 0);
  assert.equal((await readLedgerPage(client, id, { before: { at: "9999-12-31 23:59:59.999999+00", id: ROW } })).entries.length, 1);
  await assert.rejects(readLedgerPage(client, "not-a-uuid"), { code: "22P02" }, "a team id the route never checked is the database's complaint");
}));

test("the history is kept since the day migration 010 was applied, and says nothing when that day is not on record", { skip: scratchSkip }, () => withScratchDatabase(async ({ client }) => {
  const { rows: [migration] } = await client.query("SELECT applied_at FROM schema_migrations WHERE name = '010_team_ledger.sql'");
  const since = await ledgerSince(client);
  assert.ok(since instanceof Date);
  assert.equal(since.getTime(), migration.applied_at.getTime());
  await client.query("DELETE FROM schema_migrations WHERE name = '010_team_ledger.sql'");
  assert.equal(await ledgerSince(client), null);
}));
