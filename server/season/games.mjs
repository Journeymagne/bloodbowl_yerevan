/**
 * Match results: proposing one, answering it, and an admin editing it.
 *
 * Lifted out of server.mjs by step 4.9.
 *
 * Task 14 is about this file. Today the coach who proposes a result can accept
 * it themselves, and confirming runs as two statements rather than one
 * transaction — so a failure between them leaves a pairing updated and its
 * status not. Moved here unchanged; 14.1 and 14.2 fix it.
 */
import { pool } from "../db/pool.mjs";
import { httpError } from "../http/responses.mjs";
import { storedGameResultComplete } from "../api/serializers.mjs";
import { nullableInteger, scoreLeagueResult } from "./scoring.mjs";
import { loadUserGameRows } from "./store.mjs";
import { validateSeasonEntry } from "./rounds.mjs";

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
 * @param {import("pg").PoolClient} [client] run inside a caller's transaction;
 *   defaults to the pool, which is a transaction of one statement at a time.
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
    homeEntryId = await validateSeasonEntry(seasonId, body.homeEntryId);
    awayEntryId = await validateSeasonEntry(seasonId, body.awayEntryId);
    if (homeEntryId && awayEntryId && homeEntryId === awayEntryId) {
      throw httpError(400, "TEAM_PLAYS_ITSELF");
    }
  }

  if (!isAdmin && ![pairing.home_user_id,pairing.away_user_id].includes(userId)) throw httpError(403, "FIXTURE_NOT_YOURS");

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
    hasHome: friendly || Boolean(homeEntryId),
    hasAway: friendly || Boolean(awayEntryId),
    kind: pairing.match_kind,
  });
  const resultComplete = [
    score.homeTouchdowns,
    score.awayTouchdowns,
    score.homeCasualties,
    score.awayCasualties,
  ].every((value) => value !== null && value !== undefined);
  const resultStatus = resultComplete ? "confirmed" : "pending";

  const result = await client.query(
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
