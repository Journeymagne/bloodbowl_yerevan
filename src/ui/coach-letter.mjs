/**
 * A coach's letter in its circle (stage 13; the hand-off of 09c, ruling L27): the first letter of the login, in
 * capitals, white on the header's green — the one circle the administration's coaches (AdminMobile, DeskAdminUsers,
 * DeskAdminCoach), a coach's profile (CoachProfile, DeskCoachProfile) and the friendlies (Challenges, ChallengeSend,
 * DeskChallenges) draw. Hidden from a screen reader: the login beside it is what is read.
 *
 * Its sizes are the prototypes': 36 (a row of coaches, a challenge's row), 40 (AdminMobile's row), 44 (a challenge's
 * card, the friendlies' page) and 64 (a coach's profile, the administration's coach); its letter is half as tall. A
 * screen whose prototype draws one otherwise (ChallengeSend's 17px letter, DeskCoachProfile's 72) says so in its own
 * sheet, through `className`.
 */
import { escapeHtml } from "../core/dom.mjs";

/** The circle's sizes across, in px. */
export const COACH_LETTER_SIZES = Object.freeze([36, 40, 44, 64]);

/**
 * The first letter of a login, a capital, for the coach's circle; "?" for a login with none. A letter outside the basic
 * plane is one letter, not half of one.
 * @param {string|null|undefined} login
 */
export function coachInitial(login) {
  return Array.from(String(login ?? "").trim())[0]?.toUpperCase() ?? "?";
}

/**
 * The circle with the letter `initial` (`coachInitial` of the login).
 * @param {{initial: string, size: 36|40|44|64, className?: string}} props `className`: the screen's hook for its own size
 */
export function renderCoachLetter({ initial, size, className = "" }) {
  if (!COACH_LETTER_SIZES.includes(size)) throw new RangeError(`a coach's letter is drawn ${COACH_LETTER_SIZES.join(", ")} across, not ${size}`);
  const extra = className ? ` ${escapeHtml(className)}` : "";
  return `<span class="g-coach-letter g-coach-letter--${size}${extra}" aria-hidden="true">${escapeHtml(initial)}</span>`;
}
