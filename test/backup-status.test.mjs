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
  parseTimerNextElapse,
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

// A default recordedTimer() carries NextElapseUSecRealtime in the shape a
// real systemd actually emits: a human-readable timestamp, the same shape
// this file already fixtures correctly for ExecMainExitTimestamp above
// ("Sat 2026-08-22 04:00:01 UTC"). That is the shape believed to be real;
// the previous round wrongly assumed a raw microseconds-since-epoch integer
// was the *only* form and was never checked against an actual systemd.
//
// Pass `nextElapse`:
//   - a human timestamp string (default) -> a real future run
//   - an all-digit string                -> the tolerated raw-microseconds
//                                            alternative form
//   - "n/a" | "" | "0"                   -> explicit "no future run"
//   - null                               -> the property absent from the
//                                            output entirely
//   - anything else                      -> an unrecognised shape
const recordedTimer = ({
  loadState = "loaded",
  activeState = "active",
  nextElapse = "Sat 2026-08-23 04:00:00 UTC",
} = {}) => parseSystemctlProperties([
  `LoadState=${loadState}`,
  `ActiveState=${activeState}`,
  ...(nextElapse === null ? [] : [`NextElapseUSecRealtime=${nextElapse}`]),
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
  assert.equal(result.problems.some((problem) => /service.*not loaded.*LoadState=not-found/.test(problem)), true);
});

test("evaluateSystemdState: a not-found timer is a problem - the backup is not scheduled", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ loadState: "not-found", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*not loaded.*LoadState=not-found/.test(problem)), true);
});

// --- Finding 1: LoadState must be an allow-list ("loaded" only), not a
// deny-list of just "not-found" - masked, error, and bad-setting are all
// broken units too, and the service's own LoadState was not even the only
// gap: a masked service was previously invisible entirely. -----------------

test("evaluateSystemdState: a masked service is a problem - the common `systemctl mask` slip", () => {
  // Masking a unit (symlinking it to /dev/null) is a common mistake when
  // `disable` was meant. LoadState=masked, not "not-found" - the old
  // deny-list test missed this state completely.
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "masked", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /service.*not loaded.*LoadState=masked/.test(problem)), true);
});

test("evaluateSystemdState: a service in LoadState=error is a problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "error", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /service.*not loaded.*LoadState=error/.test(problem)), true);
});

test("evaluateSystemdState: a masked timer is a problem, same allow-list applied to the timer side", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ loadState: "masked", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*not loaded.*LoadState=masked/.test(problem)), true);
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

// --- Finding 2 (this round): the previous round's fixture invented the
// NextElapseUSecRealtime format (a raw microsecond integer) and every timer
// test validated the parser against the parser's own wrong assumption. These
// tests exercise parseTimerNextElapse directly against both plausible real
// shapes, plus the explicit "no next run" values, plus what happens when the
// value is in neither recognised shape. ------------------------------------

test("parseTimerNextElapse: a human-readable timestamp (the believed real systemd shape) is a future run", () => {
  const result = parseTimerNextElapse("Sat 2026-08-23 04:00:00 UTC");
  assert.equal(result.kind, "future");
  assert.ok(result.date instanceof Date);
  assert.equal(Number.isNaN(result.date.getTime()), false);
});

test("parseTimerNextElapse: an all-digit value is tolerated as microseconds since the epoch", () => {
  const result = parseTimerNextElapse("1755840000000000");
  assert.equal(result.kind, "future");
  assert.equal(result.date.getTime(), 1755840000000000 / 1000);
});

test("parseTimerNextElapse: 'n/a' is an explicit no-future-run", () => {
  assert.equal(parseTimerNextElapse("n/a").kind, "none");
});

test("parseTimerNextElapse: an empty value is an explicit no-future-run", () => {
  assert.equal(parseTimerNextElapse("").kind, "none");
});

test("parseTimerNextElapse: '0' is an explicit no-future-run", () => {
  assert.equal(parseTimerNextElapse("0").kind, "none");
});

test("parseTimerNextElapse: the property missing entirely (undefined) is unknown, not a failure", () => {
  const result = parseTimerNextElapse(undefined);
  assert.equal(result.kind, "unknown");
  assert.equal(result.raw, undefined);
});

test("parseTimerNextElapse: an unrecognised shape lands in unknown, verbatim, not a failure", () => {
  const result = parseTimerNextElapse("some-shape-nobody-has-seen-yet");
  assert.equal(result.kind, "unknown");
  assert.equal(result.raw, "some-shape-nobody-has-seen-yet");
});

// --- Finding 1 (this round, critical): the timer's next-run time must be
// parsed in a format systemd actually emits, and an unrecognised shape must
// never silently read as "no future run" (which the previous round's
// Number(raw) implementation did for every real timestamp - NaN was treated
// as "no future run", so a correctly scheduled, healthy timer reported NOT
// OK on every real deployment). ---------------------------------------------

test("evaluateSystemdState: a loaded, active timer with the real human-timestamp shape stays healthy", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  assert.deepEqual(result.problems, []);
  assert.ok(result.timerNextRun instanceof Date);
});

