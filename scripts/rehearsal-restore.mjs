#!/usr/bin/env node
/**
 * Restore a production dump into the local gata_rehearsal database, anonymized.
 *
 *   npm run rehearsal:restore -- ~/gata-dumps/gata_league-20261102-150000.dump
 *
 * Drops and recreates gata_rehearsal in the local Postgres container, restores
 * the dump without its owners and grants (the local role differs from the
 * server's), then anonymizes it in the same run (scripts/rehearsal/anonymize.mjs),
 * reads the result back and marks the database as anonymized
 * (scripts/rehearsal/marker.mjs). Never touches the database DATABASE_URL names
 * — only gata_rehearsal beside it — and starts a new rehearsal: the reports of
 * the previous one in output/rehearsal are deleted, the record and the result of
 * rehearsal:transitions with them (scripts/rehearsal/outputs.mjs).
 *
 * DATABASE_URL should use `localhost` or `127.0.0.1`: the `[::1]` form passes
 * the local-host guard but is refused by pg's connection. Its port must be the
 * container's: the restore runs through docker, the anonymization through
 * DATABASE_URL, and a different Postgres server on that port is refused.
 *
 * Refuses a Docker that is not local (DOCKER_HOST, a remote context).
 *
 * What is guaranteed: a run that ends well leaves gata_rehearsal anonymized and
 * marked; a run that fails, or is stopped by SIGINT, SIGTERM or SIGHUP, drops
 * it, so no un-anonymized copy of production survives it. What is not: SIGKILL,
 * a power cut or a dead Docker cannot be handled, and may leave the raw restore.
 * It carries no marker, so rehearsal:check and rehearsal:migrate refuse it — but
 * a server started on it would not. Start one only after the final line below.
 */
import { spawnSync } from "node:child_process";
import { existsSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { anonymizeRehearsalDatabase, verifyAnonymized } from "./rehearsal/anonymize.mjs";
import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, assertLocalDocker, assertSameServer, rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";
import { anonymizedMarker } from "./rehearsal/marker.mjs";
import { STALE_OUTPUTS } from "./rehearsal/outputs.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const container = process.env.POSTGRES_CONTAINER || "gata-league-postgres";
const inside = "/tmp/rehearsal.dump";
const SIGNALS = ["SIGINT", "SIGTERM", "SIGHUP"];

function runDocker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function docker(...args) {
  const result = runDocker(args);
  // A signal that reaches the docker client (^C goes to the whole process group)
  // ends it with `signal` set and no status; the run is over, so fail it and let
  // the caller drop the database.
  if (result.signal) throw new Error(`docker ${args.slice(0, 3).join(" ")} was interrupted by ${result.signal}`);
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || result.error?.message || "").trim();
    throw new Error(`docker ${args.slice(0, 3).join(" ")} failed: ${detail}`);
  }
  return result.stdout;
}

// With DOCKER_HOST set the context is not consulted at all, so do not ask for it:
// a refused run issues no docker command.
function assertDockerIsLocal() {
  const dockerHost = process.env.DOCKER_HOST;
  const inspected = dockerHost ? null : runDocker(["context", "inspect", "--format", "{{.Endpoints.docker.Host}}"]);
  assertLocalDocker({ dockerHost, contextEndpoint: inspected?.status === 0 ? inspected.stdout : "" });
}

function restoreDump(dump, user) {
  try {
    docker("cp", path.resolve(dump), `${container}:${inside}`);
    docker("exec", container, "pg_restore", "--no-owner", "--no-privileges", "--exit-on-error", "-U", user, "-d", REHEARSAL_DATABASE, inside);
  } finally {
    if (runDocker(["exec", container, "rm", "-f", inside]).status !== 0) {
      console.error(`rehearsal:restore: could not remove ${inside} from ${container}; it holds the production dump, remove it by hand`);
    }
  }
}

