/**
 * The inducements' step (PreInducements.html, DeskPreInducements.html; stage 09a decision 20): the budget card — whose
 * turn it is, «Petty cash 90k + from the treasury up to 50k», what is chosen, the bar and what it does to the treasury —,
 * «Help | Stars», the rows of what the team may buy, and the prayers and effects to record under them.
 *
 * Help is a counter per inducement (`renderResourceCounter`): its price, limit and the rule's first line, and a «+»
 * that says why it cannot be pressed. Stars are rows with «Take» or «Remove» (`data-prep-star`) and the places they
 * take. Every counter is locked, with why, while it is not the team's turn, once its basket is confirmed, or when the
 * preparation reads only. A phone has the budget card at the top of the step; a desk has it in the right column with
 * what is bought and the button, and the step's order words at the top of its card.
 *
 * The bar's width is a class, a tenth at a time (`g-prep-budget__bar--<share>`): the CSP allows no style attribute.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { formatMoney } from "../../core/format.mjs";
import { t } from "../../core/i18n.mjs";
import { renderResourceCounter } from "../../ui/resource-counter.mjs";
import { renderSegmentedControl } from "../../ui/segmented-control.mjs";
import { renderStatusChip } from "../../ui/status-chip.mjs";
import { prepCtaMarkup } from "./prep-frame.mjs";
import { effectsMarkup } from "./prep-effects.mjs";

/** The turn's chip (pre-flight L17): the warning's while the team waits or buys second, the accent's otherwise. */
const TURN_TONES = { first: "live", second: "wait", wait: "wait", even: "live" };

/** A sentence with some of its figures in bold: `t(key, values)` escaped, each of `bold` wrapped in `<b>`. */
function withBold(key, values, bold) {
  const marks = Object.fromEntries(bold.map((name, index) => [name, `\u0001${index}\u0002`]));
  const text = escapeHtml(t(key, { ...values, ...marks }));
  return bold.reduce((html, name, index) => html.replace(`\u0001${index}\u0002`, `<b class="g-prep-budget__figure">${escapeHtml(values[name])}</b>`), text);
}

/** The bar: its share of the most the team may spend, in its tone; a progress bar for a screen reader. */
function barMarkup(inducements) {
  return `<div class="g-prep-budget__bar g-prep-budget__bar--${inducements.share} g-prep-budget__bar--${inducements.tone}" role="progressbar"`
    + ` aria-label="${escapeHtml(t("prep.ind.spent"))}" aria-valuemin="0" aria-valuemax="${inducements.maximum}" aria-valuenow="${inducements.chosen}"><span class="g-prep-budget__fill"></span></div>`;
}

/**
 * The budget card. A phone's (PreInducements.html): the turn's chip, the budget's line and what is chosen, the bar, the
 * hint. A desk's (DeskPreInducements.html): «Budget» for a head, then the same, what is bought line by line, and the
 * button — the footer's, here.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model @param {{desk?: boolean}} [options]
 */
export function budgetCardMarkup(model, { desk = false } = {}) {
  const inducements = model.inducements;
  if (!inducements) return "";
  const head = desk ? `<span class="g-prep__label">${escapeHtml(t("prep.ind.budget"))}</span>`
    : renderStatusChip({ label: t(`prep.turn.${inducements.turn}`, { amount: formatMoney(inducements.spentByOther) }), tone: TURN_TONES[inducements.turn] });
  const values = { petty: formatMoney(inducements.petty), treasury: formatMoney(inducements.treasuryUpTo), bonus: formatMoney(inducements.bonus) };
  const bonus = inducements.bonus > 0 ? ` ${withBold("prep.ind.bonus", values, ["bonus"])}` : "";
  const line = `<div class="g-prep-budget__line"><span class="g-prep-budget__petty">${withBold("prep.ind.petty", values, ["petty", "treasury"])}${bonus}</span>`
    + `<span class="g-prep-budget__chosen">${escapeHtml(formatMoney(inducements.chosen))}</span></div>`;
  const hint = `<span class="g-prep-budget__hint">${escapeHtml(inducements.hint)}</span>`;
  const lines = desk && inducements.bought.length
    ? `<ul class="g-prep-budget__lines">${inducements.bought.map((item) => `<li class="g-prep-budget__bought"><span>${escapeHtml(t("prep.ind.bought", { quantity: item.quantity, title: item.title }))}</span>`
      + `<b>${escapeHtml(formatMoney(item.cost))}</b></li>`).join("")}</ul>` : "";
  const cta = desk ? prepCtaMarkup(model.footer) : "";
  return `<div class="g-prep__panel g-prep-budget${desk ? " g-prep-budget--desk" : ""}">${head}${line}${barMarkup(inducements)}${hint}${lines}${cta}</div>`;
}

