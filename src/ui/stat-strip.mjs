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

/** A list of known characteristics: none is an empty list. */
function checkedList(list, name) {
  if (!Array.isArray(list)) throw new Error(`${name} is a list of characteristics: empty when there are none`);
  const unknown = list.findIndex((stat) => !PLAYER_STATS.includes(stat));
  if (unknown >= 0) throw new Error(`unknown characteristic: ${JSON.stringify(list[unknown])}`);
}

/**
 * A characteristic that changed says so in words as well as in colour (WCAG
 * 1.4.1): a reader who does not see the tint hears "improved" or "lowered"
 * after the value.
 *
 * @param {object} props
 * @param {Record<"ma"|"st"|"ag"|"pa"|"ar", string|null>} props.values each characteristic as it is written, or null when the player has none
 * @param {string[]} [props.improved] the characteristics an advancement raised, drawn on the accent tint
 * @param {string[]} [props.lowered] the characteristics an injury lowered, drawn with a red value
 */
export function renderStatStrip({ values, improved = [], lowered = [] }) {
  if (!values) throw new Error("a stat strip needs values: the five characteristics, each as written or null");
  checkedList(improved, "improved");
  checkedList(lowered, "lowered");
  const both = improved.find((stat) => lowered.includes(stat));
  if (both) throw new Error(`a characteristic cannot be both improved and lowered: ${JSON.stringify(both)}`);
  const cells = PLAYER_STATS.map((stat) => {
    const value = values[stat];
    const up = improved.includes(stat);
    const down = lowered.includes(stat);
    const said = up || down ? `<span class="g-sr-only"> ${escapeHtml(up ? t("ui.stat.improved") : t("ui.stat.lowered"))}</span>` : "";
    return `<div class="${classNames("g-stat", up && "g-stat--up", down && "g-stat--down")}">`
      + `<dt class="g-stat__k">${escapeHtml(t(`stats.${stat}`))}</dt>`
      + `<dd class="g-stat__v">${escapeHtml(isEmpty(value) ? NO_VALUE : value)}${said}</dd></div>`;
  });
  return `<dl class="g-stats">${cells.join("")}</dl>`;
}
