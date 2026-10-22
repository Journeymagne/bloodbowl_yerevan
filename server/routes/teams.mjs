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
import { errorPayload } from "../http/errors.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicSavedTeam, publicSavedTeamSummary, serializeRosterForStorage } from "../api/serializers.mjs";
import { blockingViolations, checkRoster, normalizeDraft, rosterRefusal, teamBySlug } from "../domain/roster.mjs";
import { MAX_SPP_EDIT_STEPS, VALIDATION_CODES } from "../../src/domain/roster/validate.mjs";
import { classifyTreasuryChange } from "../../src/domain/roster/ledger.mjs";
import { stageViolations } from "../../src/domain/roster/stage.mjs";
import { SAVED_TEAM_COLUMNS, hasSeasonHistory, hasFriendlyGames, readPublicTeam } from "../api/team-queries.mjs";
import { writeLedgerEntries } from "../api/team-ledger.mjs";
import { refuseSiteRolls, settleRosterRolls } from "../api/dice-rolls.mjs";
import { UUID_SOURCE } from "../api/team-access.mjs";
import { writeMatchEvents } from "../season/match-events-store.mjs";
import { refuseWhilePlaying } from "../season/live-match.mjs";
import { sppEdits } from "../../src/domain/post-match/events.mjs";
import { handleTeamResourceRoutes } from "./team-resources.mjs";

