import { countToNumber, statValueForDisplayByStat } from "./domain/roster/values.mjs";
import { hasBribery } from "./domain/roster/team-rules.mjs";
import { ensureDraftPlayers, selectedRosterPlayers, skillNamesForPlayer } from "./domain/roster/players.mjs";
import { calculateRosterCosts, playerCurrentCost } from "./domain/roster/costs.mjs";
import { escapeHtml, renderOption } from "./core/dom.mjs";
import {
  SECTION_ROUTES,
  adminTeamEditUrl,
  gameUrl,
  listUrlForRoute,
  matchRoute,
  navRouteForPage,
  pageUrl,
  playerTeamUrl,
  playerUrl,
  routeFromHash,
} from "./core/routes.mjs";
import { storage } from "./core/storage.mjs";
import { initTheme } from "./core/theme.mjs";
import {
  applyStaticI18n,
  getLocale,
  initLocale,
  isSupportedLocale,
  loadTranslations,
  setLocale,
  storedLocale,
  t,
} from "./core/i18n.mjs";
import { loadReferenceData } from "./data/reference.mjs";
import { apiRequest, authToken, setAuthToken, setOnUnauthorized } from "./core/api-client.mjs";
import { state } from "./core/state.mjs";
import { view } from "./core/view.mjs";
import { renderHeader, setActiveNav, setViewSection } from "./components/page-chrome.mjs";
import { renderPlayerLink, renderPublicTeamLink, renderRosterLinks, renderRuleLinks, uniqueSorted } from "./components/content-links.mjs";
import { ensureDraftLeagueChoice, playerStatusText, renderTeamRuleAccess } from "./components/roster-editor-shared.mjs";
import { gameStatusLabel } from "./components/game-status.mjs";
import { normalizeSavedRoster } from "./data/roster-draft.mjs";
import { renderHome } from "./screens/home.mjs";
import { renderOverviewDetail } from "./screens/overview.mjs";
import { renderSection } from "./screens/section.mjs";
import { renderDetail, renderRosterStatGrid } from "./screens/detail.mjs";
import { renderLegal } from "./screens/legal.mjs";
import { renderMyTeams, wireTeamDeleteButtons } from "./screens/my-teams.mjs";
import { renderSavedRoster, rosterStore } from "./screens/saved-roster.mjs";
import { renderBuilder } from "./screens/builder.mjs";
import { renderSeason } from "./screens/season/index.mjs";
import { makeSeasonStarterRoster } from "./screens/season/season-data.mjs";
import { pairingCasualties, pairingTouchdowns } from "./screens/season/season-links.mjs";

const searchInput = document.querySelector("#global-search");
const generatedAt = document.querySelector("#generated-at");
const langToggle = document.querySelector("#lang-toggle");
const navToggle = document.querySelector("#nav-toggle");
const navOverlay = document.querySelector("#nav-overlay");
const navList = document.querySelector(".nav-list");
const authButton = document.querySelector("#auth-button");
const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authError = document.querySelector("#auth-error");
const authAccount = document.querySelector("#auth-account");
const authAccountText = document.querySelector("#auth-account-text");
const authProfileForm = document.querySelector("#auth-profile-form");
const authLogout = document.querySelector("#auth-logout");
const authTelegramField = document.querySelector("[data-auth-telegram]");

// Cache-busting token: index.html loads this module as `src/app.js?v=<version>`
// and the build stamps that value, so data and i18n fetches reuse it instead of
// carrying a second copy that drifts (it used to say gata-93 while index.html
// asked for gata-97).
const assetVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const referenceDataOptions = { version: assetVersion, inlineData: globalThis.__REFERENCE_DATA__ };

/** The bits of the frame that carry locale-dependent text. */
function applyLocaleChrome() {
  applyStaticI18n();
  updateAuthButton();
  setAuthMode(state.auth.mode);
  if (langToggle) {
    langToggle.textContent = getLocale() === "en" ? "RU" : "EN";
    langToggle.title = t("lang.toggleTitle");
  }
  if (generatedAt && state.data) {
    const dateLocale = getLocale() === "ru" ? "ru-RU" : "en-GB";
    generatedAt.textContent = `${t("footer.updated")} ${new Date(state.data.generatedAt).toLocaleDateString(dateLocale)}`;
  }
}

