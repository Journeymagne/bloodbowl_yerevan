/**
 * The coaches as the administration of 3.0 reads them, and a coach with a team made at one stroke.
 *
 * `POST /api/admin/coaches` is the route of its own here: the account, its first team and, when asked, its
 * entry in the running season are one transaction, and the password is one the server makes and says once,
 * in that answer and nowhere else. It replaced the season's 2.x pair (`POST /api/season/admin/coaches`,
 * which took a password the admin typed, and `…/create-team`, which stored a roster as sent).
 *
 * The rest are the reads `server/routes/admin.mjs` answers with: a coach in the list (his teams counted,
 * the ones still being built too, and whether he is the account the env file keeps) and one coach's page
 * (his newest live sign-in, why his account cannot be deleted, each team's stage and history), and the
 * question a delete asks first — whether one of his teams has ever been in a season.
 */
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { currentUser, generateTemporaryPassword, hashPassword } from "../auth/session.mjs";
import { isEnvAdmin } from "../auth/admin-account.mjs";
import { normalizeLogin, publicAdminUser, publicSavedTeamSummary, serializeRosterForStorage } from "../api/serializers.mjs";
import { SAVED_TEAM_COLUMNS, readPublicTeam } from "../api/team-queries.mjs";
import { normalizeDraft, teamBySlug } from "../domain/roster.mjs";
import { ensureActiveSeason } from "../season/store.mjs";
import { newBuild } from "../../src/domain/roster/build.mjs";
import { rosterForStorage } from "../../src/domain/roster/schema.mjs";
import { startingBudget } from "../../src/domain/league-rules.mjs";
import { LOGIN_MIN_LENGTH } from "../../src/domain/account.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/** The same, for a refusal the client can translate. */
function sendError(response, status, code, params) {
  return send(response, status, errorPayload(code, params));
}

/** A coach's row with his teams counted: all of them, the ones still being built, and his newest team edit. */
const COACH_COLUMNS = `users.*,
  COUNT(saved_teams.id) AS saved_team_count,
  COUNT(saved_teams.id) FILTER (WHERE saved_teams.stage = 'draft') AS draft_team_count,
  MAX(saved_teams.updated_at) AS last_team_updated_at`;

/**
 * Has one of this coach's teams, or the coach himself, ever had an entry in a season — any season, withdrawn
 * or not? Deleting him would then take the league's history with him: the entries go with the user
 * (CASCADE) and their pairings with them, and a team with an entry is held by RESTRICT, a 500 to the admin.
 */
const SEASON_HISTORY = `EXISTS (
  SELECT 1 FROM season_entries
   WHERE season_entries.user_id = users.id
      OR season_entries.saved_team_id IN (SELECT id FROM saved_teams AS own WHERE own.user_id = users.id))`;

/** Is this coach on either side of a friendly pairing, of any status? (The question `userHasFriendlyGames` asks.) */
const FRIENDLY_HISTORY = `EXISTS (
  SELECT 1 FROM season_pairings
   WHERE season_pairings.match_kind = 'friendly'
     AND users.id IN (season_pairings.friendly_home_user_id, season_pairings.friendly_away_user_id))`;

/**
 * A coach as the admin's list and answers give him: `publicAdminUser`, and whether he is the account the env
 * file keeps (`managedByServer`: its login and rights are the file's, its password too).
 */
function adminCoach(row) {
  return publicAdminUser({ ...row, managed_by_server: isEnvAdmin(row) });
}

/**
 * Every coach of the league, by login: `GET /api/admin/users`.
 *
 * @param {{query: Function}} db
 * @returns {Promise<object[]>}
 */
export async function readCoachList(db) {
  const { rows } = await db.query(
    `SELECT ${COACH_COLUMNS}
       FROM users
       LEFT JOIN saved_teams ON saved_teams.user_id = users.id
      GROUP BY users.id
      ORDER BY users.login_key ASC`,
  );
  return rows.map(adminCoach);
}

/**
 * Why a coach's account cannot be deleted, in the order the page says it: it is the admin's own, it is the
 * administrator the server's settings keep (`isEnvAdmin`: every start writes it back), a team has a season
 * history, the coach plays friendlies; null when it can be.
 */