async function anonymizeRestored(target, password, containerId, marker) {
  const client = new pg.Client({ connectionString: target });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT current_database() AS db");
    if (rows[0].db !== REHEARSAL_DATABASE) throw new Error(`connected to ${rows[0].db}, expected ${REHEARSAL_DATABASE}`);
    const server = await client.query("SELECT system_identifier::text AS id FROM pg_control_system()");
    assertSameServer({ containerId, clientId: server.rows[0]?.id, container });
    const result = await anonymizeRehearsalDatabase(client, password, undefined, { marker });
    await verifyAnonymized(client, result.hash);
    return result;
  } finally {
    await client.end();
  }
}

function dropRehearsalDatabase(user) {
  return runDocker(["exec", container, "dropdb", "--if-exists", "--force", "-U", user, REHEARSAL_DATABASE]).status === 0;
}

const dropFailed = (user) => `dropping ${REHEARSAL_DATABASE} FAILED — drop it by hand: docker exec ${container} dropdb -U ${user} ${REHEARSAL_DATABASE}`;

function afterFailure(error, user) {
  const outcome = dropRehearsalDatabase(user)
    ? `${REHEARSAL_DATABASE} was dropped so no un-anonymized copy is left`
    : `and ${dropFailed(user)}`;
  return new Error(`${error.message}; ${outcome}`, { cause: error });
}

// A listener runs only when the event loop turns, and spawnSync holds it: while a
// docker command runs, a ^C ends that command (see docker()) and the failure path
// drops the database; a signal sent to this process alone is seen at the first
// await after the commands, i.e. here, in the connect/anonymize/check phase. Both
// end in the same drop. Returns the function that takes the listeners off again.
function dropOnSignals(user) {
  const listener = (signal) => {
    const outcome = dropRehearsalDatabase(user) ? `${REHEARSAL_DATABASE} was dropped` : dropFailed(user);
    console.error(`rehearsal:restore: interrupted by ${signal}; ${outcome}`);
    process.exit(130);
  };
  for (const signal of SIGNALS) process.on(signal, listener);
  return () => {
    for (const signal of SIGNALS) process.off(signal, listener);
  };
}

async function main() {
  const dump = process.argv[2];
  if (!dump || !existsSync(dump)) throw new Error("usage: npm run rehearsal:restore -- <path to a .dump file>");
  const password = process.env.REHEARSAL_PASSWORD;
  if (!password) throw new Error("set REHEARSAL_PASSWORD in .env before restoring a dump");
  const source = assertLocalDatabaseUrl(process.env.DATABASE_URL);
  const user = decodeURIComponent(source.username) || process.env.POSTGRES_USER;
  const target = rehearsalDatabaseUrl(process.env.DATABASE_URL);
  assertDockerIsLocal();
  // What the last rehearsal left in output/rehearsal; a new restore invalidates all of it.
  for (const name of STALE_OUTPUTS) rmSync(path.join(rootDir, "output", "rehearsal", name), { force: true });

  const stopListening = dropOnSignals(user);
  let counts;
  try {
    docker("exec", container, "dropdb", "--if-exists", "--force", "-U", user, REHEARSAL_DATABASE);
    try {
      docker("exec", container, "createdb", "-U", user, REHEARSAL_DATABASE);
      const containerId = docker("exec", container, "psql", "-U", user, "-d", REHEARSAL_DATABASE, "-Atc", "SELECT system_identifier FROM pg_control_system()");
      restoreDump(dump, user);
      counts = await anonymizeRestored(target, password, containerId, anonymizedMarker(path.basename(dump)));
    } catch (error) {
      throw afterFailure(error, user);
    }
  } finally {
    stopListening();
  }
  console.log(`rehearsal: restored ${path.basename(dump)} into ${REHEARSAL_DATABASE}; anonymized ${counts.users} users, removed ${counts.sessions} sessions`);
  const shown = new URL(target);
  shown.password = "****";
  console.log(`rehearsal: use DATABASE_URL=${shown} (password as in your .env)`);
}

main().catch((error) => {
  console.error(`rehearsal:restore: ${error.message}`);
  process.exitCode = 1;
});
