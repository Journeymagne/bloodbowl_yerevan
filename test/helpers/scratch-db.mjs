/**
 * A throwaway database on the local Postgres, for the tests that need the real
 * engine: migrations, and SQL a fake client would only echo back.
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
