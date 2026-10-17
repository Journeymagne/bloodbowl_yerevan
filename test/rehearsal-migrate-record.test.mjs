import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { assertMigrateRecord, mergeMigrateRecord } from "../scripts/rehearsal/migrate-record.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const first = { at: "2026-11-01T10:00:00.000Z", applied: ["009_team_stage.sql", "010_team_ledger.sql"], ms: 812 };
const empty = { at: "2026-11-01T10:07:00.000Z", applied: [], ms: 6 };

test("the first run is the record", () => {
  assert.deepEqual(mergeMigrateRecord(null, first), { ...first, runs: [first] });
});

test("a re-run that applies nothing keeps the real time", () => {
  assert.deepEqual(mergeMigrateRecord(mergeMigrateRecord(null, first), empty), { at: first.at, applied: first.applied, ms: 812, runs: [first, empty] });
});

test("a later run that applies more adds its names and its time", () => {
  const later = { at: "2026-11-02T09:00:00.000Z", applied: ["014_match_events.sql"], ms: 40 };
  assert.deepEqual(mergeMigrateRecord(mergeMigrateRecord(null, first), later),
    { at: first.at, applied: [...first.applied, "014_match_events.sql"], ms: 852, runs: [first, later] });
});

test("a record written before runs were kept counts as one run", () => {
  assert.deepEqual(mergeMigrateRecord(first, empty), { at: first.at, applied: first.applied, ms: 812, runs: [first, empty] });
});

test("runs that all applied nothing still say how long they took", () => {
  assert.deepEqual(mergeMigrateRecord(null, empty), { ...empty, runs: [empty] });
});

test("a record of the wrong shape is refused before anything is applied; none, a legacy one and a merged one pass", () => {
  assert.equal(assertMigrateRecord(null), null);
  assert.deepEqual(assertMigrateRecord(first), first);
  assert.deepEqual(assertMigrateRecord(mergeMigrateRecord(first, empty)), mergeMigrateRecord(first, empty));
  for (const bad of [[], {}, 42, { runs: {} }, { runs: [] }, { applied: "x", ms: 1 }, { runs: [{ applied: [], ms: "1" }] }]) {
    assert.throws(() => assertMigrateRecord(bad), /migrate\.json has the wrong shape/, JSON.stringify(bad));
  }
});

// The script runs its main() on import and keeps its record under its own root, so it has no seam to stub:
// this runs a copy of it in a scratch root whose server/, scripts/rehearsal/ and node_modules/ are the real
// ones, with an empty DATABASE_URL, so whatever the run reaches, it reaches no database.
const LINKS = ["server", "node_modules", path.join("scripts", "rehearsal")];

async function runWithRecord(record) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gata-rehearsal-migrate-"));
  try {
    await fs.mkdir(path.join(dir, "scripts"));
    await fs.copyFile(path.join(root, "scripts", "rehearsal-migrate.mjs"), path.join(dir, "scripts", "rehearsal-migrate.mjs"));
    for (const link of LINKS) await fs.symlink(path.join(root, link), path.join(dir, link));
    await fs.mkdir(path.join(dir, "output", "rehearsal"), { recursive: true });
    await fs.writeFile(path.join(dir, "output", "rehearsal", "migrate.json"), record);
    return spawnSync(process.execPath, [path.join(dir, "scripts", "rehearsal-migrate.mjs")], {
      env: { PATH: process.env.PATH, DATABASE_URL: "" }, encoding: "utf8",
    });
  } finally {
    for (const link of LINKS) await fs.unlink(path.join(dir, link)).catch(() => {});
    await fs.rm(dir, { recursive: true, force: true });
  }
}

test("rehearsal:migrate reads and checks its record first: one of the wrong shape stops the run before the database is reached", async () => {
  const control = await runWithRecord(JSON.stringify(first));
  assert.match(control.stderr, /DATABASE_URL is not a URL/, "a good record goes on to the database guard");
  for (const bad of ["{}", "[]", '{"runs":[]}', '{"applied":"x","ms":1}']) {
    const stopped = await runWithRecord(bad);
    assert.equal(stopped.status, 1, bad);
    assert.match(stopped.stderr, /migrate\.json has the wrong shape — run npm run rehearsal:check -- --before to start over/, bad);
    assert.doesNotMatch(stopped.stderr, /DATABASE_URL/, bad);
  }
});