const TEAM = new RegExp(`^/api/teams/(${UUID_SOURCE})$`, "i");

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
export async function handleTeamRoutes(request, response, url) {
  if (await handleTeamResourceRoutes(request, response, url)) return true; // /api/teams/:id/...
  if (url.pathname === "/api/teams" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const result = await pool.query(
      `SELECT ${SAVED_TEAM_COLUMNS} FROM saved_teams WHERE user_id = $1 ORDER BY updated_at DESC`,
      [user.id],
    );
    return send(response, 200, { teams: result.rows.map(publicSavedTeam) });
  }

  if (url.pathname === "/api/teams" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const { name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    refuseSiteRolls(roster);
    // Born in `draft` (stage 12, decision 26): the build goes on on the team's pages, Start Re-rolls included, and an
    // admin moves it to `active`. The create is not held to the stage — what the build bought is the draft's to keep.
    const result = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster, stage)
       VALUES ($1, $2, $3, $4, $5, 'draft')
       RETURNING id`,
      [user.id, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    // GET's shape, `inActiveSeason` included, which the row of an INSERT cannot say.
    return send(response, 201, { team: await readPublicTeam(pool, result.rows[0].id) });
  }

  // A UUID or no route: anything else would reach `::uuid` and come back as a 500 (22P02).
  const teamMatch = url.pathname.match(TEAM);
  if (teamMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const result = await pool.query(
      `SELECT ${SAVED_TEAM_COLUMNS} FROM saved_teams WHERE id = $1 AND user_id = $2`,
      [teamMatch[1], user.id],
    );
    if (!result.rows[0]) return sendError(response, 404, "TEAM_NOT_FOUND");
    return send(response, 200, { team: publicSavedTeam(result.rows[0]) });
  }

  if (teamMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const { body, name, baseTeamSlug, logoData, roster } = await readTeamBody(request);
    const written = await writeSavedTeam({
      teamId: teamMatch[1], ownerId: user.id,
      name, baseTeamSlug, logoData, roster, revision: body.revision,
      actor: { id: user.id, admin: false },
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

  if (teamMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    // A team that has played in a season cannot be deleted: its matches are
    // its opponents' results too. The RESTRICT constraint behind this would
    // stop it anyway, but as a 500 nobody can act on.
    if (await hasSeasonHistory(pool, teamMatch[1])) {
      return sendError(response, 409, "TEAM_IN_SEASON_CANNOT_BE_DELETED");
    }
    if (await hasFriendlyGames(pool, teamMatch[1])) return sendError(response, 409, "TEAM_IN_FRIENDLY_GAMES");
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
 * It is one transaction: the row is locked for the length of the write, and the
 * revision is compared against the locked row, so nothing can move it between
 * the check and the UPDATE. The stage rule is checked on the same row, after
 * the revision (a stale tab hears "saved elsewhere" before anything else), and
 * only for a coach — `actor.admin` is the admin route, which is not held to it.
 * The site rolls the roster refers to are settled next, for a coach and an admin
 * alike (`settleRosterRolls`): a new reference uses its roll, a dropped one frees
 * it, and a roll that does not fit, is used already, or is taken or given back out
 * of its turn refuses the save. The
 * treasury change is journaled in the same transaction (team_ledger), after
 * the write and before the commit, so a refused or stale save leaves no line
 * and a line never outlives its save — nor does a roll's `used_at`. The SPP
 * change goes in after it on the same terms, as settled match events without
 * a match (`sppEdits`, actor included): an edit outside a match, which the blob
 * takes as it is saved and the player's history shows. A change of more than
 * MAX_SPP_EDIT_STEPS steps is refused before anything is written, the rolls
 * included. The team the save answers with, like the one a conflict shows, is
 * read in the transaction (`readPublicTeam`), after the writes: GET's shape,
 * `inActiveSeason` included. While the team plays a match, a coach's write is refused (TEAM_IN_MATCH, stage 09a)
 * — after the revision, so a stale tab still hears it was saved elsewhere; the admin's is not (the repair path).
 *
 * @param {string|null} ownerId restricts the write to one owner; null for admin
 * @param {{id?: string, admin?: boolean}} [actor] who is writing
 * @returns {Promise<{team: object}|{conflict: object}|null>} null when no such team
 * @throws {Error} a 422 STAGE_PURCHASE_LOCKED when a coach buys what the stage forbids;
 *   a 422 ROSTER_BREAKS_THE_RULES (SPP_EDIT_TOO_LARGE) for an SPP change too large for one save;
 *   a 422 DICE_ROLL_MISMATCH or 409 DICE_ROLL_USED for a site roll the save cannot take;
 *   a 422 TEAM_IN_MATCH for a coach's save while the team plays a match
 */
export async function writeSavedTeam({ teamId, ownerId, name, baseTeamSlug, logoData, roster, revision, actor = {} }) {
  const expected = Number.isInteger(revision) ? revision : null;
  const owner = ownerId ?? null;
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const locked = (await client.query(
      `SELECT roster, stage, revision, base_team_slug FROM saved_teams
        WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid) FOR UPDATE`,
      [teamId, owner],
    )).rows[0];
    if (!locked) {
      await client.query("ROLLBACK");
      return null;
    }
    if (expected !== null && locked.revision !== expected) {
      const current = await readPublicTeam(client, teamId);
      await client.query("ROLLBACK");
      return { conflict: current };
    }
    if (!actor.admin) await refuseWhilePlaying(client, teamId);
    const before = normalizeDraft(locked.roster);
    if (!actor.admin) refuseLockedPurchases(before, roster, locked.stage);
    const edits = sppEditsWithin(before, roster);
    await settleRosterRolls(client, { teamId, race: teamBySlug(baseTeamSlug), raceBefore: teamBySlug(locked.base_team_slug), before, after: roster });
    await client.query(
      `UPDATE saved_teams
          SET name = $2,
              base_team_slug = $3,
              logo_data = $4,
              roster = $5,
              revision = revision + 1,
              updated_at = now()
        WHERE id = $1`,
      [teamId, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    // The race is what prices a sale; after a race change the old squad has no price here.
    const race = locked.base_team_slug === baseTeamSlug ? teamBySlug(baseTeamSlug) : null;
    const entries = classifyTreasuryChange(race, before, roster, { admin: Boolean(actor.admin) });
    await writeLedgerEntries(client, { teamId, opening: before.treasury, entries, actorId: actor.id ?? null });
    await writeMatchEvents(client, { teamId, pairingId: null, events: edits, actorId: actor.id ?? null, settled: true });
    const team = await readPublicTeam(client, teamId);
    await client.query("COMMIT");
    return { team };
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** A save's SPP change as the rows it writes, or the refusal of one with more steps than one save may make. */
function sppEditsWithin(before, after) {
  const edits = sppEdits(before, after);
  if (edits.length > MAX_SPP_EDIT_STEPS) {
    throw rosterRefusal([{ code: VALIDATION_CODES.SPP_EDIT_TOO_LARGE, params: { limit: MAX_SPP_EDIT_STEPS } }]);
  }
  return edits;
}

/** The first re-roll the stage does not allow, as the refusal the client translates. */
function refuseLockedPurchases(before, after, stage) {
  const [violation] = stageViolations(before, after, stage);
  if (violation) throw httpError(422, "STAGE_PURCHASE_LOCKED", violation.params);
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
  if (!name) throw httpError(400, "TEAM_NAME_REQUIRED");
  if (!baseTeamSlug) throw httpError(400, "BASE_TEAM_REQUIRED");
  if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) throw httpError(400, "LOGO_TOO_LARGE");

  const { violations, roster } = checkRoster(baseTeamSlug, body.roster ?? {});
  const blocking = blockingViolations(violations);
  if (blocking.length) throw rosterRefusal(blocking);
  return { body, name, baseTeamSlug, logoData, roster };
}
