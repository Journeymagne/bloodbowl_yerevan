/**
 * Public coach profiles, and the teams on them.
 *
 * Lifted out of handleApi by step 4.9. These are the only routes that answer
 * about somebody who is not the caller: a coach's page, and one of their teams
 * as seen from outside.
 *
 * They still require a session. Whether a league table and its coaches should
 * be readable without one is task 10.3's question, and it covers these too.
 */
import { pool } from "../db/pool.mjs";
import { sendJson } from "../http/responses.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicAdminUser, publicSavedTeam, publicSavedTeamSummary, publicUser } from "../api/serializers.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handlePlayerRoutes(request, response, url) {
  const publicTeamMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)\/teams\/([0-9a-f-]+)$/i);
  if (publicTeamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const [profileResult, teamResult] = await Promise.all([
      pool.query(`SELECT * FROM users WHERE id = $1`, [publicTeamMatch[1]]),
      pool.query(`SELECT * FROM saved_teams WHERE user_id = $1 AND id = $2`, [publicTeamMatch[1], publicTeamMatch[2]]),
    ]);
    if (!profileResult.rows[0]) return send(response, 404, { error: "Player not found." });
    if (!teamResult.rows[0]) return send(response, 404, { error: "Team not found." });
    return send(response, 200, {
      user: publicUser(profileResult.rows[0]),
      team: publicSavedTeam(teamResult.rows[0]),
    });
  }

  const publicPlayerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)$/i);
  if (publicPlayerMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
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
    if (!profileResult.rows[0]) return send(response, 404, { error: "Player not found." });
    return send(response, 200, {
      user: publicAdminUser(profileResult.rows[0]),
      teams: teamsResult.rows.map(publicSavedTeamSummary),
    });
  }

  return false;
}
