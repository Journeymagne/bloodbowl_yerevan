/**
 * Making rounds, and pairing people up in them.
 *
 * Lifted out of server.mjs by step 4.9.
 *
 * `generateSwissRound` decides the round; who faces whom inside it is
 * season/pairing.mjs, which step 14.5 turned from a greedy pass into a search.
 * The greedy version could report a rematch as unavoidable when a clean
 * pairing existed.
 */
import { pool } from "../db/pool.mjs";
import { httpError } from "../http/responses.mjs";
import { pairRound, takeByeEntry } from "./pairing.mjs";
import { assertCurrentRoundComplete, assertNoDraftRound, computeSeasonStandings, previousOpponentMap, shuffleEntries } from "./scoring.mjs";
import { loadSeasonEntryRows, loadSeasonPairingRows, loadSeasonRoundRows } from "./store.mjs";

export async function generateSwissRound(seasonRow) {
  const entryRows = await loadSeasonEntryRows(seasonRow.id);
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  if (!entryRows.length) throw httpError(400, "NEED_A_COMMITTED_TEAM");
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);

  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const standings = computeSeasonStandings(entryRows, pairingRows);
  const entriesById = new Map(entryRows.map((entry) => [entry.id, entry]));
  const queue = nextRoundNumber === 1
    ? shuffleEntries(entryRows)
    : standings.map((standing) => entriesById.get(standing.entryId)).filter(Boolean);
  const { opponents, byes } = previousOpponentMap(entryRows, pairingRows);
  const pairingsToCreate = [];

  const { bye, rest } = takeByeEntry(queue, byes);
  if (bye) {
    pairingsToCreate.push({
      homeEntryId: bye.id,
      awayEntryId: null,
      homePoints: null,
      awayPoints: null,
    });
  }

  const { pairs, rematches, exhaustive } = pairRound(rest, opponents);
  if (rematches > 0) {
    // Nothing here can prevent it — late in a small league everybody has
    // played everybody. Saying so in the log is the difference between an
    // admin knowing before the round starts and a coach noticing after.
    console.warn(
      `[season] round ${nextRoundNumber}: ${rematches} pairing(s) repeat an earlier match`
      + (exhaustive ? "" : " (the search hit its budget, so a cleaner round may exist)"),
    );
  }
  const matchPairings = pairs.map(([home, away]) => ({
    homeEntryId: home.id,
    awayEntryId: away.id,
    homePoints: null,
    awayPoints: null,
  }));

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const roundResult = await client.query(
      `INSERT INTO season_rounds (season_id, round_number)
       VALUES ($1, $2)
       RETURNING *`,
      [seasonRow.id, nextRoundNumber],
    );
    const round = roundResult.rows[0];
    const orderedPairings = [...matchPairings, ...pairingsToCreate];
    for (let index = 0; index < orderedPairings.length; index += 1) {
      const pairing = orderedPairings[index];
      await client.query(
        `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id, home_points, away_points)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          round.id,
          index + 1,
          pairing.homeEntryId,
          pairing.awayEntryId,
          pairing.homePoints,
          pairing.awayPoints,
        ],
      );
    }
    await client.query(
      `UPDATE seasons SET current_round = $2, updated_at = now() WHERE id = $1`,
      [seasonRow.id, nextRoundNumber],
    );
    await client.query("COMMIT");
    return round;
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function validateSeasonEntry(seasonId, entryId) {
  if (!entryId) return null;
  const result = await pool.query(
    `SELECT id FROM season_entries WHERE id = $1 AND season_id = $2`,
    [entryId, seasonId],
  );
  if (!result.rows[0]) throw httpError(404, "ENTRY_NOT_FOUND");
  return result.rows[0].id;
}

export async function createManualRound(seasonRow) {
  const roundRows = await loadSeasonRoundRows(seasonRow.id);
  const pairingRows = await loadSeasonPairingRows(seasonRow.id);
  assertNoDraftRound(roundRows);
  assertCurrentRoundComplete(pairingRows);
  const nextRoundNumber = Math.max(0, ...roundRows.map((round) => Number(round.round_number))) + 1;
  const result = await pool.query(
    `INSERT INTO season_rounds (season_id, round_number, status)
     VALUES ($1, $2, 'draft')
     RETURNING *`,
    [seasonRow.id, nextRoundNumber],
  );
  return result.rows[0];
}

export async function addSeasonPairing(seasonId, roundId, homeEntryId = "", awayEntryId = "") {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "ROUND_NOT_FOUND");
  if (!["draft", "started"].includes(round.rows[0].status)) {
    throw httpError(409, "ROUND_IS_LOCKED");
  }

  const homeId = await validateSeasonEntry(seasonId, homeEntryId);
  const awayId = await validateSeasonEntry(seasonId, awayEntryId);
  if (homeId && awayId && homeId === awayId) throw httpError(400, "TEAM_PLAYS_ITSELF");

  const nextTable = await pool.query(
    `SELECT COALESCE(MAX(table_number), 0) + 1 AS table_number
     FROM season_pairings
     WHERE round_id = $1`,
    [roundId],
  );
  const result = await pool.query(
    `INSERT INTO season_pairings (round_id, table_number, home_entry_id, away_entry_id)
     VALUES ($1, $2, $3, $4)
     RETURNING *`,
    [roundId, nextTable.rows[0].table_number, homeId, awayId],
  );
  return result.rows[0];
}

export async function startSeasonRound(seasonId, roundId) {
  const round = await pool.query(
    `SELECT * FROM season_rounds WHERE id = $1 AND season_id = $2`,
    [roundId, seasonId],
  );
  if (!round.rows[0]) throw httpError(404, "ROUND_NOT_FOUND");
  if (round.rows[0].status === "started") return round.rows[0];

  const pairings = await pool.query(
    `SELECT * FROM season_pairings WHERE round_id = $1 ORDER BY table_number ASC`,
    [roundId],
  );
  if (!pairings.rows.some((pairing) => pairing.home_entry_id || pairing.away_entry_id)) {
    throw httpError(400, "NEED_A_PAIRING");
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `UPDATE season_rounds
       SET status = 'completed',
           updated_at = now()
       WHERE season_id = $1
         AND round_number < $2
         AND status = 'started'`,
      [seasonId, round.rows[0].round_number],
    );
    const updated = await client.query(
      `UPDATE season_rounds
       SET status = 'started',
           updated_at = now()
       WHERE id = $1 AND season_id = $2
       RETURNING *`,
      [roundId, seasonId],
    );
    await client.query(
      `UPDATE seasons
       SET current_round = GREATEST(current_round, $2),
           updated_at = now()
       WHERE id = $1`,
      [seasonId, round.rows[0].round_number],
    );
    await client.query("COMMIT");
    return updated.rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}