/**
 * Switch language without reloading: fetch that locale's content, then
 * re-render the current route. If the content cannot be loaded the locale goes
 * back to what it was, so the interface never disagrees with the data.
 */
async function switchLocale(nextLocale) {
  if (!isSupportedLocale(nextLocale) || nextLocale === getLocale()) return;
  const previous = getLocale();
  try {
    state.data = await loadReferenceData(nextLocale, referenceDataOptions);
  } catch (error) {
    console.error(error);
    return;
  }
  setLocale(nextLocale);
  state.locale = nextLocale;
  if (previous !== nextLocale) renderRoute();
}

function setAuthError(message = "") {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message;
}

async function loadAuthSession() {
  if (!authToken()) {
    state.auth.currentUser = null;
    updateAuthButton();
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/me");
    state.auth.currentUser = payload.user;
  } catch {
    setAuthToken("");
    state.auth.currentUser = null;
  }
  updateAuthButton();
  if (state.auth.currentUser) void loadGames();
}

function updateAuthButton() {
  if (!authButton) return;
  document.querySelectorAll("[data-admin-nav]").forEach((link) => {
    link.hidden = !state.auth.currentUser?.isAdmin;
  });
  if (state.auth.currentUser) {
    authButton.textContent = state.auth.currentUser.login;
    authButton.title = `${t("auth.signedInAs")} ${state.auth.currentUser.login}`;
  } else {
    authButton.textContent = t("auth.login");
    authButton.title = t("auth.loginOrCreate");
  }
}

function setAuthMode(mode) {
  state.auth.mode = mode;
  setAuthError("");
  const isAccount = mode === "account" && state.auth.currentUser;
  const isRegister = mode === "register";

  if (authTitle) {
    authTitle.textContent = isAccount ? t("auth.account") : isRegister ? t("auth.register") : t("auth.login");
  }
  if (authForm) {
    authForm.hidden = isAccount;
    authForm.reset();
  }
  if (authAccount) {
    authAccount.hidden = !isAccount;
  }
  if (authAccountText && state.auth.currentUser) {
    authAccountText.textContent = `${state.auth.currentUser.login} · ${state.auth.currentUser.telegram}`;
  }
  if (authProfileForm && state.auth.currentUser) {
    authProfileForm.elements.login.value = state.auth.currentUser.login;
    authProfileForm.elements.telegram.value = state.auth.currentUser.telegram;
    authProfileForm.elements.password.value = "";
  }
  if (authTelegramField) {
    const telegramInput = authTelegramField.querySelector("input");
    authTelegramField.hidden = !isRegister;
    telegramInput?.toggleAttribute("required", isRegister);
    telegramInput?.toggleAttribute("disabled", !isRegister);
    if (!isRegister && telegramInput) {
      telegramInput.value = "";
    }
  }
  if (authSubmit) {
    authSubmit.textContent = isRegister ? t("auth.register") : t("auth.login");
  }
  if (authSwitch) {
    authSwitch.textContent = isRegister ? t("auth.haveAccount") : t("auth.createAccount");
  }
}

function openAuthModal(mode = "login") {
  if (!authModal) return;
  authModal.hidden = false;
  document.body.classList.add("auth-open");
  setAuthMode(state.auth.currentUser && mode !== "register" ? "account" : mode);
  const form = state.auth.mode === "account" ? authProfileForm : authForm;
  form?.querySelector("input")?.focus();
}

