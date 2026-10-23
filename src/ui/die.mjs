/**
 * A die on the table: its type, and a question mark until it has been rolled.
 *
 * Which die a rule asks for, and what the roll was, is the caller's. The die
 * is one picture to a screen reader, named by its state.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames } from "./markup.mjs";

/** What a die that has not been rolled shows where its result will be. */
const NOT_ROLLED = "?";

/**
 * @param {object} props
 * @param {string} props.type "D6", "D8", "D16": what names the die
 * @param {string|number|null} [props.value] the roll; none yet when null, undefined or the empty string (a roll of 0 is a roll)
 */
export function renderDie({ type, value = null }) {
  if (!type) throw new Error("a die needs a type: it is what names it");
  const rolled = !(value === "" || value === null || value === undefined);
  const label = rolled ? t("ui.die.rolled", { type, value }) : t("ui.die.waiting", { type });
  return `<div class="${classNames("g-die", rolled && "g-die--rolled")}" role="img" aria-label="${escapeHtml(label)}">`
    + `<span class="g-die__type">${escapeHtml(type)}</span><span class="g-die__value">${escapeHtml(rolled ? value : NOT_ROLLED)}</span></div>`;
}
