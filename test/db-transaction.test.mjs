import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../server/db/pool.mjs";
import { withTransaction } from "../server/db/transaction.mjs";
import { withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

/** A pool whose client logs every statement; `fail` maps a statement to the error the database answers it with. */
async function withFakePool(run, { fail = {} } = {}) {
  const log = [], saved = { connect: pool.connect };
  pool.connect = async () => ({
    query: async (sql) => { log.push(sql); if (fail[sql]) throw fail[sql]; return { rows: [] }; },
    release: (error) => log.push(error ? `release(${error.message})` : "release"),
  });
  try { await run(log); } finally { Object.assign(pool, saved); }
}

test("the work's answer is committed and returned, and the client goes back", async () => {
  await withFakePool(async (log) => {
    assert.equal(await withTransaction(async (client) => { await client.query("UPDATE x"); return 7; }), 7);
    assert.deepEqual(log, ["BEGIN", "UPDATE x", "COMMIT", "release"]);
  });
});

test("work that throws is rolled back, the error comes through, and the client still goes back", async () => {
  await withFakePool(async (log) => {
    await assert.rejects(withTransaction(async (client) => { await client.query("UPDATE x"); throw new Error("boom"); }), /boom/);
    assert.deepEqual(log, ["BEGIN", "UPDATE x", "ROLLBACK", "release"]);
  });
});

test("a COMMIT the database refuses is the error that comes through, and the client goes back once", async () => {
  const refused = new Error("commit refused");
  await withFakePool(async (log) => {
    await assert.rejects(withTransaction(async (client) => { await client.query("UPDATE x"); }), (error) => error === refused);
    assert.deepEqual(log, ["BEGIN", "UPDATE x", "COMMIT", "ROLLBACK", "release"]);
  }, { fail: { COMMIT: refused } });
});

test("a ROLLBACK that fails leaves the original error in place, and the client is dropped instead of going back", async () => {
  const original = new Error("boom"), stuck = new Error("rollback refused");
  await withFakePool(async (log) => {
    await assert.rejects(withTransaction(async () => { throw original; }), (error) => error === original);
    assert.deepEqual(log, ["BEGIN", "ROLLBACK", "release(rollback refused)"]);
  }, { fail: { ROLLBACK: stuck } });
});

test("a read is one snapshot that cannot write", async () => {
  await withFakePool(async (log) => {
    await withTransaction(async () => null, { readOnly: true });
    assert.equal(log[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  });
});

const addCoach = (login) => `INSERT INTO users (login, login_key, telegram, password_hash) VALUES ('${login}', '${login}', '@${login}', 'x')`;
const coaches = async (client) => (await client.query("SELECT count(*)::int AS n FROM users")).rows[0].n;

test("on a real database the work lands only when it finishes, and a throw leaves nothing behind", { skip: scratchSkip }, () => withApiDatabase(async ({ client }) => {
  await assert.rejects(withTransaction(async (inside) => { await inside.query(addCoach("lion")); throw new Error("boom"); }), /boom/);
  assert.equal(await coaches(client), 0);
  await withTransaction((inside) => inside.query(addCoach("lion")));
  assert.equal(await coaches(client), 1);
}));

test("on a real database a read sees one moment and cannot write", { skip: scratchSkip }, () => withApiDatabase(async ({ client }) => {
  await client.query(addCoach("lion"));
  const seen = await withTransaction(async (inside) => {
    const before = await coaches(inside);
    await client.query(addCoach("wolf")); // another connection commits while the read is open
    return [before, await coaches(inside)];
  }, { readOnly: true });
  assert.deepEqual(seen, [1, 1]);
  assert.equal(await coaches(client), 2);
  await assert.rejects(withTransaction((inside) => inside.query("DELETE FROM users"), { readOnly: true }), { code: "25006" });
  assert.equal(await coaches(client), 2);
}));