function closeAuthModal() {
  if (!authModal) return;
  authModal.hidden = true;
  document.body.classList.remove("auth-open");
  setAuthError("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const data = new FormData(authForm);
  const login = String(data.get("login") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const telegram = String(data.get("telegram") ?? "").trim();

  if (login.length < 3) {
    setAuthError("Login must be at least 3 characters.");
    return;
  }
  if (password.length < 4) {
    setAuthError("Password must be at least 4 characters.");
    return;
  }

  try {
    const payload = state.auth.mode === "register"
      ? await apiRequest("/api/auth/register", {
        method: "POST",
        body: JSON.stringify({ login, password, telegram }),
      })
      : await apiRequest("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ login, password }),
      });

    setAuthToken(payload.token);
    state.auth.currentUser = payload.user;
    state.myTeams.loaded = false;
    state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
    state.season.loaded = false;
    updateAuthButton();
    void loadGames();
    closeAuthModal();
    renderRoute();
  } catch (error) {
    setAuthError(error.message);
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const data = new FormData(authProfileForm);
  const login = String(data.get("login") ?? "").trim();
  const telegram = String(data.get("telegram") ?? "").trim();
  const password = String(data.get("password") ?? "");

  if (login.length < 3) {
    setAuthError("Login must be at least 3 characters.");
    return;
  }
  if (!telegram) {
    setAuthError("Telegram contact is required.");
    return;
  }
  if (password && password.length < 4) {
    setAuthError("Password must be at least 4 characters.");
    return;
  }

  try {
    const payload = await apiRequest("/api/auth/profile", {
      method: "PATCH",
      body: JSON.stringify({ login, telegram, password }),
    });
    state.auth.currentUser = payload.user;
    updateAuthButton();
    setAuthMode("account");
    setAuthError("");
  } catch (error) {
    setAuthError(error.message);
  }
}

async function logoutAuth() {
  try {
    await apiRequest("/api/auth/logout", { method: "POST", body: "{}" });
  } catch {
    // Local logout should still happen if the API is unavailable.
  }
  setAuthToken("");
  state.auth.currentUser = null;
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  state.admin = { users: [], loaded: false, loading: false, error: "", editingTeams: new Map() };
  state.season = { data: null, loaded: false, loading: false, error: "" };
  updateAuthButton();
  closeAuthModal();
  renderRoute();
}

function setNavOpen(isOpen) {
  document.body.classList.toggle("nav-open", isOpen);
  navToggle?.setAttribute("aria-expanded", String(isOpen));
  navToggle?.setAttribute("aria-label", isOpen ? "Close menu" : "Open menu");
}

function findPageBySlug(slug) {
  return state.data.pages.find((page) => page.slug === slug)
    ?? state.data.pages.find((page) => page.slug.endsWith(`/${slug}`))
    ?? null;
}

function handleHistoryBack(event) {
  const trigger = event.target instanceof Element ? event.target.closest("[data-history-back]") : null;
  if (!trigger) return;
  event.preventDefault();
  const fallback = trigger.dataset.historyFallback || "#/";
  if (window.history.length > 1) {
    window.history.back();
  } else {
    location.hash = fallback;
  }
}

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

async function renderAdministration() {
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
    ${renderAdminImportUsersPanel()}
    ${renderAdminUsersTable(state.admin.users)}
  `;
  wireAdministration();
}

function renderAdminImportUsersPanel() {
  return `
    <article class="content-panel season-card admin-import-panel">
      <h2>${t("admin.importUsersHeading")}</h2>
      <p class="muted-text">${t("admin.importUsersNote")}</p>
      <div class="season-action-row admin-import-row">
        <label class="filter-field">
          <span>${t("admin.importUsersFileField")}</span>
          <input type="file" accept="application/json,.json,.team-import.json" data-admin-import-users-file>
        </label>
        <button class="primary-button" type="button" data-admin-import-users>${t("admin.importUsersAction")}</button>
      </div>
    </article>
  `;
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

async function renderAdminUserProfile(userId) {
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
    view.innerHTML = `
      ${renderHeader(`${t("admin.playerHeader")} "${payload.user.login}"`, t("admin.savedTeamsAndProfileSubtitle"), "", { back: true, backFallback: "#/administration" })}
      <div class="admin-profile-grid">
        ${renderAdminProfileCard(payload.user)}
        ${renderAdminUserManagementPanel(payload.user)}
        <section class="content-panel season-card">
          ${renderAdminCreateTeamForUserPanel(payload.user)}
        </section>
        <section class="content-panel season-card">
          <h2>${t("admin.savedTeamsHeader")}</h2>
          ${renderAdminSavedTeamsTable(payload.teams ?? [], payload.user)}
        </section>
      </div>
    `;
    wireAdminUserProfile(payload.user);
    wireTeamDeleteButtons(() => renderAdminUserProfile(userId));
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("nav.administration"), t("admin.playerProfileSubtitle"), "", { back: true, backFallback: "#/administration" })}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}

function renderAdminProfileCard(user) {
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
          <button class="filter-button danger-action" type="button" data-admin-delete-user ${isCurrentUser ? "disabled" : ""}>${t("admin.deleteUserAction")}</button>
        </div>
      </form>
      ${isCurrentUser ? `<p class="muted-text">${t("admin.cannotDeleteSelfNote")}</p>` : ""}
    </section>
  `;
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

function wireAdminUserProfile(user) {
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
      alert(t("admin.userUpdatedMessage"));
      renderAdminUserProfile(user.id);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-admin-delete-user]")?.addEventListener("click", async () => {
    if (!confirm(`${t("admin.deleteUserConfirm")} ${user.login}? ${t("admin.deleteUserCascadeWarning")}`)) return;
    try {
      await apiRequest(`/api/admin/users/${encodeURIComponent(user.id)}`, { method: "DELETE" });
      state.admin.loaded = false;
      location.hash = "#/administration";
    } catch (error) {
      alert(error.message);
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
      alert(error.message);
    }
  });
}

