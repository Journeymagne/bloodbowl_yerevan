#!/usr/bin/env node
/**
 * Snapshot the rehearsal database before migrating, and compare after.
 *
 *   npm run rehearsal:check -- --before
 *   npm run rehearsal:migrate
 *   npm run rehearsal:check -- --after      # writes output/rehearsal/report.md
 *
 * Always reads gata_rehearsal (scripts/rehearsal/guard.mjs), never the database
 * DATABASE_URL names. Exits 1 when existing data changed.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";
import { compareSnapshots, renderReport, takeSnapshot } from "./rehearsal/snapshot.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");
await loadEnvFile(rootDir);

async function readBefore() {
  try {
    return JSON.parse(await fs.readFile(path.join(outDir, "before.json"), "utf8"));
  } catch {
    throw new Error("no output/rehearsal/before.json — run `npm run rehearsal:check -- --before` before migrating");
  }
}

async function main() {
  const phase = process.argv.includes("--before") ? "before" : process.argv.includes("--after") ? "after" : null;
  if (!phase) throw new Error("usage: npm run rehearsal:check -- --before | --after");
  const before = phase === "after" ? await readBefore() : null;
  const client = new pg.Client({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
  await client.connect();
  let snapshot;
  try {
    snapshot = await takeSnapshot(client);
  } finally {
    await client.end();
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${phase}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  if (phase === "before") {
    console.log(`rehearsal:check: snapshot of ${Object.keys(snapshot.teams).length} teams written to output/rehearsal/before.json`);
    return;
  }
  const comparison = compareSnapshots(before, snapshot);
  await fs.writeFile(path.join(outDir, "report.md"), renderReport(before, snapshot, comparison));
  console.log(comparison.problems.length
    ? `rehearsal:check: ${comparison.problems.length} problem(s) — see output/rehearsal/report.md`
    : "rehearsal:check: OK — no existing data changed (output/rehearsal/report.md)");
  if (comparison.problems.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`rehearsal:check: ${error.message}`);
  process.exitCode = 1;
});
