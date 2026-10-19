/**
 * What the team page decides about money and resources, as plain functions:
 * which counter is open and why not, what a step does to the roster, which
 * phase and which match lock the page shows, how an amount typed reads. No DOM,
 * no dictionary, no state: the page puts the words on.
 *
 * The rules themselves are not written here. The stage's lock on re-rolls is
 * domain/roster/stage.mjs's, what a step costs and gives back is the 2.x
 * editor's own bookkeeping (domain/roster/costs.mjs), the prices and maxima are
 * league-rules.mjs's, and which medics and bribes a race may have is
 * team-rules.mjs's; this file asks them in the order the page needs.
 */
import { applyPaidStaffChange } from "../../../domain/roster/costs.mjs";
import { MANUAL_REASONS, MAX_ENTRY, MAX_NOTE } from "../../../domain/roster/ledger.mjs";
import { canBuy } from "../../../domain/roster/stage.mjs";
import { normalizeDraft, normalizePurchasedStaff } from "../../../domain/roster/schema.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "../../../domain/roster/team-rules.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { builderStaffCosts, builderStaffMaximums, combinedRerollsMaximum } from "../../../domain/league-rules.mjs";
import { sumMoney } from "../../../domain/money.mjs";
import { isGameClosedForPlayers } from "../../../data/games.mjs";
import { gameSides } from "../../../data/team-record.mjs";
import { currentMatch } from "../../../shell/current-match.mjs";

/** The plain counters the page edits, in the order it draws them; the race's medics follow. */
export const COUNTER_KEYS = Object.freeze(["startingRerolls", "teamRerolls", "dedicatedFans", "assistantCoaches", "cheerleaders", "bribes"]);

// What the server takes of a hand-written entry (domain/roster/ledger.mjs), where the sheet reads it from.
export { MAX_ENTRY, MAX_NOTE };

/**
 * Why a resource is closed, or null when it is open. The first reason that
 * applies wins, and the order is what the page says:
 *  - `unavailable`: Bribes of a race without Bribery and Corruption. It never
 *    opens, so it is said before a match that would end ("after the post-match"
 *    would promise Humans a bribe). The race is asked first: `hasBribery(null)`
 *    throws, and `staffAvailable` (build.mjs) does not know `teamRerolls`.
 *  - `live`: a match is on.
 *  - `stage`: the rule of the stage (`canBuy`), Starting rerolls only in a
 *    build and Team rerolls only once the team is active. The rule refuses
 *    growth alone (`stageViolations`, which the server applies), so a purchase
 *    on record can still be taken back: `canStepDown` lets «−» through a
 *    `stage` lock when `refund > 0`, and only then — a re-roll that was never
 *    bought is not dropped, because the coach could not buy it again.
 *    The other locks close the row whole.
 *  - `fans`: Dedicated Fans change after matches, not by the coach's hand.
 *    A saved team's fans move no money (`applyPaidStaffChange` skips them) and
 *    no stage rule covers them; the build sells them at 10k in the builder
 *    (decision 4 of the stage plan, and question 1 to the league owner).
 */
function lockOf(key, { race, stage, locked }) {
  if (key === "bribes" && (!race || !hasBribery(race))) return "unavailable";
  if (locked) return "live";
  if (!canBuy(stage, key)) return "stage";
  return key === "dedicatedFans" ? "fans" : null;
}

/**
 * How many of a counter the team may hold. Starting and Team rerolls share
 * `combinedRerollsMaximum`, so each has what the other leaves, never below 0;
 * every other counter has its own maximum.
 */
function maxOf(key, draft) {
  const other = { startingRerolls: "teamRerolls", teamRerolls: "startingRerolls" }[key];
  if (!other) return builderStaffMaximums[key];
  return Math.max(0, Math.min(builderStaffMaximums[key], combinedRerollsMaximum - draft[other]));
}

/** Why «+» would be refused on an open row: the maximum, or a treasury short of the price; null when it works. */
function incRefusalOf(value, max, price, treasury) {
  if (value >= max) return "max";
  return price > treasury ? "short" : null;
}

