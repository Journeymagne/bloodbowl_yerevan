#!/usr/bin/env node
/**
 * Apply outstanding migrations to gata_rehearsal and say how long they took.
 *
 * The same code path as `npm run db:migrate` (server/db/migrate.mjs), pointed
 * at the rehearsal database so nobody has to assemble its URL by hand. The
 * time is what the cutover's maintenance window has to allow for; it goes to
 * output/rehearsal/migrate.json for `rehearsal:check -- --after` to put in the
 * report. A second run adds to that file instead of replacing it (it usually
 * applies nothing, and the first run's time is the one that matters; see
 * scripts/rehearsal/migrate-record.mjs); `rehearsal:check -- --before` starts it
 * over. Refuses a database the restore has not marked as anonymized
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
import { assertMigrateRecord, mergeMigrateRecord } from "./rehearsal/migrate-record.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");
await loadEnvFile(rootDir);

const recordFile = path.join(outDir, "migrate.json");

// null when there is no record yet; one that is there but not JSON, or not of a shape a run can be added to, is an error of its own.
async function readRecord() {
  let text;
  try {
    text = await fs.readFile(recordFile, "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error("output/rehearsal/migrate.json is not valid JSON — run npm run rehearsal:check -- --before to start over");
  }
  return assertMigrateRecord(value);
}

async function main() {
  // Read first: a record that is not JSON, or of the wrong shape, stops the run before anything is applied, not after.
  const previous = await readRecord();
  const pool = new pg.Pool({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
  try {
    await assertAnonymized(pool);
    const started = performance.now();
    const applied = await applyMigrations(pool);
    const ms = Math.round(performance.now() - started);
    await fs.mkdir(outDir, { recursive: true });
    const record = mergeMigrateRecord(previous, { at: new Date().toISOString(), applied, ms });
    await fs.writeFile(recordFile, `${JSON.stringify(record, null, 2)}\n`);
    const total = record.runs.length > 1 ? `; record: ${record.applied.length} applied in ${record.ms} ms over ${record.runs.length} runs` : "";
    console.log(`rehearsal:migrate: applied ${applied.length} migration(s) in ${ms} ms${applied.length ? `: ${applied.join(", ")}` : ""}${total}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`rehearsal:migrate: ${error.message}`);
  process.exitCode = 1;
});
