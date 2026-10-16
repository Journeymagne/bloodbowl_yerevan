#!/usr/bin/env node
/**
 * Apply outstanding migrations to gata_rehearsal and say how long they took.
 *
 * The same code path as `npm run db:migrate` (server/db/migrate.mjs), pointed
 * at the rehearsal database so nobody has to assemble its URL by hand. The
 * time is what the cutover's maintenance window has to allow for.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { applyMigrations } from "../server/db/migrate.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const pool = new pg.Pool({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
const started = performance.now();
try {
  const applied = await applyMigrations(pool);
  console.log(`rehearsal:migrate: applied ${applied.length} migration(s) in ${Math.round(performance.now() - started)} ms${applied.length ? `: ${applied.join(", ")}` : ""}`);
} catch (error) {
  console.error(`rehearsal:migrate: ${error.message}`);
  process.exitCode = 1;
} finally {
  await pool.end();
}
