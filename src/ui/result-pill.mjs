/**
 * The outcome of a match as a coloured square with its letter: win, draw,
 * loss, or a friendly.
 *
 * The letter carries the meaning and the colour only reinforces it; a screen
 * reader gets the word. Which outcome a match was, and how it is shown beside
 * the opponent and the score, is the caller's.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames } from "./markup.mjs";

export const RESULT_KINDS = ["w", "d", "l", "t"];

/**
 * The letter and the word for an outcome, in the language of the page. The
 * form strip draws the same letters, so the two cannot disagree.
 *
 * @param {string} result one of RESULT_KINDS
 * @returns {{letter: string, name: string}}
 */
export function resultLabels(result) {
  if (!RESULT_KINDS.includes(result)) throw new Error(`unknown result: ${result}`);
  return { letter: t(`ui.result.${result}`), name: t(`ui.result.${result}Name`) };
}

/**
 * @param {object} props
 * @param {string} props.result one of RESULT_KINDS
 * @param {boolean} [props.compact] the 28px square of a dense list
 */
export function renderResultPill({ result, compact = false }) {
  const { letter, name } = resultLabels(result);
  const className = classNames("g-result", `g-result--${result}`, compact && "g-result--compact");
  return `<span class="${className}"><span aria-hidden="true">${escapeHtml(letter)}</span><span class="g-sr-only">${escapeHtml(name)}</span></span>`;
}
