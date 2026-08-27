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




async function handleApi(request, response, url) {
  try {
    // Route modules answer and say so; the chain stops at the first that does.
    // step 4.9 is moving the rest of this function into them.
    if (await handleAuthRoutes(request, response, url)) return;
    if (await handleTeamRoutes(request, response, url)) return;
    if (url.pathname === "/api/admin/users" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const result = await pool.query(
        `SELECT users.*,
                COUNT(saved_teams.id) AS saved_team_count,
                MAX(saved_teams.updated_at) AS last_team_updated_at
         FROM users
         LEFT JOIN saved_teams ON saved_teams.user_id = users.id
         GROUP BY users.id
         ORDER BY users.login_key ASC`,
      );
      return sendJson(response, 200, { users: result.rows.map(publicAdminUser) });
    }

    const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
    if (adminUserMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });

      const targetResult = await pool.query("SELECT * FROM users WHERE id = $1", [adminUserMatch[1]]);
      const target = targetResult.rows[0];
      if (!target) return sendJson(response, 404, { error: "User not found." });

      const body = await readJson(request);
      const login = String(body.login ?? target.login).trim();
      const password = String(body.password ?? "");
      const loginKey = normalizeLogin(login);
      const nextIsAdmin = Object.hasOwn(body, "isAdmin") ? isAdminUser({ is_admin: body.isAdmin }) : isAdminUser(target);

      if (login.length < 3) return sendJson(response, 400, { error: "Login must be at least 3 characters." });
      if (password && password.length < 4) return sendJson(response, 400, { error: "Password must be at least 4 characters." });
      if (target.id === user.id && !nextIsAdmin) {
        return sendJson(response, 409, { error: "You cannot remove admin access from your own account." });
      }

      const passwordHash = password ? hashPassword(password) : null;
      const updated = await pool.query(
        `UPDATE users
         SET login = $2,
             login_key = $3,
             password_hash = COALESCE($4, password_hash),
             is_admin = $5,
             updated_at = now()
         WHERE id = $1
         RETURNING *`,
        [target.id, login, loginKey, passwordHash, nextIsAdmin],
      ).catch((error) => {
        if (error.code === "23505") return null;
        throw error;
      });
      if (!updated) return sendJson(response, 409, { error: "This login is already registered." });

      if (password && target.id !== user.id) {
        await pool.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
      }

      return sendJson(response, 200, { user: publicAdminUser(updated.rows[0]) });
    }

    if (adminUserMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      if (adminUserMatch[1] === user.id) {
        return sendJson(response, 409, { error: "You cannot delete your own admin account." });
      }

      const deleted = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [adminUserMatch[1]]);
      if (!deleted.rows[0]) return sendJson(response, 404, { error: "User not found." });
      return sendJson(response, 200, { ok: true });
    }

    if (adminUserMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const [profileResult, teamsResult] = await Promise.all([
        pool.query(
          `SELECT users.*,
                  COUNT(saved_teams.id) AS saved_team_count,
                  MAX(saved_teams.updated_at) AS last_team_updated_at
           FROM users
           LEFT JOIN saved_teams ON saved_teams.user_id = users.id
           WHERE users.id = $1
           GROUP BY users.id`,
          [adminUserMatch[1]],
        ),
        pool.query(
          `SELECT id, user_id, name, base_team_slug, roster, created_at, updated_at
           FROM saved_teams
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [adminUserMatch[1]],
        ),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "User not found." });
      return sendJson(response, 200, {
        user: publicAdminUser(profileResult.rows[0]),
        teams: teamsResult.rows.map(publicSavedTeamSummary),
      });
    }

    const adminUserTeamsMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/teams$/i);
    if (adminUserTeamsMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const { name, baseTeamSlug, logoData, roster } = await readTeamBody(request);

      const coach = await pool.query(`SELECT * FROM users WHERE id = $1`, [adminUserTeamsMatch[1]]);
      if (!coach.rows[0]) return sendJson(response, 404, { error: "Coach not found." });

      const result = await pool.query(
        `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [adminUserTeamsMatch[1], name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      return sendJson(response, 201, {
        user: publicUser(coach.rows[0]),
        team: publicSavedTeam(result.rows[0]),
      });
    }

    const adminTeamMatch = url.pathname.match(/^\/api\/admin\/teams\/([0-9a-f-]+)$/i);
    if (adminTeamMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const result = await pool.query(
        `SELECT saved_teams.*, users.id AS owner_id, users.login AS owner_login, users.telegram AS owner_telegram, users.is_admin AS owner_is_admin, users.created_at AS owner_created_at
         FROM saved_teams
         JOIN users ON users.id = saved_teams.user_id
         WHERE saved_teams.id = $1`,
        [adminTeamMatch[1]],
      );
      if (!result.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      const row = result.rows[0];
      return sendJson(response, 200, {
        owner: publicUser({
          id: row.owner_id,
          login: row.owner_login,
          telegram: row.owner_telegram,
          is_admin: row.owner_is_admin,
          created_at: row.owner_created_at,
        }),
        team: publicSavedTeam(row),
      });
    }

    if (adminTeamMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const { body, name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
      const written = await writeSavedTeam({
        teamId: adminTeamMatch[1], ownerId: null,
        name, baseTeamSlug, logoData, roster, revision: body.revision,
      });
      if (!written) return sendJson(response, 404, { error: "Team not found." });
      if (written.conflict) {
        return sendJson(response, 409, {
          error: "This team was saved somewhere else after you opened it.",
          team: written.conflict,
        });
      }
      return sendJson(response, 200, { team: written.team });
    }

    if (adminTeamMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const deleted = await pool.query(
        `DELETE FROM saved_teams WHERE id = $1 RETURNING id, user_id`,
        [adminTeamMatch[1]],
      );
      if (!deleted.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, { ok: true, ownerId: deleted.rows[0].user_id });
    }

    const publicTeamMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)\/teams\/([0-9a-f-]+)$/i);
    if (publicTeamMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const [profileResult, teamResult] = await Promise.all([
        pool.query(`SELECT * FROM users WHERE id = $1`, [publicTeamMatch[1]]),
        pool.query(`SELECT * FROM saved_teams WHERE user_id = $1 AND id = $2`, [publicTeamMatch[1], publicTeamMatch[2]]),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "Player not found." });
      if (!teamResult.rows[0]) return sendJson(response, 404, { error: "Team not found." });
      return sendJson(response, 200, {
        user: publicUser(profileResult.rows[0]),
        team: publicSavedTeam(teamResult.rows[0]),
      });
    }

    const publicPlayerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)$/i);
    if (publicPlayerMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const [profileResult, teamsResult] = await Promise.all([
        pool.query(
          `SELECT users.*,
                  COUNT(saved_teams.id) AS saved_team_count,
                  MAX(saved_teams.updated_at) AS last_team_updated_at
           FROM users
           LEFT JOIN saved_teams ON saved_teams.user_id = users.id
           WHERE users.id = $1
           GROUP BY users.id`,
          [publicPlayerMatch[1]],
        ),
        pool.query(
          `SELECT id, user_id, name, base_team_slug, roster, created_at, updated_at
           FROM saved_teams
           WHERE user_id = $1
           ORDER BY updated_at DESC`,
          [publicPlayerMatch[1]],
        ),
      ]);
      if (!profileResult.rows[0]) return sendJson(response, 404, { error: "Player not found." });
      return sendJson(response, 200, {
        user: publicAdminUser(profileResult.rows[0]),
        teams: teamsResult.rows.map(publicSavedTeamSummary),
      });
    }

    if (url.pathname === "/api/games" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const [rows, currentRows] = await Promise.all([
        loadUserGameRows(user.id),
        user.is_admin ? loadUserGameRows(user.id, null, true) : Promise.resolve([]),
      ]);
      return sendJson(response, 200, {
        games: rows.map((row) => publicGame(row, user.id)),
        currentGames: currentRows.map((row) => publicGame(row, user.id)),
      });
    }

    const teamLogoMatch = url.pathname.match(/^\/api\/team-logos\/([0-9a-f-]+)$/i);
    if (teamLogoMatch && request.method === "GET") {
      const result = await pool.query(
        `SELECT logo_data, updated_at FROM saved_teams WHERE id = $1`,
        [teamLogoMatch[1]],
      );
      const logoData = String(result.rows[0]?.logo_data || "");
      const match = logoData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/i);
      if (!match) return writeResponse(request, response, 404, "", { "Cache-Control": "public, max-age=300" });
      const body = Buffer.from(match[2], "base64");
      const etag = `"${crypto.createHash("sha256").update(body).digest("hex")}"`;
      if (request.headers["if-none-match"] === etag) {
        return writeResponse(request, response, 304, "", { ETag: etag, "Cache-Control": "public, max-age=86400" });
      }
      return writeResponse(request, response, 200, body, {
        "Content-Type": match[1].toLowerCase(),
        "Cache-Control": "public, max-age=86400",
        ETag: etag,
      });
    }

    const gameMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)$/i);
    if (gameMatch && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const row = (await loadUserGameRows(user.id, gameMatch[1], user.is_admin))[0];
      if (!row) return sendJson(response, 404, { error: "Game not found." });
      return sendJson(response, 200, { game: publicGame(row, user.id) });
    }

    if (gameMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const row = (await loadUserGameRows(user.id, gameMatch[1], true))[0];
      if (!row) return sendJson(response, 404, { error: "Game not found." });
      await updateSeasonPairing(row.season_id, gameMatch[1], await readJson(request), true, user.id);
      const updated = (await loadUserGameRows(user.id, gameMatch[1], true))[0];
      return sendJson(response, 200, { game: publicGame(updated, user.id) });
    }

    const gameActionMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)\/(propose|confirm|reject)$/i);
    if (gameActionMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (gameActionMatch[2] === "propose") await proposeGameResult(gameActionMatch[1], user.id, await readJson(request), user.is_admin);
      if (gameActionMatch[2] === "confirm") await respondToGameProposal(gameActionMatch[1], user.id, true, user.is_admin);
      if (gameActionMatch[2] === "reject") await respondToGameProposal(gameActionMatch[1], user.id, false, user.is_admin);
      const row = (await loadUserGameRows(user.id, gameActionMatch[1], user.is_admin))[0];
      return sendJson(response, 200, { game: publicGame(row, user.id) });
    }

    if (url.pathname === "/api/season" && request.method === "GET") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/commit" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const body = await readJson(request);
      const teamId = String(body.teamId ?? "").trim();
      if (!teamId) return sendJson(response, 400, { error: "Team is required." });
      const season = await ensureActiveSeason();
      await commitSavedTeamToSeason(season.id, teamId, user.id);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/entries" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const teamId = String(body.teamId ?? "").trim();
      if (!teamId) return sendJson(response, 400, { error: "Team is required." });
      const season = await ensureActiveSeason();
      await commitSavedTeamToSeason(season.id, teamId);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const seasonEntryMatch = url.pathname.match(/^\/api\/season\/admin\/entries\/([0-9a-f-]+)$/i);
    if (seasonEntryMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(
        `DELETE FROM season_entries WHERE id = $1 AND season_id = $2`,
        [seasonEntryMatch[1], season.id],
      );
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/create-team" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const userId = String(body.userId ?? "").trim();
      const name = String(body.name ?? "").trim();
      const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
      const logoData = body.logoData ? String(body.logoData) : null;
      const roster = body.roster ?? {};

      if (!userId) return sendJson(response, 400, { error: "Coach is required." });
      if (!name) return sendJson(response, 400, { error: "Team name is required." });
      if (!baseTeamSlug) return sendJson(response, 400, { error: "Base team is required." });
      if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
        return sendJson(response, 400, { error: "Logo is too large." });
      }

      const coach = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
      if (!coach.rows[0]) return sendJson(response, 404, { error: "Coach not found." });

      const season = await ensureActiveSeason();
      const existingEntry = await pool.query(
        `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
        [season.id, userId],
      );
      if (existingEntry.rows[0]) {
        return sendJson(response, 409, { error: "This coach already has a committed team." });
      }

      const savedTeam = await pool.query(
        `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [userId, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
      );
      await commitSavedTeamToSeason(season.id, savedTeam.rows[0].id);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/rounds/generate" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await generateSwissRound(season);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    if (url.pathname === "/api/season/admin/rounds" && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await createManualRound(season);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const seasonRoundMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)$/i);
    if (seasonRoundMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(`DELETE FROM season_rounds WHERE id = $1 AND season_id = $2`, [seasonRoundMatch[1], season.id]);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    const seasonRoundStartMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/start$/i);
    if (seasonRoundStartMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await startSeasonRound(season.id, seasonRoundStartMatch[1]);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    const seasonRoundPairingsMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/pairings$/i);
    if (seasonRoundPairingsMatch && request.method === "POST") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const season = await ensureActiveSeason();
      await addSeasonPairing(season.id, seasonRoundPairingsMatch[1], body.homeEntryId, body.awayEntryId);
      return sendJson(response, 201, await loadSeasonBundle(user));
    }

    const fixtureMatch = url.pathname.match(/^\/api\/season\/fixture\/([0-9a-f-]+)$/i);
    if (fixtureMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      const body = await readJson(request);
      await proposeGameResult(fixtureMatch[1], user.id, body, user.is_admin);
      return sendJson(response, 200, { game: publicGame((await loadUserGameRows(user.id, fixtureMatch[1], user.is_admin))[0], user.id) });
    }

    const seasonPairingMatch = url.pathname.match(/^\/api\/season\/admin\/pairings\/([0-9a-f-]+)$/i);
    if (seasonPairingMatch && request.method === "PATCH") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const body = await readJson(request);
      const season = await ensureActiveSeason();
      await updateSeasonPairing(season.id, seasonPairingMatch[1], body, true, user.id);
      return sendJson(response, 200, await loadSeasonBundle(user));
    }

    if (seasonPairingMatch && request.method === "DELETE") {
      const user = await currentUser(request);
      if (!user) return sendJson(response, 401, { error: "Not authorized." });
      if (!user.is_admin) return sendJson(response, 403, { error: "Admin access required." });
      const season = await ensureActiveSeason();
      await pool.query(
        `DELETE FROM season_pairings
         USING season_rounds
         WHERE season_pairings.id = $1
           AND season_pairings.round_id = season_rounds.id
           AND season_rounds.season_id = $2`,
        [seasonPairingMatch[1], season.id],
      );
      return sendJson(response, 200, await loadSeasonBundle(user));
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
