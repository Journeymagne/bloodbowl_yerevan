import test from "node:test";
import assert from "node:assert/strict";

import { STALE_AFTER_HOURS, summarizeBackups } from "../scripts/backup/status.mjs";

const dump = (name, size = 4096) => ({ name, size });
const now = new Date("2026-08-22T12:00:00Z");

test("counts the dumps and adds up their size", () => {
  const summary = summarizeBackups([
    dump("gata_league-20260820-040000.dump", 1000),
    dump("gata_league-20260821-040000.dump", 2000),
    dump("gata_league-20260822-040000.dump", 3000),
  ], { now });

  assert.equal(summary.count, 3);
  assert.equal(summary.totalBytes, 6000);
  assert.equal(summary.newest.name, "gata_league-20260822-040000.dump");
});

test("reports the age of the newest dump in hours", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  assert.equal(summary.ageHours, 8);
  assert.equal(summary.stale, false);
});

test("calls the backups stale once the newest is older than the limit", () => {
  const summary = summarizeBackups([dump("gata_league-20260820-040000.dump")], { now });
  assert.equal(summary.ageHours, 56);
  assert.equal(summary.stale, true);
});

test("an empty directory is stale, not merely empty", () => {
  const summary = summarizeBackups([], { now });
  assert.equal(summary.count, 0);
  assert.equal(summary.newest, null);
  assert.equal(summary.ageHours, null);
  assert.equal(summary.stale, true);
});

test("ignores files that are not dumps", () => {
  const summary = summarizeBackups([
    dump("gata_league-20260822-040000.dump", 4096),
    dump("gata_league-20260822-050000.dump.partial", 99),
    dump("notes.txt", 10),
  ], { now });

  assert.equal(summary.count, 1);
  assert.equal(summary.totalBytes, 4096);
});

test("flags a directory holding more dumps than the retention limit", () => {
  const names = [15, 16, 17, 18, 19, 20, 21, 22]
    .map((day) => dump(`gata_league-202608${day}-040000.dump`));
  const summary = summarizeBackups(names, { now, keep: 7 });
  assert.equal(summary.overKeep, true);
  assert.equal(summarizeBackups(names.slice(1), { now, keep: 7 }).overKeep, false);
});

test("the staleness limit is two days", () => {
  assert.equal(STALE_AFTER_HOURS, 48);
});
