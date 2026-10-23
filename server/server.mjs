import http from "node:http";

import { rootDir } from "./config/env.mjs";
import { databaseUrl, pool, safeDatabaseLabel } from "./db/pool.mjs";
import { assertMigrationsApplied } from "./db/migrate.mjs";
import { loadTeamReference } from "./domain/roster.mjs";
import { handleStatic, staticRootLabel } from "./http/static.mjs";
import { answerMaintenance } from "./http/maintenance.mjs";
import { ensureAdminAccount } from "./auth/admin-account.mjs";
import { startSessionSweeper } from "./auth/session.mjs";
import { handleApi } from "./routes/index.mjs";

const appPort = Number(process.env.APP_PORT || process.env.PORT || 3002);

const databaseCheckRetries = Number(process.env.DATABASE_CHECK_RETRIES || 30);
const databaseCheckDelayMs = Number(process.env.DATABASE_CHECK_DELAY_MS || 1000);


function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function startupLog(message) {
  console.log(`[startup] ${message}`);
}

async function waitForDatabase() {
  const label = safeDatabaseLabel(databaseUrl);
  startupLog(`checking PostgreSQL at ${label}`);

  for (let attempt = 1; attempt <= databaseCheckRetries; attempt += 1) {
    try {
      await pool.query("SELECT 1");
      startupLog(`PostgreSQL is up, site is connected to ${label}`);
      return;
    } catch (error) {
      const isLastAttempt = attempt === databaseCheckRetries;
      const detail = error?.code || error?.message || "connection failed";
      if (isLastAttempt) {
        startupLog(`PostgreSQL check failed after ${attempt} attempts: ${detail}`);
        throw error;
      }
      startupLog(`PostgreSQL is not ready yet (${attempt}/${databaseCheckRetries}): ${detail}`);
      await wait(databaseCheckDelayMs);
    }
  }
}

/**
 * Refuse to serve a database that is behind the code. This used to run
 * init.sql on every boot; migrations are `npm run db:migrate`'s job now.
 */
async function ensureSchema() {
  await assertMigrationsApplied(pool);
  startupLog("database schema is ready");
}

await waitForDatabase();
await ensureSchema();
startupLog(`roster rules loaded for ${await loadTeamReference(rootDir)} teams`);
startupLog(`serving the site from ${staticRootLabel}`);
startupLog(`admin account is ready: ${await ensureAdminAccount(pool)}`);
startSessionSweeper();

const server = http.createServer(async (request, response) => {
  response.__request = request;
  const url = new URL(request.url || "/", `http://localhost:${appPort}`);
  if (await answerMaintenance(request, response, url)) return;
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  await handleStatic(request, response, url);
});

server.listen(appPort, () => {
  startupLog(`Gata League site and API are running at http://localhost:${appPort}`);
});