/** A star's row: its name and line, why it cannot be taken, and «Take» or «Remove». */
function starRow(row, lockedReason) {
  const taken = row.quantity > 0;
  const why = lockedReason || (taken ? "" : row.reason);
  const closed = Boolean(why);
  const words = taken ? t("prep.ind.drop") : t("prep.ind.take");
  const button = `<button type="button" class="g-prep-ind__take" data-prep-star="${escapeHtml(row.id)}"${closed ? ' aria-disabled="true"' : ""}`
    + ` aria-label="${escapeHtml(`${words}: ${row.title}`)}">${escapeHtml(words)}</button>`;
  return `<div class="g-prep-ind__star"><span class="g-prep-ind__text"><span class="g-prep-ind__name">${escapeHtml(row.title)}</span>`
    + `<span class="g-prep-ind__note">${escapeHtml(row.note)}</span>${why ? `<span class="g-prep-ind__why">${escapeHtml(why)}</span>` : ""}</span>${button}</div>`;
}

/** The rows of the category shown: help as counters, stars as rows under their places. */
function rowsMarkup(inducements) {
  const { rows, lockedReason } = inducements;
  if (inducements.category === "stars") {
    const places = `<p class="g-prep__note">${escapeHtml(t("prep.ind.stars", { used: inducements.stars.used, of: inducements.stars.of }))}</p>`;
    return `<div class="g-prep-ind__list g-prep-ind__list--stars">${places}${rows.map((row) => starRow(row, lockedReason)).join("")}</div>`;
  }
  const counters = rows.map((row) => renderResourceCounter({ key: row.id, name: row.title, note: row.note, value: row.quantity,
    incBlockedReason: row.reason, lockedReason })).join("");
  return `<div class="g-prep-ind__list">${counters}</div>`;
}

/** A desk's words at the top of the card: who buys first and why, and whose petty cash the difference is. */
function orderMarkup(model) {
  const { turn } = model.inducements;
  const ours = formatMoney(model.own.ctv), theirs = formatMoney(model.other.ctv), difference = formatMoney(Math.abs(model.own.ctv - model.other.ctv));
  const key = turn === "even" ? "prep.ind.orderEven" : turn === "first" ? "prep.ind.orderFirst" : "prep.ind.order";
  return `<p class="g-prep__note">${escapeHtml(t(key, { ours, theirs, difference }))}</p>`;
}

/**
 * The step: on a phone the budget card first; on a desk the order's words. Then «Help | Stars», the rows, the effects,
 * and that mercenaries are not the league's.
 * @param {ReturnType<typeof import("./prep-model.mjs").prepModel>} model @param {{desk?: boolean}} [options]
 */
export function inducementsMarkup(model, { desk = false } = {}) {
  const inducements = model.inducements;
  if (!inducements) return "";
  const segments = renderSegmentedControl({ label: t("prep.ind.title"), selected: inducements.category, data: { segGroup: "prep-category" },
    items: [{ value: "help", label: t("prep.ind.help") }, { value: "stars", label: t("prep.ind.starsTab") }] });
  return `${desk ? orderMarkup(model) : budgetCardMarkup(model)}${segments}${rowsMarkup(inducements)}${effectsMarkup(model)}`
    + `<p class="g-prep__note">${escapeHtml(t("prep.mercenaries"))}</p>`;
}
