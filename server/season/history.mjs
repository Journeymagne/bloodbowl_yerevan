/** Historical participants and results survive edits to the future schedule. */
import { withTransaction } from "../db/transaction.mjs";
import { httpError } from "../http/responses.mjs";

/** Call with the pairing locked: a result or match record must never move to another team or be cascaded away. */
export async function assertNoPairingHistory(pairing, client) {
  const recorded = pairing.round_status === "completed"
    || ["confirmed", "awaiting_confirmation"].includes(pairing.result_status)
    || (pairing.preparation_status ?? "not_started") !== "not_started"
    || ["home_touchdowns", "away_touchdowns", "home_casualties", "away_casualties", "proposed_at", "confirmed_at"]
      .some((key) => pairing[key] != null)
    || (pairing.round_status !== "draft" && (pairing.home_points != null || pairing.away_points != null));
  if (recorded) throw httpError(409, "MATCH_HISTORY_PROTECTED");
  const { rows } = await client.query(
    `SELECT EXISTS (SELECT 1 FROM match_preparations WHERE pairing_id = $1)
       OR EXISTS (SELECT 1 FROM match_roster_snapshots WHERE pairing_id = $1)
       OR EXISTS (SELECT 1 FROM match_treasury_spends WHERE pairing_id = $1)
       OR EXISTS (SELECT 1 FROM match_post_games WHERE pairing_id = $1)
       OR EXISTS (SELECT 1 FROM match_post_applications WHERE pairing_id = $1)
       OR EXISTS (SELECT 1 FROM match_events WHERE pairing_id = $1) AS recorded`, [pairing.id],
  );
  if (rows[0].recorded) throw httpError(409, "MATCH_HISTORY_PROTECTED");
}

/** Removing a scheduling mistake is allowed only while the pairing has no history. */
export function deleteSeasonPairing(seasonId, pairingId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      `SELECT p.*, r.status AS round_status FROM season_pairings p
       JOIN season_rounds r ON r.id = p.round_id
       WHERE p.id = $1 AND r.season_id = $2 FOR UPDATE OF p`, [pairingId, seasonId],
    );
    if (!rows[0]) throw httpError(404, "PAIRING_NOT_FOUND");
    await assertNoPairingHistory(rows[0], client);
    await client.query("DELETE FROM season_pairings WHERE id = $1", [pairingId]);
  });
}

/** A whole round can be discarded only as a draft, before any pair has acquired history. */
export function deleteSeasonRound(seasonId, roundId) {
  return withTransaction(async (client) => {
    const { rows } = await client.query(
      "SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2 FOR UPDATE", [roundId, seasonId],
    );
    if (!rows[0]) throw httpError(404, "ROUND_NOT_FOUND");
    if (rows[0].status !== "draft") throw httpError(409, "ROUND_IS_LOCKED");
    const pairs = await client.query("SELECT * FROM season_pairings WHERE round_id = $1 ORDER BY id FOR UPDATE", [roundId]);
    for (const pair of pairs.rows) await assertNoPairingHistory({ ...pair, round_status: "draft" }, client);
    await client.query("DELETE FROM season_rounds WHERE id = $1", [roundId]);
  });
}
