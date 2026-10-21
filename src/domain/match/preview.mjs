/**
 * What the board and the matches page say before the match: the preparation the server would build from the
 * saved rosters, and its own budget — so the sheet never disagrees with the inducements step. The preparation
 * itself is not read for it: reading it creates it (stage 09a, decision 10).
 *
 * Both tier bonuses are given (the owner's M2 answer: at equal CTVs the tier bonus stays, the league's
 * Inducement Tiering), so a screen can tell «CTVs equal, no inducements» from «CTVs equal, a tier bonus».
 * And a live match's records, counted the way the roster's match mode counts them. Pure.
 */
import { createPreparation } from "./preparation.mjs";
import { matchBudget, purchaseOrder } from "./budget.mjs";
import { calculateMatchCtv } from "./roster.mjs";
import { tierAllowance } from "./rules.mjs";
import { absenceOf, sitsOut } from "../roster/absence.mjs";

/** Who gets the petty cash: our side, the opponent's, or neither when the CTVs are equal. */
export const BEFORE_GETS = Object.freeze(["own", "other", "even"]);

/** The faults that mean «no preview»: a race the reference does not know, a treasury the rules cannot read. */
const NO_PREVIEW = new Set(["UNKNOWN_TEAM", "MATCH_BUDGET"]);

/**
 * @typedef {{user: {id: string, login: string}, team: {id: string, name: string, baseTeamSlug: string, revision: number, roster: object}}} PreviewSource
 * a side as `createMatchSide` takes it
 * @typedef {{id: string, number: string, name: string, position: string, retired: boolean, absence: object|null}} MissingPlayer
 * @typedef {{name: string, ctv: number, available: number, total: number, missing: MissingPlayer[]}} PreviewSide
 */

/** @returns {MissingPlayer} */
const missingOf = (player) => ({ id: String(player.id), number: String(player.number), name: player.name,
  position: player.row.position, retired: Boolean(player.temporarilyRetired), absence: absenceOf(player) });

/** @returns {PreviewSide} */
function sideOf(side) {
  const ctv = calculateMatchCtv(side);
  return { name: side.team.name, ctv: ctv.total, available: ctv.players, total: side.players.length,
    missing: side.players.filter(sitsOut).map(missingOf) };
}

/** The budget needs the whole reference (the catalogue is built from stars and pages): until it has come, none. */
const wholeReference = (data) => Boolean(data?.teams && data?.starPlayers && data?.pages);

/**
 * Before the match in numbers, for our side: both CTVs and lineups, who gets the petty cash and how much
 * (`petty` is ours — 0 when the opponent gets it), both tier bonuses, and what we may spend of the treasury
 * (`all` — we buy first; `top` — second, up to the league's limit; `none` — equal CTVs).
 *
 * @param {{own: PreviewSource, other: PreviewSource}} sources
 * @param {object} data the reference, read whole
 * The opponent's bonus is the tiers' (`tierAllowance`, as `matchBudget` counts it), not his budget: a treasury of his
 * that the rules cannot read (a 2.x value) does not blank our own numbers (the final review, m-6).
 *
 * @returns {{own: PreviewSide, other: PreviewSide, gets: "own"|"other"|"even", difference: number, petty: number,
 *   bonus: {own: number, other: number}, treasury: {rule: "all"|"top"|"none", amount: number}}|null}
 *   null when the reference has not come, a race is unknown, or our treasury cannot be read
 */
export function matchPreview({ own, other }, data) {
  if (!wholeReference(data)) return null;
  try {
    const preparation = createPreparation({ home: own, away: other }, data);
    const budget = matchBudget(preparation, "home", data);
    const ours = sideOf(preparation.home), opponent = sideOf(preparation.away);
    const first = purchaseOrder(preparation);
    return { own: ours, other: opponent,
      gets: ours.ctv === opponent.ctv ? "even" : ours.ctv < opponent.ctv ? "own" : "other",
      difference: Math.abs(opponent.ctv - ours.ctv), petty: budget.pettyCash,
      bonus: { own: budget.bonus, other: tierAllowance(preparation.away.reference, preparation.home.reference) },
      treasury: { rule: first === "home" ? "all" : first === "away" ? "top" : "none", amount: budget.treasuryLimit } };
  } catch (error) {
    if (NO_PREVIEW.has(error?.code)) return null;
    throw error;
  }
}

/**
 * A live match's records on the team's page: the rows of this match not settled yet. `count` is the rows (as
 * the roster's «records: K»), the sums are their deltas, with their signs.
 *
 * @param {object[]} events GET …/events
 * @param {string} pairingId
 * @returns {{count: number, touchdowns: number, casualties: number}}
 */
export function matchRecords(events, pairingId) {
  const rows = (events ?? []).filter((event) => event.pairingId === pairingId && !event.settledAt);
  const sum = (counter) => rows.reduce((total, event) => total + (event.counter === counter ? Number(event.delta) || 0 : 0), 0);
  return { count: rows.length, touchdowns: sum("touchdowns"), casualties: sum("casualties") };
}
