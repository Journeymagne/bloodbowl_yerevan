#!/usr/bin/env node
/**
 * Apply outstanding schema migrations.
 *
 *   npm run db:migrate            apply everything pending
 *   npm run db:migrate -- --check report what is pending, change nothing
 *
 * Reads DATABASE_URL the same way the server does: the env file outside the
 * served directory first, the repository's own .env as a fallback.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { applyMigrations, migrationStatus } from "../server/db/migrate.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is not set. Point it at the database to migrate.");
  process.exit(1);
}

const checkOnly = process.argv.includes("--check");
const pool = new pg.Pool({ connectionString: databaseUrl });

try {
  if (checkOnly) {
    const { pending, changed } = await migrationStatus(pool);
    if (changed.length) {
      console.error(`edited after being applied: ${changed.join(", ")}`);
      process.exit(1);
    }
    if (!pending.length) {
      console.log("database is up to date");
    } else {
      console.error(`pending: ${pending.map((migration) => migration.name).join(", ")}`);
      process.exit(1);
    }
  } else {
    await applyMigrations(pool);
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
