#!/usr/bin/env node
/**
 * Restore a production dump into the local gata_rehearsal database, anonymized.
 *
 *   npm run rehearsal:restore -- ~/gata-dumps/gata_league-20261102-150000.dump
 *
 * Drops and recreates gata_rehearsal in the local Postgres container, restores
 * the dump without its owners and grants (the local role differs from the
 * server's), then anonymizes it in the same run (scripts/rehearsal/anonymize.mjs).
 * Never touches the database DATABASE_URL names — only gata_rehearsal beside it.
 *
 * DATABASE_URL should use `localhost` or `127.0.0.1`: the `[::1]` form passes
 * the local-host guard but is refused by pg's connection.
 *
 * Refuses a Docker that is not local (DOCKER_HOST, a remote context), and if
 * anything fails once the database exists it drops gata_rehearsal again, so a
 * half-restored, un-anonymized copy of production is never left behind.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { anonymizeRehearsalDatabase } from "./rehearsal/anonymize.mjs";
import { REHEARSAL_DATABASE, assertLocalDatabaseUrl, assertLocalDocker, rehearsalDatabaseUrl } from "./rehearsal/guard.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

const container = process.env.POSTGRES_CONTAINER || "gata-league-postgres";
const inside = "/tmp/rehearsal.dump";

function runDocker(args) {
  return spawnSync("docker", args, { encoding: "utf8" });
}

function docker(...args) {
  const result = runDocker(args);
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

async function anonymizeRestored(target, password) {
  const client = new pg.Client({ connectionString: target });
  await client.connect();
  try {
    const { rows } = await client.query("SELECT current_database() AS db");
    if (rows[0].db !== REHEARSAL_DATABASE) throw new Error(`connected to ${rows[0].db}, expected ${REHEARSAL_DATABASE}`);
    return await anonymizeRehearsalDatabase(client, password);
  } finally {
    await client.end();
  }
}

function afterFailure(error, user) {
  const dropped = runDocker(["exec", container, "dropdb", "--if-exists", "--force", "-U", user, REHEARSAL_DATABASE]).status === 0;
  const outcome = dropped
    ? `${REHEARSAL_DATABASE} was dropped so no un-anonymized copy is left`
    : `and dropping ${REHEARSAL_DATABASE} FAILED — drop it by hand: docker exec ${container} dropdb -U ${user} ${REHEARSAL_DATABASE}`;
  return new Error(`${error.message}; ${outcome}`, { cause: error });
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

  docker("exec", container, "dropdb", "--if-exists", "--force", "-U", user, REHEARSAL_DATABASE);
  docker("exec", container, "createdb", "-U", user, REHEARSAL_DATABASE);
  let counts;
  try {
    restoreDump(dump, user);
    counts = await anonymizeRestored(target, password);
  } catch (error) {
    throw afterFailure(error, user);
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
