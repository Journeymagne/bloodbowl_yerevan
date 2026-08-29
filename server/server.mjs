import http from "node:http";

import { rootDir } from "./config/env.mjs";
import { databaseUrl, pool, safeDatabaseLabel } from "./db/pool.mjs";
import { assertMigrationsApplied } from "./db/migrate.mjs";
import { loadTeamReference } from "./domain/roster.mjs";
import { handleStatic, staticRootLabel } from "./http/static.mjs";
import { sendJson } from "./http/responses.mjs";
import { errorPayload } from "./http/errors.mjs";
import { normalizeLogin } from "./api/serializers.mjs";
import { hashPassword } from "./auth/session.mjs";
import { handleAuthRoutes } from "./routes/auth.mjs";
import { handleTeamRoutes } from "./routes/teams.mjs";
import { handleAdminRoutes } from "./routes/admin.mjs";
import { handlePlayerRoutes } from "./routes/players.mjs";
import { handleGameRoutes } from "./routes/games.mjs";
import { handleSeasonRoutes } from "./routes/season.mjs";

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
 * server/init.sql on every boot, applying schema and data alike; migrations are
 * `npm run db:migrate`'s job now, and the server only checks.
 */
async function ensureSchema() {
  await assertMigrationsApplied(pool);
  startupLog("database schema is ready");
}

async function ensureAdmin() {
  const login = process.env.ADMIN_LOGIN || "admin";
  const password = process.env.ADMIN_PASSWORD || "change-me-site-admin-password";
  const telegram = process.env.ADMIN_TELEGRAM || "@admin";
  const loginKey = normalizeLogin(login);
  const passwordHash = hashPassword(password);

  await pool.query(
    `INSERT INTO users (login, login_key, telegram, password_hash, is_admin)
     VALUES ($1, $2, $3, $4, TRUE)
     ON CONFLICT (login_key) DO UPDATE
       SET telegram = EXCLUDED.telegram,
           password_hash = EXCLUDED.password_hash,
           is_admin = TRUE,
           updated_at = now()`,
    [login, loginKey, telegram, passwordHash],
  );
  startupLog(`admin account is ready: ${login}`);
}




/**
 * Every route module, in the order the API is tried.
 *
 * This was one function of 672 lines: every endpoint the site has, in one
 * chain of `if`s, in the order they were written. Step 4.9 turned it into six
 * modules and this list.
 */
const routes = [
  handleAuthRoutes,
  handleTeamRoutes,
  handleAdminRoutes,
  handlePlayerRoutes,
  handleGameRoutes,
  handleSeasonRoutes,
];

async function handleApi(request, response, url) {
  try {
    // Each module answers and says so; the first that does ends the chain.
    // The paths do not overlap, so the order is the order somebody would look
    // for a route in, not the order the old if-chain happened to grow.
    for (const route of routes) {
      if (await route(request, response, url)) return;
    }
    return sendJson(response, 404, errorPayload("ROUTE_NOT_FOUND"));
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) {
      console.error(error);
    }
    // A 500 says nothing about itself: that belongs in the log, not in a
    // stranger's browser. Anything else carries its code.
    const payload = status >= 500
      ? errorPayload("SERVER_ERROR")
      : errorPayload(error.code ?? "SERVER_ERROR", error.params ?? {}, error.message);
    if (Array.isArray(error.violations)) payload.violations = error.violations;
    return sendJson(response, status, payload);
  }
}

await waitForDatabase();
await ensureSchema();
startupLog(`roster rules loaded for ${await loadTeamReference(rootDir)} teams`);
startupLog(`serving the site from ${staticRootLabel}`);
await ensureAdmin();

const server = http.createServer(async (request, response) => {
  response.__request = request;
  const url = new URL(request.url || "/", `http://localhost:${appPort}`);
  if (url.pathname.startsWith("/api/")) {
    await handleApi(request, response, url);
    return;
  }
  await handleStatic(request, response, url);
});

server.listen(appPort, () => {
  startupLog(`Gata League site and API are running at http://localhost:${appPort}`);
});
