/**
 * Match results: proposing one, answering it, an admin editing it, and an admin changing a technical
 * result's reason (stage 12).
 *
 * Lifted out of server.mjs by step 4.9.
 *
 * Task 14 is about this file. Today the coach who proposes a result can accept
 * it themselves, and confirming runs as two statements rather than one
 * transaction — so a failure between them leaves a pairing updated and its
 * status not. Moved here unchanged; 14.1 and 14.2 fix it.
 */
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError } from "../http/responses.mjs";
import { storedGameResultComplete } from "../api/serializers.mjs";
import { nullableInteger, scoreLeagueResult } from "./scoring.mjs";
import { loadUserGameRows } from "./store.mjs";
import { validateSeasonEntry } from "./rounds.mjs";
import { TECHNICAL_REASONS, technicalPoints } from "../../src/domain/league-rules.mjs";
import { SIDES } from "../../src/domain/match/rules.mjs";

/** How a result came about (`result_type`): played, or decided without being played (stage 12). */
const RESULT_TYPES = ["played", "technical"];

async function assertResultOutsidePostMatch(pairingId, client = pool) {
  const row = (await client.query('SELECT pairing_id FROM match_post_games WHERE pairing_id=$1', [pairingId])).rows[0];
  if (row) throw httpError(409, 'POST_RESULT_LOCKED');
}

async function withGameResultLock(pairingId, operation) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM season_pairings WHERE id=$1 FOR UPDATE', [pairingId]);
    await assertResultOutsidePostMatch(pairingId, client);
    await operation(client);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK').catch(() => {}); throw error; }
  finally { client.release(); }
}

export async function proposeGameResult(pairingId, userId, body, isAdmin = false) {
  const game = (await loadUserGameRows(userId, pairingId, isAdmin))[0];
  if (!game) throw httpError(404, "GAME_NOT_FOUND");
  await assertResultOutsidePostMatch(pairingId);
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  else if (game.round_status !== "started") throw httpError(409, "GAME_NOT_STARTED");
  if (!game.home_user_id || !game.away_user_id) throw httpError(409, "BYE_NEEDS_NO_CONFIRMATION");
  if (storedGameResultComplete(game)) throw httpError(409, "RESULT_ALREADY_CONFIRMED");
  const values = [
    nullableInteger(body.homeTouchdowns, "Home touchdowns"),
    nullableInteger(body.awayTouchdowns, "Away touchdowns"),
    nullableInteger(body.homeCasualties, "Home casualties"),
    nullableInteger(body.awayCasualties, "Away casualties"),
  ];
  if (values.some((value) => value === null || value === undefined)) throw httpError(400, "RESULT_NEEDS_BOTH_TEAMS");
  await withGameResultLock(pairingId, client => client.query(
    `UPDATE season_pairings
     SET result_status = 'awaiting_confirmation', proposed_by_user_id = $2,
         proposed_home_touchdowns = $3, proposed_away_touchdowns = $4,
         proposed_home_casualties = $5, proposed_away_casualties = $6,
         proposed_at = now(), updated_at = now()
     WHERE id = $1`,
    [pairingId, userId, ...values],
  ));
}

/**
 * Accept or reject a proposed result.
 *
 * **A coach cannot accept their own proposal.** The point of the two-step flow
 * is that a score is agreed by both sides; without this check it was agreed by
 * whoever clicked twice, and the league table counted it. An administrator
 * still can, because that is what an administrator is for when a coach has
 * gone quiet. Step 14.1.
 *
 * Accepting writes the result and the confirmation **in one transaction**. It
 * used to be two statements: a failure between them left a pairing carrying a
 * score with a status that said nobody had agreed to it. Step 14.2.
 */
