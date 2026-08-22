import test from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  STALE_AFTER_HOURS,
  summarizeBackups,
  parseSystemctlProperties,
  evaluateSystemdState,
  evaluateBackupStatus,
} from "../scripts/backup/status.mjs";

const run = promisify(execFile);
const cliPath = fileURLToPath(new URL("../scripts/backup-status.mjs", import.meta.url));

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

// Finding 5: the boundary itself (exactly STALE_AFTER_HOURS old) was never
// pinned by a test - only 8h (fresh) and 56h (stale) were covered. The
// evaluator uses a strict ">" comparison, so a dump exactly at the limit is
// still fresh; that is the behaviour this test locks in.
test("a dump exactly STALE_AFTER_HOURS old is not yet stale", () => {
  const summary = summarizeBackups([dump("gata_league-20260820-120000.dump")], { now });
  assert.equal(summary.ageHours, STALE_AFTER_HOURS);
  assert.equal(summary.stale, false);
});

// --- Finding 2: pure systemd-state parsing and evaluation ---------------

test("parseSystemctlProperties reads key=value lines and skips lines without '='", () => {
  const output = [
    "LoadState=loaded",
    "ActiveState=active",
    "", // trailing newline from stdout produces an empty final line
    "this line has no equals sign and must not become a key",
    "Result=success",
  ].join("\n");

  const properties = parseSystemctlProperties(output);
  assert.equal(properties.get("LoadState"), "loaded");
  assert.equal(properties.get("ActiveState"), "active");
  assert.equal(properties.get("Result"), "success");
  assert.equal(properties.has(""), false);
  assert.equal(properties.size, 3);
});

// Realistic `systemctl show` recordings, one per case the finding calls out.
// Values are shaped like real systemd output (RFC-ish timestamp strings,
// "not-found"/"loaded" LoadState, etc.) rather than invented shortcuts.

const recordedService = ({
  loadState = "loaded",
  result = "success",
  execMainStatus = "0",
  execMainExitTimestamp = "Sat 2026-08-22 04:00:01 UTC",
} = {}) => parseSystemctlProperties([
  `LoadState=${loadState}`,
  `Result=${result}`,
  `ExecMainStatus=${execMainStatus}`,
  `ExecMainExitTimestamp=${execMainExitTimestamp}`,
  "",
].join("\n"));

const recordedTimer = ({ loadState = "loaded", activeState = "active" } = {}) => parseSystemctlProperties([
  `LoadState=${loadState}`,
  `ActiveState=${activeState}`,
  "",
].join("\n"));

test("evaluateSystemdState: systemctl unavailable is reported plainly and is not a problem on its own", () => {
  const result = evaluateSystemdState({ available: false }, "bloodbowl-backup");
  assert.equal(result.available, false);
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.join(" "), /unknown/);
  assert.match(result.notes.join(" "), /unavailable/);
});

test("evaluateSystemdState: loaded, active timer with a successful last run is clean", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.deepEqual(result.problems, []);
  assert.equal(result.hasRun, true);
});

test("evaluateSystemdState: a not-found service is a problem, even if the timer looks fine", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "not-found", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /service.*not installed/.test(problem)), true);
});

test("evaluateSystemdState: a not-found timer is a problem - the backup is not scheduled", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ loadState: "not-found", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*not scheduled/.test(problem)), true);
});

test("evaluateSystemdState: an installed but inactive timer is a problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ loadState: "loaded", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*not scheduled/.test(problem)), true);
});

test("evaluateSystemdState: a service whose last run failed is a problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ result: "exit-code", execMainStatus: "1" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /last run result: exit-code/.test(problem)), true);
});

test("evaluateSystemdState: a service that has never run is not itself a problem when the timer is installed and active", () => {
  // This is the exact case Finding 1 was about: Result defaults to "success"
  // for a unit that has never executed, so "has it run" must come from the
  // exit timestamp being empty, not from Result being present.
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.equal(result.hasRun, false);
  assert.deepEqual(result.problems, []);
  assert.match(result.notes.join(" "), /has not run yet/);
});

test("evaluateSystemdState: a never-installed timer plus a fresh dump must still fail - the Finding 1 regression case", () => {
  // Both service and timer report as never-found, exactly what a unit that
  // was never installed (or was removed) looks like to `systemctl show`.
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "not-found", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer({ loadState: "not-found", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.length >= 2, true);
});

// --- combining pure systemd evaluation with the dump summary -------------

test("evaluateBackupStatus: fresh dumps plus a healthy timer pass", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, true);
  assert.deepEqual(status.problems, []);
});

test("evaluateBackupStatus: fresh dumps but a never-installed timer must still fail overall", () => {
  // This is Finding 1's scenario end-to-end: a dump inside the freshness
  // window must not mask a timer that was never installed.
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "not-found", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer({ loadState: "not-found", activeState: "inactive" }),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, false);
  assert.equal(status.problems.length > 0, true);
});

test("evaluateBackupStatus: systemctl being unavailable does not by itself fail the check", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({ available: false }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, true);
});

test("evaluateBackupStatus: stale dumps still fail even with a healthy timer", () => {
  const summary = summarizeBackups([dump("gata_league-20260820-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, false);
  assert.equal(status.problems.some((problem) => /older than allowed/.test(problem)), true);
});

test("evaluateBackupStatus: more dumps than the retention limit still fails (rotation is broken)", () => {
  const names = [15, 16, 17, 18, 19, 20, 21, 22]
    .map((day) => dump(`gata_league-202608${day}-040000.dump`));
  const summary = summarizeBackups(names, { now, keep: 7 });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, false);
  assert.equal(status.problems.some((problem) => /expected at most/.test(problem)), true);
});

// --- Finding 3: a file that vanishes (or can't be stat'd) between readdir
// and stat must not crash the whole command -------------------------------

test("the CLI survives a dangling symlink in the backup directory instead of crashing", async (t) => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "gata-backup-status-"));
  t.after(() => fs.rm(dir, { recursive: true, force: true }));

  // A real, readable dump so the directory is otherwise healthy.
  await fs.writeFile(path.join(dir, "gata_league-20260822-040000.dump"), "x".repeat(2048));

  // A dangling symlink reproduces exactly the race the finding describes:
  // readdir() sees the name, but stat() (which follows symlinks) throws
  // ENOENT because the target is gone - the same as a file rotated away
  // between the two calls.
  await fs.symlink(
    path.join(dir, "gata_league-20260822-050000.dump-does-not-exist"),
    path.join(dir, "gata_league-20260822-050000.dump"),
  );

  const { stdout, stderr } = await run("node", [cliPath], {
    env: { ...process.env, BACKUP_DIR: dir },
  });

  // Must not have crashed with the generic top-level "backup status failed"
  // handler - the vanished entry should simply be skipped.
  assert.doesNotMatch(stderr, /backup status failed/);
  assert.match(stdout, /dumps:\s+1 /);
});
