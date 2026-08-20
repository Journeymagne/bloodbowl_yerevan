/**
 * A game/pairing result status, translated for display.
 *
 * Mechanically moved out of src/app.js. Used by the games screens (still in
 * app.js — task 6.8) and by screens/season/schedule.mjs's pairing table,
 * which is why this tiny wrapper gets its own module rather than living in
 * either.
 */
import { t } from "../core/i18n.mjs";

export function gameStatusLabel(status) {
  return t(`games.status.${status || "pending"}`);
}
