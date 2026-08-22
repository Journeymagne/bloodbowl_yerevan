#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_KEEP } from "./backup/rotation.mjs";
import {
  summarizeBackups,
  parseSystemctlProperties,
  evaluateSystemdState,
  evaluateBackupStatus,
} from "./backup/status.mjs";

const run = promisify(execFile);
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const keep = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);
const unit = "bloodbowl-backup";

// `1_048_576` is 1 MiB, not 1 MB - the label has to match what is actually
// computed.
const formatSize = (bytes) => `${(bytes / 1_048_576).toFixed(1)} MiB`;

async function readEntries() {
  let names = [];
  try {
    names = await fs.readdir(backupDir);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const entries = [];
  let unreadableCount = 0;
  for (const name of names) {
    let stat;
    try {
      stat = await fs.stat(path.join(backupDir, name));
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
    if (stat.isFile()) entries.push({ name, size: stat.size });
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
async function readSystemdState() {
  try {
    const [service, timer] = await Promise.all([
      readUnitProperties(`${unit}.service`, [
        "LoadState", "Result", "ExecMainStatus", "ExecMainExitTimestamp",
      ]),
      readUnitProperties(`${unit}.timer`, ["LoadState", "ActiveState", "NextElapseUSecRealtime"]),
    ]);
    return { available: true, service, timer };
  } catch {
    return { available: false };
  }
}

async function main() {
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
    const service = state.service.get("LoadState");
    const lastRun = systemd.hasRun
      ? `last run ${systemd.result} (exit ${state.service.get("ExecMainStatus")}) at ${state.service.get("ExecMainExitTimestamp")}`
      : "has not run yet";
    console.log(`service:   ${service}, ${lastRun}`);
    const nextRun = systemd.timerNextRun ? `, next run ${systemd.timerNextRun.toISOString()}` : "";
    console.log(`timer:     ${state.timer.get("LoadState")}, ${state.timer.get("ActiveState")}${nextRun}`);
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
