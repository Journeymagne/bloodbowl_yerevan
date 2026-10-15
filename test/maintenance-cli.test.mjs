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
