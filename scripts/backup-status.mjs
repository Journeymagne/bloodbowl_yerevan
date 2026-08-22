#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import {
  summarizeBackups,
  parseSystemctlProperties,
  evaluateSystemdState,
  evaluateBackupStatus,
  parseKeepOption,
} from "./backup/status.mjs";

const run = promisify(execFile);
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const unit = "bloodbowl-backup";

// `1_048_576` is 1 MiB, not 1 MB - the label has to match what is actually
// computed.
const formatSize = (bytes) => `${(bytes / 1_048_576).toFixed(1)} MiB`;

async function readEntries() {
  let dirEntries = [];
  try {
    dirEntries = await fs.readdir(backupDir, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const entries = [];
  let unreadableCount = 0;
  for (const dirent of dirEntries) {
    // Match rotate() in scripts/backup/create.mjs: a symlink is never a
    // dump this system created, whether or not its target exists.
    // Dirent.isFile() decides this from the entry's own type, without
    // following the link - the same check rotation uses to leave symlinks
    // alone. Deciding it any other way (e.g. stat(), which follows links)
    // would let the two scripts disagree: a dump-named symlink would count
    // here but never get rotated away there, and sit in the retention
    // total forever.
    if (!dirent.isFile()) continue;
    let stat;
    try {
      stat = await fs.stat(path.join(backupDir, dirent.name));
    } catch {
      // Rotation deleting a dump between readdir() and stat() (ENOENT), or a
      // file this process cannot read (EACCES), is a benign race, not a
      // reason to abort the whole check. A name that can no longer be
      // stat'd is simply not part of the listing - but it is counted, so a
      // permissions regression or filesystem trouble that makes most of the
      // directory unreadable is not silently indistinguishable from an
      // empty, healthy directory.
      unreadableCount += 1;
      continue;
    }
    entries.push({ name: dirent.name, size: stat.size });
  }
  return { entries, unreadableCount };
}

async function readUnitProperties(unitName, properties) {
  const { stdout } = await run("systemctl", [
    "show", unitName,
    ...properties.map((property) => `--property=${property}`),
  ]);
  return parseSystemctlProperties(stdout);
}

// systemd is absent on development machines; its absence is not a failure of
// the backups, so it is collected here and left for the pure evaluator to
// report as "unknown" rather than thrown.
//
// The service and timer are queried independently (Promise.allSettled, not
// Promise.all) so that one failing does not discard the other's result - a
// single failing `systemctl show` call (a transient error querying just the
// timer, say) must not erase a real `Result=failed` read successfully off
// the service. Only when *both* fail is systemd state reported as fully
// unknown; otherwise the successful side is kept and the failed side is
// `null`, which the pure evaluator treats as "unknown" for that unit only.
async function readSystemdState() {
  const [serviceResult, timerResult] = await Promise.allSettled([
    readUnitProperties(`${unit}.service`, [
      "LoadState", "Result", "ExecMainStatus", "ExecMainExitTimestamp",
    ]),
    readUnitProperties(`${unit}.timer`, ["LoadState", "ActiveState", "NextElapseUSecRealtime"]),
  ]);

  const service = serviceResult.status === "fulfilled" ? serviceResult.value : null;
  const timer = timerResult.status === "fulfilled" ? timerResult.value : null;

  if (service === null && timer === null) {
    return { available: false };
  }
  return { available: true, service, timer };
}

async function main() {
  // Validated before any I/O: a garbage BACKUP_KEEP must fail loudly rather
  // than silently disable the over-retention check (see parseKeepOption).
  const keep = parseKeepOption(process.env.BACKUP_KEEP);

  const listing = await readEntries();
  if (listing === null) {
    console.error(`backup directory ${backupDir} does not exist`);
    process.exitCode = 1;
    return;
  }
  const { entries, unreadableCount } = listing;

  const summary = summarizeBackups(entries, { keep });
  console.log(`directory: ${backupDir}`);
  console.log(`dumps:     ${summary.count} (keeping ${keep}), ${formatSize(summary.totalBytes)} total`);
  if (summary.newest) {
    console.log(`newest:    ${summary.newest.name}, ${formatSize(summary.newest.size)}, ${summary.ageHours.toFixed(1)} h ago`);
  } else {
    console.log("newest:    none");
  }
  if (unreadableCount > 0) {
    const noun = unreadableCount === 1 ? "entry" : "entries";
    console.log(`unreadable: ${unreadableCount} ${noun} could not be stat'd (permissions or a mid-listing race)`);
  }

  const state = await readSystemdState();
  const systemd = evaluateSystemdState(state, unit);
  if (!state.available) {
    console.log(`systemd:   unknown (systemctl unavailable)`);
  } else {
    // state.service / state.timer are read independently and either can be
    // null on its own (that unit's systemctl query failed while the other
    // succeeded) - print each side's unknown state rather than assuming both
    // are present just because `state.available` is true.
    if (state.service === null) {
      console.log(`service:   unknown (systemctl query failed)`);
    } else {
      const lastRun = systemd.hasRun
        ? `last run ${systemd.result} (exit ${state.service.get("ExecMainStatus")}) at ${state.service.get("ExecMainExitTimestamp")}`
        : "has not run yet";
      console.log(`service:   ${state.service.get("LoadState")}, ${lastRun}`);
    }

    if (state.timer === null) {
      console.log(`timer:     unknown (systemctl query failed)`);
    } else {
      let nextRun = "";
      if (systemd.timerNextRun) {
        nextRun = `, next run ${systemd.timerNextRun.toISOString()}`;
      } else if (systemd.timerNextRunUnknown) {
        // Print what systemd actually said verbatim - see the comment on
        // parseTimerNextElapse in scripts/backup/status.mjs.
        nextRun = `, next run unknown (NextElapseUSecRealtime=${systemd.timerNextRunUnknown})`;
      }
      console.log(`timer:     ${state.timer.get("LoadState")}, ${state.timer.get("ActiveState")}${nextRun}`);
    }
  }

  const { problems, ok } = evaluateBackupStatus({ summary, keep, systemd, unreadableCount });
  if (!ok) {
    console.error(`\nNOT OK:\n- ${problems.join("\n- ")}`);
    process.exitCode = 1;
    return;
  }
  console.log("\nOK");
}

main().catch((error) => {
  console.error(`backup status failed: ${error.message}`);
  process.exitCode = 1;
});
