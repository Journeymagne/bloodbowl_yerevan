/**
 * Deleting a team from the 2.x screens: the roster editor and the admin's page
 * of a user. They moved here from screens/my-teams.mjs, which stage 06 replaced
 * with the 3.0 list (screens/teams/index.mjs, whose own sheet asks before it
 * deletes). They leave with those screens, at stages 07 and 12.
 *
 * What is asked, and what is sent, has not changed: the 2.x dialog, then
 * `deleteTeam` (data/teams.mjs), which owns the request, the list and the
 * games. What it no longer does for these callers is the admin's lists, so
 * they are reset here.
 */
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { deleteTeam } from "../data/teams.mjs";
import { confirmAction } from "./dialog.mjs";
import { toast, toastError } from "./toast.mjs";

/** Where a team is deleted: an admin deleting another coach's goes through the admin's route, everyone else through their own. */
function deleteTeamEndpoint(teamId, ownerId = "") {
  const currentUser = state.auth.currentUser;
  if (currentUser?.isAdmin && ownerId && ownerId !== currentUser.id) {
    return `/api/admin/teams/${encodeURIComponent(teamId)}`;
  }
  return `/api/teams/${encodeURIComponent(teamId)}`;
}

/**
 * Ask, then delete. A refusal is said as a message. A delete that went through also makes the admin screens
 * read their users again and forget a draft of the team, as the delete always did.
 * @param {string} teamId
 * @param {{ownerId?: string, teamName?: string, endpoint?: string}} [options] `endpoint` wins over the one chosen by the owner
 * @returns {Promise<boolean>} whether the team was deleted
 */
export async function deleteSavedTeam(teamId, options = {}) {
  if (!teamId) return false;
  const teamName = options.teamName ? ` "${options.teamName}"` : "";
  if (!await confirmAction({
    message: `${t("savedRoster.deleteTeamConfirm")}${teamName}?`,
    confirmLabel: t("common.delete"),
    destructive: true,
  })) return false;
  const { refusal } = await deleteTeam(teamId, { endpoint: options.endpoint || deleteTeamEndpoint(teamId, options.ownerId) });
  if (refusal) {
    toast(refusal, { tone: "error" });
    return false;
  }
  state.admin.loaded = false;
  state.admin.editingTeams?.delete(teamId);
  return true;
}

/** Make every `[data-delete-team]` button on the page delete its team, and call `afterDelete(button)` once one is deleted. */
export function wireTeamDeleteButtons(afterDelete) {
  view.querySelectorAll("[data-delete-team]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        const deleted = await deleteSavedTeam(button.dataset.deleteTeam, {
          ownerId: button.dataset.deleteTeamOwner || "",
          teamName: button.dataset.deleteTeamName || "",
          endpoint: button.dataset.deleteTeamEndpoint || "",
        });
        if (deleted && afterDelete) await afterDelete(button);
      } catch (error) {
        toastError(error);
      }
    });
  });
}
