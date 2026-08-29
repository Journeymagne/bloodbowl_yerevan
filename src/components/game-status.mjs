/**
 * A game/pairing result status, translated for display.
 *
 * Mechanically moved out of src/app.js. Used by the games screens (still in
 * app.js — task 6.8) and by screens/season/schedule.mjs's pairing table,
 * which is why this tiny wrapper gets its own module rather than living in
 * either.
 */
import { t } from "../core/i18n.mjs";

/**
 * Every status a result can be in, and therefore every `games.status.<name>`
 * key the dictionaries must carry. Written down (step 13.4) so a test can
 * check them rather than a coach finding `games.status.rejected` on a card.
 */
export const GAME_RESULT_STATUSES = Object.freeze([
  "pending",
  "awaiting_confirmation",
  "confirmed",
  "rejected",
]);

export function gameStatusLabel(status) {
  return t(`games.status.${status || "pending"}`);
}
