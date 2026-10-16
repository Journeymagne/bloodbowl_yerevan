import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildMaintenanceFlag, parseMaintenanceArgs } from "../scripts/maintenance/flag.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const now = new Date("2026-11-02T15:00:00Z");

test("arguments name the command and the flag's fields", () => {
  assert.deepEqual(parseMaintenanceArgs(["on", "--kind", "unplanned", "--ends", "2026-11-02T19:00+04:00"]),
    { command: "on", kind: "unplanned", starts: undefined, ends: "2026-11-02T19:00+04:00" });
  assert.deepEqual(parseMaintenanceArgs(["off"]), { command: "off", kind: undefined, starts: undefined, ends: undefined });
  assert.throws(() => parseMaintenanceArgs(["pause"]), /on, off or status/);
  assert.throws(() => parseMaintenanceArgs(["on", "--colour", "red"]), /--colour/);
});

test("a flag starts now and is planned unless told otherwise", () => {
  assert.deepEqual(buildMaintenanceFlag({}, now), { kind: "planned", startsAt: now.toISOString(), endsAt: null });
  assert.deepEqual(buildMaintenanceFlag({ kind: "planned", ends: "2026-11-02T20:00:00+04:00" }, now),
    { kind: "planned", startsAt: now.toISOString(), endsAt: "2026-11-02T16:00:00.000Z" });
});

test("a flag that would confuse the page is refused", () => {
  assert.throws(() => buildMaintenanceFlag({ kind: "weekly" }, now), /planned or unplanned/);
  assert.throws(() => buildMaintenanceFlag({ ends: "tonight" }, now), /--ends/);
  assert.throws(() => buildMaintenanceFlag({ ends: "2026-11-02T18:00:00+04:00" }, now), /after/);
});

test("on writes the flag, status reads it, off removes it", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gata-maintenance-"));
  const file = path.join(dir, "maintenance.json");
  const run = (...args) => spawnSync(process.execPath, [path.join(root, "scripts", "maintenance.mjs"), ...args], {
    env: { ...process.env, MAINTENANCE_FILE: file }, encoding: "utf8",
  });
  assert.equal(run("on", "--kind", "planned").status, 0);
  assert.equal(JSON.parse(await fs.readFile(file, "utf8")).kind, "planned");
  assert.match(run("status").stdout, /maintenance: on \(planned\)/);
  assert.equal(run("off").status, 0);
  await assert.rejects(fs.access(file));
  assert.match(run("status").stdout, /maintenance: off/);
  assert.equal((await fs.readdir(dir)).length, 0);
});

test("an option with no value is refused, never defaulted", () => {
  assert.throws(() => parseMaintenanceArgs(["on", "--kind"]), /--kind needs a value/);
  assert.throws(() => parseMaintenanceArgs(["on", "--ends"]), /--ends needs a value/);
  assert.throws(() => parseMaintenanceArgs(["on", "--ends", "--kind", "unplanned"]), /--ends needs a value/);
});

test("a repeated option is refused, not overwritten", () => {
  assert.throws(() => parseMaintenanceArgs(["on", "--kind", "planned", "--kind", "unplanned"]), /--kind given twice/);
});

test("an empty option value is refused, not read as absent", () => {
  assert.throws(() => parseMaintenanceArgs(["on", "--ends", ""]), /--ends must not be empty/);
  assert.throws(() => parseMaintenanceArgs(["on", "--starts", ""]), /--starts must not be empty/);
  assert.throws(() => parseMaintenanceArgs(["on", "--kind", ""]), /--kind must not be empty/);
  assert.throws(() => buildMaintenanceFlag({ ends: "" }, now), /--ends must not be empty/);
});

test("off and status take no options", () => {
  assert.throws(() => parseMaintenanceArgs(["off", "--kind", "planned"]), /off takes no options/);
  assert.throws(() => parseMaintenanceArgs(["status", "--ends", "2026-11-02T19:00+04:00"]), /status takes no options/);
});

test("a time without a UTC offset is refused, whatever the server's timezone", () => {
  assert.throws(() => buildMaintenanceFlag({ ends: "2026-11-02T19:00" }, now), /--ends needs a UTC offset/);
  assert.throws(() => buildMaintenanceFlag({ starts: "2026-11-02" }, now), /--starts needs a UTC offset/);
});

test("a time with Z or a +HH:MM / +HHMM offset is accepted", () => {
  assert.deepEqual(buildMaintenanceFlag({ starts: "2026-11-02T19:00+04:00" }, now).startsAt, "2026-11-02T15:00:00.000Z");
  assert.deepEqual(buildMaintenanceFlag({ ends: "2026-11-02T20:00:00+0400" }, now).endsAt, "2026-11-02T16:00:00.000Z");
  assert.deepEqual(buildMaintenanceFlag({ ends: "2026-11-02T20:00Z" }, now).endsAt, "2026-11-02T20:00:00.000Z");
});

test("a date that does not exist is refused, not rolled over into another day", () => {
  assert.throws(() => buildMaintenanceFlag({ ends: "2026-11-31T10:00Z" }, now), /--ends must be a date and time/);
  assert.throws(() => buildMaintenanceFlag({ ends: "2026-02-30T10:00Z" }, now), /--ends must be a date and time/);
});

test("a stray word or an unknown option is named in the error", () => {
  assert.throws(() => parseMaintenanceArgs(["on", "extra"]), /unexpected argument extra/);
  assert.throws(() => parseMaintenanceArgs(["on", "--kind", "unplanned", "unplanned"]), /unexpected argument unplanned/);
  assert.throws(() => parseMaintenanceArgs(["on", "--colour", "red"]), /unknown option --colour/);
});

test("a mistyped option exits 1 and writes no flag", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gata-maintenance-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  const file = path.join(dir, "maintenance.json");
  const run = (...args) => spawnSync(process.execPath, [path.join(root, "scripts", "maintenance.mjs"), ...args], {
    env: { ...process.env, MAINTENANCE_FILE: file }, encoding: "utf8",
  });
  const missingValue = run("on", "--ends");
  assert.equal(missingValue.status, 1);
  assert.match(missingValue.stderr, /--ends needs a value/);
  const noOffset = run("on", "--ends", "2026-11-02T19:00");
  assert.equal(noOffset.status, 1);
  assert.match(noOffset.stderr, /--ends needs a UTC offset/);
  await assert.rejects(fs.access(file));
  assert.equal((await fs.readdir(dir)).length, 0);
});
