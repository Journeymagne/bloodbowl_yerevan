/**
 * One shared coach-profile template, plus its admin controls.
 *
 * Both the Administration route and the public player route render this
 * template. Access decides which controls appear; the route no longer does.
 */
import { errorText } from "../../core/api.mjs";
import { escapeHtml, renderOption } from "../../core/dom.mjs";
import { t } from "../../core/i18n.mjs";
import { state } from "../../core/state.mjs";
import { view } from "../../core/view.mjs";
import { apiRequest } from "../../core/api-client.mjs";
import { adminTeamEditUrl, pageUrl } from "../../core/routes.mjs";
import { ensureDraftPlayers } from "../../domain/roster/players.mjs";
import { calculateRosterCosts } from "../../domain/roster/costs.mjs";
import { renderHeader, setActiveNav, setViewSection } from "../../components/page-chrome.mjs";
import { renderPlayerLink, renderPublicTeamLink } from "../../components/content-links.mjs";
import { updateAuthButton } from "../../components/auth-button.mjs";
import { normalizeSavedRoster } from "../../data/roster-draft.mjs";
import { wireTeamDeleteButtons } from "../my-teams.mjs";
import { makeSeasonStarterRoster } from "../season/season-data.mjs";
import { toast, toastError } from "../../components/toast.mjs";
import { confirmAction } from "../../components/dialog.mjs";

export async function renderAdminUserProfile(userId) {
  setActiveNav("administration");
  setViewSection("administration");
  view.innerHTML = `
    ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), "", { back: true, backFallback: "#/administration" })}
    <div class="loading">${t("admin.loadingProfile")}</div>
  `;

  if (!state.auth.currentUser?.isAdmin) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), "", { back: true, backFallback: "#/administration" })}
      <div class="empty-state">${t("admin.accessRequired")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(userId)}`);
    view.innerHTML = renderUserProfilePage(payload, {
      subtitle: t("admin.savedTeamsAndProfileSubtitle"),
      backFallback: "#/administration",
    });
    wireUserProfile(payload.user, () => renderAdminUserProfile(userId));
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), "", { back: true, backFallback: "#/administration" })}
      <div class="empty-state">${escapeHtml(errorText(error))}</div>
    `;
  }
}

export function renderUserProfilePage(payload, { subtitle, backFallback } = {}) {
  const user = payload.user;
  const isAdmin = Boolean(state.auth.currentUser?.isAdmin);
  return `
    ${renderHeader(`${t("admin.playerHeader")} "${user.login}"`, subtitle, "", { back: true, backFallback })}
    <div class="admin-profile-grid">
      ${renderUserProfileCard(user)}
      ${isAdmin ? renderAdminUserManagementPanel(user) : ""}
      ${isAdmin ? `<section class="content-panel season-card">${renderAdminCreateTeamForUserPanel(user)}</section>` : ""}
      <section class="content-panel season-card">
        <h2>${t("admin.savedTeamsHeader")}</h2>
        ${renderProfileSavedTeamsTable(payload.teams ?? [], user)}
      </section>
    </div>
  `;
}

