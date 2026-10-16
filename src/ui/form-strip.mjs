/**
 * Recent results as a row of ten squares, the oldest at the left: the coach's
 * all-time record at a glance.
 *
 * Which matches count, and in what order they were played, is the caller's.
 * Each square is its letter, with the word in its title; the colour only
 * reinforces it.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { dataAttributes } from "./markup.mjs";
import { resultLabels } from "./result-pill.mjs";

/** How many squares the strip holds. */
const VISIBLE = 10;

/**
 * @param {object} props
 * @param {string[]} props.results RESULT_KINDS values, the oldest first; only the last ten are drawn
 */
export function renderFormStrip({ results }) {
  if (!Array.isArray(results)) throw new Error("a form strip needs results: an array of outcomes, the oldest first");
  // Every result is checked, the ones cut off included: a bad value should fail now, not when it enters the window.
  const items = results.map((result) => ({ result, ...resultLabels(result) })).slice(-VISIBLE).map(({ result, letter, name }) =>
    `<span class="g-form__item g-form__item--${result}" role="listitem"${dataAttributes({ result })} title="${escapeHtml(name)}">${escapeHtml(letter)}</span>`);
  return `<div class="g-form" role="list" aria-label="${escapeHtml(t("ui.form.label"))}">${items.join("")}</div>`;
}