function renderAdminSavedTeamsTable(teams, owner = null) {
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
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${teams.map((team) => renderAdminSavedTeamRow(team, owner)).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderAdminSavedTeamRow(team, owner = null) {
  const teamOwner = owner ?? team.owner ?? null;
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
          <strong>${teamOwner ? renderPublicTeamLink(teamOwner, team) : escapeHtml(team.name)}</strong>
        </span>
      </td>
      <td>${rosterTeam ? `<a class="inline-rule-link" href="${pageUrl(rosterTeam)}">${escapeHtml(rosterTeam.title)}</a>` : escapeHtml(team.baseTeamSlug || "-")}</td>
      <td>${costs ? costs.totalPlayersCount : "-"}</td>
      <td>${costs ? `${costs.total}k` : "-"}</td>
      <td>${escapeHtml(updated)}</td>
      <td>
        ${state.auth.currentUser?.isAdmin && teamOwner ? `
          <div class="table-actions">
            <a class="primary-button compact-action" href="${adminTeamEditUrl(teamOwner, team)}">${t("common.edit")}</a>
            <button class="filter-button compact-action danger-action" type="button" data-delete-team="${escapeHtml(team.id)}" data-delete-team-owner="${escapeHtml(teamOwner.id || "")}" data-delete-team-name="${escapeHtml(team.name || "")}">${t("common.delete")}</button>
          </div>
        ` : `<span class="muted-text">-</span>`}
      </td>
    </tr>
  `;
}

async function renderPlayerProfile(userId) {
  setActiveNav("season");
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

async function renderPublicTeamProfile(userId, teamId) {
  setActiveNav("season");
  setViewSection("players");
  view.innerHTML = `
    ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
    <div class="loading">${t("myTeams.loadingTeam")}</div>
  `;

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"))}
      <div class="empty-state">${t("admin.loginToViewSavedTeams")}</div>
    `;
    return;
  }

  try {
    const payload = await apiRequest(`/api/players/${encodeURIComponent(userId)}/teams/${encodeURIComponent(teamId)}`);
    const draft = normalizeSavedRoster(payload.team);
    const team = state.data.teams.find((item) => item.slug === draft.teamSlug) ?? state.data.teams[0];
    ensureDraftLeagueChoice(team, draft);
    ensureDraftPlayers(team, draft);
    const costs = calculateRosterCosts(team, draft);
    const actions = `
      ${state.auth.currentUser?.isAdmin ? `<a class="primary-button" href="${adminTeamEditUrl(payload.user, payload.team)}">${t("admin.editTeamAction")}</a>` : ""}
    `;
    view.innerHTML = `
      ${renderHeader(`${t("sidebar.teamHeading")} "${payload.team.name}"`, `${t("admin.coachHeading")}: ${payload.user.login}`, actions, { back: true, backFallback: playerUrl(payload.user) })}
      ${renderPublicTeamOverview(payload.user, payload.team, team, draft, costs)}
      <section class="content-panel compact-table-panel">
        <h2>${t("savedRoster.rosterHeading")}</h2>
        ${renderPublicTeamRosterTable(team, draft)}
      </section>
    `;
  } catch (error) {
    view.innerHTML = `
      ${renderHeader(t("sidebar.teamHeading"), t("admin.savedRosterSubtitle"), "", { back: true, backFallback: playerUrl(userId) })}
      <div class="empty-state">${escapeHtml(error.message)}</div>
    `;
  }
}

function renderPublicTeamOverview(user, savedTeam, team, draft, costs) {
  const totalRerolls = countToNumber(draft.startingRerolls) + countToNumber(draft.teamRerolls);
  return `
    <section class="public-team-overview side-panel">
      ${draft.logoData ? `<div class="summary-logo-block public-team-logo-block"><img src="${escapeHtml(draft.logoData)}" alt=""></div>` : ""}
      <div class="public-team-overview-grid">
        <div class="public-team-summary-block">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${playerTeamUrl(user, savedTeam)}">${escapeHtml(savedTeam.name)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
            <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.teamRerolls")}</dt><dd>${totalRerolls}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
            <dt>${t("savedRoster.treasury")}</dt><dd>${countToNumber(draft.treasury)}k</dd>
            <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
          </dl>
        </div>
        <div class="public-team-coach-block">
          <h2>${t("admin.coachHeading")}</h2>
          <p>${renderPlayerLink(user)}</p>
          <div class="public-team-rules-wrap">
            ${renderTeamRuleAccess(team, draft)}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderPublicTeamRosterTable(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) return `<p>${t("savedRoster.noPlayersYet")}</p>`;
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="compact-roster-table public-roster-table">
        <thead>
          <tr>
            <th>#</th>
            <th>${t("roster.nameHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("admin.statusHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => `
            <tr>
              <td>${index + 1}</td>
              <td><strong>${escapeHtml(player.name)}</strong></td>
              <td>${escapeHtml(player.row.position)}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0))}</td>
              <td>${escapeHtml(statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0))}</td>
              <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
              <td>${playerCurrentCost(player.row, player, true)}k</td>
              <td>${escapeHtml(playerStatusText(player))}</td>
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function wireAdministration() {
  view.querySelector("[data-admin-refresh]")?.addEventListener("click", () => {
    state.admin.loaded = false;
    renderAdministration();
  });

  view.querySelector("[data-admin-import-users]")?.addEventListener("click", async (event) => {
    const button = event.currentTarget;
    const file = view.querySelector("[data-admin-import-users-file]")?.files?.[0];
    if (!file) {
      alert(t("admin.importUsersMissingFile"));
      return;
    }

    let payload = null;
    try {
      payload = JSON.parse(await file.text());
    } catch {
      alert(t("admin.importUsersInvalidFile"));
      return;
    }

    button.disabled = true;
    button.textContent = t("common.saving");
    try {
      const result = await apiRequest("/api/admin/import-users", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      state.admin.loaded = false;
      await renderAdministration();
      alert(t("admin.importUsersSuccess").replace("{count}", String(result.imported?.length ?? 0)));
    } catch (error) {
      button.disabled = false;
      button.textContent = t("admin.importUsersAction");
      alert(error.message);
    }
  });
}

function gameOpponent(game) {
  return game.viewerIsHome ? game.away : game.home;
}

let gamesLoadPromise = null;

async function loadGames(force = false) {
  if (!state.auth.currentUser) return;
  if (state.games.loaded && !force) return;
  if (gamesLoadPromise && !force) return gamesLoadPromise;
  state.games.loading = true;
  gamesLoadPromise = (async () => {
    try {
      const payload = await apiRequest("/api/games");
      state.games = { items: payload.games ?? [], currentItems: payload.currentGames ?? [], loaded: true, loading: false, error: "" };
    } catch (error) {
      state.games = { items: [], currentItems: [], loaded: true, loading: false, error: error.message };
    } finally {
      gamesLoadPromise = null;
    }
  })();
  return gamesLoadPromise;
}

function renderGameCard(game) {
  const opponent = gameOpponent(game);
  const resultSubmitted = isGameResultSubmitted(game);
  return `
    <a class="card compact game-card" href="${gameUrl(game)}">
      <span class="season-status-pill" data-status="${escapeHtml(game.resultStatus)}">${escapeHtml(gameStatusLabel(game.resultStatus))}</span>
      <h3>${escapeHtml(game.season.name)} · ${t("season.roundLabel")} ${game.roundNumber}</h3>
      <p>${t("games.vsLabel")} <strong>${escapeHtml(opponent?.team?.name || t("season.byeLabel"))}</strong>${opponent ? ` · ${escapeHtml(opponent.user.login)}` : ""}</p>
      ${resultSubmitted ? `<p>${t("season.touchdownsLabel")}: ${escapeHtml(pairingTouchdowns(game))} · ${t("season.casualtiesHeader")}: ${escapeHtml(pairingCasualties(game))}</p>` : ""}
    </a>
  `;
}

function isGameResultSubmitted(game) {
  return game?.resultStatus === "confirmed"
    && game.homeTouchdowns !== null
    && game.homeTouchdowns !== undefined
    && game.awayTouchdowns !== null
    && game.awayTouchdowns !== undefined
    && game.homeCasualties !== null
    && game.homeCasualties !== undefined
    && game.awayCasualties !== null
    && game.awayCasualties !== undefined;
}

function isCurrentPlayerRoundGame(game) {
  return game?.roundStatus === "started"
    && Number(game?.roundNumber ?? 0) === Number(game?.season?.currentRound ?? 0);
}

function isGameClosedForPlayers(game) {
  return game?.roundStatus === "completed"
    || (game?.roundStatus === "started" && Number(game?.roundNumber ?? 0) < Number(game?.season?.currentRound ?? 0));
}

async function renderMyGames() {
  setActiveNav("my-games");
  setViewSection("my-games");
  if (!state.auth.currentUser) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="empty-state">${t("games.loginRequired")}</div>`;
    return;
  }
  if (!state.games.loaded) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="loading">${t("games.loading")}</div>`;
  }
  await loadGames();
  if (state.games.error) {
    view.innerHTML = `${renderHeader(t("nav.myGames"), t("games.subtitle"))}<div class="empty-state">${escapeHtml(state.games.error)}</div>`;
    return;
  }
  const nextGames = state.games.items.filter((game) => !isGameResultSubmitted(game) && isCurrentPlayerRoundGame(game));
  const history = state.games.items.filter((game) => isGameResultSubmitted(game) || isGameClosedForPlayers(game));
  view.innerHTML = `
    ${renderHeader(t("nav.myGames"), t("games.subtitle"))}
    <section class="content-panel season-card"><h2>${t("games.nextGameHeading")}</h2>
      ${nextGames.length ? `<div class="card-grid games-grid">${nextGames.map(renderGameCard).join("")}</div>` : `<p>${t("games.noNextGame")}</p>`}
    </section>
    <section class="content-panel season-card"><h2>${t("games.historyHeading")}</h2>
      ${history.length ? `<div class="card-grid games-grid">${history.map(renderGameCard).join("")}</div>` : `<p>${t("games.noHistory")}</p>`}
    </section>`;
}

