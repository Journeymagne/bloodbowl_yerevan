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

export async function proposeGameResult(pairingId, userId, body, isAdmin = false) {
  const game = (await loadUserGameRows(userId, pairingId, isAdmin))[0];
  if (!game) throw httpError(404, "Game not found.");
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  else if (game.round_status !== "started") throw httpError(409, "This game has not started yet.");
  if (!game.home_user_id || !game.away_user_id) throw httpError(409, "A BYE game does not require confirmation.");
  if (storedGameResultComplete(game)) throw httpError(409, "This result is already confirmed.");
  const values = [
    nullableInteger(body.homeTouchdowns, "Home touchdowns"),
    nullableInteger(body.awayTouchdowns, "Away touchdowns"),
    nullableInteger(body.homeCasualties, "Home casualties"),
    nullableInteger(body.awayCasualties, "Away casualties"),
  ];
  if (values.some((value) => value === null || value === undefined)) throw httpError(400, "Enter touchdowns and casualties for both teams.");
  await pool.query(
    `UPDATE season_pairings
     SET result_status = 'awaiting_confirmation', proposed_by_user_id = $2,
         proposed_home_touchdowns = $3, proposed_away_touchdowns = $4,
         proposed_home_casualties = $5, proposed_away_casualties = $6,
         proposed_at = now(), updated_at = now()
     WHERE id = $1`,
    [pairingId, userId, ...values],
  );
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
  if (!game) throw httpError(404, "Game not found.");
  if (!isAdmin) ensurePlayerCanSubmitGame(game);
  if (game.result_status !== "awaiting_confirmation") throw httpError(409, "There is no result awaiting confirmation.");
  if (accept && !isAdmin && game.proposed_by_user_id === userId) {
    throw httpError(409, "You proposed this result; your opponent has to confirm it.");
  }
  if (!accept) {
    await pool.query(`UPDATE season_pairings SET result_status = 'rejected', updated_at = now() WHERE id = $1`, [pairingId]);
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
  if (game.round_status !== "started") throw httpError(409, "This game has not started yet.");
  if (Number(game.round_number ?? 0) !== Number(game.season_current_round ?? 0)) {
    throw httpError(409, "This round is closed for player result changes.");
  }
}

/**
 * @param {import("pg").PoolClient} [client] run inside a caller's transaction;
 *   defaults to the pool, which is a transaction of one statement at a time.
 */
export async function updateSeasonPairing(seasonId, pairingId, body, isAdmin = false, userId = "", client = pool) {
  const current = await client.query(
    `SELECT season_pairings.*, season_rounds.season_id, season_rounds.round_number, season_rounds.status AS round_status, seasons.current_round AS season_current_round
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     JOIN seasons ON seasons.id = season_rounds.season_id
     WHERE season_pairings.id = $1 AND season_rounds.season_id = $2`,
    [pairingId, seasonId],
  );
  const pairing = current.rows[0];
  if (!pairing) throw httpError(404, "Pairing not found.");

  const wantsTeamUpdate = Object.hasOwn(body, "homeEntryId") || Object.hasOwn(body, "awayEntryId");
  if (wantsTeamUpdate && !isAdmin) throw httpError(403, "Admin access required.");
  if (!isAdmin) ensurePlayerCanSubmitGame(pairing);
  if (!isAdmin && (!pairing.home_entry_id || !pairing.away_entry_id)) {
    throw httpError(400, "This fixture cannot receive a player-submitted result.");
  }

  let homeEntryId = pairing.home_entry_id;
  let awayEntryId = pairing.away_entry_id;
  if (wantsTeamUpdate) {
    homeEntryId = await validateSeasonEntry(seasonId, body.homeEntryId);
    awayEntryId = await validateSeasonEntry(seasonId, body.awayEntryId);
    if (homeEntryId && awayEntryId && homeEntryId === awayEntryId) {
      throw httpError(400, "A team cannot play itself.");
    }
  }

  if (!isAdmin) {
    const userEntry = await client.query(
      `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
      [seasonId, userId],
    );
    const entryId = userEntry.rows[0]?.id;
    if (!entryId || (entryId !== pairing.home_entry_id && entryId !== pairing.away_entry_id)) {
      throw httpError(403, "This fixture does not belong to your team.");
    }
  }

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
    hasHome: Boolean(homeEntryId),
    hasAway: Boolean(awayEntryId),
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
