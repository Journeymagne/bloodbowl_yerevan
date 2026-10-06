/**
 * "My teams": the list of a coach's saved rosters, and team deletion.
 *
 * Mechanically moved out of src/app.js. `deleteSavedTeam` and
 * `wireTeamDeleteButtons` are exported because the admin screens (still in
 * app.js) reuse the same delete-button wiring on a user's or a player's
 * saved teams; `loadMyTeams` is exported because saved-roster.mjs's team
 * picker reloads the same list.
 */
import { errorText } from "../core/api.mjs";
import { escapeHtml } from "../core/dom.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { view } from "../core/view.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { resetBuilderForTeam } from "../data/roster-draft.mjs";
import { toastError } from "../components/toast.mjs";
import { renderSavedTeams } from "../components/saved-teams.mjs";
import { confirmAction } from "../components/dialog.mjs";

export async function loadMyTeams(force = false) {
  if (!state.auth.currentUser) {
    state.myTeams = { items: [], loaded: true, loading: false, error: "" };
    return;
  }
  if (state.myTeams.loaded && !force) return;
  state.myTeams.loading = true;
  state.myTeams.error = "";
  try {
    const payload = await apiRequest("/api/teams");
    state.myTeams.items = payload.teams ?? [];
    state.myTeams.loaded = true;
  } catch (error) {
    state.myTeams.error = errorText(error);
  } finally {
    state.myTeams.loading = false;
  }
}

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
    ${state.myTeams.items.length ? renderSavedTeams(state.myTeams.items, { owner: state.auth.currentUser, canManage: true, editUrl: team => "#/my-teams/" + encodeURIComponent(team.id) }) : `<div class="empty-state">${t("myTeams.noSavedTeams")}</div>`}
  `;
  wireMyTeams();
}


function wireMyTeams() {
  view.querySelector("[data-new-team]")?.addEventListener("click", () => {
    resetBuilderForTeam(state.data.teams[0]);
    location.hash = "#/builder";
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
  state.games.loaded = false;
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