function renderGameScore(game, proposed = false) {
  const prefix = proposed ? "proposed" : "";
  const value = (name) => game[`${prefix}${prefix ? name[0].toUpperCase() + name.slice(1) : name}`];
  return `${t("season.touchdownsLabel")}: ${value("homeTouchdowns") ?? "-"} / ${value("awayTouchdowns") ?? "-"} · ${t("season.casualtiesHeader")}: ${value("homeCasualties") ?? "-"} / ${value("awayCasualties") ?? "-"}`;
}

function renderGameProposalForm(game) {
  const value = (confirmedKey, proposedKey) => game[proposedKey] ?? game[confirmedKey] ?? "";
  return `
    <form class="game-result-form fixture-result-form" data-game-proposal>
      <label class="filter-field"><span>${t("season.homeTouchdownsField")}</span><input name="homeTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("homeTouchdowns", "proposedHomeTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.awayTouchdownsField")}</span><input name="awayTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("awayTouchdowns", "proposedAwayTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.homeCasualtiesField")}</span><input name="homeCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("homeCasualties", "proposedHomeCasualties"))}"></label>
      <label class="filter-field"><span>${t("season.awayCasualtiesField")}</span><input name="awayCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("awayCasualties", "proposedAwayCasualties"))}"></label>
      <button class="primary-button" type="submit">${t("games.requestConfirmationAction")}</button>
    </form>`;
}

