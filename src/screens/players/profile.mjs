/**
 * A coach's public profile: their account card and saved teams, visible
 * to any signed-in user.
 *
 * Mechanically moved out of src/app.js. An admin viewing this screen gets
 * the same edit panels as the administration screen, so those come from
 * screens/administration/user.mjs rather than being duplicated here.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { adminTeamEditUrl, pageUrl } from "../../core/routes.mjs";
import { ensureDraftPlayers } from "../../domain/roster/players.mjs";
import { calculateRosterCosts } from "../../domain/roster/costs.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderPublicTeamLink } from "../../components/content-links.mjs";
import { normalizeSavedRoster } from "../../data/roster-draft.mjs";
import { wireTeamDeleteButtons } from "../my-teams.mjs";
import {
  renderAdminCreateTeamForUserPanel,
  renderAdminProfileCard,
  wireAdminUserProfile,
} from "../administration/user.mjs";

export async function renderPlayerProfile(userId) {
  // "players" matches no nav item, so nothing lights up — which is what
  // routeSection() in core/routes.mjs already says these routes are. The two
  // used to disagree, and this screen highlighted "Season".
  setActiveNav("players");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), "", { back: true, backFallback: "#/season" })}
    <div class="loading">${t("admin.loadingPlayer")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewProfiles")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}`);
    view.innerHTML = `
      ${renderHeader(`${t("admin.playerHeader")} "${payload.user.login}"`, t("admin.savedTeamsAndCoachSubtitle"), "", { back: true, backFallback: "#/season" })}
      <div class="admin-profile-grid">
        ${renderAdminProfileCard(payload.user)}
        ${state.auth.currentUser?.isAdmin ? `<section class="content-panel season-card">${renderAdminCreateTeamForUserPanel(payload.user)}</section>` : ""}
        <section class="content-panel season-card">
          <h2>${t("admin.savedTeamsHeader")}</h2>
          ${renderPublicProfileTeamsTable(payload.user, payload.teams ?? [])}
        </section>
      </div>
    `;
    if (state.auth.currentUser?.isAdmin) {
      wireAdminUserProfile(payload.user);
    }
    wireTeamDeleteButtons(() => renderPlayerProfile(userId));
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("admin.playerProfileHeading"), t("admin.savedTeamsAndCoachSubtitle"), "", { back: true, backFallback: "#/season" })}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}
function renderPublicProfileTeamsTable(user, teams) {
  if (!teams.length) return `<p>${t("myTeams.noSavedTeams")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="admin-teams-table compact-roster-table">
        <thead>
          <tr>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            <th>${t("catalog.players")}</th>
            <th>${t("roster.totalCost")}</th>
            <th>${t("footer.updated")}</th>
            ${canManageProfileTeams(user) ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${teams.map((team) => renderPublicProfileTeamRow(user, team)).join("")}
        </tbody>
      </table>
    </div>
  `;
}
function renderPublicProfileTeamRow(user, team) {
  const base = state.data.teams.find((item) => item.slug === team.baseTeamSlug);
  const draft = normalizeSavedRoster(team);
  const rosterTeam = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? base;
  if (rosterTeam) ensureDraftPlayers(rosterTeam, draft);
  const costs = rosterTeam ? calculateRosterCosts(rosterTeam, draft) : null;
  const updated = team.updatedAt ? new Date(team.updatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td>
        <span class="saved-team-name-cell">
          ${team.logoData ? `<img src="${escapeHtml(team.logoData)}" alt="">` : ""}
          <strong>${renderPublicTeamLink(user, team)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      ${canManageProfileTeams(user) ? `
        <td>
          <div class="table-actions">
            ${state.auth.currentUser?.isAdmin ? `<a class="primary-button compact-action" href="${adminTeamEditUrl(user, team)}">${t("common.edit")}</a>` : `<a class="primary-button compact-action" href="#/my-teams/${encodeURIComponent(team.id)}">${t("common.edit")}</a>`}
            <button class="filter-button compact-action danger-action" type="button" data-delete-team="${escapeHtml(team.id)}" data-delete-team-owner="${escapeHtml(user.id || "")}" data-delete-team-name="${escapeHtml(team.name || "")}">${t("common.delete")}</button>
          </div>
        </td>
      ` : ""}
    </tr>
  `;
}
function canManageProfileTeams(user) {
  return Boolean(state.auth.currentUser?.isAdmin || (state.auth.currentUser?.id && state.auth.currentUser.id === user?.id));
}
