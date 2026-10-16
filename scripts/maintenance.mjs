#!/usr/bin/env node
/**
 * Turn maintenance mode on or off, or say whether it is on.
 *
 *   npm run maintenance:on -- --kind planned --ends "2026-11-02T19:00+04:00"
 *   npm run maintenance:off
 *   npm run maintenance:status
 *
 * The running server notices within two seconds; nothing restarts. On the
 * server the flag lives in /etc/bloodbowl-league (root only), so run these
 * with `sudo -i`. MAINTENANCE_FILE in the env file moves it.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { maintenanceFilePath, parseMaintenanceFlag } from "../server/http/maintenance-flag.mjs";
import { buildMaintenanceFlag, parseMaintenanceArgs } from "./maintenance/flag.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function writeAtomically(file, body) {
  // Write beside the target and rename over it, so the server never reads a
  // half-written flag (it would treat that as an outage and say so).
  const temporary = `${file}.tmp-${process.pid}`;
  await fs.writeFile(temporary, body, { mode: 0o644 });
  await fs.rename(temporary, file);
}

async function describe(file) {
  try {
    const flag = parseMaintenanceFlag(await fs.readFile(file, "utf8"));
    const window = [flag.startsAt, flag.endsAt].filter(Boolean).join(" → ");
    return `maintenance: on (${flag.kind}${flag.invalid ? ", unreadable flag" : ""})${window ? ` ${window}` : ""} — ${file}`;
  } catch (error) {
    if (error.code === "ENOENT") return `maintenance: off — ${file}`;
    throw error;
  }
}

async function main() {
  await loadEnvFile(rootDir);
  const args = parseMaintenanceArgs(process.argv.slice(2));
  const file = maintenanceFilePath();
  if (args.command === "on") {
    await writeAtomically(file, `${JSON.stringify(buildMaintenanceFlag(args), null, 2)}\n`);
  } else if (args.command === "off") {
    await fs.rm(file, { force: true });
  }
  console.log(await describe(file));
}

main().catch((error) => {
  console.error(`maintenance: ${error.message}`);
  process.exitCode = 1;
});