function renderAdminGameResultForm(game) {
  const value = (confirmedKey, proposedKey) => game[confirmedKey] ?? game[proposedKey] ?? "";
  return `
    <form class="game-result-form fixture-result-form notice-box" data-admin-game-result>
      <strong>${t("games.adminEditHeading")}</strong>
      <label class="filter-field"><span>${t("season.homeTouchdownsField")}</span><input name="homeTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("homeTouchdowns", "proposedHomeTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.awayTouchdownsField")}</span><input name="awayTouchdowns" type="number" min="0" step="1" required value="${escapeHtml(value("awayTouchdowns", "proposedAwayTouchdowns"))}"></label>
      <label class="filter-field"><span>${t("season.homeCasualtiesField")}</span><input name="homeCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("homeCasualties", "proposedHomeCasualties"))}"></label>
      <label class="filter-field"><span>${t("season.awayCasualtiesField")}</span><input name="awayCasualties" type="number" min="0" step="1" required value="${escapeHtml(value("awayCasualties", "proposedAwayCasualties"))}"></label>
      <button class="primary-button" type="submit">${t("games.adminSaveResultAction")}</button>
    </form>`;
}

async function renderGamePage(gameId) {
  setActiveNav("my-games");
  setViewSection("my-games");
  if (!state.auth.currentUser) {
    view.innerHTML = `${renderHeader(t("games.gameHeading"), t("games.subtitle"))}<div class="empty-state">${t("games.loginRequired")}</div>`;
    return;
  }
  try {
    const { game } = await apiRequest(`/api/games/${encodeURIComponent(gameId)}`);
    const isAdmin = Boolean(state.auth.currentUser?.isAdmin);
    const resultSubmitted = isGameResultSubmitted(game);
    const playerLocked = !isAdmin && isGameClosedForPlayers(game);
    const awaitingConfirmation = game.resultStatus === "awaiting_confirmation";
    const playerResultForm = !isAdmin && !resultSubmitted && !playerLocked ? renderGameProposalForm(game) : "";
    const confirmationBox = awaitingConfirmation && !resultSubmitted && !playerLocked
      ? `<div class="notice-box"><strong>${t("games.confirmRequestHeading")}</strong><p>${escapeHtml(renderGameScore(game, true))}</p><div class="game-confirm-actions"><button class="primary-button" data-game-confirm>${t("games.confirmAction")}</button><button class="filter-button danger-action" data-game-reject>${t("games.rejectAction")}</button></div></div>`
      : "";
    const lockedNotice = playerLocked && !resultSubmitted ? `<p class="notice-box">${t("games.roundClosed")}</p>` : "";
    const actions = resultSubmitted
      ? `<p class="notice-box">${escapeHtml(renderGameScore(game))}</p>`
      : `${lockedNotice}${confirmationBox}${playerResultForm}`;
    view.innerHTML = `
      ${renderHeader(t("games.gameHeading"), `${game.season.name} · ${t("season.roundLabel")} ${game.roundNumber}`, "", { back: true, backFallback: "#/my-games" })}
      <section class="content-panel game-page"><div class="game-versus"><div><span>${t("season.homeLabel")}</span><h2>${escapeHtml(game.home?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.home?.team?.name || "-")}</p>${game.home?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.home.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div><strong>VS</strong><div><span>${t("season.awayLabel")}</span><h2>${escapeHtml(game.away?.user?.login || "-")}</h2><p class="game-team-name">${escapeHtml(game.away?.team?.name || "-")}</p>${game.away?.team?.logoUrl ? `<img class="game-team-logo" src="${escapeHtml(game.away.team.logoUrl)}" alt="" loading="lazy" decoding="async">` : ""}</div></div>${actions}${isAdmin ? renderAdminGameResultForm(game) : ""}</section>`;
    wireGamePage(game);
  } catch (error) {
    view.innerHTML = `${renderHeader(t("games.gameHeading"), t("games.subtitle"), "", { back: true, backFallback: "#/my-games" })}<div class="empty-state">${escapeHtml(error.message)}</div>`;
  }
}

