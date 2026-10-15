#!/usr/bin/env node
/**
 * The deploy's schema step: `npm run db:migrate`, with a dump in front of it.
 *
 * Release 2.1.0. Before this the deploy migrated with whatever backup the
 * nightly timer had last taken, up to a day old. Now any deploy that changes
 * the schema takes a labelled dump first (gata_league-premigrate-*.dump, which
 * rotation keeps), and a failed dump means the schema is left as it was.
 */
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { loadEnvFile } from "../server/config/env-file.mjs";
import { applyMigrations, migrationStatus } from "../server/db/migrate.mjs";
import { planDeployMigration } from "./deploy/migrate-plan.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
await loadEnvFile(rootDir);

if (!process.env.DATABASE_URL) {
  console.error("deploy:migrate: DATABASE_URL is not set");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
try {
  const plan = planDeployMigration(await migrationStatus(pool));
  console.log(`deploy:migrate: ${plan.message}`);
  if (plan.action === "refuse") {
    process.exitCode = 1;
  } else if (plan.action === "backup-then-migrate") {
    const backup = spawnSync(process.execPath, [path.join(rootDir, "scripts", "backup-db.mjs"), "--label", "premigrate"], { stdio: "inherit" });
    if (backup.status !== 0) {
      console.error("deploy:migrate: the pre-migration backup failed; the schema was not touched");
      process.exitCode = 1;
    } else {
      const applied = await applyMigrations(pool);
      console.log(`deploy:migrate: applied ${applied.join(", ")}`);
    }
  }
} finally {
  await pool.end();
}
