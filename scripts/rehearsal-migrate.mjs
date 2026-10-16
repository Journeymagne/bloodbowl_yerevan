#!/usr/bin/env node
/**
 * Apply outstanding migrations to gata_rehearsal and say how long they took.
 *
 * The same code path as `npm run db:migrate` (server/db/migrate.mjs), pointed
 * at the rehearsal database so nobody has to assemble its URL by hand. The
 * time is what the cutover's maintenance window has to allow for; it goes to
 * output/rehearsal/migrate.json for `rehearsal:check -- --after` to put in the
 * report. Refuses a database the restore has not marked as anonymized
 * (scripts/rehearsal/marker.mjs).
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { applyMigrations } from "../server/db/migrate.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";
import { assertAnonymized } from "./rehearsal/marker.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");
await loadEnvFile(rootDir);

async function main() {
  const pool = new pg.Pool({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
  try {
    await assertAnonymized(pool);
    const started = performance.now();
    const applied = await applyMigrations(pool);
    const ms = Math.round(performance.now() - started);
    await fs.mkdir(outDir, { recursive: true });
    await fs.writeFile(path.join(outDir, "migrate.json"), `${JSON.stringify({ at: new Date().toISOString(), applied, ms }, null, 2)}\n`);
    console.log(`rehearsal:migrate: applied ${applied.length} migration(s) in ${ms} ms${applied.length ? `: ${applied.join(", ")}` : ""}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`rehearsal:migrate: ${error.message}`);
  process.exitCode = 1;
});
