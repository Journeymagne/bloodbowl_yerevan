/**
 * What an administrator can do to other people's accounts and teams.
 *
 * The last group lifted out of handleApi by step 4.9, and the one with the most
 * reach: it can rename a coach, reset their password, delete their account, and
 * create or edit a team on their behalf.
 *
 * The team endpoints here go through the same readTeamBody and writeSavedTeam
 * as a coach's own — the league's rules and the revision check apply to an
 * admin too. A roster that breaks the rules is just as wrong when an admin
 * sends it. The stage rule for re-rolls is the one thing that does not: an
 * admin may put a team right in either stage.
 */
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import {
  currentUser,
  generateTemporaryPassword,
  hashPassword,
} from "../auth/session.mjs";
import { isEnvAdmin } from "../auth/admin-account.mjs";
import {
  isAdminUser,
  normalizeLogin,
  publicAdminUser,
  publicSavedTeam,
  publicSavedTeamSummary,
  publicUser,
  serializeRosterForStorage,
} from "../api/serializers.mjs";
import { readTeamBody, writeSavedTeam } from "./teams.mjs";
import { refuseSiteRolls } from "../api/dice-rolls.mjs";
import { SAVED_TEAM_COLUMNS, hasSeasonHistory, hasFriendlyGames, readPublicTeam, userHasFriendlyGames } from "../api/team-queries.mjs";
import { UUID_SOURCE } from "../api/team-access.mjs";

// The ids these routes take are UUIDs, and nothing else matches: a path that is no UUID is no route (404)
// rather than a `::uuid` the database refuses (a 500). Postgres reads a UUID in any case, so a self-check
// compares the id the database gives back, never the path's spelling.
const USER = new RegExp(`^/api/admin/users/(${UUID_SOURCE})$`, "i");
const USER_PASSWORD_RESET = new RegExp(`^/api/admin/users/(${UUID_SOURCE})/reset-password$`, "i");
const USER_TEAMS = new RegExp(`^/api/admin/users/(${UUID_SOURCE})/teams$`, "i");
const TEAM = new RegExp(`^/api/admin/teams/(${UUID_SOURCE})$`, "i");

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/** The same, for a refusal the client can translate. */
function sendError(response, status, code, params) {
  return send(response, status, errorPayload(code, params));
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAdminRoutes(request, response, url) {
  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const result = await pool.query(
      `SELECT users.*,
              COUNT(saved_teams.id) AS saved_team_count,
              MAX(saved_teams.updated_at) AS last_team_updated_at
       FROM users
       LEFT JOIN saved_teams ON saved_teams.user_id = users.id
       GROUP BY users.id
       ORDER BY users.login_key ASC`,
    );
    return send(response, 200, { users: result.rows.map(publicAdminUser) });
  }

  return handleAdminUserRoutes(request, response, url);
}

/**
 * One coach account: reading it, editing it, deleting it.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleAdminUserRoutes(request, response, url) {
  if (await handleAdminPasswordResetRoute(request, response, url)) return true;

  const adminUserMatch = url.pathname.match(USER);
  if (adminUserMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");

    const targetResult = await pool.query("SELECT * FROM users WHERE id = $1", [adminUserMatch[1]]);
    const target = targetResult.rows[0];
    if (!target) return sendError(response, 404, "USER_NOT_FOUND");

    const body = await readJson(request);
    const login = String(body.login ?? target.login).trim();
    const password = String(body.password ?? "");
    const loginKey = normalizeLogin(login);
    const nextIsAdmin = Object.hasOwn(body, "isAdmin") ? isAdminUser({ is_admin: body.isAdmin }) : isAdminUser(target);

    if (login.length < 3) return sendError(response, 400, "LOGIN_TOO_SHORT");
    if (password && password.length < 4) return sendError(response, 400, "PASSWORD_TOO_SHORT");
    // The env file's administrator keeps the file's password: every start would write it back.
    if (password && isEnvAdmin(target)) return sendError(response, 409, "ADMIN_PASSWORD_FROM_ENV");
    // Your own password is changed in your settings, with the current one (PATCH /api/auth/profile). Here
    // it would be written with no password asked, and the administrator's other sessions would go on.
    if (password && target.id === user.id) return sendError(response, 409, "SELF_PASSWORD_RESET");
    if (target.id === user.id && !nextIsAdmin) {
      return sendError(response, 409, "SELF_ADMIN_DEMOTE");
    }

    // A new password and the end of that user's sessions are one transaction: a login that is taken (409)
    // or a write that fails leaves the old password and every session as they were. Hashed before it opens.
    const passwordHash = password ? hashPassword(password) : null;
    const updated = await withTransaction(async (client) => {
      const { rows } = await client.query(
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
        throw error.code === "23505" ? httpError(409, "LOGIN_ALREADY_REGISTERED") : error;
      });
      if (!rows[0]) throw httpError(404, "USER_NOT_FOUND"); // deleted while this request waited for the row
      if (password) await client.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
      return rows[0];
    });

    return send(response, 200, { user: publicAdminUser(updated) });
  }

  return handleAdminUserReadRoutes(request, response, url);
}

/**
 * Replace one password and revoke every session of that user.
 *
 * Who the path names is read first, and refused before anything is hashed or written: the env file's
 * administrator, whose password is the file's (ADMIN_PASSWORD_FROM_ENV), and the administrator himself
 * (SELF_PASSWORD_RESET), by the id the database gives back — the path may spell it in capitals. The new
 * password and the end of the sessions are one transaction.
 */
