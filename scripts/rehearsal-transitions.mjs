#!/usr/bin/env node
/**
 * rehearsal:transitions — the five states a site can be in on the day it moves from 2.1.0 to 3.0 (rollout spec
 * §3.3), seeded on 2.1.0 and taken to their end on 3.0: a pre-match half done, a match begun, a post-match past
 * its Players step, a score sent and not answered, a challenge not accepted. All five are friendlies between two
 * coaches the seed registers (stage 09b, owner's answer 1), so the league table must come out as it went in.
 *
 *   npm run rehearsal:transitions -- --seed http://localhost:3004     # against the 2.1.0 server
 *   npm run rehearsal:transitions -- --finish http://localhost:3077   # against the 3.0 server, once migrated
 *
 * Where it stands in a rehearsal (stage 09b decision 26; the seed must be in both snapshots of rehearsal:check,
 * or --after would call it data that changed):
 *   1. npm run rehearsal:restore
 *   2. a 2.1.0 server on gata_rehearsal (port 3004; DATABASE_URL of gata_rehearsal and test ADMIN_* in its
 *      environment, since its worktree has no env file), then --seed; stop that server
 *   3. npm run rehearsal:check -- --before
 *   4. npm run rehearsal:migrate, then npm run rehearsal:check -- --after: its report marks the seed's pairings,
 *      challenges and teams, and leaves them out of the open states it counts (output/rehearsal/transitions.json)
 *   5. the 3.0 server on gata_rehearsal with ADMIN_LOGIN and ADMIN_PASSWORD (test values, from output/), the
 *      smoke checks, then --finish with the same ADMIN_LOGIN and ADMIN_PASSWORD
 *
 * It never touches a database itself: it speaks HTTP only, and only to a site on this machine (http on localhost,
 * 127.0.0.1 or [::1]). --seed writes output/rehearsal/transitions.json, mode 0600: it holds the passwords this
 * run gave its two coaches — test values, never in git. It writes it as it goes, «complete»: false until the
 * end, so a seed that stops part-way (a refused call, ^C) leaves a record of the rows it made, which
 * rehearsal:check and --finish refuse: run rehearsal:restore again (it deletes the record), then --seed. A
 * --seed with a record already there is refused too — a second seed would leave the first one's rows unmarked.
 * --finish reads it back, signs in as those coaches and as the admin of ADMIN_LOGIN and ADMIN_PASSWORD (read as
 * the server reads them: the environment, then the env file), prints a line per state, «<state>: ok» or
 * «<state>: FAIL — <why>», then the table's, and writes what it checked to output/rehearsal/transitions-finish.json.
 * Exit 1 on any FAIL or refusal, 2 when there is no seed to finish.
 */
import { promises as fs } from "node:fs";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { TRANSITIONS_FINISH as FINISH_FILE, TRANSITIONS_RECORD as SEED_FILE, writePrivate } from "./rehearsal/outputs.mjs";
import { siteApi } from "./rehearsal/transitions-api.mjs";
import { assertTransitionsRecord, parseTransitionsArgs } from "./rehearsal/transitions-checks.mjs";
import { finishTransitions } from "./rehearsal/transitions-finish.mjs";
import { seedToRecord } from "./rehearsal/transitions-seed.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(rootDir, "output", "rehearsal");

async function seed(base) {
  const record = await seedToRecord(siteApi(base), { dir: outDir, stamp: randomUUID() });
  console.log(`rehearsal:transitions: seeded 5 states on ${base} (${Object.keys(record.cases).join(", ")}) — output/rehearsal/${SEED_FILE}`);
}

// The seed's record, or null when there is none to finish.
async function readRecord() {
  let text;
  try {
    text = await fs.readFile(path.join(outDir, SEED_FILE), "utf8");
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
  let value;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(`output/rehearsal/${SEED_FILE} is not valid JSON — run rehearsal:restore again, then --seed`);
  }
  return assertTransitionsRecord(value);
}

function adminOfEnvironment() {
  const { ADMIN_LOGIN: login, ADMIN_PASSWORD: password } = process.env;
  if (!login || !password) {
    throw new Error("--finish needs ADMIN_LOGIN and ADMIN_PASSWORD in the environment, the ones the 3.0 server has: the admin enters the score of «proposed»");
  }
  return { login, password };
}

async function finish(base) {
  const record = await readRecord();
  if (!record) {
    console.error(`rehearsal:transitions: no output/rehearsal/${SEED_FILE} — run --seed against the 2.1.0 site first`);
    process.exitCode = 2;
    return;
  }
  const results = await finishTransitions(siteApi(base), record, { admin: adminOfEnvironment() });
  await writePrivate(path.join(outDir, FINISH_FILE), { finishedAt: new Date().toISOString(), base, stamp: record.stamp, results });
  for (const result of results) console.log(result.ok ? `${result.state}: ok` : `${result.state}: FAIL — ${result.error}`);
  const failed = results.filter((result) => !result.ok).length;
  console.log(`rehearsal:transitions: ${failed ? `${failed} FAIL` : "every state ok"} — output/rehearsal/${FINISH_FILE}`);
  process.exitCode = failed ? 1 : 0;
}

async function main() {
  await loadEnvFile(rootDir);
  const { mode, base } = parseTransitionsArgs(process.argv.slice(2));
  if (mode === "seed") await seed(base);
  else await finish(base);
}

main().catch((error) => {
  console.error(`rehearsal:transitions: ${error.message}`);
  process.exitCode = 1;
});
