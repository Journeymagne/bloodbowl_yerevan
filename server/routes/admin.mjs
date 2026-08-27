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
 * sends it.
 */
import { pool } from "../db/pool.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { currentUser, hashPassword } from "../auth/session.mjs";
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
import { SAVED_TEAM_COLUMNS } from "../api/team-queries.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAdminRoutes(request, response, url) {
  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
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
  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
  if (adminUserMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });

    const targetResult = await pool.query("SELECT * FROM users WHERE id = $1", [adminUserMatch[1]]);
    const target = targetResult.rows[0];
    if (!target) return send(response, 404, { error: "User not found." });

    const body = await readJson(request);
    const login = String(body.login ?? target.login).trim();
    const password = String(body.password ?? "");
    const loginKey = normalizeLogin(login);
    const nextIsAdmin = Object.hasOwn(body, "isAdmin") ? isAdminUser({ is_admin: body.isAdmin }) : isAdminUser(target);

    if (login.length < 3) return send(response, 400, { error: "Login must be at least 3 characters." });
    if (password && password.length < 4) return send(response, 400, { error: "Password must be at least 4 characters." });
    if (target.id === user.id && !nextIsAdmin) {
      return send(response, 409, { error: "You cannot remove admin access from your own account." });
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
    if (!updated) return send(response, 409, { error: "This login is already registered." });

    if (password && target.id !== user.id) {
      await pool.query("DELETE FROM sessions WHERE user_id = $1", [target.id]);
    }

    return send(response, 200, { user: publicAdminUser(updated.rows[0]) });
  }

  return handleAdminUserReadRoutes(request, response, url);
}

/**
 * Deleting a coach, and reading their profile as an admin sees it.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleAdminUserReadRoutes(request, response, url) {
  const adminUserMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)$/i);
  if (adminUserMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    if (adminUserMatch[1] === user.id) {
      return send(response, 409, { error: "You cannot delete your own admin account." });
    }

    const deleted = await pool.query("DELETE FROM users WHERE id = $1 RETURNING id", [adminUserMatch[1]]);
    if (!deleted.rows[0]) return send(response, 404, { error: "User not found." });
    return send(response, 200, { ok: true });
  }

  if (adminUserMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
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
    if (!profileResult.rows[0]) return send(response, 404, { error: "User not found." });
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
  const adminUserTeamsMatch = url.pathname.match(/^\/api\/admin\/users\/([0-9a-f-]+)\/teams$/i);
  if (adminUserTeamsMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const { name, baseTeamSlug, logoData, roster } = await readTeamBody(request);

    const coach = await pool.query(`SELECT * FROM users WHERE id = $1`, [adminUserTeamsMatch[1]]);
    if (!coach.rows[0]) return send(response, 404, { error: "Coach not found." });

    const result = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [adminUserTeamsMatch[1], name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    return send(response, 201, {
      user: publicUser(coach.rows[0]),
      team: publicSavedTeam(result.rows[0]),
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
  const adminTeamMatch = url.pathname.match(/^\/api\/admin\/teams\/([0-9a-f-]+)$/i);
  if (adminTeamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const result = await pool.query(
      `SELECT ${SAVED_TEAM_COLUMNS}, users.id AS owner_id, users.login AS owner_login, users.telegram AS owner_telegram, users.is_admin AS owner_is_admin, users.created_at AS owner_created_at
       FROM saved_teams
       JOIN users ON users.id = saved_teams.user_id
       WHERE saved_teams.id = $1`,
      [adminTeamMatch[1]],
    );
    if (!result.rows[0]) return send(response, 404, { error: "Team not found." });
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
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const { body, name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    const written = await writeSavedTeam({
      teamId: adminTeamMatch[1], ownerId: null,
      name, baseTeamSlug, logoData, roster, revision: body.revision,
    });
    if (!written) return send(response, 404, { error: "Team not found." });
    if (written.conflict) {
      return send(response, 409, {
        error: "This team was saved somewhere else after you opened it.",
        team: written.conflict,
      });
    }
    return send(response, 200, { team: written.team });
  }

  if (adminTeamMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const deleted = await pool.query(
      `DELETE FROM saved_teams WHERE id = $1 RETURNING id, user_id`,
      [adminTeamMatch[1]],
    );
    if (!deleted.rows[0]) return send(response, 404, { error: "Team not found." });
    return send(response, 200, { ok: true, ownerId: deleted.rows[0].user_id });
  }

  return false;
}
