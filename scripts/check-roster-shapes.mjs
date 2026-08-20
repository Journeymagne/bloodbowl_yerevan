#!/usr/bin/env node
/**
 * Verify that no saved team is still stored in a retired roster shape.
 *
 * Support for the two older shapes was removed from the app:
 *
 *   - `slots`: a fixed-length array of slot objects
 *   - `roster` counts plus `playerEdits` keyed by "rowIndex-copyIndex"
 *
 * A team stored in either of those now reads as an empty roster. Run this
 * against the production database **before** deploying that change:
 *
 *   DATABASE_URL=postgres://... node scripts/check-roster-shapes.mjs
 *
 * Exit 0: every team is in the current shape — safe to deploy.
 * Exit 1: at least one team would lose its players — they are listed.
 * Exit 2: could not connect / no DATABASE_URL.
 *
 * Read-only: the script issues a single SELECT and never writes.
 * `--json` prints the raw report instead of the summary.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";

import { ROSTER_SHAPES, classifyRosterShape, hasVestigialKeys } from "../src/domain/roster/shape.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvFile() {
  let body = "";
  try {
    body = await fs.readFile(path.join(rootDir, ".env"), "utf8");
  } catch {
    return;
  }
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && process.env[key] === undefined) process.env[key] = value;
  }
}

await loadEnvFile();

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is required (put it in .env or pass it on the command line).");
  process.exit(2);
}

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

let rows;
try {
  // Deliberately plain SQL: the shape rules live in one tested module rather
  // than in jsonb expressions nobody can unit-test.
  ({ rows } = await pool.query(`
    SELECT saved_teams.id,
           saved_teams.name,
           saved_teams.updated_at,
           saved_teams.roster,
           users.login AS owner
    FROM saved_teams
    JOIN users ON users.id = saved_teams.user_id
    ORDER BY saved_teams.updated_at DESC
  `));
} catch (error) {
  console.error(`Could not read saved_teams: ${error.message}`);
  await pool.end();
  process.exit(2);
} finally {
  if (!rows) await pool.end().catch(() => {});
}

if (rows) await pool.end();

const report = rows.map((row) => ({
  id: row.id,
  name: row.name,
  owner: row.owner,
  updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  ...classifyRosterShape(row.roster),
  vestigial: hasVestigialKeys(row.roster),
}));

const retired = report.filter((item) => item.shape === ROSTER_SHAPES.RETIRED);
const empty = report.filter((item) => item.shape === ROSTER_SHAPES.EMPTY);
const current = report.filter((item) => item.shape === ROSTER_SHAPES.CURRENT);
const vestigial = report.filter((item) => item.vestigial);

if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ total: report.length, retired, empty, current, vestigial }, null, 2));
} else {
  console.log(`Saved teams: ${report.length}`);
  console.log(`  current shape (players[] present): ${current.length}`);
  console.log(`  empty rosters (nothing to lose):   ${empty.length}`);
  console.log(`  retired shape, would read empty:   ${retired.length}`);
  console.log(`  players[] plus leftover old keys:  ${vestigial.length}`);

  if (vestigial.length) {
    console.log("\nLeftover `slots` / `playerEdits` keys sit next to a real players[] in some rows.");
    console.log("Harmless — the app ignores them — and they disappear on the next save.");
  }

  if (retired.length) {
    console.log("\nThese teams are stored in a retired shape and WILL read as empty:\n");
    for (const item of retired) {
      console.log(`  ${item.owner} / ${item.name} (${item.id})`);
      console.log(`      slots ${item.slots}, playerEdits ${item.edits}, counts ${item.counts}, updated ${item.updatedAt}`);
    }
    console.log("\nDo not deploy the removal until these are converted or deleted.");
  } else {
    console.log("\nNo team is in a retired shape — safe to deploy the removal.");
  }
}

process.exit(retired.length ? 1 : 0);
