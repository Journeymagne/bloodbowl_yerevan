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
 *
 * What the coaches' list and a coach's page say, and a coach with a team made
 * at one stroke, are server/routes/admin-coaches.mjs (stage 12). A team's
 * treasury set with its reason, a death and its undo, and a fallen player added
 * afterwards — the repair path while a team plays — are server/routes/admin-team.mjs.
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
import { changesEnvProfile, isEnvAdmin } from "../auth/admin-account.mjs";
import {
  isAdminUser,
  normalizeLogin,
  publicAdminUser,
  publicGame,
  publicSavedTeam,
  publicUser,
  serializeRosterForStorage,
} from "../api/serializers.mjs";
import { readTeamBody, writeSavedTeam } from "./teams.mjs";
import { handleAdminCoachRoutes, readCoach, readCoachList, userHasSeasonHistory } from "./admin-coaches.mjs";
import { adminTeamMatches, handleAdminTeamWrites } from "./admin-team.mjs";
import { teamHasLiveMatch } from "../season/live-match.mjs";
import { refuseSiteRolls } from "../api/dice-rolls.mjs";
import { SAVED_TEAM_COLUMNS, hasSeasonHistory, hasFriendlyGames, readPublicTeam, userHasFriendlyGames } from "../api/team-queries.mjs";
import { loadAwaitingGameRows } from "../season/store.mjs";
import { UUID_SOURCE } from "../api/team-access.mjs";
import { LOGIN_MIN_LENGTH, PASSWORD_MIN_LENGTH } from "../../src/domain/account.mjs";

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
  if (await handleAdminAwaitingRoute(request, response, url)) return true;
  if (await handleAdminCoachRoutes(request, response, url)) return true; // POST /api/admin/coaches
  if (await handleAdminTeamWrites(request, response, url)) return true; // /api/admin/teams/:id/{treasury,players/:pid/death,fallen[/:fid]}

  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    return send(response, 200, { users: await readCoachList(pool) });
  }

  return handleAdminUserRoutes(request, response, url);
}

/**
 * `GET /api/admin/awaiting` (stage 12): every score awaiting confirmation — the season's league games of any
 * round and the friendlies — for the admin to confirm, reject or put right.
 */
async function handleAdminAwaitingRoute(request, response, url) {
  if (url.pathname !== "/api/admin/awaiting" || request.method !== "GET") return false;
  const user = await currentUser(request);
  if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
  if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
  const rows = await loadAwaitingGameRows();
  return send(response, 200, { games: rows.map((row) => publicGame(row, user.id)) });
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

    if (login.length < LOGIN_MIN_LENGTH) return sendError(response, 400, "LOGIN_TOO_SHORT");
    if (password && password.length < PASSWORD_MIN_LENGTH) return sendError(response, 400, "PASSWORD_TOO_SHORT");
    // The env file's administrator keeps the file's password: every start would write it back.
    if (password && isEnvAdmin(target)) return sendError(response, 409, "ADMIN_PASSWORD_FROM_ENV");
    // Nor does the login (the start finds the account by it; only its letter case is a user's to change), nor
    // the rights: the start makes it an administrator again, so a demotion here would last until the restart.
    const rights = Object.hasOwn(body, "isAdmin") ? nextIsAdmin : undefined;
    if (changesEnvProfile(target, { login, isAdmin: rights })) return sendError(response, 409, "ADMIN_PROFILE_FROM_ENV");
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
 * A coach with a season history (`USER_IN_SEASON`) is asked about once his teams are held, when no entry can
 * be added to them any more: an entry would take its pairings with the user (CASCADE), and its team is held
 * by RESTRICT — a 500 nobody can act on, which this 409 answers before the DELETE.
 *
 * @throws 404 USER_NOT_FOUND; 409 SELF_ADMIN_DELETE, USER_IN_FRIENDLY_GAMES or USER_IN_SEASON
 */
async function deleteUser(client, userId, admin) {
  const { rows: [target] } = await client.query("SELECT id FROM users WHERE id = $1", [userId]);
  if (!target) throw httpError(404, "USER_NOT_FOUND");
  if (target.id === admin.id) throw httpError(409, "SELF_ADMIN_DELETE");
  if (await userHasFriendlyGames(client, target.id)) throw httpError(409, "USER_IN_FRIENDLY_GAMES");
  await client.query("SELECT 1 FROM saved_teams WHERE user_id = $1 ORDER BY id FOR UPDATE", [target.id]);
  if (await userHasSeasonHistory(client, target.id)) throw httpError(409, "USER_IN_SEASON");
  // Another admin may have deleted him while this one waited on the teams: then there is no one to delete.
  const deleted = await client.query("DELETE FROM users WHERE id = $1 RETURNING id", [target.id]);
  if (!deleted.rows[0]) throw httpError(404, "USER_NOT_FOUND");
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
    const coach = await readCoach(pool, adminUserMatch[1], user);
    if (!coach) return sendError(response, 404, "USER_NOT_FOUND");
    return send(response, 200, coach);
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

    // Born in `draft`, like every new team (decision 26): the admin moves it to `active` («Сезон → Участники»).
    const result = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster, stage)
       VALUES ($1, $2, $3, $4, $5, 'draft')
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
      inMatch: await teamHasLiveMatch(pool, row.id), // the admin's edit goes through while it plays: the repair path
      matches: await adminTeamMatches(pool, row.id),
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
