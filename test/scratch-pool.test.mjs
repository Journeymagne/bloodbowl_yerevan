import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { scratchSkip, withScratchDatabase, withServerPool } from "./helpers/scratch-db.mjs";

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const OTHER_CONNECTIONS = `SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND backend_type = 'client backend' AND pid <> pg_backend_pid()`;

test("withServerPool returns only when its pool's connections have really closed, however long that takes", { skip: scratchSkip }, () =>
  withScratchDatabase(async ({ client, url }) => {
    // A connection takes a moment to close, and longer on a busy machine. Dropping the database while one is
    // still closing terminates it, and the pool reports that as an error nobody listens to. Here it takes a while.
    const { end } = pg.Client.prototype;
    pg.Client.prototype.end = function slowEnd(done) { setTimeout(() => end.call(this, done), 100); };
    try {
      await withServerPool(url, async () => {
        const { pool } = await import("../server/db/pool.mjs");
        await Promise.all(Array.from({ length: 8 }, () => pool.query("SELECT pg_sleep(0.05)")));
      });
    } finally { pg.Client.prototype.end = end; }
    assert.equal((await client.query(OTHER_CONNECTIONS)).rows[0].n, 0);
  }, { through: "001_baseline.sql" }));

test("a pool whose connections do not close in time is reported, not waited on for ever", { skip: scratchSkip }, () =>
  withScratchDatabase(async ({ client, url }) => {
    const { end } = pg.Client.prototype;
    pg.Client.prototype.end = function slowEnd(done) { setTimeout(() => end.call(this, done), 400); };
    try {
      await assert.rejects(withServerPool(url, async () => {
        const { pool } = await import("../server/db/pool.mjs");
        await Promise.all([1, 2].map(() => pool.query("SELECT 1")));
      }, { closeTimeoutMs: 50 }), /connection\(s\) of the scratch pool still open after 50 ms/);
    } finally { pg.Client.prototype.end = end; }
    for (let waited = 0; (await client.query(OTHER_CONNECTIONS)).rows[0].n > 0 && waited < 3000; waited += 50) await sleep(50);
    assert.equal((await client.query(OTHER_CONNECTIONS)).rows[0].n, 0, "they close in the end, before the database is dropped");
  }, { through: "001_baseline.sql" }));
