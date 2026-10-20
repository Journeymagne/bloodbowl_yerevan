/**
 * «History» and «Coach's Safe» of the team page (TeamManage): what moved the treasury, line by line, and what the
 * safe holds. The lines are the ledger's (`data/treasury.mjs` keeps them, a page at a time); this file puts words
 * on a line, draws the list and wires its three buttons.
 *
 * The list is three lines until the coach asks for the whole of it («All history · N» is the count the server
 * gives, not the lines read so far); once unfolded, «More» reads the page after the lines the page holds. What is
 * unfolded is the team's, kept here and not in the markup, so the page redrawing itself (on every change of the
 * ledger, the team or the games) draws it unfolded again. A history that has not answered yet says so: a team that
 * has one is never shown as having none.
 */
import { escapeHtml, focusLost, listenerGroup } from "../../../core/dom.mjs";
import { formatDay, formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { readLedger } from "../../../data/treasury.mjs";
import { lastSafeDeposit } from "./model.mjs";

/** How many lines the history shows before the coach asks for the whole of it. */
export const HISTORY_PREVIEW = 3;
/** The history's heading, which takes the focus when the button that had it goes. */
const HEADING_ID = "manage-history-title";

/** The teams whose history is unfolded. */
const unfolded = new Set();

/** @param {string} teamId @returns {boolean} whether the team's history is unfolded */
export function historyExpanded(teamId) {
  return unfolded.has(teamId);
}

/** The match a line belongs to, in words: its round, or that it was a friendly; empty where the page does not hold the game. */
function matchWords(entry, games) {
  const game = entry.pairingId ? (games ?? []).find((item) => item.id === entry.pairingId) : null;
  if (!game) return "";
  if (game.kind === "friendly") return t("games.friendlyMatch");
  return Number(game.roundNumber) > 0 ? t("treasury.when.round", { round: game.roundNumber }) : "";
}

/**
 * The words of one line of the history. A hand-written line says what the coach said it was for, any other what
 * the system did; the comment is the coach's own. A line of a match says which one when the page holds the game.
 *
 * @param {{kind: string, reason?: string|null, note?: string|null, delta: number, createdAt: string, pairingId?: string|null}} entry
 * @param {Array<{id: string, kind: string, roundNumber?: number|null}>} games the coach's games
 * @returns {{title: string, note: string, when: string, amount: string, tone: "in"|"out"}} `amount` carries its
 *   sign (a real minus, U+2212), `tone` the direction of the money
 */
export function ledgerLine(entry, games) {
  const day = formatDay(entry.createdAt);
  const match = matchWords(entry, games);
  const outgoing = entry.delta < 0;
  return {
    title: entry.kind === "manual" && entry.reason ? t(`treasury.reason.${entry.reason}`) : t(`treasury.kind.${entry.kind}`),
    note: entry.note ?? "",
    when: match ? `${day} · ${match}` : day,
    amount: `${outgoing ? "−" : "+"}${formatMoney(Math.abs(entry.delta))}`,
    tone: outgoing ? "out" : "in",
  };
}

function rowMarkup(entry, games) {
  const { title, note, when, amount, tone } = ledgerLine(entry, games);
  return `<li class="g-ledger__row"><span class="g-ledger__title">${escapeHtml(title)}</span>`
    + (note ? `<span class="g-ledger__note">${escapeHtml(note)}</span>` : "")
    + `<span class="g-ledger__when">${escapeHtml(when)}</span>`
    + `<span class="g-ledger__amount g-ledger__amount--${tone}">${escapeHtml(amount)}</span></li>`;
}

/** A status, so a screen reader hears the history loading, empty or failed as the line changes. */
const stateMarkup = (text) => `<p class="g-ledger__state" role="status">${escapeHtml(text)}</p>`;

/**
 * A text button of the history. Keyed, like the row of buttons it stands in (a line saying the history did not
 * load comes in ahead of that row, and an unkeyed row would be taken for another), so a page drawn again keeps
 * the keyboard focus on it.
 */
const actionMarkup = (name, label) => `<button type="button" class="g-ledger__action" data-key="ledger-${name}" data-ledger-${name}>${escapeHtml(label)}</button>`;

/**
 * What stands in place of the list, or under it: nothing yet, nothing at all, the reason the history did not come,
 * or, under the lines, that a read is on its way (a «More» pressed is not left looking as if nothing happened).
 */
function statusMarkup({ entries, loaded, loading, error }) {
  if (error) return stateMarkup(t("treasury.history.failed", { reason: error }));
  if (entries.length) return loading ? stateMarkup(t("treasury.history.loading")) : "";
  return loaded ? stateMarkup(t("treasury.history.empty")) : stateMarkup(t("treasury.history.loading"));
}

/** The buttons under the lines: ask again after a failure, unfold or fold the list, read the next page of an unfolded one. */
function actionsMarkup({ entries, next, total, error }, expanded) {
  const retry = error ? actionMarkup("retry", t("treasury.history.retry")) : "";
  if (!entries.length) return retry;
  let toggle = "";
  if (expanded) toggle = actionMarkup("all", t("treasury.history.less"));
  else if (total > HISTORY_PREVIEW) toggle = actionMarkup("all", t("treasury.history.all", { count: total }));
  const more = expanded && next ? actionMarkup("more", t("treasury.history.more")) : "";
  return retry + toggle + more;
}

/**
 * The card of the history.
 *
 * @param {object} input
 * @param {{entries: object[], next: string|null, since: string|null, total: number, loaded: boolean, loading: boolean, error: string}} input.ledger
 *   what `ledgerOf` holds
 * @param {object[]} [input.games] the coach's games, to name the round of a match line
 * @param {boolean} [input.expanded] the whole of the lines read so far, not the first `HISTORY_PREVIEW`
 * @returns {string}
 */
export function historyMarkup({ ledger, games = [], expanded = false }) {
  const shown = expanded ? ledger.entries : ledger.entries.slice(0, HISTORY_PREVIEW);
  const list = shown.length ? `<ol class="g-ledger">${shown.map((entry) => rowMarkup(entry, games)).join("")}</ol>` : "";
  const actions = actionsMarkup(ledger, expanded);
  const since = ledger.since ? `<p class="g-ledger__since">${escapeHtml(t("treasury.history.since", { date: formatDay(ledger.since, { year: true }) }))}</p>` : "";
  return `<section class="g-manage__history" aria-labelledby="${HEADING_ID}">`
    + `<h2 class="g-manage__history-title" id="${HEADING_ID}" tabindex="-1">${escapeHtml(t("treasury.history"))}</h2>`
    + `${list}${statusMarkup(ledger)}${actions ? `<div class="g-ledger__actions" data-key="ledger-actions">${actions}</div>` : ""}${since}</section>`;
}

/**
 * A read a button of the history started, and where the keyboard focus goes. The page keeps it on a button that is
 * still there once it is drawn again, but «Try again» goes as soon as its read starts and the last «More» once its page
 * comes: the focus would fall to the body, and goes to the heading of the history instead. Asked when the read starts
 * and when it ends; a press made with the focus elsewhere (a mouse in Safari) moves nothing.
 *
 * @param {Element} root @param {Element} button the one pressed @param {Function} read the read, asynchronous: it answers when it is done
 */
function readKeepingFocus(root, button, read) {
  const document = root.ownerDocument;
  const held = document?.activeElement === button;
  const reading = read();
  if (!held) return;
  const keep = () => {
    if (!focusLost(document.activeElement)) return;
    root.querySelector(`#${HEADING_ID}`)?.focus();
  };
  keep();
  void reading.then(keep);
}

/**
 * The buttons of the history: «All history» folds and unfolds the list and tells the page to draw it again,
 * «More» reads the page after the lines the page holds, and «Try again» reads the first page again. The reads
 * announce themselves (`onLedgerChange`), so the page draws their answers without being told here; the focus on a
 * button that goes with its read goes to the heading (`readKeepingFocus`).
 *
 * @param {Element} root the page's element, which outlives its redraws
 * @param {string} teamId
 * @param {() => void} onChange draws the page again
 * @returns {() => void} removes the listeners
 */
export function wireHistory(root, teamId, onChange) {
  const group = listenerGroup(root);
  group.on("click", "[data-ledger-all]", () => {
    if (!unfolded.delete(teamId)) unfolded.add(teamId);
    onChange();
  });
  group.on("click", "[data-ledger-more]", (event, button) => readKeepingFocus(root, button, () => readLedger(teamId, { more: true })));
  group.on("click", "[data-ledger-retry]", (event, button) => readKeepingFocus(root, button, () => readLedger(teamId)));
  return group.release;
}

/**
 * The card of Coach's Safe: what it holds, the rule, and the last deposit when the history the page holds
 * has one (the newest `safe` line; a deposit older than the pages read is not looked for).
 *
 * @param {object} input
 * @param {number} input.safe thousands in the safe
 * @param {object[]} input.entries the lines of the history read so far, newest first
 * @returns {string}
 */
export function safeMarkup({ safe, entries }) {
  const deposit = lastSafeDeposit(entries);
  const last = deposit
    ? `<p class="g-manage__safe-last">${escapeHtml(t("treasury.safeLast", { amount: formatMoney(deposit.amount), date: formatDay(deposit.createdAt) }))}</p>`
    : "";
  return `<section class="g-manage__safe" aria-labelledby="manage-safe-title"><div class="g-manage__safe-text">`
    + `<h2 class="g-manage__safe-title" id="manage-safe-title">${escapeHtml(t("treasury.safeTitle"))}</h2>`
    + `<p class="g-manage__safe-rule">${escapeHtml(t("treasury.safeRule"))}</p>${last}</div>`
    + `<span class="g-manage__safe-amount">${escapeHtml(formatMoney(safe))}</span></section>`;
}
