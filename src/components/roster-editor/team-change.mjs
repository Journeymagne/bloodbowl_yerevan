/**
 * Changing which race a roster is built from, without losing the roster by
 * accident.
 *
 * Picking a different race empties the squad — the positions belong to the
 * race, so none of them survive. Both editors did that silently on a `change`
 * event, and in the league editor the wipe reached the server inside the
 * 450ms autosave debounce, so a mis-click on the dropdown destroyed a
 * developed roster for good. Step 7.7 of the refactor plan.
 *
 * The guard is deliberately a plain `confirm()`: every other destructive
 * action in the editor uses one, and step 7.10 replaces them all together
 * rather than leaving one odd dialog out on its own.
 */
import { t } from "../../core/i18n.mjs";
import { selectedRosterPlayers } from "../../domain/roster/players.mjs";

/**
 * Ask before a race change that would throw players away.
 *
 * A roster with nobody in it has nothing to lose, so it changes without a
 * prompt — the question is only worth asking when there is an answer worth
 * hearing.
 *
 * @param {object} team the race currently selected
 * @param {object} draft
 * @param {object} nextTeam the race being switched to
 * @returns {boolean} whether to go ahead
 */
export function confirmRaceChange(team, draft, nextTeam) {
  const losing = selectedRosterPlayers(team, draft).length;
  if (!losing) return true;
  return confirm(t("roster.confirmTeamChange", {
    count: losing,
    from: team?.title ?? "",
    to: nextTeam?.title ?? "",
  }));
}

/**
 * Put a race dropdown back where it was.
 *
 * Without this, cancelling leaves the select showing the race the coach
 * declined to switch to while the roster is still the old one — the screen
 * would be lying until the next full render.
 */
export function restoreTeamSelect(select, slug) {
  if (select) select.value = slug;
}
