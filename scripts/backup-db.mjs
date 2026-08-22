#!/usr/bin/env node
import { createWriteStream } from "node:fs";
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { readEnvValues } from "../server/config/env-file.mjs";
import { DEFAULT_KEEP } from "./backup/rotation.mjs";
import { createBackup } from "./backup/create.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const backupDir = process.env.BACKUP_DIR || "/var/backups/bloodbowl-league";
const container = process.env.POSTGRES_CONTAINER || "gata-league-postgres";
const keep = Number(process.env.BACKUP_KEEP || DEFAULT_KEEP);

function run(command, args, { onStdout = null, env = process.env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", onStdout ? "pipe" : "ignore", "pipe"],
      env,
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    if (onStdout) child.stdout.pipe(onStdout);

    const exited = new Promise((done, failed) => {
      child.on("error", failed);
      child.on("close", done);
    });
    // The child can exit before the file it was piped into has flushed, so wait
    // for both: otherwise a truncated dump can look like a clean run.
    const written = onStdout
      ? new Promise((done, failed) => {
          onStdout.on("close", done);
          onStdout.on("error", failed);
        })
      : Promise.resolve();

    Promise.all([exited, written]).then(([code]) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}: ${stderr.trim()}`));
    }, reject);
  });
}

async function main() {
  const values = await readEnvValues(rootDir);
  const database = process.env.POSTGRES_DB || values.get("POSTGRES_DB");
  const user = process.env.POSTGRES_USER || values.get("POSTGRES_USER");
  if (!database || !user) {
    throw new Error("POSTGRES_DB and POSTGRES_USER must be set, in the environment or in the env file");
  }
  const password = process.env.POSTGRES_PASSWORD || values.get("POSTGRES_PASSWORD");

  const runDump = async (target) => {
    const file = createWriteStream(target, { mode: 0o600 });
    const args = ["exec"];
    // The postgres:16 image trusts local-socket connections by default, so no
    // password is needed against a stock container. If a container has been
    // hardened to require one, POSTGRES_PASSWORD is passed to `docker exec`
    // through the spawned process's environment (`-e PGPASSWORD` with no
    // value tells docker to forward it from its own environment) rather than
    // as a command-line argument, so it never shows up in `ps` on the host.
    if (password) args.push("-e", "PGPASSWORD");
    args.push(container, "pg_dump", "-U", user, "-d", database, "-Fc");
    await run("docker", args, {
      onStdout: file,
      env: password ? { ...process.env, PGPASSWORD: password } : process.env,
    });
  };

  // The container cannot see the host's backup directory, and pg_restore wants
  // a seekable archive rather than a pipe, so the file goes in for the check.
  const verifyDump = async (target) => {
    const inside = `/tmp/${path.basename(target)}`;
    await run("docker", ["cp", target, `${container}:${inside}`]);
    try {
      await run("docker", ["exec", container, "pg_restore", "--list", inside]);
    } finally {
      await run("docker", ["exec", container, "rm", "-f", inside]).catch(() => {});
    }
  };

  const result = await createBackup({ backupDir, runDump, verifyDump, keep });
  const removed = result.removed.length ? `, removed ${result.removed.length}` : "";
  if (result.rotationError) {
    // The dump itself is verified and on disk under its final name, so this is
    // not a failed backup — but old dumps are no longer being cleaned up, and
    // left unchecked that fills the disk. Surface both facts, and exit
    // non-zero so the caller (a systemd timer) notices.
    console.error(
      `backup ok: ${result.path}, but rotation failed: ${result.rotationError.message}`,
    );
    process.exitCode = 1;
    return;
  }
  console.log(`backup ok: ${result.path}${removed}`);
}

main().catch((error) => {
  console.error(`backup failed: ${error.message}`);
  process.exitCode = 1;
});
