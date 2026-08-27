/**
 * A coach's saved teams.
 *
 * Lifted out of handleApi by step 4.9. The two functions the routes lean on
 * came with them, because they are about teams and nothing else: readTeamBody,
 * which is where the league's rules are enforced at the boundary, and
 * writeSavedTeam, which is where a stale write is refused.
 */
import { pool } from "../db/pool.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicSavedTeam, publicSavedTeamSummary, serializeRosterForStorage } from "../api/serializers.mjs";
import { blockingViolations, checkRoster } from "../domain/roster.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleTeamRoutes(request, response, url) {
  if (url.pathname === "/api/teams" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const result = await pool.query(
      `SELECT * FROM saved_teams WHERE user_id = $1 ORDER BY updated_at DESC`,
      [user.id],
    );
    return send(response, 200, { teams: result.rows.map(publicSavedTeam) });
  }

  if (url.pathname === "/api/teams" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const { name, baseTeamSlug, logoData, roster } = await readTeamBody(request);

    const result = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [user.id, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    return send(response, 201, { team: publicSavedTeam(result.rows[0]) });
  }

  const teamMatch = url.pathname.match(/^\/api\/teams\/([0-9a-f-]+)$/i);
  if (teamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const result = await pool.query(
      `SELECT * FROM saved_teams WHERE id = $1 AND user_id = $2`,
      [teamMatch[1], user.id],
    );
    if (!result.rows[0]) return send(response, 404, { error: "Team not found." });
    return send(response, 200, { team: publicSavedTeam(result.rows[0]) });
  }

  if (teamMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const { body, name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    const written = await writeSavedTeam({
      teamId: teamMatch[1], ownerId: user.id,
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

  if (teamMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    await pool.query(`DELETE FROM saved_teams WHERE id = $1 AND user_id = $2`, [teamMatch[1], user.id]);
    return send(response, 200, { ok: true });
  }

  return false;
}

/**
 * Write a team, refusing to overwrite work the client has not seen.
 *
 * Two tabs on the same roster used to be a race the loser never heard about:
 * both PATCH, the second wins, and the first coach's edits are gone with no
 * message. The client sends the revision it last saw; the write lands only
 * while that still matches, and a mismatch answers 409 with the team as it now
 * stands, so the interface can offer a choice instead of guessing.
 *
 * A body with no revision writes unconditionally. That is deliberate rather
 * than an oversight: admin paths create teams without ever having read one,
 * and refusing them would break flows this step is not about. Every path a
 * coach edits through autosaves, and autosave sends it.
 *
 * @param {string|null} ownerId restricts the write to one owner; null for admin
 * @returns {Promise<{team: object}|{conflict: object}|null>} null when no such team
 */
export async function writeSavedTeam({ teamId, ownerId, name, baseTeamSlug, logoData, roster, revision }) {
  const expected = Number.isInteger(revision) ? revision : null;
  const owner = ownerId ?? null;
  const result = await pool.query(
    `UPDATE saved_teams
        SET name = $3,
            base_team_slug = $4,
            logo_data = $5,
            roster = $6,
            revision = revision + 1,
            updated_at = now()
      WHERE id = $1
        AND ($2::uuid IS NULL OR user_id = $2::uuid)
        AND ($7::int IS NULL OR revision = $7::int)
      RETURNING *`,
    [teamId, owner, name, baseTeamSlug, logoData, serializeRosterForStorage(roster), expected],
  );
  if (result.rows[0]) return { team: publicSavedTeam(result.rows[0]) };

  // No row: either the team is not there, or the revision moved under us.
  const current = await pool.query(
    `SELECT * FROM saved_teams WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)`,
    [teamId, owner],
  );
  if (!current.rows[0]) return null;
  return { conflict: publicSavedTeam(current.rows[0]) };
}

/**
 * Read and check a team body. Both the coach's endpoints and the admin ones
 * go through here, because the API is the boundary — a roster that breaks the
 * rules is just as wrong when an admin sends it.
 */
export async function readTeamBody(request) {
  const body = await readJson(request);
  const name = String(body.name ?? "").trim();
  const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
  const logoData = body.logoData ? String(body.logoData) : null;
  if (!name) throw httpError(400, "Team name is required.");
  if (!baseTeamSlug) throw httpError(400, "Base team is required.");
  if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) throw httpError(400, "Logo is too large.");

  const { violations, roster } = checkRoster(baseTeamSlug, body.roster ?? {});
  const blocking = blockingViolations(violations);
  if (blocking.length) {
    const error = httpError(422, "This roster breaks the league's rules.");
    error.violations = blocking;
    throw error;
  }
  return { body, name, baseTeamSlug, logoData, roster };
}
