/**
 * What the deploy's schema step does, decided before it touches anything.
 *
 * A migration is the one deploy step that cannot be undone by putting the old
 * code back, so it never runs without a fresh dump to return to.
 */
export function planDeployMigration({ pending, changed }) {
  if (changed.length) {
    return { action: "refuse", message: `edited after being applied: ${changed.join(", ")}` };
  }
  if (!pending.length) return { action: "skip", message: "no pending migrations, backup skipped" };
  return { action: "backup-then-migrate", message: `pending: ${pending.map((migration) => migration.name).join(", ")}` };
}

/** The database a connection string names, the way the driver reads it; "" when it names none. */
function databaseNameOf(databaseUrl) {
  try {
    return decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\//, ""));
  } catch {
    return "";
  }
}

/**
 * The migration goes to the database in DATABASE_URL, but the dump in front of
 * it is of POSTGRES_DB, inside the container (scripts/backup-db.mjs). If those
 * name different databases the "backup before migrating" would be of the wrong
 * one, so the deploy stops instead.
 *
 * @param {{databaseUrl: string|undefined, postgresDb: string|undefined}} target
 *   postgresDb is resolved as backup-db.mjs resolves it: the environment first,
 *   then the env file
 * @returns {{ok: true}|{ok: false, message: string}}
 */
export function checkBackupTarget({ databaseUrl, postgresDb }) {
  const migrated = databaseNameOf(databaseUrl);
  if (!migrated) {
    return { ok: false, message: "DATABASE_URL does not name a database; refusing to migrate without knowing which database the backup must cover" };
  }
  const refusal = "refusing to migrate without a backup of the same database";
  if (!postgresDb) {
    return { ok: false, message: `DATABASE_URL names ${migrated} but POSTGRES_DB is not set, so the backup has no database to dump; ${refusal}` };
  }
  if (postgresDb !== migrated) {
    return { ok: false, message: `DATABASE_URL names ${migrated} but the backup would dump POSTGRES_DB=${postgresDb}; ${refusal}` };
  }
  return { ok: true };
}