/**
 * The resources of a team as the page draws them: the plain counters, then the
 * medics its race may hire. A team with no race read yet gets the counters
 * alone, with Bribes closed.
 *
 * `value` is read the way the 2.x editor reads a stored roster (`normalizeDraft`,
 * so a count kept under the first builder's name still shows). `refund` is what
 * «−» pays back: the price, only while the roster records a purchase of it
 * (`normalizePurchasedStaff`; a Team Reroll of a team saved before purchases
 * were recorded counts as bought), otherwise 0. `max` is the counter's own
 * maximum, except that the two re-roll counters share 8 between them (`maxOf`).
 * A closed row's «−» is `canStepDown`'s to say, not `decDisabled`'s alone.
 *
 * @param {{race: object|null, roster: object, stage: string|undefined, locked?: boolean}} input
 *   `race` is the reference's entry for the team's race; `locked` is a match on
 * @returns {Array<{key: string, kind: "counter"|"medic", value: number, max: number, price: number,
 *   lock: "unavailable"|"live"|"stage"|"fans"|null, incRefusal: "max"|"short"|null, decDisabled: boolean, refund: number}>}
 */
export function resourceRows({ race, roster, stage, locked = false }) {
  const draft = normalizeDraft(roster);
  const purchased = normalizePurchasedStaff(roster);
  const medics = race ? availableMedicalStaffDefinitions(race).map(({ key }) => ({ key, kind: "medic" })) : [];
  const keys = [...COUNTER_KEYS.map((key) => ({ key, kind: "counter" })), ...medics];
  return keys.map(({ key, kind }) => {
    const [value, max, price] = [draft[key], maxOf(key, draft), builderStaffCosts[key]];
    const lock = lockOf(key, { race, stage, locked });
    return {
      key, kind, value, max, price, lock,
      incRefusal: lock === null ? incRefusalOf(value, max, price, draft.treasury) : null,
      decDisabled: value <= 0,
      refund: purchased[key] > 0 ? price : 0,
    };
  });
}

/**
 * Whether «−» works on a row: not at zero, and not on a closed row, except one
 * the stage closed, which still lets a purchase on record be taken back
 * (`refund > 0`; see `lockOf`). The page draws «−» from this, and `stepResource`
 * decides by it, so the button and the step never disagree.
 *
 * @param {{lock: string|null, decDisabled: boolean, refund: number}} row a row of `resourceRows`
 * @returns {boolean}
 */
export function canStepDown(row) {
  if (row.decDisabled) return false;
  return row.lock === null || (row.lock === "stage" && row.refund > 0);
}

/**
 * One step of a counter, as the 2.x editor takes it: «+» spends the price and
 * records the purchase, «−» pays back what was bought and leaves the rest. The
 * answer is the new roster (`normalizeDraft` of a copy; the one given is not
 * touched) or, when the row says no, `{refused: row}` for the page to explain.
 * A step is one: the row's refusals judge a single count.
 *
 * @param {{race: object|null, roster: object, stage: string|undefined, key: string, delta: 1|-1, locked?: boolean}} input
 * @returns {{roster: object}|{refused: object}}
 * @throws a `key` the page does not draw for this team: that is the caller's mistake, not a refusal
 */
export function stepResource({ race, roster, stage, key, delta, locked = false }) {
  const row = resourceRows({ race, roster, stage, locked }).find((candidate) => candidate.key === key);
  if (!row) throw new Error(`stepResource: no resource "${key}" on this team`);
  const closed = delta < 0 ? !canStepDown(row) : Boolean(row.lock || (delta > 0 && row.incRefusal));
  if (closed) return { refused: row };
  const draft = normalizeDraft(structuredClone(roster));
  draft[key] = row.value + delta;
  applyPaidStaffChange(draft, key, row.value, row.value + delta);
  return { roster: draft };
}

/**
 * Whether a game of the team is being got ready: `preparing` (the sides have not
 * both confirmed their preparation) or `ready` (both have), the post-match not
 * done, and the round still the players'.
 */
function isPreparing(game) {
  return (game.preparationStatus === "preparing" || game.preparationStatus === "ready")
    && game.postMatchStatus !== "completed"
    && !isGameClosedForPlayers(game);
}

