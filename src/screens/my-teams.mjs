/**
 * "My teams": the list of a coach's saved rosters, and team deletion.
 *
 * Mechanically moved out of src/app.js. `deleteSavedTeam` and
 * `wireTeamDeleteButtons` are exported because the admin screens (still in
 * app.js) reuse the same delete-button wiring on a user's or a player's
 * saved teams. The list itself is loaded by data/teams.mjs, which the session
 * fills too.
 */
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { newTeamUrl, savedRosterUrl } from "../core/routes.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { resetBuilderForTeam } from "../data/roster-draft.mjs";
import { toastError } from "../components/toast.mjs";
import { renderSavedTeams } from "../components/saved-teams.mjs";
import { confirmAction } from "../components/dialog.mjs";
import { invalidateGames } from "../data/games.mjs";
import { loadMyTeams } from "../data/teams.mjs";

export async function renderMyTeams() {
  setActiveNav("my-teams");
  setViewSection("teams");
  view.innerHTML = `
    ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"), `<button class="primary-button" type="button" data-new-team>${t("myTeams.createTeam")}</button>`)}
    <div class="loading">${t("myTeams.loadingTeams")}</div>
  `;
  await loadMyTeams(true);
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }
  if (state.myTeams.error) {
    view.innerHTML = `
      ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"))}
      <div class="empty-state">${escapeHtml(state.myTeams.error)}</div>
    `;
    return;
  }
  view.innerHTML = `
    ${renderHeader(t("myTeams.title"), t("myTeams.subtitle"), `<button class="primary-button" type="button" data-new-team>${t("myTeams.createTeam")}</button>`)}
    ${state.myTeams.items.length ? renderSavedTeams(state.myTeams.items, { owner: state.auth.currentUser, canManage: true, editUrl: savedRosterUrl }) : `<div class="empty-state">${t("myTeams.noSavedTeams")}</div>`}
  `;
  wireMyTeams();
}


function wireMyTeams() {
  view.querySelector("[data-new-team]")?.addEventListener("click", () => {
    resetBuilderForTeam(state.data.teams[0]);
    location.hash = newTeamUrl();
  });
  wireTeamDeleteButtons(() => renderMyTeams());
}

function deleteTeamEndpoint(teamId, ownerId = "") {
  const currentUser = state.auth.currentUser;
  if (currentUser?.isAdmin && ownerId && ownerId !== currentUser.id) {
    return `/api/admin/teams/${encodeURIComponent(teamId)}`;
  }
  return `/api/teams/${encodeURIComponent(teamId)}`;
}

export async function deleteSavedTeam(teamId, options = {}) {
  if (!teamId) return false;
  const teamName = options.teamName ? ` "${options.teamName}"` : "";
  if (!await confirmAction({
    message: `${t("savedRoster.deleteTeamConfirm")}${teamName}?`,
    confirmLabel: t("common.delete"),
    destructive: true,
  })) return false;
  await apiRequest(options.endpoint || deleteTeamEndpoint(teamId, options.ownerId), { method: "DELETE" });
  state.myTeams.loaded = false;
  state.season.loaded = false;
  void invalidateGames();
  state.admin.loaded = false;
  state.admin.editingTeams?.delete(teamId);
  return true;
}

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