async function handleAdminPasswordResetRoute(request, response, url) {
  const match = url.pathname.match(USER_PASSWORD_RESET);
  if (!match || request.method !== "POST") return false;

  const user = await currentUser(request);
  if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
  if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");

  const { rows: [target] } = await pool.query("SELECT id, login_key FROM users WHERE id = $1", [match[1]]);
  if (!target) return sendError(response, 404, "USER_NOT_FOUND");
  if (isEnvAdmin(target)) return sendError(response, 409, "ADMIN_PASSWORD_FROM_ENV");
  if (target.id === user.id) return sendError(response, 409, "SELF_PASSWORD_RESET");
  const password = generateTemporaryPassword();
  const passwordHash = hashPassword(password);
  await withTransaction(async (client) => {
    const updated = await client.query("UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id", [target.id, passwordHash]);
    if (!updated.rows[0]) throw httpError(404, "USER_NOT_FOUND"); // deleted since it was read
    await client.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
  });
  return send(response, 200, { password });
}

/**
 * The transaction of deleting a user: who the path names, by the database's id (`SELF_ADMIN_DELETE` for
 * one's own, however the path spells it), then his teams, locked `ORDER BY id FOR UPDATE`, then the user.
 * The delete cascades to the teams, and every writer of a team holds the team and then waits on the
 * user's row (`FOR KEY SHARE`, through a foreign key): taking the user first, as a bare DELETE did, closed
 * a cycle with each of them (40P01). Taken in the writers' order, team then user, it only waits its turn.
 *
 * @throws 404 USER_NOT_FOUND; 409 SELF_ADMIN_DELETE or USER_IN_FRIENDLY_GAMES
 */
async function deleteUser(client, userId, admin) {
  const { rows: [target] } = await client.query("SELECT id FROM users WHERE id = $1", [userId]);
  if (!target) throw httpError(404, "USER_NOT_FOUND");
  if (target.id === admin.id) throw httpError(409, "SELF_ADMIN_DELETE");
  if (await userHasFriendlyGames(client, target.id)) throw httpError(409, "USER_IN_FRIENDLY_GAMES");
  await client.query("SELECT 1 FROM saved_teams WHERE user_id = $1 ORDER BY id FOR UPDATE", [target.id]);
  await client.query("DELETE FROM users WHERE id = $1", [target.id]);
}

/**
 * Deleting a coach, and reading their profile as an admin sees it.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleAdminUserReadRoutes(request, response, url) {
  const adminUserMatch = url.pathname.match(USER);
  if (adminUserMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    await withTransaction((client) => deleteUser(client, adminUserMatch[1], user));
    return send(response, 200, { ok: true });
  }

  if (adminUserMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
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
    if (!profileResult.rows[0]) return sendError(response, 404, "USER_NOT_FOUND");
    return send(response, 200, {
      user: publicAdminUser(profileResult.rows[0]),
      teams: teamsResult.rows.map(publicSavedTeamSummary),
    });
  }

  return handleAdminUserTeamRoutes(request, response, url);
}

/**
 * Creating a team on a coach behalf.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleAdminUserTeamRoutes(request, response, url) {
  const adminUserTeamsMatch = url.pathname.match(USER_TEAMS);
  if (adminUserTeamsMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const { name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    refuseSiteRolls(roster);
    const coach = await pool.query(`SELECT * FROM users WHERE id = $1`, [adminUserTeamsMatch[1]]);
    if (!coach.rows[0]) return sendError(response, 404, "COACH_NOT_FOUND");

    const result = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [coach.rows[0].id, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    return send(response, 201, {
      user: publicUser(coach.rows[0]),
      team: await readPublicTeam(pool, result.rows[0].id), // GET's shape, as the coach's own create answers
    });
  }

  return handleAdminTeamRoutes(request, response, url);
}

/**
 * Editing somebody else's team as an administrator.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleAdminTeamRoutes(request, response, url) {
  const adminTeamMatch = url.pathname.match(TEAM);
  if (adminTeamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const result = await pool.query(
      `SELECT ${SAVED_TEAM_COLUMNS}, users.id AS owner_id, users.login AS owner_login, users.telegram AS owner_telegram, users.is_admin AS owner_is_admin, users.created_at AS owner_created_at
       FROM saved_teams
       JOIN users ON users.id = saved_teams.user_id
       WHERE saved_teams.id = $1`,
      [adminTeamMatch[1]],
    );
    if (!result.rows[0]) return sendError(response, 404, "TEAM_NOT_FOUND");
    const row = result.rows[0];
    return send(response, 200, {
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
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const { body, name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    const written = await writeSavedTeam({
      teamId: adminTeamMatch[1], ownerId: null,
      name, baseTeamSlug, logoData, roster, revision: body.revision,
      actor: { id: user.id, admin: true },
    });
    if (!written) return sendError(response, 404, "TEAM_NOT_FOUND");
    if (written.conflict) {
      return send(response, 409, {
        ...errorPayload("TEAM_SAVED_ELSEWHERE"),
        team: written.conflict,
      });
    }
    return send(response, 200, { team: written.team });
  }

  if (adminTeamMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    // A team that has played in a season cannot be deleted: its matches are
    // its opponents' results too. The RESTRICT constraint behind this would
    // stop it anyway, but as a 500 nobody can act on.
    if (await hasSeasonHistory(pool, adminTeamMatch[1])) {
      return sendError(response, 409, "TEAM_IN_SEASON_CANNOT_BE_DELETED");
    }
    if (await hasFriendlyGames(pool, adminTeamMatch[1])) return sendError(response, 409, "TEAM_IN_FRIENDLY_GAMES");
    const deleted = await pool.query(
      `DELETE FROM saved_teams WHERE id = $1 RETURNING id, user_id`,
      [adminTeamMatch[1]],
    );
    if (!deleted.rows[0]) return sendError(response, 404, "TEAM_NOT_FOUND");
    return send(response, 200, { ok: true, ownerId: deleted.rows[0].user_id });
  }

  return false;
}