function wireGamePage(game) {
  view.querySelector("[data-admin-game-result]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { await apiRequest(`/api/games/${game.id}`, { method: "PATCH", body: JSON.stringify(form) }); state.games.loaded = false; renderGamePage(game.id); } catch (error) { alert(error.message); }
  });
  view.querySelector("[data-game-proposal]")?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    try { await apiRequest(`/api/games/${game.id}/propose`, { method: "POST", body: JSON.stringify(form) }); renderGamePage(game.id); } catch (error) { alert(error.message); }
  });
  for (const [selector, action] of [["[data-game-confirm]", "confirm"], ["[data-game-reject]", "reject"]]) {
    view.querySelector(selector)?.addEventListener("click", async () => {
      try { await apiRequest(`/api/games/${game.id}/${action}`, { method: "POST", body: "{}" }); state.games.loaded = false; renderGamePage(game.id); } catch (error) { alert(error.message); }
    });
  }
}

/** Domain violations rendered in the current locale. */

/**
 * One screen per route name. `matchRoute` decides which; this decides what to
 * draw. Keeping the two apart is what makes the routing table testable — see
 * test/routes.test.mjs.
 */
const screens = {
  home: () => renderHome(),
  overview: ({ slug }) => renderOverviewDetail(slug),
  section: ({ route }) => renderSection(route),
  builder: () => renderBuilder(),
  savedRoster: ({ teamId }) => renderSavedRoster(teamId),
  myTeams: () => renderMyTeams(),
  game: ({ gameId }) => renderGamePage(gameId),
  myGames: () => renderMyGames(),
  season: ({ tab }) => renderSeason(true, tab),
  adminTeamEdit: ({ ownerId, teamId }) => renderSavedRoster(teamId, true, { adminOwnerId: ownerId }),
  adminUserProfile: ({ userId }) => renderAdminUserProfile(userId),
  administration: () => renderAdministration(),
  publicTeam: ({ userId, teamId }) => renderPublicTeamProfile(userId, teamId),
  playerProfile: ({ userId }) => renderPlayerProfile(userId),
  legal: () => renderLegal(),
  page: ({ slug }) => {
    const page = findPageBySlug(slug);
    return page ? renderDetail(page) : renderNotFound();
  },
};

