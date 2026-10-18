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
import { canBuy } from "../../../domain/roster/stage.mjs";
import { normalizeDraft, normalizePurchasedStaff } from "../../../domain/roster/schema.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "../../../domain/roster/team-rules.mjs";
import { countToNumber } from "../../../domain/roster/values.mjs";
import { builderStaffCosts, builderStaffMaximums } from "../../../domain/league-rules.mjs";
import { sumMoney } from "../../../domain/money.mjs";
import { isGameClosedForPlayers } from "../../../data/games.mjs";
import { gameSides } from "../../../data/team-record.mjs";
import { isMatchLive } from "../../../shell/current-match.mjs";

/** The plain counters the page edits, in the order it draws them; the race's medics follow. */
export const COUNTER_KEYS = Object.freeze(["startingRerolls", "teamRerolls", "dedicatedFans", "assistantCoaches", "cheerleaders", "bribes"]);

/** The largest entry the treasury takes at once, in thousands; `checkManualEntry` (server/api/team-ledger.mjs) refuses more. */
export const MAX_ENTRY = 100000;

/** The longest note an entry carries, in characters (trimmed), as the server counts it. */
export const MAX_NOTE = 200;

/**
 * Why a resource is closed, or null when it is open. The first reason that
 * applies wins, and the order is what the page says:
 *  - `unavailable`: Bribes of a race without Bribery and Corruption. It never
 *    opens, so it is said before a match that would end ("after the post-match"
 *    would promise Humans a bribe). The race is asked first: `hasBribery(null)`
 *    throws, and `staffAvailable` (build.mjs) does not know `teamRerolls`.
 *  - `live`: a match is on.
 *  - `stage`: the rule of the stage (`canBuy`), Starting rerolls only in a
 *    build and Team rerolls only once the team is active.
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
 * were recorded counts as bought), otherwise 0.
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
    const [value, max, price] = [draft[key], builderStaffMaximums[key], builderStaffCosts[key]];
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
  if (row.lock || (delta > 0 && row.incRefusal) || (delta < 0 && row.decDisabled)) return { refused: row };
  const draft = normalizeDraft(structuredClone(roster));
  draft[key] = row.value + delta;
  applyPaidStaffChange(draft, key, row.value, row.value + delta);
  return { roster: draft };
}

/** Whether a game of the team is being got ready: both sides still preparing or ready, and the round still the players'. */
function isPreparing(game) {
  return (game.preparationStatus === "preparing" || game.preparationStatus === "ready")
    && game.postMatchStatus !== "completed"
    && !isGameClosedForPlayers(game);
}

/**
 * What a match does to the page. A match on (`isMatchLive`, the SideNav card's
 * own question) closes the resources and the money; a match being prepared only
 * warns, since buying then resets the roster-bound steps but is not forbidden.
 * A preparation counts only in a round the players can still play
 * (`isGameClosedForPlayers`, as the SideNav card judges it), so the team page
 * and the roster never disagree. A match on wins over a preparation.
 *
 * @param {object[]} games the coach's games (`state.games.items`)
 * @param {string|null} teamId
 * @returns {{kind: "live"|"preparing", game: object}|null}
 */
export function matchLock(games, teamId) {
  let preparing = null;
  for (const game of games ?? []) {
    if (!gameSides(game, teamId)) continue;
    if (isMatchLive(game)) return { kind: "live", game };
    if (!preparing && isPreparing(game)) preparing = { kind: "preparing", game };
  }
  return preparing;
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
 * reason, a note too long, a debit the treasury cannot cover. `delta` is the
 * signed amount (null while there is none), `after` the treasury once it is
 * made (summed in gold, so 70 + 0.3 is 70.3), `short` how much it lacks.
 *
 * @param {{treasury: number, sign: 1|-1, amountText: string, reason: string, note: string}} input
 * @returns {{delta: number|null, after: number, short: number,
 *   problem: null|"amount"|"tooMuch"|"reason"|"note"|"short"}}
 */
export function moneyCheck({ treasury, sign, amountText, reason, note }) {
  const amount = readAmount(amountText);
  const delta = amount === null ? null : sign * amount || 0;
  const after = sumMoney(countToNumber(treasury), delta ?? 0);
  const problem = [
    [!amount, "amount"],
    [amount > MAX_ENTRY, "tooMuch"],
    [!reason, "reason"],
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
