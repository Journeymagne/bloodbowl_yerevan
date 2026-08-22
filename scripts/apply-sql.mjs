import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { readEnvValues } from "../server/config/env-file.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function loadEnvFile() {
  // Shared with server.mjs and backup-db.mjs, so this script finds the env file
  // where production actually keeps it: /etc/bloodbowl-league/.env, outside the
  // directory that is served over HTTP.
  //
  // A variable already present in the real environment wins over the file, the
  // same way server.mjs composes it, so systemd and docker overrides keep
  // winning over whatever the file says.
  for (const [key, value] of await readEnvValues(rootDir)) {
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

function databaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) {
    console.error("DATABASE_URL is required, in the environment or in the env file.");
    process.exit(1);
  }
  return value;
}

const sqlPath = process.argv[2];
if (!sqlPath) {
  console.error("Usage: node scripts/apply-sql.mjs <file.sql>");
  process.exit(1);
}

await loadEnvFile();

const sql = await fs.readFile(path.resolve(sqlPath), "utf8");
const pool = new Pool({ connectionString: databaseUrl() });

try {
  const result = await pool.query(sql);
  console.log(JSON.stringify({ ok: true, rows: result.rows }, null, 2));
} finally {
  await pool.end();
}
