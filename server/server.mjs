import crypto from "node:crypto";
import http from "node:http";
import { promises as fs } from "node:fs";
import path from "node:path";
import { rootDir } from "./config/env.mjs";
import { databaseUrl, pool, safeDatabaseLabel } from "./db/pool.mjs";
import { assertMigrationsApplied } from "./db/migrate.mjs";
import { loadTeamReference } from "./domain/roster.mjs";
import { resolveStaticPath } from "./http/static-path.mjs";
import { encodedBody, httpError, readJson, sendJson, writeResponse } from "./http/responses.mjs";
import {
  isAdminUser,
  normalizeLogin,
  publicAdminUser,
  publicGame,
  publicSavedTeam,
  publicSavedTeamSummary,
  publicUser,
  serializeRosterForStorage,
} from "./api/serializers.mjs";
import { currentUser, hashPassword } from "./auth/session.mjs";
import { handleAuthRoutes } from "./routes/auth.mjs";
import { handleTeamRoutes } from "./routes/teams.mjs";
import { handleAdminRoutes } from "./routes/admin.mjs";
import { handlePlayerRoutes } from "./routes/players.mjs";
import { handleGameRoutes } from "./routes/games.mjs";
import { handleSeasonRoutes } from "./routes/season.mjs";
import {
  commitSavedTeamToSeason,
  ensureActiveSeason,
  loadSeasonBundle,
  loadUserGameRows,
} from "./season/store.mjs";
import { addSeasonPairing, createManualRound, generateSwissRound, startSeasonRound, validateSeasonEntry } from "./season/rounds.mjs";
import { proposeGameResult, respondToGameProposal, updateSeasonPairing } from "./season/games.mjs";

const appPort = Number(process.env.APP_PORT || process.env.PORT || 3002);

const databaseCheckRetries = Number(process.env.DATABASE_CHECK_RETRIES || 30);
const databaseCheckDelayMs = Number(process.env.DATABASE_CHECK_DELAY_MS || 1000);

const mimeTypes = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".svg", "image/svg+xml"],
  [".webp", "image/webp"],
]);


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
    // Order is not significant — the paths do not overlap — so this reads in
    // the order somebody would look for a route, not in the order the old
    // if-chain happened to grow.
    for (const route of routes) {
      if (await route(request, response, url)) return;
    }
    return sendJson(response, 404, { error: "API route not found." });
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) {
      console.error(error);
    }
    const payload = { error: status >= 500 ? "Server error." : error.message };
    if (Array.isArray(error.violations)) payload.violations = error.violations;
    return sendJson(response, status, payload);
  }
}


function cacheControlForStatic(url, fullPath) {
  const pathname = url.pathname;
  const extension = path.extname(fullPath);
  if (extension === ".html" || pathname === "/" || pathname === "/index.html") {
    return "no-cache";
  }
  if (url.searchParams.has("v") || pathname.startsWith("/assets/")) {
    return "public, max-age=31536000, immutable";
  }
  if (pathname.startsWith("/public/data") || pathname.startsWith("/src/i18n/")) {
    return "public, max-age=3600, stale-while-revalidate=86400";
  }
  return "public, max-age=86400";
}

async function handleStatic(request, response, url) {
  const fullPath = resolveStaticPath(url.pathname, rootDir);
  if (!fullPath) {
    // 404 rather than 403: a 403 confirms the file exists.
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
    return;
  }

  try {
    const body = await fs.readFile(fullPath);
    writeResponse(request, response, 200, body, {
      "Content-Type": mimeTypes.get(path.extname(fullPath)) || "application/octet-stream",
      "Cache-Control": cacheControlForStatic(url, fullPath),
    });
  } catch {
    response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    response.end("Not found");
  }
}

await waitForDatabase();
await ensureSchema();
startupLog(`roster rules loaded for ${await loadTeamReference(rootDir)} teams`);
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
