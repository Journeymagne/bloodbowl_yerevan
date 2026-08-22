#!/usr/bin/env node
import { promises as fs } from "node:fs";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

import { DEFAULT_KEEP } from "./backup/rotation.mjs";
import { summarizeBackups } from "./backup/status.mjs";

const run = promisify(execFile);
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const keep = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);
const unit = "bloodbowl-backup";

const megabytes = (bytes) => `${(bytes / 1_048_576).toFixed(1)} MB`;

async function readEntries() {
  let names = [];
  try {
    names = await fs.readdir(backupDir);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }

  const entries = [];
  for (const name of names) {
    const stat = await fs.stat(path.join(backupDir, name));
    if (stat.isFile()) entries.push({ name, size: stat.size });
  }
  return entries;
}

// systemd is absent on development machines; its absence is not a failure of
// the backups, so it is reported rather than thrown.
async function readTimer() {
  try {
    const { stdout } = await run("systemctl", [
      "show", `${unit}.service`,
      "--property=Result", "--property=ExecMainStatus", "--property=ExecMainExitTimestamp",
    ]);
    const properties = new Map(
      stdout.trim().split("\n").map((line) => {
        const index = line.indexOf("=");
        return [line.slice(0, index), line.slice(index + 1)];
      }),
    );
    const { stdout: timers } = await run("systemctl", ["list-timers", `${unit}.timer`, "--no-pager", "--no-legend"]);
    return { properties, timers: timers.trim() };
  } catch {
    return null;
  }
}

async function main() {
  const entries = await readEntries();
  if (entries === null) {
    console.error(`backup directory ${backupDir} does not exist`);
    process.exitCode = 1;
    return;
  }

  const summary = summarizeBackups(entries, { keep });
  console.log(`directory: ${backupDir}`);
  console.log(`dumps:     ${summary.count} (keeping ${keep}), ${megabytes(summary.totalBytes)} total`);
  if (summary.newest) {
    console.log(`newest:    ${summary.newest.name}, ${megabytes(summary.newest.size)}, ${summary.ageHours.toFixed(1)} h ago`);
  } else {
    console.log("newest:    none");
  }

  const timer = await readTimer();
  if (timer) {
    console.log(`last run:  ${timer.properties.get("Result")} (exit ${timer.properties.get("ExecMainStatus")}) at ${timer.properties.get("ExecMainExitTimestamp") || "never"}`);
    console.log(`timer:     ${timer.timers || "not scheduled"}`);
  } else {
    console.log("last run:  unknown (systemctl unavailable)");
  }

  const problems = [];
  if (summary.stale) problems.push(`newest dump is older than allowed (${summary.ageHours === null ? "there are none" : `${summary.ageHours.toFixed(1)} h`})`);
  if (summary.overKeep) problems.push(`${summary.count} dumps kept, expected at most ${keep}`);
  if (timer && timer.properties.get("Result") && timer.properties.get("Result") !== "success") {
    problems.push(`last run result: ${timer.properties.get("Result")}`);
  }

  if (problems.length) {
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
