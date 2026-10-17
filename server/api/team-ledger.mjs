/**
 * The treasury ledger (migration 010): written, read and checked for a hand-written entry.
 *
 * Writing. `writeLedgerEntries` is the one place that inserts `team_ledger` rows. Call it inside
 * the transaction that changes the treasury, so a line exists exactly when the change does.
 *
 * `created_at` is `clock_timestamp()`, not `now()`: `now()` is the same for the
 * whole transaction, and the several lines of one save would lose their order.
 *
 * Reading. `readLedgerPage` pages the history newest first. `pg` returns the `numeric` amounts as
 * strings and the reader turns them into numbers: they are thousands to the gold, three decimals
 * at most, which a double holds exactly. The cursor is the row's own `created_at::text` and id:
 * a JS `Date` keeps milliseconds, two lines of one save share one, and paging by it would skip or
 * repeat them. The text keeps the microseconds, and the id settles a tie.
 */
import { isMoneyAmount, sumMoney } from "../../src/domain/money.mjs";
import { MANUAL_REASONS, ledgerRows } from "../../src/domain/roster/ledger.mjs";
import { httpError } from "../http/errors.mjs";
import { isUuid } from "./team-access.mjs";

const INSERT_LINE = `
  INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind, reason, note, pairing_id, actor_user_id, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8, clock_timestamp())`;

/**
 * One row per entry, each with the treasury after it, counted from `opening`
 * (the treasury before the first entry). Returns how many rows were written.
 * An entry that moves nothing, to the gold, is not a line and is skipped.
 *
 * @param {{ query: Function }} client a pg client inside the treasury's transaction
 * @param {{ teamId: string, opening: number, entries: object[], pairingId?: string|null, actorId?: string|null }} lines
 * @returns {Promise<number>}
 */
export async function writeLedgerEntries(client, { teamId, opening, entries, pairingId = null, actorId = null }) {
  const rows = ledgerRows(opening, entries.filter(({ delta }) => sumMoney(delta)));
  for (const { kind, delta, balanceAfter, reason, note } of rows) {
    await client.query(INSERT_LINE, [teamId, delta, balanceAfter, kind, reason ?? null, note ?? null, pairingId, actorId]);
  }
  return rows.length;
}

/** What `created_at::text` is in any session time zone: seconds, up to six decimals, an offset of hours that may carry minutes and seconds. */
const CURSOR_TIME = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(\.\d{1,6})?[+-]\d{2}(:\d{2}){0,2}$/;

/** The database refusing a time, or a zone offset, that is none: what a cursor made up by hand runs into. */
const NOT_A_TIME = new Set(["22007", "22008", "22009"]);

/** How many lines a page holds unless the caller asks for another number. */
export const LEDGER_PAGE_SIZE = 20;

const PAGE_SQL = `
  SELECT id, kind, delta::text, balance_after::text, reason, note, pairing_id, created_at, created_at::text AS at
    FROM team_ledger
   WHERE saved_team_id = $1 AND ($2::timestamptz IS NULL OR (created_at, id) < ($2::timestamptz, $3::uuid))
   ORDER BY created_at DESC, id DESC
   LIMIT $4 + 1`;

/**
 * The cursor for the page that follows the line `{ at, id }`. A client holds it as an opaque string
 * and hands it back as `before`.
 *
 * @param {{ at: string, id: string }} line `at` is the line's `created_at::text`
 * @returns {string}
 */
export function encodeLedgerCursor({ at, id }) {
  return Buffer.from(JSON.stringify([at, id])).toString("base64url");
}

/**
 * The `{ at, id }` a cursor holds, or null for anything that is not one this module could have made:
 * not text, not a pair, a time that does not look like Postgres's, an id that is no UUID.
 *
 * It judges the shape only. A time can look right and still be none (month 13); `readLedgerPage`
 * leaves that to the database.
 *
 * @param {unknown} text
 * @returns {{ at: string, id: string }|null}
 */
export function decodeLedgerCursor(text) {
  if (typeof text !== "string") return null;
  let parts;
  try { parts = JSON.parse(Buffer.from(text, "base64url").toString("utf8")); } catch { return null; }
  if (!Array.isArray(parts) || parts.length !== 2) return null;
  const [at, id] = parts;
  return typeof at === "string" && CURSOR_TIME.test(at) && isUuid(id) ? { at, id } : null;
}

