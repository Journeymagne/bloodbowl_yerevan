/**
 * Writing the treasury ledger (migration 010).
 *
 * The one place that inserts `team_ledger` rows. Call it inside the transaction
 * that changes the treasury, so a line exists exactly when the change does.
 *
 * `created_at` is `clock_timestamp()`, not `now()`: `now()` is the same for the
 * whole transaction, and the several lines of one save would lose their order.
 * `pg` returns the `numeric` amounts as strings; whoever reads the history
 * (stage 03) turns them into numbers.
 */
import { ledgerRows } from "../../src/domain/roster/ledger.mjs";

const INSERT_LINE = `
  INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind, reason, note, pairing_id, actor_user_id, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`;

/**
 * One row per entry, each with the treasury after it, counted from `opening`
 * (the treasury before the first entry). Returns how many rows were written.
 *
 * @param {{ query: Function }} client a pg client inside the treasury's transaction
 * @param {{ teamId: string, opening: number, entries: object[], pairingId?: string|null, actorId?: string|null }} lines
 * @returns {Promise<number>}
 */
export async function writeLedgerEntries(client, { teamId, opening, entries, pairingId = null, actorId = null }) {
  const rows = ledgerRows(opening, entries);
  for (const { kind, delta, balanceAfter, reason, note } of rows) {
    await client.query(INSERT_LINE, [teamId, delta, balanceAfter, kind, reason ?? null, note ?? null, pairingId, actorId]);
  }
  return rows.length;
}