function coachDeleteBlock(row, viewer) {
  if (row.id === viewer.id) return "self";
  if (isEnvAdmin(row)) return "server";
  if (row.season_history) return "season";
  if (row.friendly_history) return "friendly";
  return null;
}

/**
 * A coach's team on his admin page: `publicSavedTeamSummary` (its stage and `inActiveSeason` included), how
 * many matches it has with a confirmed result (league and friendly, a bye is none), how many friendly
 * pairings it is in whatever their state, and why it cannot be deleted — the order `DELETE
 * /api/admin/teams/:id` refuses in: a season history first, then a friendly.
 */
function coachTeam(row) {
  const friendlies = Number(row.friendlies ?? 0);
  return {
    ...publicSavedTeamSummary(row),
    matches: Number(row.matches ?? 0),
    friendlies,
    deleteBlock: row.season_history ? "season" : friendlies > 0 ? "friendly" : null,
  };
}

/**
 * One coach as his admin page reads him: `GET /api/admin/users/:id`. `lastLoginAt` is when his newest live
 * session began — null when none is live (a session ends at sign-out, at a reset, at its expiry, so an older
 * one says nothing true). His teams are newest edit first; their columns are read through a subquery, so a
 * logo is never read out of the table for a list that does not send it.
 *
 * @param {{query: Function}} db
 * @param {string} userId
 * @param {{id: string}} viewer the admin asking
 * @returns {Promise<{user: object, teams: object[]}|null>} null when there is no such coach
 */
export async function readCoach(db, userId, viewer) {
  const [profile, teams] = await Promise.all([
    db.query(
      `SELECT ${COACH_COLUMNS},
              (SELECT MAX(sessions.created_at) FROM sessions
                WHERE sessions.user_id = users.id AND sessions.expires_at > now()) AS last_login_at,
              ${SEASON_HISTORY} AS season_history,
              ${FRIENDLY_HISTORY} AS friendly_history
         FROM users
         LEFT JOIN saved_teams ON saved_teams.user_id = users.id
        WHERE users.id = $1
        GROUP BY users.id`,
      [userId],
    ),
    db.query(
      `SELECT team.id, team.user_id, team.name, team.base_team_slug, team.roster, team.revision, team.stage,
              team.activated_at, team.in_active_season, team.created_at, team.updated_at,
              (SELECT count(*) FROM match_pairing_context AS pairing
                WHERE team.id IN (pairing.home_team_id, pairing.away_team_id)
                  AND pairing.home_team_id IS NOT NULL AND pairing.away_team_id IS NOT NULL
                  AND pairing.result_status = 'confirmed') AS matches,
              (SELECT count(*) FROM season_pairings AS friendly
                WHERE friendly.match_kind = 'friendly'
                  AND team.id IN (friendly.friendly_home_team_id, friendly.friendly_away_team_id)) AS friendlies,
              EXISTS (SELECT 1 FROM season_entries WHERE season_entries.saved_team_id = team.id) AS season_history
         FROM (SELECT ${SAVED_TEAM_COLUMNS} FROM saved_teams WHERE saved_teams.user_id = $1) AS team
        ORDER BY team.updated_at DESC`,
      [userId],
    ),
  ]);
  const row = profile.rows[0];
  if (!row) return null;
  return {
    user: adminCoach({ ...row, delete_block: coachDeleteBlock(row, viewer) }),
    teams: teams.rows.map(coachTeam),
  };
}

/**
 * The delete's own question (`USER_IN_SEASON`), asked inside its transaction once the coach's teams are
 * held: no entry can be added to them after that, so the answer stands until the DELETE.
 *
 * @param {{query: Function}} client
 * @param {string} userId
 * @returns {Promise<boolean>}
 */
export async function userHasSeasonHistory(client, userId) {
  const { rows } = await client.query(`SELECT ${SEASON_HISTORY} AS season_history FROM users WHERE users.id = $1`, [userId]);
  return Boolean(rows[0]?.season_history);
}

