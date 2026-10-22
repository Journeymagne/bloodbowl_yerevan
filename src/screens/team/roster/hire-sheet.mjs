/**
 * The roster's «+» and its cart (spec UI §10; StatsHire on a phone, DeskRosterHire on a desk): the race's positions as
 * cards with what each costs and how many the team holds, the treasury and what the cart leaves of it, and one button
 * that says what it waits for.
 *
 * What the cart buys and why a position is refused is the domain's (`hireQuote`, drawn from the queue's draft at every
 * draw); the cart itself is the visit's (market.mjs). Money refuses no +: a cart dearer than the treasury is said by
 * the tile «Left» and by the button, which buys nothing then (decision 3).
 */
import { escapeHtml } from "../../../core/dom.mjs";
import { formatMoney } from "../../../core/format.mjs";
import { t } from "../../../core/i18n.mjs";
import { rowsForTeam } from "../../../domain/roster/values.mjs";
import { renderButton } from "../../../ui/button.mjs";
import { icon } from "../../../ui/icons.mjs";
import { classNames, dataAttributes } from "../../../ui/markup.mjs";
import { renderSheet } from "../../../ui/sheet.mjs";
import { positionStatsLine } from "../../../ui/stat-strip.mjs";
import { renderStepButton } from "../../../ui/stepper.mjs";
import { hireClosed, prepResetWords } from "./panel.mjs";
import { closedMarkup } from "./player-access.mjs";
import { HIRE_SHEET, footButton } from "./sheets.mjs";

/**
 * A refusal of the domain's (`TRANSFER_REFUSALS`) in the words its code names: «Ogre: maximum is 1.»
 * @param {import("../../../domain/roster/transfers.mjs").TransferRefusal} refusal
 */
export function refusalWords({ code, params = {} }) {
  return t(`validation.${code}`, params);
}

/**
 * The «+» (decision 12): after «Player» in the active roster's header, a round plus named «Hire players», its title
 * «Add players» as the prototypes give it; where that table is not drawn (nobody on the roster plays the next match),
 * the button as wide as the column under the words (`block`). Closed (`hireClosed`: a match, the screen's lock) it
 * says why as every closed control does, and keeps what names it, so the focus finds it again when the cart it opened
 * closes.
 *
 * @param {import("./view.mjs").RosterScreen} screen
 * @param {{block?: boolean}} [options]
 */
export function hireButtonMarkup(screen, { block = false } = {}) {
  const label = t("teamRoster.hire.open");
  const data = { rosterHire: "hire" };
  const reason = hireClosed(screen);
  if (reason) return closedMarkup({ className: block ? "g-btn g-btn--primary g-btn--block" : "g-roster__hire", label, glyph: block ? "" : "plus", reason, data });
  if (block) return renderButton({ label, kind: "primary", block: true, data });
  return `<button type="button" class="g-roster__hire" aria-haspopup="dialog" aria-label="${escapeHtml(label)}" title="${escapeHtml(t("teamRoster.hire.openTitle"))}"`
    + `${dataAttributes(data)}>${icon("plus", 14)}</button>`;
}

/**
 * «+ To the cart» while the cart holds none of the position, else the stepper «− N +». A + the rules refuse says why
 * as its title, `aria-disabled` and in reach (wireStepButtons hands its press to `onRefused`); both carry
 * `data-hire-step`, so the one wiring hears either.
 */
function cartControlMarkup({ position, inCart }, blockedReason) {
  const add = t("teamRoster.hire.add", { position });
  if (inCart === 0) {
    const refused = blockedReason ? ` aria-disabled="true" title="${escapeHtml(blockedReason)}"` : "";
    return `<button type="button" class="g-market__add" data-hire-step="1" aria-label="${escapeHtml(add)}"${refused}>`
      + `${icon("plus", 16)}<span class="g-market__addword">${escapeHtml(t("teamRoster.hire.addWord"))}</span></button>`;
  }
  return `<span class="g-market__stepper">${renderStepButton({ hook: "hire", delta: -1, label: t("teamRoster.hire.drop", { position }), className: "g-market__step" })}`
    + `<span class="g-market__count">${escapeHtml(inCart)}</span>`
    + `${renderStepButton({ hook: "hire", delta: 1, label: add, blockedReason, className: "g-market__step g-market__step--plus" })}</span>`;
}

/**
 * One position of the race's table as a card (decision 13): its letter on its colour, its name and price, its
 * characteristics, its skills and how many of it the team holds of its maximum, and at the right what puts it in the
 * cart (`cartControlMarkup`). In the cart, the card is tinted and ringed.
 *
 * @param {{row: object, quoteRow: import("../../../domain/roster/transfers.mjs").HireRow}} props `row` the race's line
 *   (`rowsForTeam`), `quoteRow` what the cart says of it (`hireQuote`)
 */
export function cartRowMarkup({ row, quoteRow }) {
  const { rowIndex, position, kind, price, have, max, inCart, refusal } = quoteRow;
  const skills = (row.skills ?? []).join(", ") || t("newTeam.noSkills");
  return `<div class="${classNames("g-market__row", inCart > 0 && "g-market__row--in")}" data-hire-key="${escapeHtml(rowIndex)}">`
    + `<span class="g-market__letter g-market__letter--${escapeHtml(kind)}" aria-hidden="true">${escapeHtml(Array.from(position)[0] ?? "")}</span>`
    + `<span class="g-market__text"><span class="g-market__head"><b class="g-market__name">${escapeHtml(position)}</b>`
    + `<span class="g-market__price">${escapeHtml(formatMoney(price))}</span></span>`
    + `<span class="g-market__stats">${escapeHtml(positionStatsLine(row))}</span>`
    + `<span class="g-market__meta">${escapeHtml(t("teamRoster.hire.limit", { skills, have, max }))}</span></span>`
    + `${cartControlMarkup(quoteRow, refusal ? refusalWords(refusal) : "")}</div>`;
}