function renderNotFound() {
  setActiveNav("home");
  setViewSection("home");
  view.innerHTML = `<div class="empty-state">${t("app.pageNotFound")}</div>`;
}

function renderRoute() {
  // Each screen sets its own nav highlight on the way in. core/routes.mjs also
  // exports routeSection(), which derives the same thing from the route alone —
  // the two disagree today (a player profile highlights "season"), so switching
  // to it is a visible change and belongs in its own commit, not this one.
  const { name, params } = matchRoute(routeFromHash(location.hash));
  return screens[name](params);
}

async function init() {
  setOnUnauthorized(updateAuthButton);
  initTheme();
  state.locale = initLocale(storedLocale());
  await loadTranslations(assetVersion);
  state.data = await loadReferenceData(state.locale, referenceDataOptions);
  await loadAuthSession();
  applyLocaleChrome();
  if (searchInput) {
    searchInput.addEventListener("input", (event) => {
      state.query = event.currentTarget.value;
      renderRoute();
    });
  }
  view.addEventListener("click", handleHistoryBack);
  navToggle?.addEventListener("click", () => {
    setNavOpen(!document.body.classList.contains("nav-open"));
  });
  navOverlay?.addEventListener("click", () => setNavOpen(false));
  navList?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) {
      setNavOpen(false);
    }
  });
  authButton?.addEventListener("click", () => openAuthModal());
  authModal?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("[data-auth-close]")) {
      closeAuthModal();
    }
  });
  authForm?.addEventListener("submit", handleAuthSubmit);
  authProfileForm?.addEventListener("submit", handleProfileSubmit);
  authSwitch?.addEventListener("click", () => {
    setAuthMode(state.auth.mode === "register" ? "login" : "register");
  });
  authLogout?.addEventListener("click", logoutAuth);
  window.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      setNavOpen(false);
      closeAuthModal();
    }
  });
  window.addEventListener("resize", () => {
    if (window.innerWidth > 900) {
      setNavOpen(false);
    }
  });
  window.addEventListener("beforeunload", (event) => {
    // Autosave debounces, so closing the tab a moment after the last keystroke
    // used to drop it without a word.
    if (!rosterStore.hasPendingChanges()) return;
    event.preventDefault();
    event.returnValue = "";
  });
  langToggle?.addEventListener("click", () => {
    switchLocale(state.locale === "en" ? "ru" : "en");
  });
  window.addEventListener("hashchange", renderRoute);
  renderRoute();
}

init().catch((error) => {
  console.error(error);
  view.innerHTML = `<div class="empty-state">${t("app.dataLoadError")}</div>`;
});
