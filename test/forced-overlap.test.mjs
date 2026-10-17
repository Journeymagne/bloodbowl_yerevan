import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { lockRow, scratchSkip, withForcedOverlap, withScratchDatabase } from "./helpers/scratch-db.mjs";

/** A transaction of its own that locks the user row, then notes that it got through. */
async function locker(url, userId, through) {
  const client = new pg.Client({ connectionString: url });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(...lockRow("users", userId));
    through.push(userId);
    await client.query("COMMIT");
  } finally { await client.end(); }
}

const someone = async (client) => (await client.query(
  "INSERT INTO users (login, login_key, telegram, password_hash) VALUES ('u', 'u', '@u', 'x') RETURNING id")).rows[0].id;

test("requests that take the held lock wait on it together and run once it is released", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    const user = await someone(client), through = [];
    const results = await withForcedOverlap(url, { lock: lockRow("users", user), waiting: 2 },
      [() => locker(url, user, through), () => locker(url, user, through)]);
    assert.deepEqual(results.map((result) => result.status), ["fulfilled", "fulfilled"]);
    assert.equal(through.length, 2);
  });
});

test("requests that never wait on the lock are reported, not passed off as overlapping", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    const user = await someone(client);
    await assert.rejects(withForcedOverlap(url, { lock: lockRow("users", user), waiting: 1, timeoutMs: 300 }, [async () => "no lock"]),
      /did not overlap/);
  });
});

const NOBODY = "44444444-4444-4444-8444-444444444444";

test("a lock that matches no row holds nothing, and is said to: no request is started", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ url }) => {
    let started = false;
    await assert.rejects(withForcedOverlap(url, { lock: lockRow("users", NOBODY), waiting: 1, timeoutMs: 300 }, [async () => { started = true; }]),
      /the lock matched no row/);
    assert.equal(started, false);
  });
});

test("a race that never overlapped still lets the lock go: another client takes the row at once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    const user = await someone(client);
    await assert.rejects(withForcedOverlap(url, { lock: lockRow("users", user), waiting: 2, timeoutMs: 300 }, [async () => "no lock"]), /did not overlap/);
    const [sql, values] = lockRow("users", user);
    await client.query("BEGIN");
    await client.query(`${sql} NOWAIT`, values); // 55P03 if the holder had kept it
    await client.query("COMMIT");
  });
});

test("a request that fails while the lock is held is one of the answers, not an error of the race's own", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client, url }) => {
    const user = await someone(client), through = [];
    const results = await withForcedOverlap(url, { lock: lockRow("users", user), waiting: 1 },
      [async () => { throw new Error("refused before the lock"); }, () => locker(url, user, through)]);
    assert.deepEqual(results.map((result) => result.status), ["rejected", "fulfilled"]);
    assert.equal(results[0].reason.message, "refused before the lock");
    assert.deepEqual(through, [user]);
  });
});
