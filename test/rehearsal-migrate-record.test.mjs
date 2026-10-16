import test from "node:test";
import assert from "node:assert/strict";

import { mergeMigrateRecord } from "../scripts/rehearsal/migrate-record.mjs";

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
