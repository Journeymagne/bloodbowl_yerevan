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
 * The guard is components/dialog.mjs, like every other destructive action in
 * the app since step 7.10. That makes it asynchronous, so callers await it;
 * a `confirm()` here would have been the one blocking prompt left.
 */
import { t } from "../../core/i18n.mjs";
import { confirmAction } from "../dialog.mjs";
import { toast } from "../toast.mjs";
import { selectedRosterPlayers } from "../../domain/roster/players.mjs";

/**
 * Ask before a race change that would throw players away — or refuse it.
 *
 * A roster with nobody in it has nothing to lose, so it changes without a
 * prompt: the question is only worth asking when there is an answer worth
 * hearing.
 *
 * A team playing in the current season cannot change race at all, confirmed
 * or not. Its opponents' results, the table and the fixtures all refer to a
 * squad that would stop existing. Step 7.7 wanted this and could not have it:
 * the editor had no way to know a team was in a season until step 4.11 made
 * the server say so.
 *
 * @param {object} team the race currently selected
 * @param {object} draft
 * @param {object} nextTeam the race being switched to
 * @param {{inActiveSeason?: boolean}} [permissions]
 * @returns {Promise<boolean>} whether to go ahead
 */
export async function confirmRaceChange(team, draft, nextTeam, permissions = {}) {
  if (permissions.inActiveSeason) {
    toast(t("roster.raceLockedInSeason"), { tone: "error" });
    return false;
  }
  const losing = selectedRosterPlayers(team, draft).length;
  if (!losing) return true;
  return confirmAction({
    message: t("roster.confirmTeamChange", {
      count: losing,
      from: team?.title ?? "",
      to: nextTeam?.title ?? "",
    }),
    confirmLabel: t("roster.changeRaceAction"),
    destructive: true,
  });
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