/**
 * What a match does to the page. A match on closes the resources and the money;
 * a match being prepared only warns, since buying then resets the roster-bound
 * steps but is not forbidden. A match on is the SideNav card's own pick
 * (`currentMatch`: the card's phases put a match in play first, a league match
 * before a friendly, then the freshest), so with two on, the page and the card
 * name the same game. A preparation counts only in a round the players can
 * still play (`isGameClosedForPlayers`, as the card judges it), so the team
 * page and the roster never disagree. A match on wins over a preparation.
 *
 * @param {object[]} games the coach's games (`state.games.items`)
 * @param {string|null} teamId
 * @returns {{kind: "live"|"preparing", game: object}|null}
 */
export function matchLock(games, teamId) {
  const own = games ?? [];
  const current = currentMatch(own, teamId);
  if (current?.phase === "live") return { kind: "live", game: current.game };
  const game = own.find((candidate) => gameSides(candidate, teamId) && isPreparing(candidate));
  return game ? { kind: "preparing", game } : null;
}

/**
 * Where the team is in its life, as the page head says it (plan decision 7):
 * a `draft` is a build, an `active` team in the table of the active season is
 * in the season (with the season's round), any other `active` team is out of it.
 * A season whose first round has not begun has no round: `round` is null, and
 * the page says «season on» without a number.
 *
 * @param {{stage?: string, inActiveSeason?: boolean}} team the saved team
 * @param {{season?: {currentRound?: number|null}|null}|null} seasonData what `loadSeason` holds
 * @returns {{key: "draft"|"season"|"out", round: number|null}}
 */
export function phaseOf(team, seasonData) {
  if (team?.stage === "draft") return { key: "draft", round: null };
  if (team?.stage !== "active" || team.inActiveSeason !== true) return { key: "out", round: null };
  const round = Number(seasonData?.season?.currentRound);
  return { key: "season", round: round > 0 ? round : null };
}

const AMOUNT = /^\s*\d+(?:[.,]\d)?\s*$/;

/**
 * An amount typed in thousands: whole or with one decimal, a tenth of a thousand
 * (100 gold, as the page writes money: `formatMoney` rounds to tenths), a comma
 * read as a dot. Zero is 0; a sign, a second decimal, an exponent, letters or
 * nothing at all is null (controller ruling K14).
 *
 * @param {string} text
 * @returns {number|null}
 */
export function readAmount(text) {
  const source = String(text ?? "");
  return AMOUNT.test(source) ? Number(source.trim().replace(",", ".")) : null;
}

/**
 * What the sheet's button waits for. The checks go in this order and the first
 * that fails is the `problem`: no amount (unreadable, or 0), too much, no
 * reason (or one the server does not know), a note too long, a debit the
 * treasury cannot cover. `delta` is the signed amount (null while there is
 * none, and when it is too large to enter: it is not added up then), `after`
 * the treasury once it is made (summed in gold, so 70 + 0.3 is 70.3), `short`
 * how much it lacks.
 *
 * @param {{treasury: number, sign: 1|-1, amountText: string, reason: string, note: string}} input
 * @returns {{delta: number|null, after: number, short: number,
 *   problem: null|"amount"|"tooMuch"|"reason"|"note"|"short"}}
 */
export function moneyCheck({ treasury, sign, amountText, reason, note }) {
  const amount = readAmount(amountText);
  const enterable = amount !== null && amount <= MAX_ENTRY;
  const delta = enterable ? sign * amount || 0 : null;
  const after = sumMoney(countToNumber(treasury), delta ?? 0);
  const problem = [
    [!amount, "amount"],
    [!enterable, "tooMuch"],
    [!MANUAL_REASONS.includes(reason), "reason"],
    [String(note ?? "").trim().length > MAX_NOTE, "note"],
    [after < 0, "short"],
  ].find(([failed]) => failed)?.[1] ?? null;
  return { delta, after, short: Math.max(0, -after), problem };
}

/**
 * The newest deposit to the Coach's Safe in a team's history: the newest `safe`
 * line, whose `delta` is minus what went in.
 *
 * @param {Array<{kind: string, delta: number, createdAt: string}>} entries newest first
 * @returns {{amount: number, createdAt: string}|null}
 */
export function lastSafeDeposit(entries) {
  const line = entries.find((entry) => entry.kind === "safe");
  return line ? { amount: -line.delta, createdAt: line.createdAt } : null;
}
