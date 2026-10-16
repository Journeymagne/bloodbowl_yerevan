/**
 * The five characteristics of a player in a row: MA, ST, AG, PA, AR.
 *
 * The values arrive already formatted ("3+", "6"): what a characteristic is
 * worth, and which ones an advancement has raised, is the caller's, taken
 * from src/domain.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { PLAYER_STATS } from "../domain/roster/values.mjs";
import { classNames } from "./markup.mjs";

/** What a characteristic that a player does not have (a lineman's PA) shows. */
const NO_VALUE = "–";

/** A number can be a value and zero is one: only the empty string (or no value at all) is nothing to draw. */
const isEmpty = (value) => value === "" || value === null || value === undefined;

/**
 * @param {object} props
 * @param {Record<"ma"|"st"|"ag"|"pa"|"ar", string|null>} props.values each characteristic as it is written, or null when the player has none
 * @param {string[]} [props.improved] the characteristics an advancement raised, drawn on the accent tint
 */
export function renderStatStrip({ values, improved = [] }) {
  if (!values) throw new Error("a stat strip needs values: the five characteristics, each as written or null");
  if (!Array.isArray(improved)) throw new Error("improved is a list of characteristics: empty when an advancement raised none");
  const unknown = improved.findIndex((stat) => !PLAYER_STATS.includes(stat));
  if (unknown >= 0) throw new Error(`unknown characteristic: ${JSON.stringify(improved[unknown])}`);
  const cells = PLAYER_STATS.map((stat) => {
    const value = values[stat];
    return `<div class="${classNames("g-stat", improved.includes(stat) && "g-stat--up")}">`
      + `<dt class="g-stat__k">${escapeHtml(t(`stats.${stat}`))}</dt>`
      + `<dd class="g-stat__v">${escapeHtml(isEmpty(value) ? NO_VALUE : value)}</dd></div>`;
  });
  return `<dl class="g-stats">${cells.join("")}</dl>`;
}