/**
 * The three tiles over the cards: the treasury, what the cart costs — «0» while it is empty, as both prototypes write
 * it — and what it leaves, red when it does not pay.
 */
function tilesMarkup({ treasury, total, left }) {
  const tile = (label, value, className = "") => `<div class="${classNames("g-market__tile", className)}"><dt class="g-market__label">${escapeHtml(label)}</dt>`
    + `<dd class="g-market__value">${escapeHtml(value)}</dd></div>`;
  const cart = total ? t("teamRoster.hire.minus", { amount: formatMoney(total) }) : "0";
  return `<dl class="g-market__tiles">${tile(t("teamRoster.hire.treasury"), formatMoney(treasury))}${tile(t("teamRoster.hire.cart"), cart)}`
    + `${tile(t("teamRoster.hire.left"), formatMoney(left), classNames("g-market__tile--left", left < 0 && "g-market__tile--short"))}</dl>`;
}

/** The cart's lines, each with what it costs («2 × Human Lineman» — «100k»); none while it is empty. */
function linesMarkup({ rows }) {
  const lines = rows.filter((row) => row.inCart > 0).map((row) => `<li class="g-market__line"><span>${escapeHtml(t("teamRoster.hire.line", { count: row.inCart, position: row.position }))}</span>`
    + `<b class="g-market__sum">${escapeHtml(formatMoney(row.price * row.inCart))}</b></li>`);
  return lines.length ? `<ul class="g-market__lines">${lines.join("")}</ul>` : "";
}

/** What «Buy» says: that the cart is empty, what the treasury lacks, or what it buys for how much (no plural forms, as 07a's counts). */
function buyLabel({ count, left, total }) {
  if (!count) return t("teamRoster.hire.empty");
  if (left < 0) return t("teamRoster.hire.short", { amount: formatMoney(-left) });
  return t("teamRoster.hire.buy", { total: formatMoney(total), count });
}

/**
 * Why the cart is not bought beyond what «Buy» says, once (K7, the T2 review's carry): the press's own refusal (another
 * tab's coach, the rules a 422 left the queue on), else a limit the cart as a whole breaks — a roster saved before the
 * rules were checked can break one with nothing in the cart. A treasury it overspends is the button's to say.
 */
function refusalOf(quote, refusal) {
  if (refusal) return refusal;
  return quote.refusal && quote.refusal.code !== "TREASURY_INVALID" ? refusalWords(quote.refusal) : "";
}

/**
 * The cart, a sheet from the bottom on a phone and a 640px modal on a desk (decision 13): the race and the places
 * left, the three tiles, a card for each position, the cart's lines, the numbers the new players get, and in a
 * preparation what a save of the roster resets (R12). «Cancel» beside «Buy» on a desk (market.css hides it on a phone,
 * where the cross closes the sheet). «Buy» waits for a cart, for the money, for the limits — `disabled`, its words say
 * what — and is closed with the screen's reason (`reason`), in reach to say it.
 *
 * @param {object} props
 * @param {object} props.race the team's race
 * @param {import("../../../domain/roster/transfers.mjs").HireQuote} props.quote the cart on the queue's draft (`hireQuote`)
 * @param {{kind: string}} props.mode what the roster is for just now
 * @param {string} [props.refusal] the last press's refusal, "" for none
 * @param {string} [props.reason] why nothing can be bought just now (`hireClosed`), "" when it can
 * @returns {string} a closed dialog: `patchWithModal(view, markup, "#roster-hire")` opens it
 */
export function hireSheetMarkup({ race, quote, mode, refusal = "", reason = "" }) {
  const rows = rowsForTeam(race);
  const cards = quote.rows.map((quoteRow) => cartRowMarkup({ row: rows[quoteRow.rowIndex], quoteRow })).join("");
  const numbers = quote.count ? t("teamRoster.hire.numbers", { numbers: quote.numbers.join(", ") }) : t("teamRoster.hire.noneYet");
  const prep = mode.kind === "prep" ? `<p class="g-market__prep">${escapeHtml(prepResetWords())}</p>` : "";
  const said = refusalOf(quote, refusal);
  const alert = said ? `<p class="g-market__refusal" role="alert">${escapeHtml(said)}</p>` : "";
  const waits = !quote.count || quote.left < 0 || Boolean(quote.refusal);
  return renderSheet({
    id: HIRE_SHEET,
    at: 80,
    title: t("teamRoster.hire.title"),
    sub: t("teamRoster.hire.sub", { race: race.title, players: quote.players, max: quote.max, free: quote.free }),
    wide: true,
    bodyHtml: `${tilesMarkup(quote)}${cards}${linesMarkup(quote)}<p class="g-market__numbers">${escapeHtml(numbers)}</p>${prep}${alert}`,
    footStartHtml: renderButton({ label: t("teamRoster.hire.keep"), data: { hireKeep: true } }),
    footHtml: footButton({ label: buyLabel(quote), kind: "primary", data: { hireBuy: true }, disabled: !reason && waits, reason }),
  });
}
