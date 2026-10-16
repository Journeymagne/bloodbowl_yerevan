#!/usr/bin/env node
/**
 * Snapshot the rehearsal database before migrating, and compare after.
 *
 *   npm run rehearsal:check -- --before
 *   npm run rehearsal:migrate
 *   npm run rehearsal:check -- --after      # writes output/rehearsal/report.md
 *
 * Always reads gata_rehearsal (scripts/rehearsal/guard.mjs), never the database
 * DATABASE_URL names, and only once the restore has marked it as anonymized
 * (scripts/rehearsal/marker.mjs). Exits 1 when existing data changed. An OK needs
 * a migration to have been applied between the two snapshots: with none, nothing
 * was tested, and it says so.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";
import { assertAnonymized } from "./rehearsal/marker.mjs";
import { compareSnapshots, renderReport, takeSnapshot, verdict } from "./rehearsal/snapshot.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");
await loadEnvFile(rootDir);

// null when the file is not there; a file that is there but not JSON is an error of its own.
async function readJson(name) {
  let text;
  try {
    text = await fs.readFile(path.join(outDir, name), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`output/rehearsal/${name} is not valid JSON`);
  }
}

async function readBefore() {
  let before;
  try {
    before = await readJson("before.json");
  } catch (error) {
    throw new Error(`${error.message} — run \`npm run rehearsal:check -- --before\` again`);
  }
  if (!before) throw new Error("no output/rehearsal/before.json — run `npm run rehearsal:check -- --before` before migrating");
  return before;
}

async function main() {
  const phase = process.argv.includes("--before") ? "before" : process.argv.includes("--after") ? "after" : null;
  if (!phase) throw new Error("usage: npm run rehearsal:check -- --before | --after");
  const before = phase === "after" ? await readBefore() : null;
  const client = new pg.Client({ connectionString: rehearsalDatabaseUrl(process.env.DATABASE_URL) });
  await client.connect();
  let snapshot;
  try {
    await assertAnonymized(client);
    snapshot = await takeSnapshot(client);
  } finally {
    await client.end();
  }
  await fs.mkdir(outDir, { recursive: true });
  await fs.writeFile(path.join(outDir, `${phase}.json`), `${JSON.stringify(snapshot, null, 2)}\n`);
  if (phase === "before") {
    // A new --before starts a new measurement; the time of an earlier migrate is not this one's.
    await fs.rm(path.join(outDir, "migrate.json"), { force: true });
    console.log(`rehearsal:check: snapshot of ${Object.keys(snapshot.teams).length} teams written to output/rehearsal/before.json`);
    return;
  }
  const comparison = compareSnapshots(before, snapshot);
  await fs.writeFile(path.join(outDir, "report.md"), renderReport(before, snapshot, comparison, await readJson("migrate.json")));
  const { strong, rest } = verdict(before, snapshot, comparison);
  const report = "output/rehearsal/report.md";
  console.log(`rehearsal:check: ${strong}${rest}${comparison.problems.length ? ` — see ${report}` : ` (${report})`}`);
  if (comparison.problems.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`rehearsal:check: ${error.message}`);
  process.exitCode = 1;
});