/** A `team_ledger` row as a client reads it: amounts as numbers, and none of the columns that say who wrote it or for which team. */
function ledgerEntry(row) {
  return {
    id: row.id,
    kind: row.kind,
    delta: Number(row.delta),
    balanceAfter: Number(row.balance_after),
    reason: row.reason,
    note: row.note,
    pairingId: row.pairing_id,
    createdAt: row.created_at,
  };
}

/**
 * One page of a team's history, newest first, ties on the time broken by id.
 *
 * `limit` rows are returned, and one more is asked for to know whether a page follows: `next` is the
 * cursor of the last line returned, and null when there is nothing older. The caller has checked
 * that `teamId` is a UUID and that the team may be read (`teamForUser`).
 *
 * @param {{ query: Function }} db a pg pool, or the client of a transaction
 * @param {string} teamId
 * @param {{ before?: {at: string, id: string}|null, limit?: number }} [page] `before` is what
 *   `decodeLedgerCursor` returned; `limit` is a whole number of 1 or more
 * @returns {Promise<{ entries: object[], next: string|null }>}
 * @throws 400 FIELD_INVALID `before` when the cursor's time is none the database takes
 */
export async function readLedgerPage(db, teamId, { before = null, limit = LEDGER_PAGE_SIZE } = {}) {
  let rows;
  try {
    ({ rows } = await db.query(PAGE_SQL, [teamId, before?.at ?? null, before?.id ?? null, limit]));
  } catch (error) {
    throw NOT_A_TIME.has(error.code) ? httpError(400, "FIELD_INVALID", { field: "before" }) : error;
  }
  const page = rows.slice(0, limit);
  return {
    entries: page.map(ledgerEntry),
    next: rows.length > limit ? encodeLedgerCursor(page[page.length - 1]) : null,
  };
}

/**
 * When the history begins: the day migration 010 was applied. Nothing before it was recorded, and
 * nothing is guessed (the ledger is not backfilled).
 *
 * @param {{ query: Function }} db
 * @returns {Promise<Date|null>} null when the migration is not on record
 */
export async function ledgerSince(db) {
  const { rows } = await db.query("SELECT applied_at FROM schema_migrations WHERE name = '010_team_ledger.sql'");
  return rows[0]?.applied_at ?? null;
}

const MAX_MANUAL_AMOUNT = 100000;
const MAX_NOTE_LENGTH = 200;

/** A number of thousands, either sign, that moves at least a gold and not more than one entry may. */
function isManualAmount(delta) {
  return typeof delta === "number" && sumMoney(delta) !== 0 && isMoneyAmount(Math.abs(delta)) && Math.abs(delta) <= MAX_MANUAL_AMOUNT;
}

/**
 * The hand-written entry a request body asks for, checked: an amount to the gold that is not zero and
 * not more than 100000 either way, one of `MANUAL_REASONS`, and a note of at most 200 characters that
 * may be left out (an empty one is none) and holds no NUL (U+0000, which no text column of Postgres
 * holds: it would be a 500).
 *
 * @param {unknown} body whatever the request carried; it need not be an object
 * @returns {{ delta: number, reason: string, note: string|null }} `delta` as the money it is (`sumMoney`:
 *   0.1 + 0.2 is 0.3)
 * @throws 400 FIELD_INVALID naming the first of `delta`, `reason`, `note` that is wrong
 */
export function checkManualEntry(body) {
  const { delta, reason, note } = body ?? {};
  if (!isManualAmount(delta)) throw httpError(400, "FIELD_INVALID", { field: "delta" });
  if (!MANUAL_REASONS.includes(reason)) throw httpError(400, "FIELD_INVALID", { field: "reason" });
  const text = note ?? "";
  if (typeof text !== "string" || text.trim().length > MAX_NOTE_LENGTH || text.includes("\u0000")) throw httpError(400, "FIELD_INVALID", { field: "note" });
  return { delta: sumMoney(delta), reason, note: text.trim() || null };
}
