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
import { pageUrl } from "../core/routes.mjs";
import { calculateRosterCosts } from "../domain/roster/costs.mjs";
import { ensureDraftPlayers } from "../domain/roster/players.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../components/page-chrome.mjs";
import { renderPublicTeamLink } from "../components/content-links.mjs";
import { normalizeSavedRoster, resetBuilderForTeam } from "../data/roster-draft.mjs";
import { toastError } from "../components/toast.mjs";
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
    ${state.myTeams.items.length ? renderSavedTeamsTable(state.myTeams.items) : `<div class="empty-state">${t("myTeams.noSavedTeams")}</div>`}
  `;
  wireMyTeams();
}

function renderSavedTeamsTable(teams) {
  return `
    <article class="content-panel compact-table-panel my-teams-table-panel">
      <div class="table-scroll builder-table-scroll">
        <table class="my-teams-table compact-roster-table">
          <thead>
            <tr>
              <th>${t("sidebar.teamHeading")}</th>
              <th>${t("myTeams.table.rules")}</th>
              <th>${t("myTeams.table.players")}</th>
              <th>${t("roster.totalCost")}</th>
              <th>${t("footer.updated")}</th>
              <th>${t("myTeams.table.actions")}</th>
            </tr>
          </thead>
          <tbody>
            ${teams.map(renderSavedTeamRow).join("")}
          </tbody>
        </table>
      </div>
    </article>
    <div class="my-teams-card-list">
      ${teams.map(renderSavedTeamCard).join("")}
    </div>
  `;
}

function renderSavedTeamRow(team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) {
    ensureDraftPlayers(rosterTeam, draft);
  }
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td>
        <span class="saved-team-name-cell">
          ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
          <strong>${renderPublicTeamLink(state.auth.currentUser, team)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      <td>
        <div class="table-actions">
          <a class="primary-button compact-action" href="#/my-teams/${encodeURIComponent(team.id)}">${t("common.edit")}</a>
          <button class="filter-button compact-action danger-action" type="button" data-delete-team="${escapeHtml(team.id)}" data-delete-team-name="${escapeHtml(team.name || "")}">${t("common.delete")}</button>
        </div>
      </td>
    </tr>
  `;
}

function renderSavedTeamCard(team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) {
    ensureDraftPlayers(rosterTeam, draft);
  }
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <article class="card saved-team-card">
      <header class="saved-team-card-head">
        ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
        <div>
          <h3>${renderPublicTeamLink(state.auth.currentUser, team)}</h3>
          <p>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</p>
        </div>
      </header>
      <dl class="saved-team-card-stats">
        <div><dt>${t("catalog.players")}</dt><dd>${costs ? costs.totalPlayersCount : "-"}</dd></div>
        <div><dt>${t("roster.totalCost")}</dt><dd>${costs ? `${costs.total}k` : "-"}</dd></div>
        <div><dt>${t("footer.updated")}</dt><dd>${escapeHtml(updated)}</dd></div>
      </dl>
      <div class="saved-team-actions">
        <a class="primary-button compact-action" href="#/my-teams/${encodeURIComponent(team.id)}">${t("common.edit")}</a>
        <button class="filter-button compact-action danger-action" type="button" data-delete-team="${escapeHtml(team.id)}" data-delete-team-name="${escapeHtml(team.name || "")}">${t("common.delete")}</button>
      </div>
    </article>
  `;
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