test("evaluateSystemdState: a loaded, active timer with the tolerated raw-microseconds shape stays healthy", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: "1755840000000000" }),
  }, "bloodbowl-backup");
  assert.deepEqual(result.problems, []);
  assert.ok(result.timerNextRun instanceof Date);
});

test("evaluateSystemdState: a loaded, active timer with no future elapse (NextElapseUSecRealtime=0) is a problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: "0" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*no future run/.test(problem)), true);
});

test("evaluateSystemdState: NextElapseUSecRealtime='n/a' is a problem - the timer will never fire again", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: "n/a" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*no future run/.test(problem)), true);
});

test("evaluateSystemdState: an empty NextElapseUSecRealtime value is a problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: "" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*no future run/.test(problem)), true);
});

test("evaluateSystemdState: NextElapseUSecRealtime missing from the output entirely is unknown, and must NOT fail the check", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: null }),
  }, "bloodbowl-backup");
  assert.deepEqual(result.problems, []);
  assert.equal(result.timerNextRun, null);
  assert.match(result.notes.join(" "), /timer.*next run is unknown/);
});

test("evaluateSystemdState: an unrecognised NextElapseUSecRealtime shape is reported verbatim as unknown, and must NOT fail the check", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer({ nextElapse: "some-shape-nobody-has-seen-yet" }),
  }, "bloodbowl-backup");
  assert.deepEqual(result.problems, []);
  assert.equal(result.timerNextRun, null);
  assert.equal(result.timerNextRunUnknown, "some-shape-nobody-has-seen-yet");
  assert.match(result.notes.join(" "), /some-shape-nobody-has-seen-yet/);
});

// --- Finding 3 (this round): a failure reading the service's systemctl
// output must not erase a successful read of the timer's, and vice versa -
// the two are now read (and evaluated) independently. ----------------------

test("evaluateSystemdState: the service query failing does not erase a real timer problem", () => {
  const result = evaluateSystemdState({
    available: true,
    service: null,
    timer: recordedTimer({ loadState: "not-found", activeState: "inactive" }),
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /timer.*not loaded.*LoadState=not-found/.test(problem)), true);
  assert.equal(result.hasRun, null);
  assert.match(result.notes.join(" "), /service state unknown/);
});

test("evaluateSystemdState: the timer query failing does not erase a real service failure (Result=failed)", () => {
  const result = evaluateSystemdState({
    available: true,
    service: recordedService({ result: "failed", execMainStatus: "1" }),
    timer: null,
  }, "bloodbowl-backup");
  assert.equal(result.problems.some((problem) => /last run result: failed/.test(problem)), true);
  assert.equal(result.timerNextRun, null);
  assert.match(result.notes.join(" "), /timer state unknown/);
});

test("evaluateBackupStatus: an active-but-dead timer plus a never-run service and a fresh dump must still fail - the Finding 2 regression case", () => {
  // The reviewer's exact repro: active timer with no future elapse, service
  // that has never run, but a dump happens to be fresh. Must not read as OK.
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService({ result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer({ nextElapse: "0" }),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, false);
});

test("evaluateBackupStatus: a masked service must still fail overall even with a healthy timer and a fresh dump - the Finding 1 regression case", () => {
  // The reviewer's exact repro: masked service, loaded active timer with a
  // real future elapse, one dump inside the freshness window. Must not read
  // as OK just because LoadState=masked isn't literally "not-found".
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService({ loadState: "masked", result: "success", execMainExitTimestamp: "" }),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd });
  assert.equal(status.ok, false);
});

// --- Finding 3: entries that could not be stat'd must be counted, reported,
// and treated as a problem rather than silently discarded. -----------------

test("evaluateBackupStatus: a non-zero unreadable-entry count is a problem", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd, unreadableCount: 3 });
  assert.equal(status.ok, false);
  assert.equal(status.problems.some((problem) => /3.*unreadable|unreadable.*3/.test(problem)), true);
});

test("evaluateBackupStatus: zero unreadable entries is not, by itself, a problem", () => {
  const summary = summarizeBackups([dump("gata_league-20260822-040000.dump")], { now });
  const systemd = evaluateSystemdState({
    available: true,
    service: recordedService(),
    timer: recordedTimer(),
  }, "bloodbowl-backup");
  const status = evaluateBackupStatus({ summary, keep: 7, systemd, unreadableCount: 0 });
  assert.equal(status.ok, true);
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

test("the CLI survives a dangling symlink in the backup directory instead of crashing, but still reports and fails on the unreadable entry", async (t) => {
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

  // Finding 3: the vanished entry must not crash the process (no generic
  // "backup status failed" handler), but it also must not be silently
  // discarded - it is counted, reported, and now makes the check fail.
  await assert.rejects(
    run("node", [cliPath], { env: { ...process.env, BACKUP_DIR: dir } }),
    (error) => {
      assert.doesNotMatch(error.stderr, /backup status failed/);
      assert.match(error.stdout, /dumps:\s+1 /);
      assert.match(error.stdout, /unreadable/);
      assert.equal(error.code, 1);
      return true;
    },
  );
});
