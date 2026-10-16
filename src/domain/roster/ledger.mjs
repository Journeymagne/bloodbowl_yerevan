/**
 * The treasury ledger: what moved a team's money, line by line.
 *
 * The treasury itself stays in the roster blob; the ledger only explains it
 * (design spec section 3.2). Every line is thousands with a sign, summed
 * through `sumMoney` so a half-price sale's individual gold stays exact, and
 * a line that moved nothing is never produced.
 *
 * `classifyTreasuryChange` reads an edit as a diff — a new player bought in
 * the editor is a hire, a vanished one is a cancelled purchase or a sale, a
 * change in purchased staff is staff bought or refunded — and whatever the
 * diff does not explain is left as one remainder line. `postMatchLedgerEntries`
 * does the same for a post-match settlement, whose accounting already lists
 * the operations it applied.
 *
 * Pure: no database, no clock. The callers (the server's PATCH, match start
 * and post-match) write the lines to `team_ledger`.
 */
import { builderStaffCosts } from "../league-rules.mjs";
import { sumMoney } from "../money.mjs";
import { normalizeDraftPlayers } from "./players.mjs";
import { PURCHASED_STAFF_FIELDS, normalizePurchasedStaff } from "./schema.mjs";
import { playerPurchaseRefund, playerSaleValue } from "./transfers.mjs";
import { countToNumber } from "./values.mjs";

/** In the order of the `team_ledger.kind` CHECK. */
export const LEDGER_KINDS = Object.freeze([
  "manual",
  "hire",
  "sale",
  "cancel_purchase",
  "staff",
  "staff_refund",
  "match_spend",
  "match_income",
  "safe",
  "mistake",
  "admin",
]);

/** A post-match operation's own line; a staff operation's depends on its sign. */
const POST_MATCH_OPERATION_KINDS = Object.freeze({ hire: "hire", keep: "hire", raise: "hire", sell: "sale" });

/**
 * The ledger lines that explain a treasury edit, operations first and the
 * remainder last: hires in the order of the roster after the edit,
 * cancellations and sales in the order of the roster before it, staff in the
 * order of PURCHASED_STAFF_FIELDS.
 *
 * `team` is the race catalogue the players are priced against. Without one —
 * the race changed, so the players mean nothing against it — nothing is
 * classified and the whole difference is one remainder line.
 */
export function classifyTreasuryChange(team, before, after, { admin = false } = {}) {
  const entries = team ? [...playerEntries(team, before, after), ...staffEntries(before, after)] : [];
  const change = sumMoney(countToNumber(after.treasury), -countToNumber(before.treasury));
  const residual = sumMoney(change, ...entries.map((entry) => -entry.delta));
  if (residual) entries.push({ kind: admin ? "admin" : "manual", delta: residual });
  return entries;
}

function playerEntries(team, before, after) {
  const was = normalizeDraftPlayers(team, before), now = normalizeDraftPlayers(team, after);
  const had = new Set(was.map((player) => player.id)), kept = new Set(now.map((player) => player.id));
  const hires = now.filter((player) => !had.has(player.id) && playerPurchaseRefund(player) !== null)
    .map((player) => ({ kind: "hire", delta: -playerPurchaseRefund(player) }));
  const removals = was.filter((player) => !kept.has(player.id)).map((player) => {
    const refund = playerPurchaseRefund(player);
    return refund !== null ? { kind: "cancel_purchase", delta: refund } : { kind: "sale", delta: playerSaleValue(team, player) };
  });
  return [...hires, ...removals].filter((entry) => entry.delta);
}

/** More purchased staff than before was bought at the list price, fewer was refunded at it. */
function staffEntries(before, after) {
  const was = normalizePurchasedStaff(before), now = normalizePurchasedStaff(after);
  return PURCHASED_STAFF_FIELDS
    .map((key) => ({ count: now[key] - was[key], cost: builderStaffCosts[key] ?? 0 }))
    .filter(({ count, cost }) => count && cost)
    .map(({ count, cost }) => ({ kind: count > 0 ? "staff" : "staff_refund", delta: -count * cost }));
}

/**
 * The ledger lines of a post-match settlement (`projectPostRoster().accounting`):
 * the match income, each roster operation at the amount it moved, the coaches'
 * safe deposit, then the loss to a mistake.
 */
export function postMatchLedgerEntries({ winnings, transactions, deposit, loss }) {
  return [
    { kind: "match_income", delta: countToNumber(winnings) },
    ...transactions.map(({ type, amount }) => ({ kind: operationKind(type, amount), delta: countToNumber(amount) })),
    { kind: "safe", delta: -countToNumber(deposit) },
    { kind: "mistake", delta: -countToNumber(loss) },
  ].filter((entry) => entry.delta);
}

function operationKind(type, amount) {
  if (type === "staff") return amount < 0 ? "staff" : "staff_refund";
  const kind = POST_MATCH_OPERATION_KINDS[type];
  if (!kind) throw new Error(`No ledger line for the post-match operation "${type}"`);
  return kind;
}

/** The entries with the treasury after each one, from the balance before the first. */
export function ledgerRows(opening, entries) {
  let balance = countToNumber(opening);
  return entries.map((entry) => {
    balance = sumMoney(balance, entry.delta);
    return { ...entry, balanceAfter: balance };
  });
}
