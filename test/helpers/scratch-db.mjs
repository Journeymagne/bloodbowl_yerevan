/**
 * A throwaway database on the local Postgres, for the tests that need the real
 * engine: migrations, SQL a fake client would only echo back, and races that
 * need real connections queueing on a real lock.
 *
 * Opt-in. GATA_TEST_DATABASE_URL names the local server — the DATABASE_URL in
 * .env will do, only its host, port and credentials are used. Without it these
 * tests skip, so `npm test` stays green on a machine with no database. The URL
 * must be local (scripts/rehearsal/guard.mjs); every call creates its own
 * gata_test_* database from template0 and drops it afterwards, pass or fail.
 */
import { randomBytes } from "node:crypto";
import pg from "pg";

import { migrationStatus, readMigrations } from "../../server/db/migrate.mjs";
import { assertLocalDatabaseUrl } from "../../scripts/rehearsal/guard.mjs";

const configured = process.env.GATA_TEST_DATABASE_URL;

/** `skip` for node:test: false when a database is configured, the reason otherwise. */
export const scratchSkip = configured ? false : "set GATA_TEST_DATABASE_URL to a local Postgres to run the database tests";

function urlFor(database) {
  const url = assertLocalDatabaseUrl(configured);
  url.pathname = `/${database}`;
  return url.toString();
}

/** One migration file as the runner applies it: its SQL and its log row, in one transaction. */
export async function runMigration(client, name) {
  const migration = (await readMigrations()).find((item) => item.name === name);
  if (!migration) throw new Error(`no migration ${name}`);
  await client.query("BEGIN");
  try {
    await client.query(migration.sql);
    await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING",
      [migration.name, migration.checksum]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  }
}

/**
 * Every migration up to and including `last` (all of them without it), in the runner's order.
 * `last` is an exact file name: a misspelt one would apply everything and look fine.
 */
export async function migrateThrough(client, last = null) {
  const migrations = await readMigrations();
  if (last && !migrations.some(({ name }) => name === last)) throw new Error(`no migration ${last}`);
  await migrationStatus(client); // creates schema_migrations exactly as the runner does
  for (const { name } of migrations) {
    if (last && name.localeCompare(last, "en") > 0) break;
    await runMigration(client, name);
  }
}

/**
 * Runs `run` with the server's pool (server/db/pool.mjs) answering from the database at `url`: its
 * `query` and `connect` are a real pg.Pool's for that long, then its own methods come back and the
 * borrowed pool is ended. Route code runs unchanged against the throwaway database, with real
 * connections and real locks, so concurrent requests are tested as they happen.
 *
 * The pool module is imported here and not at the top: it loads the env file, which the tests that
 * only need a scratch database have no use for.
 */
export async function withServerPool(url, run) {
  const { pool } = await import("../../server/db/pool.mjs");
  const scratch = new pg.Pool({ connectionString: url });
  const { query, connect } = pool;
  pool.query = scratch.query.bind(scratch);
  pool.connect = scratch.connect.bind(scratch);
  try {
    return await run();
  } finally {
    pool.query = query;
    pool.connect = connect;
    await scratch.end();
  }
}

/** The statement that takes a row's lock, as `[sql, values]` for `client.query(...lockRow("users", id))`. */
export function lockRow(table, id) {
  return [`SELECT 1 FROM ${table} WHERE id = $1 FOR UPDATE`, [id]];
}

const WAITING_ON_A_LOCK = `SELECT count(*)::int AS n FROM pg_stat_activity
  WHERE datname = current_database() AND wait_event_type = 'Lock' AND pid <> pg_backend_pid()`;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs `starters` while a client of its own holds `lock`, and lets go only once at least `waiting`
 * backends of this database are queued on a lock.
 *
 * Why: a race that `Promise.all` happens to win proves nothing — the requests may simply have run one
 * after the other, and the test would pass for a server with no locking at all. Holding the lock makes
 * every request queue on it, and counting the queue in pg_stat_activity makes the test know that they
 * did; when they never do, it throws instead of passing.
 *
 * @param {string} url the scratch database
 * @param {{lock: [string, unknown[]?], waiting: number, timeoutMs?: number}} options `lock` is what
 *   `lockRow` returns, and should be the first lock every starter reaches
 * @param {Array<() => Promise<unknown>>} starters one per request, all started together
 * @returns {Promise<PromiseSettledResult<unknown>[]>} how each request ended, once every one has
 */
export async function withForcedOverlap(url, { lock, waiting, timeoutMs = 5000 }, starters) {
  const holder = new pg.Client({ connectionString: url });
  await holder.connect();
  try {
    await holder.query("BEGIN");
    await holder.query(...lock);
    // Started together and not awaited: they run into the lock while this client counts them.
    const running = Promise.allSettled(starters.map((start) => Promise.resolve().then(start)));
    const deadline = Date.now() + timeoutMs;
    let queued;
    for (;;) {
      // A transaction keeps the first picture it takes of pg_stat_activity, and this one is open:
      // without a new one the count would stay at whatever it was on the first look.
      await holder.query("SELECT pg_stat_clear_snapshot()");
      queued = (await holder.query(WAITING_ON_A_LOCK)).rows[0].n;
      if (queued >= waiting || Date.now() >= deadline) break;
      await sleep(25);
    }
    await holder.query("COMMIT");
    const results = await running;
    if (queued < waiting) throw new Error(`only ${queued} of ${waiting} requests waited on the lock: they did not overlap`);
    return results;
  } finally {
    await holder.query("ROLLBACK").catch(() => {});
    await holder.end().catch(() => {});
  }
}

export async function withScratchDatabase(run, { through = null } = {}) {
  const name = `gata_test_${randomBytes(6).toString("hex")}`;
  const server = new pg.Client({ connectionString: urlFor("postgres") });
  await server.connect();
  try {
    // template0: nobody is ever connected to it, so parallel test files never collide on the template.
    await server.query(`CREATE DATABASE ${name} TEMPLATE template0`);
    const client = new pg.Client({ connectionString: urlFor(name) });
    await client.connect();
    try {
      await migrateThrough(client, through);
      await run({ client, url: urlFor(name) });
    } finally {
      await client.end();
    }
  } finally {
    await server.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`)
      .catch((error) => console.error(`could not drop ${name}: ${error.message}`));
    await server.end();
  }
}
