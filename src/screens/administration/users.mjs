/**
 * The administration screen: the coach list and the bulk user import.
 *
 * Mechanically moved out of src/app.js.
 */
import { escapeHtml } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderPlayerLink } from "../../components/content-links.mjs";

async function loadAdminUsers(force = false) {
  if (!state.auth.currentUser?.isAdmin) {
    state.admin = { users: [], loaded: true, loading: false, error: "", editingTeams: new Map() };
    return;
  }
  if (state.admin.loaded && !force) return;
  state.admin.loading = true;
  state.admin.error = "";
  try {
    const payload = await apiRequest("/api/admin/users");
    state.admin.users = payload.users ?? [];
    state.admin.loaded = true;
  } catch (error) {
    state.admin.error = error.message;
  } finally {
    state.admin.loading = false;
  }
}
export async function renderAdministration() {
  setActiveNav("administration");
  setViewSection("administration");
  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
    <div class="loading">${t("admin.loadingPlayers")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"))}
      <div class="empty-state">${t("admin.loginRequired")}</div>
    `;
    return;
  }

  if (!state.auth.currentUser.isAdmin) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"))}
      <div class="empty-state">${t("admin.accessRequired")}</div>
    `;
    return;
  }

  await loadAdminUsers(true);
  if (state.admin.error) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
      <div class="empty-state">${escapeHtml(state.admin.error)}</div>
    `;
    wireAdministration();
    return;
  }

  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.subtitle"), `<button class="primary-button" type="button" data-admin-refresh>${t("admin.refresh")}</button>`)}
    ${renderAdminUsersTable(state.admin.users)}
  `;
  wireAdministration();
}
function renderAdminUsersTable(users) {
  if (!users.length) return `<div class="empty-state">${t("admin.noPlayersFound")}</div>`;
  return `
    <article class="content-panel compact-table-panel">
      <div class="table-scroll builder-table-scroll">
        <table class="admin-users-table compact-roster-table">
          <thead>
            <tr>
              <th>${t("admin.playerHeader")}</th>
              <th>${t("auth.telegramField")}</th>
              <th>${t("admin.roleHeader")}</th>
              <th>${t("admin.savedTeamsHeader")}</th>
              <th>${t("admin.lastTeamUpdateHeader")}</th>
              <th>${t("roster.actionHeader")}</th>
            </tr>
          </thead>
          <tbody>
            ${users.map(renderAdminUserRow).join("")}
          </tbody>
        </table>
      </div>
    </article>
  `;
}
function renderAdminUserRow(user) {
  const updated = user.lastTeamUpdatedAt ? new Date(user.lastTeamUpdatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <tr>
      <td><strong>${renderPlayerLink(user)}</strong></td>
      <td>${escapeHtml(user.telegram || "-")}</td>
      <td>${user.isAdmin ? t("admin.roleAdmin") : t("admin.rolePlayer")}</td>
      <td>${user.savedTeamCount ?? 0}</td>
      <td>${escapeHtml(updated)}</td>
      <td><a class="primary-button compact-action" href="#/administration/users/${encodeURIComponent(user.id)}">${t("admin.profileLink")}</a></td>
    </tr>
  `;
}
function wireAdministration() {
  view.querySelector("[data-admin-refresh]")?.addEventListener("click", () => {
    state.admin.loaded = false;
    renderAdministration();
  });

}