function renderUserProfileCard(user) {
  const created = user.createdAt ? new Date(user.createdAt).toLocaleDateString("en-GB") : "-";
  const updated = user.lastTeamUpdatedAt ? new Date(user.lastTeamUpdatedAt).toLocaleDateString("en-GB") : "-";
  return `
    <aside class="side-panel admin-profile-card">
      <h2>${t("admin.profileHeading")}</h2>
      <dl class="stat-list">
        <dt>${t("auth.loginField")}</dt><dd>${renderPlayerLink(user)}</dd>
        <dt>${t("auth.telegramField")}</dt><dd>${escapeHtml(user.telegram || "-")}</dd>
        <dt>${t("admin.roleHeader")}</dt><dd>${user.isAdmin ? t("admin.roleAdmin") : t("admin.rolePlayer")}</dd>
        <dt>${t("admin.savedTeamsHeader")}</dt><dd>${user.savedTeamCount ?? 0}</dd>
        <dt>${t("admin.createdHeader")}</dt><dd>${escapeHtml(created)}</dd>
        <dt>${t("admin.lastTeamUpdateHeader")}</dt><dd>${escapeHtml(updated)}</dd>
      </dl>
    </aside>
  `;
}
function renderAdminUserManagementPanel(user) {
  const isCurrentUser = user.id === state.auth.currentUser?.id;
  return `
    <section class="content-panel season-card admin-user-management-panel">
      <h2>${t("admin.manageUserHeading")}</h2>
      <p class="muted-text">${t("admin.manageUserNote")}</p>
      <form class="admin-user-management-form" data-admin-user-management>
        <label class="filter-field">
          <span>${t("admin.nicknameField")}</span>
          <input name="login" type="text" minlength="3" required value="${escapeHtml(user.login || "")}">
        </label>
        <label class="filter-field">
          <span>${t("admin.newPasswordField")}</span>
          <input name="password" type="password" minlength="4" placeholder="${t("admin.newPasswordPlaceholder")}" autocomplete="new-password">
        </label>
        <label class="filter-field checkbox-field">
          <input name="isAdmin" type="checkbox" ${user.isAdmin ? "checked" : ""} ${isCurrentUser ? "disabled" : ""}>
          <span>${t("admin.adminAccessField")}</span>
        </label>
        <div class="admin-user-management-actions">
          <button class="primary-button" type="submit">${t("common.save")}</button>
          ${isCurrentUser ? "" : renderAdminPasswordResetButton()}
          <button class="filter-button danger-action" type="button" data-admin-delete-user ${isCurrentUser ? "disabled" : ""}>${t("admin.deleteUserAction")}</button>
        </div>
      </form>
      ${isCurrentUser ? "" : renderAdminPasswordResetResult()}
      ${isCurrentUser ? `<p class="muted-text">${t("admin.cannotDeleteSelfNote")}</p>` : ""}
    </section>
  `;
}

function renderAdminPasswordResetButton() {
  return `<button class="filter-button danger-action" type="button" data-admin-reset-password>${t("admin.resetPasswordAction")}</button>`;
}

function renderAdminPasswordResetResult() {
  return `<div class="admin-reset-password-result" data-admin-reset-password-result hidden>
    <label class="filter-field">
      <span>${t("admin.generatedPasswordLabel")}</span>
      <span class="admin-reset-password-value">
        <input type="text" readonly data-admin-generated-password autocomplete="off" aria-label="${t("admin.generatedPasswordLabel")}">
        <button class="filter-button" type="button" data-admin-copy-password>${t("admin.copyPasswordAction")}</button>
      </span>
    </label>
    <p class="muted-text">${t("admin.generatedPasswordNote")}</p>
  </div>`;
}

