/**
 * The state of a match in a few words, with a dot: "Not started", "Live",
 * "Waiting for confirmation".
 *
 * The chip draws the words it is given. What state a match is in, and what it
 * is called, is the caller's; the tone only says how it is coloured: `live`
 * is the accent, `wait` is the warning colour, `danger` is a fault's red, and
 * `neutral` is the rest.
 */
import { escapeHtml } from "../core/dom.mjs";
import { classNames } from "./markup.mjs";

export const STATUS_TONES = ["neutral", "live", "wait", "danger"];

/**
 * @param {object} props
 * @param {string} props.label the state, in words: the dot is not the message
 * @param {string} [props.tone] one of STATUS_TONES; `neutral` is the base look and has no class of its own
 * @param {boolean} [props.onDark] for the dark header colour, not for a page
 */
export function renderStatusChip({ label, tone = "neutral", onDark = false }) {
  if (!label) throw new Error("a status chip needs a label: the state is told in words");
  if (!STATUS_TONES.includes(tone)) throw new Error(`unknown status tone: ${tone}`);
  const className = classNames("g-status", tone !== "neutral" && `g-status--${tone}`, onDark && "g-status--on-dark");
  return `<span class="${className}">${escapeHtml(label)}</span>`;
}
