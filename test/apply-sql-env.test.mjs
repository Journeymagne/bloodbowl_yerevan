import test from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const script = path.join(rootDir, "scripts", "apply-sql.mjs");

// Nothing here reaches a database: every connection string points at a
// 127.0.0.1 port nothing listens on, so the script fails with a refused
// connection naming the port it dialled. That port is the assertion — it says
// which DATABASE_URL the script picked, without needing postgres to be up.
const REFUSED_FROM_FILE = "postgres://u:p@127.0.0.1:5441/from_file";
const REFUSED_FROM_ENV = "postgres://u:p@127.0.0.1:5442/from_env";

async function runApplySql({ envFileBody, env = {} }) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "apply-sql-test-"));
  const sqlPath = path.join(dir, "query.sql");
  await fs.writeFile(sqlPath, "select 1;\n");

  // Start from the real environment so node keeps working, then drop the keys
  // that would let the machine running the tests decide the outcome.
  const childEnv = { ...process.env, ...env };
  if (env.DATABASE_URL === undefined) delete childEnv.DATABASE_URL;

  if (envFileBody !== undefined) {
    const envPath = path.join(dir, "env");
    await fs.writeFile(envPath, envFileBody);
    childEnv.BLOODBOWL_ENV_FILE = envPath;
  } else {
    delete childEnv.BLOODBOWL_ENV_FILE;
  }

  return new Promise((resolve) => {
    execFile(process.execPath, [script, sqlPath], { env: childEnv }, (error, stdout, stderr) => {
      resolve({ code: error?.code ?? 0, stdout, stderr });
    });
  });
}

test("reads DATABASE_URL from the env file the environment points at", async () => {
  const result = await runApplySql({ envFileBody: `DATABASE_URL=${REFUSED_FROM_FILE}\n` });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /127\.0\.0\.1:5441/);
});

test("a DATABASE_URL already in the environment wins over the env file", async () => {
  const result = await runApplySql({
    envFileBody: `DATABASE_URL=${REFUSED_FROM_FILE}\n`,
    env: { DATABASE_URL: REFUSED_FROM_ENV },
  });
  assert.notEqual(result.code, 0);
  assert.match(result.stderr, /127\.0\.0\.1:5442/);
});

test("fails with a clear message when DATABASE_URL is set nowhere", async () => {
  const result = await runApplySql({ envFileBody: "POSTGRES_USER=gata_admin\n" });
  assert.equal(result.code, 1);
  assert.match(result.stderr, /DATABASE_URL is required/);
  // No default connection string: a missing DATABASE_URL must never be
  // answered by quietly dialling some other database.
  assert.doesNotMatch(result.stderr, /ECONNREFUSED|postgres:\/\//);
});