/**
 * What `POST /api/admin/coaches` was sent, trimmed, and refused before anything is read or written: a
 * short login, no Telegram, no team name, a race the league does not have.
 *
 * @returns {{login: string, telegram: string, teamName: string, race: object, enter: boolean}}
 */
function readCoachBody(body) {
  const login = String(body.login ?? "").trim();
  const telegram = String(body.telegram ?? "").trim();
  const teamName = String(body.teamName ?? "").trim();
  if (login.length < LOGIN_MIN_LENGTH) throw httpError(400, "LOGIN_TOO_SHORT");
  if (!telegram) throw httpError(400, "TELEGRAM_REQUIRED");
  if (!teamName) throw httpError(400, "TEAM_NAME_REQUIRED");
  const race = typeof body.baseTeamSlug === "string" ? teamBySlug(body.baseTeamSlug.trim()) : null;
  if (!race) throw httpError(400, "FIELD_INVALID", { field: "baseTeamSlug" });
  return { login, telegram, teamName, race, enter: body.enter === true };
}

/**
 * The account, its team and its entry, on one client: a login taken (409) or a write that fails leaves none
 * of them. The team is born in `draft` with the builder's draft of its race — named, its first league and
 * favoured — and the 600k a new team starts with, no players.
 */
async function createCoach(client, { login, telegram, teamName, race, passwordHash, season }) {
  const { rows: [user] } = await client.query(
    `INSERT INTO users (login, login_key, telegram, password_hash) VALUES ($1, $2, $3, $4) RETURNING id`,
    [login, normalizeLogin(login), telegram, passwordHash],
  ).catch((error) => {
    throw error.code === "23505" ? httpError(409, "LOGIN_ALREADY_REGISTERED") : error;
  });
  const roster = normalizeDraft(rosterForStorage({ ...newBuild(race, { name: teamName }), treasury: startingBudget }));
  const { rows: [team] } = await client.query(
    `INSERT INTO saved_teams (user_id, name, base_team_slug, roster, stage) VALUES ($1, $2, $3, $4, 'draft') RETURNING id`,
    [user.id, teamName, race.slug, serializeRosterForStorage(roster)],
  );
  const entry = season ? (await client.query(
    `INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3) RETURNING id`,
    [season.id, user.id, team.id],
  ).catch((error) => {
    throw error.code === "23505" ? httpError(409, "ENTRY_ALREADY_COMMITTED") : error;
  })).rows[0] : null;
  const { rows: [row] } = await client.query(
    `SELECT ${COACH_COLUMNS} FROM users LEFT JOIN saved_teams ON saved_teams.user_id = users.id WHERE users.id = $1 GROUP BY users.id`,
    [user.id],
  );
  return { user: adminCoach(row), team: await readPublicTeam(client, team.id), entryId: entry?.id ?? null };
}

/**
 * `POST /api/admin/coaches {login, telegram, teamName, baseTeamSlug, enter}` → 201 `{user, team, password,
 * entryId}`. The fields are refused first; a login somebody holds is refused before the season is looked up
 * (and the transaction refuses it again, for one taken meanwhile). The season is the running one, read — or
 * made, as every entry does — before the transaction (`ensureActiveSeason` runs on the pool), and only when
 * the entry is asked for. The password is the server's, sent in this answer once and kept only as its hash;
 * the admin's own session is not touched, and the coach gets none.
 *
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleAdminCoachRoutes(request, response, url) {
  if (url.pathname !== "/api/admin/coaches" || request.method !== "POST") return false;
  const user = await currentUser(request);
  if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
  if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
  const fields = readCoachBody(await readJson(request));
  const taken = await pool.query("SELECT 1 FROM users WHERE login_key = $1", [normalizeLogin(fields.login)]);
  if (taken.rowCount > 0) return sendError(response, 409, "LOGIN_ALREADY_REGISTERED");
  const season = fields.enter ? await ensureActiveSeason() : null;
  const password = generateTemporaryPassword();
  const passwordHash = hashPassword(password);
  const created = await withTransaction((client) => createCoach(client, { ...fields, passwordHash, season }));
  return send(response, 201, { ...created, password });
}
