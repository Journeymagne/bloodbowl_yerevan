/**
 * Public coach profiles, and the teams on them.
 *
 * Lifted out of handleApi by step 4.9. These are the only routes that answer
 * about somebody who is not the caller: a coach's page, and one of their teams
 * as seen from outside.
 *
 * They still require a session. Whether a league table and its coaches should
 * be readable without one is task 10.3's question, and it covers these too.
 *
 * A coach's public team carries the skills its site rolls came up with — the used
 * random skills, their dice' skills alone: no attempts, faces or stamps, no waiting
 * roll (stage 10; spec 3.0 §9.5: whoever can open the roster sees what the dice showed).
 */
import { pool } from "../db/pool.mjs";
import { sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicAdminUser, publicSavedTeam, publicSavedTeamSummary, publicUser } from "../api/serializers.mjs";
import { rolledDice } from "../../src/domain/roster/dice.mjs";

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
 * A used random-skill roll as any coach who can open the roster sees it: the player it was for and the
 * skill each die came up, the coach having taken one of them. Nothing else of the row — not the attempts
 * (the faces, the duplicates thrown again), the params (the column and its candidates), who rolled it or
 * when it was rolled and used.
 *
 * @param {{id: string, player_id: string, result: object}} row a `dice_rolls` row the query below read: a used random
 *   skill's, so its purpose is written as the contract has it rather than copied
 * @returns {{id: string, playerId: string, purpose: "random_skill", result: {dice: {skill: string}[]}}}
 */
export function publicTeamRoll(row) {
  return {
    id: row.id,
    playerId: String(row.player_id),
    purpose: "random_skill",
    result: { dice: rolledDice(row).map(({ skill }) => ({ skill })) },
  };
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handlePlayerRoutes(request, response, url) {
  const publicTeamMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)\/teams\/([0-9a-f-]+)$/i);
  if (publicTeamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const [profileResult, teamResult, rollsResult] = await Promise.all([
      pool.query(`SELECT * FROM users WHERE id = $1`, [publicTeamMatch[1]]),
      pool.query(`SELECT * FROM saved_teams WHERE user_id = $1 AND id = $2`, [publicTeamMatch[1], publicTeamMatch[2]]),
      // Read alongside, not after: on a 404 below they are dropped unsent.
      pool.query(
        `SELECT * FROM dice_rolls
         WHERE saved_team_id = $1 AND purpose = 'random_skill' AND used_at IS NOT NULL
         ORDER BY created_at, id`,
        [publicTeamMatch[2]],
      ),
    ]);
    if (!profileResult.rows[0]) return sendError(response, 404, "PLAYER_NOT_FOUND");
    if (!teamResult.rows[0]) return sendError(response, 404, "TEAM_NOT_FOUND");
    return send(response, 200, {
      user: publicUser(profileResult.rows[0]),
      team: publicSavedTeam(teamResult.rows[0]),
      rolls: rollsResult.rows.map(publicTeamRoll),
    });
  }

  const publicPlayerMatch = url.pathname.match(/^\/api\/players\/([0-9a-f-]+)$/i);
  if (publicPlayerMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
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
        `SELECT id, user_id, name, base_team_slug, roster, stage, created_at, updated_at,
                (logo_data IS NOT NULL AND logo_data <> '') AS has_logo
         FROM saved_teams
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [publicPlayerMatch[1]],
      ),
    ]);
    if (!profileResult.rows[0]) return sendError(response, 404, "PLAYER_NOT_FOUND");
    return send(response, 200, {
      user: publicAdminUser(profileResult.rows[0]),
      teams: teamsResult.rows.map(publicSavedTeamSummary),
    });
  }

  return false;
}