function renderAdminCreateTeamForUserPanel(user) {
  const teams = state.data.teams ?? [];
  return `
    <h2>${t("admin.createTeamForPlayerHeading")}</h2>
    <p class="muted-text">${t("admin.createTeamForPlayerNotePrefix")} ${escapeHtml(user.login)}${t("admin.createTeamForPlayerNoteSuffix")}</p>
    <div class="season-action-row admin-create-team-row">
      <label class="filter-field">
        <span>${t("admin.rulesTeamField")}</span>
        <select data-admin-create-team-base>
          ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
        </select>
      </label>
      <label class="filter-field">
        <span>${t("savedRoster.teamName")}</span>
        <input type="text" data-admin-create-team-name placeholder="${t("admin.newTeamNamePlaceholder")}">
      </label>
      <button class="primary-button" type="button" data-admin-create-user-team="${escapeHtml(user.id)}">${t("myTeams.createTeam")}</button>
    </div>
  `;
}
function wireAdminUserProfile(user, rerender) {
  view.querySelector("[data-admin-user-management]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const login = String(form.get("login") ?? "").trim();
    const password = String(form.get("password") ?? "");
    const isAdminInput = event.currentTarget.querySelector("input[name='isAdmin']");
    const isAdmin = isAdminInput ? Boolean(isAdminInput.checked) : Boolean(user.isAdmin);
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        body: JSON.stringify({ login, password, isAdmin }),
      });
      if (payload.user?.id === state.auth.currentUser?.id) {
        state.auth.currentUser = { ...state.auth.currentUser, ...payload.user };
        updateAuthButton();
      }
      state.admin.loaded = false;
      toast(t("admin.userUpdatedMessage"));
      rerender();
    } catch (error) {
      toastError(error);
    }
  });

  wireAdminPasswordReset(user);

  view.querySelector("[data-admin-delete-user]")?.addEventListener("click", async () => {
    if (!await confirmAction({
      message: `${t("admin.deleteUserConfirm")} ${user.login}? ${t("admin.deleteUserCascadeWarning")}`,
      confirmLabel: t("common.delete"),
      destructive: true,
    })) return;
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      state.admin.loaded = false;
      location.hash = "#/administration";
    } catch (error) {
      toastError(error);
    }
  });

  view.querySelector("[data-admin-create-user-team]")?.addEventListener("click", async () => {
    const baseTeamSlug = view.querySelector("[data-admin-create-team-base]")?.value;
    const baseTeam = state.data.teams.find((team) => team.slug === baseTeamSlug);
    if (!baseTeam) return;
    const name = String(view.querySelector("[data-admin-create-team-name]")?.value ?? "").trim() || baseTeam.title;
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/teams`, {
        method: "POST",
        body: JSON.stringify({
          name,
          baseTeamSlug,
          roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      });
      state.admin.loaded = false;
      location.hash = adminTeamEditUrl(user, payload.team);
    } catch (error) {
      toastError(error);
    }
  });
}

export function wireUserProfile(user, rerender) {
  if (state.auth.currentUser?.isAdmin) wireAdminUserProfile(user, rerender);
  wireTeamDeleteButtons(rerender);
}

function wireAdminPasswordReset(user) {
  view.querySelector("[data-admin-reset-password]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    if (!await confirmAction({
      message: t("admin.resetPasswordConfirm", { login: user.login }),
      confirmLabel: t("admin.resetPasswordAction"),
      destructive: true,
    })) {
      button.disabled = false;
      return;
    }
    try {
      const payload = await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}/reset-password`, {
        method: "POST",
      });
      const result = view.querySelector("[data-admin-reset-password-result]");
      const password = view.querySelector("[data-admin-generated-password]");
      if (result && password) {
        password.value = String(payload.password ?? "");
        result.hidden = false;
        password.focus();
        password.select();
      }
      toast(t("admin.passwordResetMessage"));
    } catch (error) {
      toastError(error);
    } finally {
      button.disabled = false;
    }
  });

  view.querySelector("[data-admin-copy-password]")?.addEventListener("click", async () => {
    const password = view.querySelector("[data-admin-generated-password]");
    if (!password?.value) return;
    try {
      if (!globalThis.navigator?.clipboard?.writeText) throw new Error("clipboard unavailable");
      await globalThis.navigator.clipboard.writeText(password.value);
      toast(t("admin.passwordCopiedMessage"));
    } catch {
      password.focus();
      password.select();
      toast(t("admin.passwordCopyFallbackMessage"));
    }
  });
}
function renderProfileSavedTeamsTable(teams, owner) {
  if (!teams.length) return `<p>${t("myTeams.noSavedTeams")}</p>`;
  const canManage = canManageProfileTeams(owner);
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
            ${canManage ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${teams.map((team) => renderProfileSavedTeamRow(team, owner)).join("")}
        </tbody>
      </table>
    </div>
  `;
}
function renderProfileSavedTeamRow(team, owner) {
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
          <strong>${renderPublicTeamLink(owner, team)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      ${canManageProfileTeams(owner) ? `<td>
          <div class="table-actions">
            <a class="primary-button compact-action" href="${profileTeamEditUrl(owner, team)}">${t("common.edit")}</a>
            <button class="filter-button compact-action danger-action" type="button" data-delete-team="${escapeHtml(team.id)}" data-delete-team-owner="${escapeHtml(owner.id || "")}" data-delete-team-name="${escapeHtml(team.name || "")}">${t("common.delete")}</button>
          </div>
      </td>` : ""}
    </tr>
  `;
}

function canManageProfileTeams(user) {
  const currentUser = state.auth.currentUser;
  return Boolean(currentUser?.isAdmin || (currentUser?.id && currentUser.id === user?.id));
}

function profileTeamEditUrl(owner, team) {
  return state.auth.currentUser?.isAdmin
    ? adminTeamEditUrl(owner, team)
    : `#/my-teams/${encodeURIComponent(team.id)}`;
}
