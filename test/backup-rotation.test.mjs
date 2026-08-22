import test from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_KEEP,
  PARTIAL_MAX_AGE_MS,
  formatDumpName,
  isDumpName,
  parseDumpTimestamp,
  planRotation,
} from "../scripts/backup/rotation.mjs";

const dumpsFor = (...days) => days.map((day) => ({
  name: `gata_league-202608${String(day).padStart(2, "0")}-040000.dump`,
  mtimeMs: 0,
}));

test("formats a dump name from a UTC timestamp", () => {
  assert.equal(formatDumpName(new Date("2026-08-22T04:00:00Z")), "gata_league-20260822-040000.dump");
});

test("formats in UTC regardless of the local timezone", () => {
  // 01:30 UTC on the 22nd is still the 21st in several timezones; the name must
  // not drift with the machine's clock settings.
  assert.equal(formatDumpName(new Date("2026-08-22T01:30:07Z")), "gata_league-20260822-013007.dump");
});

test("parseDumpTimestamp is the inverse of formatDumpName", () => {
  const when = new Date("2026-08-22T04:05:06Z");
  assert.deepEqual(parseDumpTimestamp(formatDumpName(when)), when);
});

test("parseDumpTimestamp refuses names that are not dumps", () => {
  for (const name of [
    "gata_league-20260822-040000.dump.partial",
    "gata_league-2026-08-22.dump",
    "other-20260822-040000.dump",
    "gata_league-20260822-040000.dump.gz",
    "notes.txt",
    "",
  ]) {
    assert.equal(parseDumpTimestamp(name), null, `expected ${name} to be refused`);
    assert.equal(isDumpName(name), false, `expected ${name} not to count as a dump`);
  }
});

test("keeps everything when there are fewer dumps than the limit", () => {
  const plan = planRotation(dumpsFor(1, 2, 3), { keep: 7, now: new Date("2026-09-01T00:00:00Z") });
  assert.equal(plan.remove.length, 0);
  assert.equal(plan.keep.length, 3);
});

test("keeps exactly the newest seven and removes the rest", () => {
  const plan = planRotation(dumpsFor(9, 1, 5, 3, 10, 2, 7, 4, 8, 6), {
    keep: 7,
    now: new Date("2026-09-01T00:00:00Z"),
  });
  assert.equal(plan.keep.length, 7);
  assert.deepEqual(plan.remove, [
    "gata_league-20260801-040000.dump",
    "gata_league-20260802-040000.dump",
    "gata_league-20260803-040000.dump",
  ]);
  assert.equal(plan.keep.at(0), "gata_league-20260804-040000.dump");
  assert.equal(plan.keep.at(-1), "gata_league-20260810-040000.dump");
});

test("never touches files that are not dumps", () => {
  const plan = planRotation([
    ...dumpsFor(1, 2, 3, 4, 5, 6, 7, 8),
    { name: "README", mtimeMs: 0 },
    { name: "gata_league-20260101-040000.sql", mtimeMs: 0 },
    { name: ".keep", mtimeMs: 0 },
  ], { keep: 7, now: new Date("2026-09-01T00:00:00Z") });

  assert.deepEqual(plan.remove, ["gata_league-20260801-040000.dump"]);
});

test("a partial file is not a dump and does not fill one of the seven slots", () => {
  const now = new Date("2026-08-09T04:00:00Z");
  const plan = planRotation([
    ...dumpsFor(1, 2, 3, 4, 5, 6, 7),
    { name: "gata_league-20260809-040000.dump.partial", mtimeMs: now.getTime() },
  ], { keep: 7, now });

  assert.equal(plan.keep.length, 7);
  assert.equal(plan.remove.length, 0);
});

test("removes a partial left behind for more than a day", () => {
  const now = new Date("2026-08-09T04:00:00Z");
  const plan = planRotation([
    { name: "gata_league-20260807-040000.dump.partial", mtimeMs: now.getTime() - PARTIAL_MAX_AGE_MS - 1000 },
    { name: "gata_league-20260809-035900.dump.partial", mtimeMs: now.getTime() - 60_000 },
  ], { keep: 7, now });

  assert.deepEqual(plan.remove, ["gata_league-20260807-040000.dump.partial"]);
});

test("parseDumpTimestamp refuses calendar-impossible dump-shaped names", () => {
  for (const name of [
    "gata_league-99999999-999999.dump",
    "gata_league-20260230-040000.dump", // Feb 30 does not exist
    "gata_league-20261301-040000.dump", // month 13
    "gata_league-20260822-250000.dump", // hour 25
    "gata_league-20260822-046000.dump", // minute 60
  ]) {
    assert.equal(parseDumpTimestamp(name), null, `expected ${name} to be refused`);
    assert.equal(isDumpName(name), false, `expected ${name} not to count as a dump`);
  }
});

test("parseDumpTimestamp still round-trips valid edge dates", () => {
  for (const name of [
    "gata_league-20240229-040000.dump", // leap day
    "gata_league-20260101-000000.dump", // midnight
  ]) {
    const when = parseDumpTimestamp(name);
    assert.notEqual(when, null);
    assert.equal(formatDumpName(when), name);
  }
});

test("a calendar-impossible dump-shaped name cannot push a real dump into remove", () => {
  const now = new Date("2026-09-01T00:00:00Z");
  const plan = planRotation([
    ...dumpsFor(1, 2, 3, 4, 5, 6, 7),
    { name: "gata_league-99999999-999999.dump", mtimeMs: 0 },
  ], { keep: 7, now });

  for (const day of [1, 2, 3, 4, 5, 6, 7]) {
    const name = `gata_league-202608${String(day).padStart(2, "0")}-040000.dump`;
    assert.ok(!plan.remove.includes(name), `expected legitimate dump ${name} not to be removed`);
  }
  assert.ok(!plan.keep.includes("gata_league-99999999-999999.dump"));
  assert.ok(!plan.remove.includes("gata_league-99999999-999999.dump"));
});

test("removes a partial exactly at the max age boundary (inclusive)", () => {
  const now = new Date("2026-08-09T04:00:00Z");
  const plan = planRotation([
    { name: "gata_league-20260807-040000.dump.partial", mtimeMs: now.getTime() - PARTIAL_MAX_AGE_MS },
  ], { keep: 7, now });

  assert.deepEqual(plan.remove, ["gata_league-20260807-040000.dump.partial"]);
});

test("refuses a keep count that would wipe the directory", () => {
  for (const keep of [0, -1, 1.5, Number.NaN, "7"]) {
    assert.throws(() => planRotation(dumpsFor(1, 2), { keep }), RangeError);
  }
});

test("the default keep count is seven", () => {
  assert.equal(DEFAULT_KEEP, 7);
  const plan = planRotation(dumpsFor(1, 2, 3, 4, 5, 6, 7, 8), { now: new Date("2026-09-01T00:00:00Z") });
  assert.equal(plan.keep.length, 7);
});
