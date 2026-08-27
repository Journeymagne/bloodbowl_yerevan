/**
 * Schema migrations: applied by an explicit command, never by starting up.
 *
 * The server used to run server/init.sql on every boot. That file was mostly
 * idempotent schema statements, so it looked harmless — but it also carried
 * data edits, and re-running those on each restart is how a pending match
 * result quietly became a confirmed one. Worse, it meant nobody could tell
 * which changes a given database had actually seen.
 *
 * So: numbered files in ./migrations, applied in name order, each recorded in
 * `schema_migrations` inside the same transaction that applies it. A file that
 * fails leaves nothing behind. A file that has already been applied is skipped.
 * Editing an applied file is refused — its checksum is recorded, and a mismatch
 * means the database and the repository disagree about what was run.
 *
 * The server calls `assertMigrationsApplied()` at boot and refuses to start if
 * anything is outstanding, rather than applying it and hoping.
 */
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

const CREATE_TABLE = `
  CREATE TABLE IF NOT EXISTS schema_migrations (
    name TEXT PRIMARY KEY,
    checksum TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )
`;

function checksumOf(sql) {
  // Line endings differ between a Windows checkout and the server; the SQL does
  // not, so they must not change the checksum.
  return createHash("sha256").update(sql.replace(/\r\n/g, "\n")).digest("hex");
}

/** Every migration on disk, in the order they must be applied. */
export async function readMigrations() {
  const names = (await fs.readdir(migrationsDir))
    .filter((name) => name.endsWith(".sql"))
    .sort((a, b) => a.localeCompare(b, "en"));
  return Promise.all(names.map(async (name) => {
    const sql = await fs.readFile(path.join(migrationsDir, name), "utf8");
    return { name, sql, checksum: checksumOf(sql) };
  }));
}

async function readApplied(pool) {
  await pool.query(CREATE_TABLE);
  const { rows } = await pool.query("SELECT name, checksum FROM schema_migrations");
  return new Map(rows.map((row) => [row.name, row.checksum]));
}

/**
 * What this database still owes, and what it disagrees with us about.
 *
 * @returns {Promise<{pending: object[], changed: string[]}>}
 */
export async function migrationStatus(pool) {
  const [migrations, applied] = await Promise.all([readMigrations(), readApplied(pool)]);
  const pending = [];
  const changed = [];
  for (const migration of migrations) {
    const seen = applied.get(migration.name);
    if (seen === undefined) pending.push(migration);
    else if (seen !== migration.checksum) changed.push(migration.name);
  }
  return { pending, changed };
}

/**
 * Apply everything outstanding. Each file gets its own transaction, so a
 * failure leaves the database at the last migration that worked.
 *
 * @returns {Promise<string[]>} the names applied, in order
 */
export async function applyMigrations(pool, log = console.log) {
  const { pending, changed } = await migrationStatus(pool);
  if (changed.length) {
    throw new Error(
      `these migrations were edited after being applied: ${changed.join(", ")}. `
      + "A migration is a record of what ran; write a new one instead.",
    );
  }
  const done = [];
  for (const migration of pending) {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(migration.sql);
      await client.query(
        "INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)",
        [migration.name, migration.checksum],
      );
      await client.query("COMMIT");
      log(`applied ${migration.name}`);
      done.push(migration.name);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw new Error(`${migration.name} failed: ${error.message}`, { cause: error });
    } finally {
      client.release();
    }
  }
  if (!done.length) log("no migrations to apply");
  return done;
}

/**
 * Refuse to serve a database that is not at the schema this code expects.
 *
 * Called at boot. Starting anyway is how you get a deploy that half-works: the
 * new code reads a column the old schema does not have, and every request that
 * touches it fails at three in the morning instead of at deploy time.
 */
export async function assertMigrationsApplied(pool) {
  const { pending, changed } = await migrationStatus(pool);
  if (changed.length) {
    throw new Error(`migrations edited after being applied: ${changed.join(", ")}`);
  }
  if (pending.length) {
    throw new Error(
      `database is behind: ${pending.map((migration) => migration.name).join(", ")} not applied. `
      + "Run `npm run db:migrate`.",
    );
  }
}
