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
  storedGameResultComplete,
  publicUser,
  serializeRosterForStorage,
} from "./api/serializers.mjs";
import { currentUser, hashPassword } from "./auth/session.mjs";
import { handleAuthRoutes } from "./routes/auth.mjs";
import { handleTeamRoutes } from "./routes/teams.mjs";
import {
  assertCurrentRoundComplete,
  assertNoDraftRound,
  computeSeasonStandings,
  nullableInteger,
  previousOpponentMap,
  scoreLeagueResult,
  shuffleEntries,
} from "./season/scoring.mjs";
import {
  commitSavedTeamToSeason,
  ensureActiveSeason,
  loadSeasonBundle,
  loadSeasonEntryRows,
  loadSeasonPairingRows,
  loadSeasonRoundRows,
  loadUserGameRows,
} from "./season/store.mjs";

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




async function generateSwissRound(seasonRow) {
  const entryRows = await loadSeasonEntryRows(seasonRow.id);
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  if (!entryRows.length) throw httpError(400, "Add at least one committed team first.");
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);

  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const standings = computeSeasonStandings(entryRows, pairingRows);
  const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
  const queue = nextRoundNumber === 1
    ? shuffleEntries(entryRows)
    : standings.map((standing) => entriesById.get(standing.entryId)).filter(Boolean);
  const { opponents, byes } = previousOpponentMap(entryRows, pairingRows);
  const pairingsToCreate = [];

  if (queue.length % 2 === 1) {
    let byeIndex = -1;
    for (let index = queue.length - 1; index >= 0; index -= 1) {
      if (!byes.has(queue[index].id)) {
        byeIndex = index;
        break;
      }
    }
    if (byeIndex === -1) byeIndex = queue.length - 1;
    const [byeEntry] = queue.splice(byeIndex, 1);
    pairingsToCreate.push({
      homeEntryId: byeEntry.id,
      awayEntryId: null,
      homePoints: null,
      awayPoints: null,
    });
  }

  const matchPairings = [];
  while (queue.length > 0) {
    const home = queue.shift();
    let awayIndex = queue.findIndex((candidate) => !opponents.get(home.id)?.has(candidate.id));
    if (awayIndex === -1) awayIndex = 0;
    const [away] = queue.splice(awayIndex, 1);
    matchPairings.push({
      homeEntryId: home.id,
      awayEntryId: away.id,
      homePoints: null,
      awayPoints: null,
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roundResult = await client.query(
      `INSERT INTO season_rounds (season_id, round_number)
       VALUES ($1, $2)
       RETURNING *`,
      [seasonRow.id, nextRoundNumber],
    );
    const round = roundResult.rows[0];
    const orderedPairings = [...matchPairings, ...pairingsToCreate];
    for (let index = 0; index < orderedPairings.length; index += 1) {
      const pairing = orderedPairings[index];
      await client.query(
        `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id, home_points, away_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          round.id,
          index + 1,
          pairing.homeEntryId,
          pairing.awayEntryId,
          pairing.homePoints,
          pairing.awayPoints,
        ],
      );
    }
    await client.query(
      `UPDATE seasons SET current_round = $2, updated_at = now() WHERE id = $1`,
      [seasonRow.id, nextRoundNumber],
    );
    await client.query("COMMIT");
    return round;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

async function validateSeasonEntry(seasonId, entryId) {
  if (!entryId) return null;
  const result = await pool.query(
    `SELECT id FROM season_entries WHERE id = $1 AND season_id = $2`,
    [entryId, seasonId],
  );
  if (!result.rows[0]) throw httpError(404, "Season entry not found.");
  return result.rows[0].id;
}

async function createManualRound(seasonRow) {
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);
  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const result = await pool.query(
    `INSERT INTO season_rounds (season_id, round_number, status)
     VALUES ($1, $2, 'draft')
     RETURNING *`,
    [seasonRow.id, nextRoundNumber],
  );
  return result.rows[0];
}

async function addSeasonPairing(seasonId, roundId, homeEntryId = "", awayEntryId = "") {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "Round not found.");
  if (!["draft", "started"].includes(round.rows[0].status)) {
    throw httpError(409, "This round cannot be changed.");
  }

  const homeId = await validateSeasonEntry(seasonId, homeEntryId);
  const awayId = await validateSeasonEntry(seasonId, awayEntryId);
  if (homeId && awayId && homeId === awayId) throw httpError(400, "A team cannot play itself.");

  const nextTable = await pool.query(
    `SELECT COALESCE(MAX(table_number), 0) + 1 AS table_number
     FROM season_pairings
     WHERE round_id = $1`,
    [roundId],
  );
  const result = await pool.query(
    `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [roundId, nextTable.rows[0].table_number, homeId, awayId],
  );
  return result.rows[0];
}

async function proposeGameResult(pairingId, userId, body, isAdmin = false) {
  const game = (await loadUserGameRows(userId, pairingId, isAdmin))[0];
  if (!game) throw httpError(404, "Game not found.");
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  else if (game.round_status !== "started") throw httpError(409, "This game has not started yet.");
  if (!game.home_user_id || !game.away_user_id) throw httpError(409, "A BYE game does not require confirmation.");
  if (storedGameResultComplete(game)) throw httpError(409, "This result is already confirmed.");
  const values = [
    nullableInteger(body.homeTouchdowns, "Home touchdowns"),
    nullableInteger(body.awayTouchdowns, "Away touchdowns"),
    nullableInteger(body.homeCasualties, "Home casualties"),
    nullableInteger(body.awayCasualties, "Away casualties"),
  ];
  if (values.some((value) => value === null || value === undefined)) throw httpError(400, "Enter touchdowns and casualties for both teams.");
  await pool.query(
    `UPDATE season_pairings
     SET result_status = 'awaiting_confirmation', proposed_by_user_id = $2,
         proposed_home_touchdowns = $3, proposed_away_touchdowns = $4,
         proposed_home_casualties = $5, proposed_away_casualties = $6,
         proposed_at = now(), updated_at = now()
     WHERE id = $1`,
    [pairingId, userId, ...values],
  );
}

async function respondToGameProposal(pairingId, userId, accept, isAdmin = false) {
  const game = (await loadUserGameRows(userId, pairingId, isAdmin))[0];
  if (!game) throw httpError(404, "Game not found.");
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  if (game.result_status !== "awaiting_confirmation") throw httpError(409, "There is no result awaiting confirmation.");
  if (!accept) {
    await pool.query(`UPDATE season_pairings SET result_status = 'rejected', updated_at = now() WHERE id = $1`, [pairingId]);
    return;
  }
  await updateSeasonPairing(game.season_id, pairingId, {
    homeTouchdowns: game.proposed_home_touchdowns,
    awayTouchdowns: game.proposed_away_touchdowns,
    homeCasualties: game.proposed_home_casualties,
    awayCasualties: game.proposed_away_casualties,
  }, isAdmin, userId);
  await pool.query(`UPDATE season_pairings SET result_status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1`, [pairingId]);
}

function ensurePlayerCanSubmitGame(game) {
  if (game.round_status !== "started") throw httpError(409, "This game has not started yet.");
  if (Number(game.round_number ?? 0) !== Number(game.season_current_round ?? 0)) {
    throw httpError(409, "This round is closed for player result changes.");
  }
}

async function updateSeasonPairing(seasonId, pairingId, body, isAdmin = false, userId = "") {
  const current = await pool.query(
    `SELECT season_pairings.*, season_rounds.season_id, season_rounds.round_number, season_rounds.status AS round_status, seasons.current_round AS season_current_round
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     JOIN seasons ON seasons.id = season_rounds.season_id
     WHERE season_pairings.id = $1 AND season_rounds.season_id = $2`,
    [pairingId, seasonId],
  );
  const pairing = current.rows[0];
  if (!pairing) throw httpError(404, "Pairing not found.");

  const wantsTeamUpdate = Object.hasOwn(body, "homeEntryId") || Object.hasOwn(body, "awayEntryId");
  if (wantsTeamUpdate && !isAdmin) throw httpError(403, "Admin access required.");
  if (!isAdmin) ensurePlayerCanSubmitGame(pairing);
  if (!isAdmin && (!pairing.home_entry_id || !pairing.away_entry_id)) {
    throw httpError(400, "This fixture cannot receive a player-submitted result.");
  }

  let homeEntryId = pairing.home_entry_id;
  let awayEntryId = pairing.away_entry_id;
  if (wantsTeamUpdate) {
    homeEntryId = await validateSeasonEntry(seasonId, body.homeEntryId);
    awayEntryId = await validateSeasonEntry(seasonId, body.awayEntryId);
    if (homeEntryId && awayEntryId && homeEntryId === awayEntryId) {
      throw httpError(400, "A team cannot play itself.");
    }
  }

  if (!isAdmin) {
    const userEntry = await pool.query(
      `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
      [seasonId, userId],
    );
    const entryId = userEntry.rows[0]?.id;
    if (!entryId || (entryId !== pairing.home_entry_id && entryId !== pairing.away_entry_id)) {
      throw httpError(403, "This fixture does not belong to your team.");
    }
  }

  const homeTouchdowns = nullableInteger(body.homeTouchdowns, "Home touchdowns");
  const awayTouchdowns = nullableInteger(body.awayTouchdowns, "Away touchdowns");
  const homeCasualties = nullableInteger(body.homeCasualties, "Home casualties");
  const awayCasualties = nullableInteger(body.awayCasualties, "Away casualties");
  const nextHomeTouchdowns = homeTouchdowns === undefined ? pairing.home_touchdowns : homeTouchdowns;
  const nextAwayTouchdowns = awayTouchdowns === undefined ? pairing.away_touchdowns : awayTouchdowns;
  const nextHomeCasualties = homeCasualties === undefined ? pairing.home_casualties : homeCasualties;
  const nextAwayCasualties = awayCasualties === undefined ? pairing.away_casualties : awayCasualties;
  const score = scoreLeagueResult({
    homeTouchdowns: nextHomeTouchdowns,
    awayTouchdowns: nextAwayTouchdowns,
    homeCasualties: nextHomeCasualties,
    awayCasualties: nextAwayCasualties,
    hasHome: Boolean(homeEntryId),
    hasAway: Boolean(awayEntryId),
  });
  const resultComplete = [
    score.homeTouchdowns,
    score.awayTouchdowns,
    score.homeCasualties,
    score.awayCasualties,
  ].every((value) => value !== null && value !== undefined);
  const resultStatus = resultComplete ? "confirmed" : "pending";

  const result = await pool.query(
    `UPDATE season_pairings
     SET home_entry_id = $2,
         away_entry_id = $3,
         home_touchdowns = $4,
         away_touchdowns = $5,
         home_casualties = $6,
         away_casualties = $7,
         result_type = 'played',
         home_points = $8,
         away_points = $9,
         result_status = $10,
         confirmed_at = CASE WHEN $10 = 'confirmed' THEN now() ELSE NULL END,
         updated_at = now()
     WHERE id = $1
     RETURNING *`,
    [
      pairingId,
      homeEntryId,
      awayEntryId,
      score.homeTouchdowns,
      score.awayTouchdowns,
      score.homeCasualties,
      score.awayCasualties,
      score.homePoints,
      score.awayPoints,
      resultStatus,
    ],
  );
  return result.rows[0];
}

async function startSeasonRound(seasonId, roundId) {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "Round not found.");
  if (round.rows[0].status === "started") return round.rows[0];

  const pairings = await pool.query(
    `SELECT * FROM season_pairings WHERE round_id = $1 ORDER BY table_number ASC`,
    [roundId],
  );
  if (!pairings.rows.some((pairing) => pairing.home_entry_id || pairing.away_entry_id)) {
    throw httpError(400, "Add at least one non-empty pairing before starting the round.");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE season_rounds
       SET status = 'completed',
           updated_at = now()
       WHERE season_id = $1
         AND round_number < $2
         AND status = 'started'`,
      [seasonId, round.rows[0].round_number],
    );
    const updated = await client.query(
      `UPDATE season_rounds
       SET status = 'started',
           updated_at = now()
       WHERE id = $1 AND season_id = $2
       RETURNING *`,
      [roundId, seasonId],
    );
    await client.query(
      `UPDATE seasons
       SET current_round = GREATEST(current_round, $2),
           updated_at = now()
       WHERE id = $1`,
      [seasonId, round.rows[0].round_number],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
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
