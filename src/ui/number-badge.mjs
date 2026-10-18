/**
 * A player's number on his position's colour: the round badge at the start of
 * a roster row and at the head of a player's page.
 *
 * The captain wears a gold «C» in the corner. It is a mark, hidden from a
 * screen reader, and the word «Captain» is said in its place: the colour and the
 * letter are not the message.
 *
 * Which position is a blitzer's and who is the captain is the caller's, taken
 * from src/domain (positionKind, the roster's captain).
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { classNames } from "./markup.mjs";

/** The colours a position has: see positionKind in src/domain/roster/players.mjs. */
export const PLAYER_BADGE_KINDS = ["blitzer", "catcher", "thrower", "lineman", "big"];

/**
 * @param {object} props
 * @param {string|number} props.number the shirt number, as it is written
 * @param {string} [props.kind] one of PLAYER_BADGE_KINDS; a lineman's by default
 * @param {boolean} [props.captain] wears the captain's «C»
 * @param {boolean} [props.large] the form at the head of a player's page
 */
export function renderPlayerBadge({ number, kind = "lineman", captain = false, large = false }) {
  if (!PLAYER_BADGE_KINDS.includes(kind)) throw new Error(`unknown badge kind: ${JSON.stringify(kind)}`);
  const mark = captain
    ? `<span class="g-num__captain" aria-hidden="true">${escapeHtml(t("ui.badge.captainMark"))}</span><span class="g-sr-only">${escapeHtml(t("ui.badge.captain"))}</span>`
    : "";
  return `<span class="${classNames("g-num", `g-num--${kind}`, large && "g-num--lg")}"><span class="g-num__n">${escapeHtml(number)}</span>${mark}</span>`;
}
