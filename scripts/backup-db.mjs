#!/usr/bin/env node
import { createWriteStream, rmSync } from "node:fs";
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

// Tracks whatever dump is currently in flight, so a signal handler that fires
// asynchronously (the process being killed from outside, e.g. `systemctl stop`
// or a systemd start-timeout) has something to clean up. Set right before the
// dump child is spawned, cleared once runDump settles either way.
let activeChild = null;
let activePartialPath = null;

// SIGTERM/SIGINT mean something external is ending this run right now — the
// same orphan-accumulation problem the write-failure teardown above closes,
// just triggered by the systemd caller instead of an internal error. Node's
// default behaviour for these signals is to exit immediately with no chance
// for the normal try/catch teardown in runDump or createBackup to run, so it
// must be handled explicitly here. Everything below must be synchronous: the
// process is on its way out, and an `await` may never get scheduled again.
function handleTerminationSignal(signal) {
  process.stderr.write(`backup interrupted by ${signal}\n`);
  if (activeChild && activeChild.exitCode === null && activeChild.signalCode === null) {
    activeChild.kill();
  }
  if (activePartialPath) {
    // Only ever the not-yet-verified file — safe to remove unconditionally.
    // A finished `*.dump` is never tracked here.
    rmSync(activePartialPath, { force: true });
  }
  process.exit(1);
}
process.on("SIGTERM", () => handleTerminationSignal("SIGTERM"));
process.on("SIGINT", () => handleTerminationSignal("SIGINT"));

function run(command, args, { onStdout = null, env = process.env, onChild = null } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", onStdout ? "pipe" : "ignore", "pipe"],
      env,
    });
    if (onChild) onChild(child);

    let stderr = "";
    child.stderr.on("data", (chunk) => { stderr += chunk; });
    if (onStdout) child.stdout.pipe(onStdout);

    // `.pipe()` does not undo itself when the destination errors: Node leaves
    // the source flowing and the child running. On any failure path below we
    // must tear both down ourselves before the promise settles, or a write
    // failure (disk full, most realistically) leaves the dump process
    // orphaned in the container.
    let settled = false;
    const settleReject = (error) => {
      if (settled) return;
      settled = true;
      if (child.exitCode === null && child.signalCode === null) {
        child.kill();
      }
      if (onStdout && !onStdout.destroyed) {
        onStdout.destroy();
      }
      reject(error);
    };
    const settleResolve = () => {
      if (settled) return;
      settled = true;
      resolve();
    };

    const exited = new Promise((done, failed) => {
      child.on("error", failed);
      child.on("close", (code, signal) => done([code, signal]));
    });
    // The child can exit before the file it was piped into has flushed, so wait
    // for both: otherwise a truncated dump can look like a clean run.
    const written = onStdout
      ? new Promise((done, failed) => {
          onStdout.on("close", done);
          onStdout.on("error", failed);
        })
      : Promise.resolve();

    Promise.all([exited, written]).then(([[code, signal]]) => {
      if (code === 0) {
        settleResolve();
      } else {
        const status = signal ? `signal ${signal}` : `${code}`;
        settleReject(new Error(`${command} ${args.join(" ")} exited with ${status}: ${stderr.trim()}`));
      }
    }, settleReject);
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
    activePartialPath = target;
    try {
      await run("docker", args, {
        onStdout: file,
        env: password ? { ...process.env, PGPASSWORD: password } : process.env,
        onChild: (child) => { activeChild = child; },
      });
    } finally {
      activeChild = null;
      activePartialPath = null;
    }
  };

  // The container cannot see the host's backup directory, and pg_restore wants
  // a seekable archive rather than a pipe, so the file goes in for the check.
  const verifyDump = async (target) => {
    const inside = `/tmp/${path.basename(target)}`;
    await run("docker", ["cp", target, `${container}:${inside}`]);
    try {
      await run("docker", ["exec", container, "pg_restore", "--list", inside]);
    } finally {
      await run("docker", ["exec", container, "rm", "-f", inside]).catch((error) => {
        // Not fatal to the backup — the dump itself is already verified by
        // this point — but silently leaving copies inside the container on
        // every failed cleanup is exactly the kind of thing an operator needs
        // to hear about before it becomes a disk problem.
        console.error(`warning: failed to remove ${inside} from ${container}: ${error.message}`);
      });
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