export async function respondToGameProposal(pairingId, userId, accept, isAdmin = false) {
  const game = (await loadUserGameRows(userId, pairingId, isAdmin))[0];
  if (!game) throw httpError(404, "GAME_NOT_FOUND");
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  if (game.result_status !== "awaiting_confirmation") throw httpError(409, "NO_RESULT_AWAITING_CONFIRMATION");
  if (accept && !isAdmin && game.proposed_by_user_id === userId) {
    throw httpError(409, "PROPOSER_CANNOT_CONFIRM");
  }
  if (!accept) {
    await withGameResultLock(pairingId, client => client.query(`UPDATE season_pairings SET result_status = 'rejected', updated_at = now() WHERE id = $1`, [pairingId]));
    return;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await updateSeasonPairing(game.season_id, pairingId, {
      homeTouchdowns: game.proposed_home_touchdowns,
      awayTouchdowns: game.proposed_away_touchdowns,
      homeCasualties: game.proposed_home_casualties,
      awayCasualties: game.proposed_away_casualties,
    }, isAdmin, userId, client);
    await client.query(
      `UPDATE season_pairings SET result_status = 'confirmed', confirmed_at = now(), updated_at = now() WHERE id = $1`,
      [pairingId],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

export function ensurePlayerCanSubmitGame(game) {
  if (game.match_kind === "friendly") return;
  if (game.round_status !== "started") throw httpError(409, "GAME_NOT_STARTED");
  if (Number(game.round_number ?? 0) !== Number(game.season_current_round ?? 0)) {
    throw httpError(409, "ROUND_CLOSED_FOR_PLAYERS");
  }
}

/**
 * The admin's result, or a coach's agreed one (`respondToGameProposal`), written to a pairing, and an admin's
 * change of its teams.
 *
 * The body's `mode` is "played" (the default, as 2.x sends it: the score, each value left out kept as the
 * pairing has it) or "technical" (stage 12: `winner` and `technicalReason`, `nextResult`). The result's type
 * and reason are written with the score: a played result takes a technical one's reason away.
 *
 * @param {import("pg").PoolClient} [client] run inside a caller's transaction;
 *   defaults to the pool, which is a transaction of one statement at a time.
 * @throws 400 FIELD_INVALID {field: "mode"|"winner"|"technicalReason"} for a technical result without both
 *   sides, a winner or one of TECHNICAL_REASONS; what the score's checks refuse
 */
export async function updateSeasonPairing(seasonId, pairingId, body, isAdmin = false, userId = "", client = pool) {
  const current = await client.query(
    `SELECT c.* FROM match_pairing_context c JOIN season_pairings p ON p.id=c.id
     WHERE c.id=$1 AND c.season_id IS NOT DISTINCT FROM $2::uuid FOR UPDATE OF p`,
    [pairingId, seasonId],
  );
  const pairing = current.rows[0];
  if (!pairing) throw httpError(404, "PAIRING_NOT_FOUND");
  await assertResultOutsidePostMatch(pairingId, client);

  const wantsTeamUpdate = Object.hasOwn(body, "homeEntryId") || Object.hasOwn(body, "awayEntryId");
  const friendly = pairing.match_kind === "friendly";
  if (friendly && wantsTeamUpdate) throw httpError(409, "FRIENDLY_TEAMS_FIXED");
  if (wantsTeamUpdate && !isAdmin) throw httpError(403, "ADMIN_REQUIRED");
  if (!isAdmin) ensurePlayerCanSubmitGame(pairing);
  if (!isAdmin && !friendly && (!pairing.home_entry_id || !pairing.away_entry_id)) {
    throw httpError(400, "FIXTURE_NOT_PLAYER_SUBMITTABLE");
  }

  let homeEntryId = pairing.home_entry_id;
  let awayEntryId = pairing.away_entry_id;
  if (wantsTeamUpdate) {
    homeEntryId = await validateSeasonEntry(seasonId, body.homeEntryId, { includeWithdrawn: body.homeEntryId === pairing.home_entry_id });
    awayEntryId = await validateSeasonEntry(seasonId, body.awayEntryId, { includeWithdrawn: body.awayEntryId === pairing.away_entry_id });
    if (homeEntryId && awayEntryId && homeEntryId === awayEntryId) {
      throw httpError(400, "TEAM_PLAYS_ITSELF");
    }
  }

  if (!isAdmin && ![pairing.home_user_id,pairing.away_user_id].includes(userId)) throw httpError(403, "FIXTURE_NOT_YOURS");

  const score = nextResult(pairing, body, friendly, { hasHome: friendly || Boolean(homeEntryId), hasAway: friendly || Boolean(awayEntryId) });
  const resultComplete = [
    score.homeTouchdowns,
    score.awayTouchdowns,
    score.homeCasualties,
    score.awayCasualties,
  ].every((value) => value !== null && value !== undefined);
  const resultStatus = resultComplete ? "confirmed" : "pending";

  const result = await client.query(
    `UPDATE season_pairings
     SET home_entry_id = $2, away_entry_id = $3,
         home_touchdowns = $4, away_touchdowns = $5, home_casualties = $6, away_casualties = $7,
         result_type = $11, technical_reason = $12,
         home_points = $8, away_points = $9,
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
      score.resultType,
      score.technicalReason,
    ],
  );
  return result.rows[0];
}

/**
 * The result a write leaves on the pairing (`scoreLeagueResult`): a played one from the body's score, a value
 * left out kept as the pairing has it; a technical one from its winner and reason, only where both sides play.
 *
 * @param {object} pairing the pairing's row as `match_pairing_context` gives it
 * @param {object} body the request's
 * @param {boolean} friendly a friendly gives no points
 * @param {{hasHome: boolean, hasAway: boolean}} sides who plays, the teams the write leaves
 */
function nextResult(pairing, body, friendly, sides) {
  const kind = friendly ? "friendly" : "league";
  // A change of the teams alone (no mode, no score) keeps a technical result technical: its winner (the side
  // with more touchdowns) and its reason, scored with the sides the write leaves — not a played 2–0 without a reason.
  const scoreSent = ["homeTouchdowns", "awayTouchdowns", "homeCasualties", "awayCasualties"].some((field) => Object.hasOwn(body, field));
  if (body.mode === undefined && !scoreSent && pairing.result_type === "technical") {
    if (!sides.hasHome || !sides.hasAway) throw httpError(400, "FIELD_INVALID", { field: "mode" });
    const winner = Number(pairing.away_touchdowns) > Number(pairing.home_touchdowns) ? "away" : "home";
    return scoreLeagueResult({ ...sides, kind, resultType: "technical", winner, technicalReason: pairing.technical_reason ?? "other" });
  }
  const mode = body.mode ?? "played";
  if (!RESULT_TYPES.includes(mode)) throw httpError(400, "FIELD_INVALID", { field: "mode" });
  if (mode === "technical") {
    if (!sides.hasHome || !sides.hasAway) throw httpError(400, "FIELD_INVALID", { field: "mode" });
    if (!SIDES.includes(body.winner)) throw httpError(400, "FIELD_INVALID", { field: "winner" });
    if (!TECHNICAL_REASONS.includes(body.technicalReason)) throw httpError(400, "FIELD_INVALID", { field: "technicalReason" });
    return scoreLeagueResult({ ...sides, kind, resultType: "technical", winner: body.winner, technicalReason: body.technicalReason });
  }
  const value = (field, column, label) => {
    const sent = nullableInteger(body[field], label);
    return sent === undefined ? pairing[column] : sent;
  };
  return scoreLeagueResult({
    homeTouchdowns: value("homeTouchdowns", "home_touchdowns", "Home touchdowns"),
    awayTouchdowns: value("awayTouchdowns", "away_touchdowns", "Away touchdowns"),
    homeCasualties: value("homeCasualties", "home_casualties", "Home casualties"),
    awayCasualties: value("awayCasualties", "away_casualties", "Away casualties"),
    ...sides,
    kind,
  });
}

/**
 * The reason of a confirmed technical result, changed by the admin (stage 12): the reason and the points it
 * gives (`technicalPoints`; the winner is the side with more touchdowns), and nothing else — the score, the
 * status, its confirmation stay as they are, so a result the post-match wrote is changed too. A finished
 * post-match keeps everything it settled (the score, the SPP, the money) but its result's reason, which is set
 * to the new one: its page counts its points from it, and would show the old ones beside the table's new. While
 * its post-match is open the reason is not changed: the finish writes the reason the post-match holds over it.
 *
 * @param {string} seasonId the active season's
 * @param {string} pairingId a league pairing of that season
 * @param {unknown} reason the body's `technicalReason`
 * @returns {Promise<void>}
 * @throws 400 FIELD_INVALID {field: "technicalReason"}; 404 PAIRING_NOT_FOUND; 409 RESULT_NOT_TECHNICAL for a
 *   result that is not a confirmed technical one; 409 POST_RESULT_LOCKED while its post-match is open
 */
export async function setTechnicalReason(seasonId, pairingId, reason) {
  if (!TECHNICAL_REASONS.includes(reason)) throw httpError(400, "FIELD_INVALID", { field: "technicalReason" });
  await withTransaction(async (client) => {
    const pairing = (await client.query(
      `SELECT p.* FROM season_pairings p JOIN season_rounds r ON r.id = p.round_id
       WHERE p.id = $1 AND r.season_id = $2 FOR UPDATE OF p`,
      [pairingId, seasonId],
    )).rows[0];
    if (!pairing) throw httpError(404, "PAIRING_NOT_FOUND");
    if (pairing.result_status !== "confirmed" || pairing.result_type !== "technical") throw httpError(409, "RESULT_NOT_TECHNICAL");
    const post = (await client.query("SELECT state->>'status' AS status FROM match_post_games WHERE pairing_id = $1", [pairingId])).rows[0];
    if (post && post.status !== "completed") throw httpError(409, "POST_RESULT_LOCKED");
    const homeWon = Number(pairing.home_touchdowns) > Number(pairing.away_touchdowns);
    await client.query(
      "UPDATE season_pairings SET technical_reason = $2, home_points = $3, away_points = $4, updated_at = now() WHERE id = $1",
      [pairingId, reason, technicalPoints({ won: homeWon, reason }), technicalPoints({ won: !homeWon, reason })],
    );
    await client.query(
      `UPDATE match_post_games SET state = jsonb_set(state, '{result,reason}', to_jsonb($2::text)), updated_at = now()
       WHERE pairing_id = $1 AND state->>'status' = 'completed' AND jsonb_typeof(state->'result') = 'object'`,
      [pairingId, reason],
    );
  });
}
