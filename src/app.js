import {
  advancementRanks,
  advancementStatCosts,
  advancementTypeLabels,
  builderStaffCosts,
  builderStaffMaximums,
  eliteSkillCombos,
  favouredAlignments,
  medicalStaffDefinitions,
  skillAccessMap,
  specialRuleNames,
  sppCounterDefinitions,
} from "./domain/league-rules.mjs";
import {
  categoriesForAccess,
  clamp,
  costToNumber,
  countToNumber,
  makeRosterPlayerId,
  parseAccessCodes,
  rosterMax,
  rowCost,
  rowsForTeam,
  statValueForDisplayByStat,
} from "./domain/roster/values.mjs";
import {
  availableMedicalStaffDefinitions,
  canHireMedicalStaff,
  favouredAlignmentName,
  favouredSkillsForChoice,
  hasBribery,
  leagueAccessDisplayByKey,
  leagueOrder,
  ruleLookupKey,
  specialRuleDisplayByKey,
  specialRuleMatchKey,
  specialRuleOrder,
  teamApothecaryAccess,
  teamFavouredOptions,
  teamHasFavouredOf,
  teamHasSpecialRule,
  teamLeagueOptions,
  teamSpecialRuleTokens,
  uniqueCanonical,
} from "./domain/roster/team-rules.mjs";
import {
  baseSkillsForPlayer,
  canAddRowToDraft,
  ensureDraftPlayers,
  makeRosterPlayer,
  normalizeExtraSkill,
  normalizeFavouredSkill,
  normalizePlayerAdvancements,
  normalizePlayerExtraSkills,
  normalizePlayerFavouredSkills,
  normalizePurchasedStaff,
  normalizeRosterPlayer,
  normalizeSppCounters,
  rosterPlayerView,
  rowCountInPlayers,
  selectedRosterPlayers,
  setRosterCaptain,
  skillNamesForPlayer,
  syncRosterCountsFromPlayers,
} from "./domain/roster/players.mjs";
import {
  canTakeAdvancement,
  playerAdvancementLevel,
  playerAdvancementSpent,
  playerAvailableSpp,
  playerLevelRank,
  playerSppTotal,
  rosterTotalSpp,
} from "./domain/roster/progression.mjs";
import {
  applyPaidStaffChange,
  calculateRosterCosts,
  eliteComboCost,
  markStaffPurchased,
  playerAdjustmentCost,
  playerCurrentCost,
  refundTreasury,
  skillModCost,
  spendTreasury,
  staffItemCost,
  statModCost,
  syncMedicalStaffForTeam,
} from "./domain/roster/costs.mjs";
import { validateRoster } from "./domain/roster/validate.mjs";
import { SAVE_STATUS, createRosterStore } from "./data/roster-store.mjs";
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
import { createApiClient } from "./core/api.mjs";
import { renderRosterNotices, wireRosterNotices } from "./components/roster-notices.mjs";
import { createBuilderDraftStore, isEmptyBuilderDraft } from "./data/builder-draft.mjs";
import { startingBudget } from "./domain/league-rules.mjs";
import { state } from "./core/state.mjs";
import { view } from "./core/view.mjs";
import { renderHeader, setActiveNav, setViewSection } from "./components/page-chrome.mjs";
import { renderRosterLinks, renderRuleLinks, uniqueSorted } from "./components/content-links.mjs";
import { renderHome } from "./screens/home.mjs";
import { renderOverviewDetail } from "./screens/overview.mjs";
import { renderSection } from "./screens/section.mjs";
import { renderDetail, renderRosterStatGrid } from "./screens/detail.mjs";
import { renderLegal } from "./screens/legal.mjs";

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

const authTokenKey = "gata-league-auth-token";
// Cache-busting token: index.html loads this module as `src/app.js?v=<version>`
// and the build stamps that value, so data and i18n fetches reuse it instead of
// carrying a second copy that drifts (it used to say gata-93 while index.html
// asked for gata-97).
const assetVersion = new URL(import.meta.url).searchParams.get("v") || "dev";
const referenceDataOptions = { version: assetVersion, inlineData: globalThis.__REFERENCE_DATA__ };
const logoUploadMaxBytes = 2 * 1024 * 1024;
const logoOptimizeMaxDimension = 512;
const logoOptimizeQuality = 0.82;
const logoOptimizeSkipLength = 160_000;
const logoOptimizationCache = new Map();
const autosaveDelayMs = 450;

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

function authToken() {
  return localStorage.getItem(authTokenKey) || "";
}

function setAuthToken(token = "") {
  if (token) {
    localStorage.setItem(authTokenKey, token);
  } else {
    localStorage.removeItem(authTokenKey);
  }
}

const apiClient = createApiClient({
  getToken: authToken,
  onUnauthorized: () => {
    // The session died under us. Say so once, instead of letting every screen
    // report its own mystery failure.
    if (!state.auth.currentUser) return;
    state.auth.currentUser = null;
    setAuthToken("");
    updateAuthButton();
  },
});

/** Errors from here carry a `kind`; see src/core/api.mjs. */
async function apiRequest(path, options = {}) {
  return apiClient.request(path, options);
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
  state.season = { data: null, loaded: false, loading: false, error: "", activeTab: "registration" };
  updateAuthButton();
  closeAuthModal();
  renderRoute();
}

function renderPlayerLink(user) {
  if (!user?.id) return `<span class="muted-text">-</span>`;
  return `<a class="inline-rule-link" href="${playerUrl(user)}">${escapeHtml(user.login || t("admin.playerHeader"))}</a>`;
}

function renderPublicTeamLink(user, team) {
  if (!user?.id || !team?.id) return `<span class="muted-text">${escapeHtml(team?.name || "-")}</span>`;
  return `<a class="inline-rule-link" href="${playerTeamUrl(user, team)}">${escapeHtml(team.name || t("sidebar.teamHeading"))}</a>`;
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

function isSavedRosterPlayerExpanded(playerId) {
  return state.savedRosterUi.expandedPlayers.has(playerId);
}

function setSavedRosterPlayerExpanded(playerId, expanded) {
  if (!playerId) return;
  if (expanded) {
    state.savedRosterUi.expandedPlayers.add(playerId);
  } else {
    state.savedRosterUi.expandedPlayers.delete(playerId);
  }
}

function emptyBuilderState(team = null) {
  return {
    editingTeamId: "",
    teamSlug: team?.slug ?? "",
    teamName: team?.title ?? "",
    favouredChoice: "",
    logoData: "",
    players: [],
    roster: {},
    teamRerolls: 0,
    startingRerolls: 0,
    bribes: 0,
    dedicatedFans: 0,
    assistantCoaches: 0,
    cheerleaders: 0,
    apothecary: 0,
    mortuaryAssistant: 0,
    plagueDoctor: 0,
    purchasedStaff: {},
    treasury: 0,
    coachesSafe: 0,
  };
}

function resetBuilderForTeam(team) {
  state.builder = emptyBuilderState(team);
}

function builderPayload(team) {
  return {
    editingTeamId: state.builder.editingTeamId,
    teamSlug: team.slug,
    teamName: state.builder.teamName || team.title,
    selectedLeague: state.builder.selectedLeague || "",
    favouredChoice: state.builder.favouredChoice || "",
    logoData: state.builder.logoData || "",
    players: state.builder.players,
    roster: state.builder.roster,
    teamRerolls: state.builder.teamRerolls,
    startingRerolls: state.builder.startingRerolls,
    bribes: state.builder.bribes,
    dedicatedFans: state.builder.dedicatedFans,
    assistantCoaches: state.builder.assistantCoaches,
    cheerleaders: state.builder.cheerleaders,
    apothecary: state.builder.apothecary,
    mortuaryAssistant: state.builder.mortuaryAssistant,
    plagueDoctor: state.builder.plagueDoctor,
    purchasedStaff: state.builder.purchasedStaff ?? {},
    treasury: state.builder.treasury,
    coachesSafe: state.builder.coachesSafe,
  };
}

function normalizeSavedRoster(savedTeam) {
  const roster = savedTeam.roster ?? {};
  const draft = {
    ...emptyBuilderState(),
    editingTeamId: savedTeam.id,
    teamSlug: savedTeam.baseTeamSlug || roster.teamSlug || "",
    teamName: savedTeam.name || roster.teamName || "",
    selectedLeague: String(roster.selectedLeague ?? ""),
    favouredChoice: String(roster.favouredChoice ?? ""),
    logoData: savedTeam.logoData || roster.logoData || "",
    players: Array.isArray(roster.players) ? roster.players : [],
    roster: roster.roster ?? {},
    teamRerolls: countToNumber(roster.teamRerolls ?? 0),
    startingRerolls: countToNumber(roster.startingRerolls ?? roster.rerolls ?? 0),
    bribes: countToNumber(roster.bribes ?? 0),
    dedicatedFans: countToNumber(roster.dedicatedFans ?? 0),
    assistantCoaches: countToNumber(roster.assistantCoaches ?? 0),
    cheerleaders: countToNumber(roster.cheerleaders ?? 0),
    apothecary: countToNumber(roster.apothecary ?? 0),
    mortuaryAssistant: countToNumber(roster.mortuaryAssistant ?? 0),
    plagueDoctor: countToNumber(roster.plagueDoctor ?? 0),
    purchasedStaff: normalizePurchasedStaff(roster),
    treasury: countToNumber(roster.treasury ?? 0),
    coachesSafe: countToNumber(roster.coachesSafe ?? 0),
  };
  savedTeam.roster = draft;
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  return draft;
}

function updateSavedRosterFields(savedTeam, draft) {
  savedTeam.name = draft.teamName;
  savedTeam.logoData = draft.logoData;
  savedTeam.baseTeamSlug = draft.teamSlug;
  savedTeam.roster = draft;
}

function playerStatusText(player) {
  const statuses = [];
  if (player.isCaptain) statuses.push(t("roster.captain"));
  if (player.skipNextGame) statuses.push(t("admin.skipNextGameStatus"));
  if (player.niglingInjury) statuses.push(t("roster.niglingInjury"));
  return statuses.join(", ") || "-";
}

function availableSkillOptionsForPlayer(row, player) {
  const base = new Set(skillNamesForPlayer(row, player));
  const primaryCategories = categoriesForAccess(row.primary ?? []);
  const secondaryCategories = categoriesForAccess(row.secondary ?? []);
  const options = [];

  (state.data.skillGroups ?? []).forEach((group) => {
    const access = primaryCategories.includes(group.category)
      ? "primary"
      : secondaryCategories.includes(group.category)
        ? "secondary"
        : "";
    if (!access) return;
    (group.skills ?? []).forEach((name) => {
      if (!base.has(name)) options.push({ name, access, category: group.category });
    });
  });

  return options.sort((a, b) => a.name.localeCompare(b.name, "en"));
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

function ensureDraftLeagueChoice(team, draft) {
  const options = teamLeagueOptions(team);
  if (!options.length) {
    draft.selectedLeague = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.selectedLeague));
  draft.selectedLeague = current ?? options[0];
  return draft.selectedLeague;
}

function ensureDraftFavouredChoice(team, draft) {
  const options = teamFavouredOptions(team);
  if (!options.length) {
    draft.favouredChoice = "";
    return "";
  }
  const current = options.find((option) => ruleLookupKey(option) === ruleLookupKey(draft.favouredChoice));
  draft.favouredChoice = current ?? options[0];
  return draft.favouredChoice;
}

function favouredSkillOptionsForPlayer(team, draft, row, player) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return [];
  const taken = new Set(skillNamesForPlayer(row, player));
  return favouredSkillsForChoice(choice)
    .filter((name) => !taken.has(name))
    .map((name) => ({ name, access: "favoured", alignment: choice }));
}

function sanitizeFavouredSkillsForTeam(team, draft) {
  const choice = ensureDraftFavouredChoice(team, draft);
  const allowed = new Set(favouredSkillsForChoice(choice));
  (draft.players ?? []).forEach((player) => {
    const row = rowsForTeam(team)[player.rowIndex];
    if (!row) return;
    const regularSkills = new Set([
      ...(row.skills ?? []),
      ...normalizePlayerExtraSkills(row, player.extraSkills ?? []).map((skill) => skill.name),
    ]);
    player.favouredSkills = normalizePlayerFavouredSkills(row, player.favouredSkills ?? [])
      .filter((skill) => allowed.has(skill.name) && !regularSkills.has(skill.name));
  });
}

function renderTeamRuleAccess(team, draft, controlName = "") {
  const leagueOptions = teamLeagueOptions(team);
  const selectedLeague = ensureDraftLeagueChoice(team, draft);
  const favouredOptions = teamFavouredOptions(team);
  const selectedFavoured = ensureDraftFavouredChoice(team, draft);
  const specialRules = teamSpecialRuleTokens(team);
  return `
    <section class="team-rules-panel">
      <div class="team-rules-row">
        <span>${t("roster.tier")}</span>
        <strong>${escapeHtml(team.team?.meta?.league ?? "-")}</strong>
      </div>
      <div class="team-rules-row">
        <span>${t("roster.leagueAccess")}</span>
        ${leagueOptions.length > 1 ? `
          <select ${controlName ? `data-${controlName}-league` : ""}>
            ${leagueOptions.map((option) => renderOption(option, option, selectedLeague)).join("")}
          </select>
        ` : `<div class="rule-link-list">${renderRuleLinks(leagueOptions)}</div>`}
      </div>
      <div class="team-rules-row team-rules-row-wide">
        <span>${t("roster.specialRules")}</span>
        <div class="rule-link-list">${renderRuleLinks(specialRules)}</div>
      </div>
      ${favouredOptions.length ? `
        <div class="team-rules-row">
          <span>${t("roster.favouredOf")}</span>
          ${favouredOptions.length > 1 ? `
            <select ${controlName ? `data-${controlName}-favoured` : ""}>
              ${favouredOptions.map((option) => renderOption(option, option, selectedFavoured)).join("")}
            </select>
          ` : `<strong>${escapeHtml(selectedFavoured)}</strong>`}
        </div>
      ` : ""}
    </section>
  `;
}

async function loadMyTeams(force = false) {
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
    state.myTeams.error = error.message;
  } finally {
    state.myTeams.loading = false;
  }
}

async function renderMyTeams() {
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

async function deleteSavedTeam(teamId, options = {}) {
  if (!teamId) return false;
  const teamName = options.teamName ? ` "${options.teamName}"` : "";
  if (!confirm(`${t("savedRoster.deleteTeamConfirm")}${teamName}?`)) return false;
  await apiRequest(options.endpoint || deleteTeamEndpoint(teamId, options.ownerId), { method: "DELETE" });
  state.myTeams.loaded = false;
  state.season.loaded = false;
  state.games.loaded = false;
  state.admin.loaded = false;
  state.admin.editingTeams?.delete(teamId);
  return true;
}

function wireTeamDeleteButtons(afterDelete) {
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
        alert(error.message);
      }
    });
  });
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

function gameStatusLabel(status) {
  return t(`games.status.${status || "pending"}`);
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

async function loadSeason(force = false) {
  if (!state.auth.currentUser) {
    state.season = { ...state.season, data: null, loaded: true, loading: false, error: "" };
    return;
  }
  if (state.season.loaded && !force) return;
  state.season.loading = true;
  state.season.error = "";
  try {
    state.season.data = await apiRequest("/api/season");
    state.season.loaded = true;
  } catch (error) {
    state.season.error = error.message;
  } finally {
    state.season.loading = false;
  }
}

function seasonEntryLabel(entry) {
  if (!entry) return "-";
  return `${entry.user.login} · ${entry.team.name}`;
}

function seasonTeamRulesLink(entry) {
  const team = state.data.teams.find((item) => item.slug === entry?.team?.baseTeamSlug);
  return team
    ? `<a class="inline-rule-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>`
    : escapeHtml(entry?.team?.baseTeamSlug || "-");
}

function seasonTeamProfileLink(entry) {
  return entry ? renderPublicTeamLink(entry.user, entry.team) : `<span class="muted-text">-</span>`;
}

function makeSeasonStarterRoster(team, name) {
  const draft = emptyBuilderState(team);
  draft.teamName = name || team.title;
  draft.selectedLeague = teamLeagueOptions(team)[0] ?? "";
  return draft;
}

const seasonTabDefinitions = [
  { id: "registration", labelKey: "season.tab.registration" },
  { id: "fixture", labelKey: "season.tab.fixture" },
  { id: "standings", labelKey: "season.tab.standings" },
  { id: "schedule", labelKey: "season.tab.schedule" },
  { id: "administration", labelKey: "nav.administration", adminOnly: true },
];

function availableSeasonTabs() {
  return seasonTabDefinitions.filter((tab) => !tab.adminOnly || state.auth.currentUser?.isAdmin);
}

function normalizeSeasonTab(tabId = "") {
  const tabs = availableSeasonTabs();
  return tabs.some((tab) => tab.id === tabId) ? tabId : tabs[0]?.id ?? "registration";
}

function renderSeasonTabs(activeTab) {
  return `
    <div class="season-tabs" role="tablist" aria-label="${t("season.sectionsAriaLabel")}">
      ${availableSeasonTabs().map((tab) => `
        <button
          class="season-tab ${tab.id === activeTab ? "active" : ""}"
          type="button"
          role="tab"
          aria-selected="${tab.id === activeTab ? "true" : "false"}"
          data-season-tab="${escapeHtml(tab.id)}"
        >${t(tab.labelKey)}</button>
      `).join("")}
    </div>
  `;
}

function renderSeasonTabContent(data, activeTab) {
  if (activeTab === "fixture") return renderLeagueFixture(data);
  if (activeTab === "standings") return renderSeasonStandings(data);
  if (activeTab === "schedule") return renderSeasonRounds(data);
  if (activeTab === "administration" && state.auth.currentUser?.isAdmin) return renderSeasonAdmin(data);
  return renderSeasonRegistration(data);
}

async function renderSeason(refresh = true) {
  setActiveNav("season");
  setViewSection("season");
  view.innerHTML = `
    ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    <div class="loading">${t("season.loading")}</div>
  `;

  await loadSeason(refresh);

  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"))}
      <div class="empty-state">${t("season.loginToCommit")}</div>
    `;
    return;
  }

  if (state.season.error) {
    view.innerHTML = `
      ${renderHeader(t("nav.season"), t("season.subtitle"), `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
      <div class="empty-state">${escapeHtml(state.season.error)}</div>
    `;
    wireSeason();
    return;
  }

  const data = state.season.data ?? {};
  const activeTab = normalizeSeasonTab(state.season.activeTab);
  state.season.activeTab = activeTab;
  view.innerHTML = `
    ${renderHeader(t("nav.season"), `${data.season?.name ?? t("season.defaultName")} · ${t("season.swissPairingControl")}`, `<button class="primary-button" type="button" data-season-refresh>${t("admin.refresh")}</button>`)}
    ${renderSeasonTabs(activeTab)}
    ${renderSeasonTabContent(data, activeTab)}
  `;
  wireSeason();
}

function renderSeasonRegistration(data) {
  return `
    <div class="season-registration-layout">
      <div class="season-registration-top">
        ${renderSeasonCommitPanel(data)}
        ${state.auth.currentUser?.isAdmin ? renderSeasonRegistrationAdminPanel(data) : ""}
      </div>
      <section class="content-panel season-card season-registered-panel">
        <h2>${t("season.registeredTeamsHeading")}</h2>
        ${renderSeasonEntriesTable(data, Boolean(state.auth.currentUser?.isAdmin))}
      </section>
    </div>
  `;
}

function availableSeasonSavedTeams(data) {
  const admin = data.admin ?? { savedTeams: [] };
  const committedTeamIds = new Set((data.entries ?? []).map((entry) => entry.team.id));
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  return admin.savedTeams.filter((team) => !committedTeamIds.has(team.id) && !committedUserIds.has(team.owner.id));
}

function renderSeasonRegistrationAdminPanel(data) {
  const availableSavedTeams = availableSeasonSavedTeams(data);
  return `
    <section class="content-panel season-card">
      <h2>${t("season.adminRegistrationHeading")}</h2>
      ${availableSavedTeams.length ? `
        <p>${t("season.addSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-admin-team>
              ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
        </div>
      ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
    </section>
  `;
}

function renderSeasonCommitPanel(data) {
  const myEntry = data.myEntry;
  const teams = data.myTeams ?? [];
  if (myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.yourTeamHeading")}</h2>
        <div class="season-committed-team">
          ${myEntry.team.logoData ? `<img src="${escapeHtml(myEntry.team.logoData)}" alt="">` : ""}
          <div>
            <strong>${escapeHtml(myEntry.team.name)}</strong>
            <p>${seasonTeamRulesLink(myEntry)}</p>
            <p class="muted-text">${t("season.committedAs")} ${escapeHtml(myEntry.user.login)}.</p>
          </div>
        </div>
      </section>
    `;
  }

  return `
    <section class="content-panel season-card">
      <h2>${t("season.commitTeamHeading")}</h2>
      ${teams.length ? `
        <p>${t("season.selectSavedTeamNote")}</p>
        <div class="season-action-row">
          <label class="filter-field">
            <span>${t("season.savedTeamField")}</span>
            <select data-season-commit-team>
              ${teams.map((team) => renderOption(team.id, team.name, "")).join("")}
            </select>
          </label>
          <button class="primary-button" type="button" data-season-commit>${t("season.commitAction")}</button>
        </div>
      ` : `
        <p>${t("myTeams.noSavedTeams")}</p>
        <a class="primary-button" href="#/builder">${t("myTeams.createTeam")}</a>
      `}
    </section>
  `;
}

function pairingEntry(data, entryId) {
  return (data.entries ?? []).find((entry) => entry.id === entryId) ?? null;
}

function pairingTeamCell(data, entryId) {
  const entry = pairingEntry(data, entryId);
  if (!entry) return `<span class="muted-text">${t("season.emptySlotLabel")}</span>`;
  return `
    <span class="season-pairing-team">
      <strong>${seasonTeamProfileLink(entry)}</strong>
      <span>${renderPlayerLink(entry.user)} · ${seasonTeamRulesLink(entry)}</span>
    </span>
  `;
}

function pairingLeaguePoints(pairing) {
  const home = pairing.homePoints ?? "-";
  const away = pairing.awayPoints ?? "-";
  return `${home} / ${away}`;
}

function pairingTouchdowns(pairing) {
  const home = pairing.homeTouchdowns ?? "-";
  const away = pairing.awayTouchdowns ?? "-";
  return `${home} / ${away}`;
}

function pairingCasualties(pairing) {
  const home = pairing.homeCasualties ?? "-";
  const away = pairing.awayCasualties ?? "-";
  return `${home} / ${away}`;
}

function currentFixtureForData(data) {
  if (!data.myEntry) return null;
  if (data.currentFixture) return data.currentFixture;
  return [...(data.rounds ?? [])]
    .filter((round) => round.status === "started")
    .sort((a, b) => b.roundNumber - a.roundNumber)
    .flatMap((round) => round.pairings)
    .find((pairing) => pairing.homeEntryId === data.myEntry.id || pairing.awayEntryId === data.myEntry.id) ?? null;
}

function renderLeagueFixture(data) {
  const myEntry = data.myEntry;
  if (!myEntry) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.commitFirstNote")}</p>
      </section>
    `;
  }

  const fixture = currentFixtureForData(data);
  if (!fixture) {
    return `
      <section class="content-panel season-card">
        <h2>${t("season.leagueFixtureHeading")}</h2>
        <p>${t("season.noActivePairingNote")}</p>
      </section>
    `;
  }

  const home = pairingEntry(data, fixture.homeEntryId);
  const away = pairingEntry(data, fixture.awayEntryId);
  const isHome = fixture.homeEntryId === myEntry.id;
  const opponent = isHome ? away : home;
  return `
    <section class="content-panel season-card">
      <h2>${t("season.leagueFixtureHeading")}</h2>
      <div class="fixture-headline">
        <div>
          <span class="muted-text">${t("season.roundLabel")} ${fixture.roundNumber} · ${t("season.tableLabel")} ${fixture.tableNumber}</span>
          <strong>${seasonTeamProfileLink(myEntry)}</strong>
        </div>
        <div>
          <span class="muted-text">${t("season.opponentLabel")}</span>
          ${opponent ? `
            <strong>${seasonTeamProfileLink(opponent)}</strong>
            <p>${renderPlayerLink(opponent.user)} · ${seasonTeamRulesLink(opponent)}</p>
          ` : `<strong>${t("season.byeLabel")}</strong>`}
        </div>
      </div>

      <div class="season-score-summary">
        <span>${t("season.touchdownsLabel")}: <strong>${escapeHtml(pairingTouchdowns(fixture))}</strong></span>
        <span>${t("season.casualtiesLabel")}: <strong>${escapeHtml(pairingCasualties(fixture))}</strong></span>
        <span>${t("season.leaguePointsLabel")}: <strong>${escapeHtml(pairingLeaguePoints(fixture))}</strong></span>
      </div>

      ${opponent ? `<a class="primary-button" href="${gameUrl(fixture)}">${t("games.openGameAction")}</a>` : `<p>${t("season.oneTeamFixtureNote")}</p>`}
    </section>
  `;
}

function renderSeasonEntriesTable(data, adminActions = false) {
  const entries = data.entries ?? [];
  if (!entries.length) return `<p>${t("season.noTeamsCommittedYet")}</p>`;
  return `
    <div class="table-scroll">
      <table class="compact-roster-table season-table">
        <thead>
          <tr>
            <th>${t("admin.coachHeading")}</th>
            <th>${t("sidebar.teamHeading")}</th>
            <th>${t("myTeams.table.rules")}</th>
            ${adminActions ? `<th>${t("roster.actionHeader")}</th>` : ""}
          </tr>
        </thead>
        <tbody>
          ${entries.map((entry) => `
            <tr>
              <td>${renderPlayerLink(entry.user)}</td>
              <td><strong>${seasonTeamProfileLink(entry)}</strong></td>
              <td>${seasonTeamRulesLink(entry)}</td>
              ${adminActions ? `<td><button class="filter-button compact-action" type="button" data-season-remove-entry="${escapeHtml(entry.id)}">${t("common.remove")}</button></td>` : ""}
            </tr>
          `).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSeasonStandings(data) {
  const standings = data.standings ?? [];
  return `
    <section class="content-panel season-card">
      <h2>${t("season.tab.standings")}</h2>
      <p class="muted-text">${t("season.scoringNote")}</p>
      ${standings.length ? `
        <div class="table-scroll">
          <table class="compact-roster-table season-table">
            <thead>
              <tr>
                <th>#</th>
                <th>${t("admin.coachHeading")}</th>
                <th>${t("sidebar.teamHeading")}</th>
                <th>${t("season.gamesHeader")}</th>
                <th>${t("season.leaguePointsLabel")}</th>
                <th>${t("season.touchdownsLabel")}</th>
                <th>${t("season.casualtiesLabel")}</th>
              </tr>
            </thead>
            <tbody>
              ${standings.map((standing) => `
                <tr>
                  <td>${standing.rank}</td>
                  <td>${renderPlayerLink(standing.user)}</td>
                  <td><strong>${renderPublicTeamLink(standing.user, standing.team)}</strong></td>
                  <td>${standing.games}</td>
                  <td>${standing.points}</td>
                  <td>${standing.touchdowns ?? 0}</td>
                  <td>${standing.casualties ?? 0}</td>
                </tr>
              `).join("")}
            </tbody>
          </table>
        </div>
      ` : `<p>${t("season.noTeamsCommittedYet")}</p>`}
    </section>
  `;
}

function renderSeasonRounds(data, adminMode = false) {
  const rounds = data.rounds ?? [];
  if (!rounds.length) {
    return `
      <section class="content-panel season-card">
        <h2>${adminMode ? t("season.pairingControlsHeading") : t("season.tab.schedule")}</h2>
        <p>${t("season.noRoundsGeneratedNote")}</p>
      </section>
    `;
  }

  return `
    <section class="season-rounds">
      ${rounds.map((round) => `
        <article class="content-panel season-card">
          <header class="season-round-header">
            <div>
              <h2>${t("season.roundLabel")} ${round.roundNumber}</h2>
              <span class="season-status-pill" data-status="${escapeHtml(round.status)}">${escapeHtml(round.status)}</span>
            </div>
            ${adminMode ? renderSeasonRoundActions(round) : ""}
          </header>
          <div class="table-scroll">
            <table class="compact-roster-table season-table">
              <thead>
                ${adminMode ? `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                    <th>${t("admin.statusHeader")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("roster.actionHeader")}</th>
                  </tr>
                ` : `
                  <tr>
                    <th>${t("season.tableLabel")}</th>
                    <th>${t("season.homeLabel")}</th>
                    <th>${t("season.tdHeader")}</th>
                    <th>${t("season.casualtiesHeader")}</th>
                    <th>${t("season.leaguePointsLabel")}</th>
                    <th>${t("season.awayLabel")}</th>
                  </tr>
                `}
              </thead>
              <tbody>
                ${round.pairings.map((pairing) => renderSeasonPairingRow(data, round, pairing, adminMode)).join("")}
              </tbody>
            </table>
          </div>
        </article>
      `).join("")}
    </section>
  `;
}

function renderSeasonRoundActions(round) {
  return `
    <div class="season-round-actions">
      ${round.status === "draft" ? `
        <button class="primary-button compact-action" type="button" data-season-start-round="${escapeHtml(round.id)}">${t("season.startRoundAction")}</button>
      ` : ""}
      ${round.status === "draft" || round.status === "started" ? `
        <button class="filter-button compact-action" type="button" data-season-add-pairing="${escapeHtml(round.id)}">${t("season.addEmptyPairingAction")}</button>
      ` : ""}
      <button class="filter-button compact-action" type="button" data-season-delete-round="${escapeHtml(round.id)}">${t("season.deleteRoundAction")}</button>
    </div>
  `;
}

function renderSeasonPairingRow(data, round, pairing, adminMode = false) {
  const home = pairingEntry(data, pairing.homeEntryId);
  const away = pairingEntry(data, pairing.awayEntryId);
  const isBye = !away;
  const homeValue = pairing.homePoints ?? "";
  const awayValue = pairing.awayPoints ?? "";
  if (!adminMode) {
    return `
      <tr>
        <td>${pairing.tableNumber}</td>
        <td>${pairingTeamCell(data, pairing.homeEntryId)}</td>
        <td>${escapeHtml(pairingTouchdowns(pairing))}</td>
        <td>${escapeHtml(pairingCasualties(pairing))}</td>
        <td>${escapeHtml(pairingLeaguePoints(pairing))}</td>
        <td>${isBye ? `<strong>${t("season.byeLabel")}</strong>` : pairingTeamCell(data, pairing.awayEntryId)}</td>
      </tr>
    `;
  }

  const selectedEntryIds = selectedRoundEntryIds(round);
  return `
    <tr data-pairing-row="${escapeHtml(pairing.id)}">
      <td>${pairing.tableNumber}</td>
      <td>${renderSeasonEntrySelect(data, "home-entry", pairing.homeEntryId, false, selectedEntryIds)}</td>
      <td>${renderSeasonEntrySelect(data, "away-entry", pairing.awayEntryId, false, selectedEntryIds)}</td>
      <td><span class="season-status-pill" data-status="${escapeHtml(pairing.resultStatus)}">${escapeHtml(gameStatusLabel(pairing.resultStatus))}</span></td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeTouchdowns ?? "")}" data-home-td>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayTouchdowns ?? "")}" data-away-td>
        </div>
      </td>
      <td>
        <div class="season-td-pair">
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.homeCasualties ?? "")}" data-home-casualties>
          <input class="season-score-input" type="number" min="0" step="1" value="${escapeHtml(pairing.awayCasualties ?? "")}" data-away-casualties>
        </div>
      </td>
      <td>${escapeHtml(pairingLeaguePoints(pairing))}</td>
      <td>
        <div class="table-actions">
          <button class="filter-button compact-action" type="button" data-delete-season-pairing="${escapeHtml(pairing.id)}">${t("common.delete")}</button>
        </div>
      </td>
    </tr>
  `;
}

function selectedRoundEntryIds(round) {
  const selected = new Set();
  for (const pairing of round.pairings ?? []) {
    if (pairing.homeEntryId) selected.add(pairing.homeEntryId);
    if (pairing.awayEntryId) selected.add(pairing.awayEntryId);
  }
  return selected;
}

function renderSeasonEntrySelect(data, name, selected, disabled = false, unavailableEntryIds = new Set()) {
  const selectedValue = selected ?? "";
  const options = (data.entries ?? []).filter((entry) => entry.id === selectedValue || !unavailableEntryIds.has(entry.id));
  return `
    <select class="table-select" data-${name} ${disabled ? "disabled" : ""}>
      ${renderOption("", t("season.emptySlotLabel"), selectedValue)}
      ${options.map((entry) => renderOption(entry.id, seasonEntryLabel(entry), selectedValue)).join("")}
    </select>
  `;
}

function renderSeasonAdmin(data) {
  const admin = data.admin ?? { users: [], savedTeams: [] };
  const committedUserIds = new Set((data.entries ?? []).map((entry) => entry.user.id));
  const availableSavedTeams = availableSeasonSavedTeams(data);
  const availableUsers = admin.users.filter((user) => !committedUserIds.has(user.id));
  const teams = state.data.teams ?? [];
  return `
    <div class="season-admin-stack">
      <section class="content-panel season-card season-admin-panel">
        <h2>${t("season.adminControlsHeading")}</h2>
        <div class="season-admin-grid">
          <div class="season-admin-block">
            <h3>${t("season.tab.schedule")}</h3>
            <p>${t("season.roundsAdminNote")}</p>
            <button class="primary-button" type="button" data-season-generate-round>${t("season.generateNextRoundAction")}</button>
            <button class="filter-button" type="button" data-season-create-round>${t("season.createEmptyRoundAction")}</button>
          </div>

          <div class="season-admin-block">
            <h3>${t("season.addSavedTeamHeading")}</h3>
            ${availableSavedTeams.length ? `
              <label class="filter-field">
                <span>${t("season.savedTeamField")}</span>
                <select data-season-admin-team>
                  ${availableSavedTeams.map((team) => renderOption(team.id, `${team.owner.login} · ${team.name}`, "")).join("")}
                </select>
              </label>
              <button class="primary-button" type="button" data-season-admin-add-team>${t("season.addTeamAction")}</button>
            ` : `<p>${t("season.noEligibleSavedTeams")}</p>`}
          </div>

          <div class="season-admin-block">
            <h3>${t("season.createTeamForCoachHeading")}</h3>
            ${availableUsers.length ? `
              <label class="filter-field">
                <span>${t("admin.coachHeading")}</span>
                <select data-season-admin-user>
                  ${availableUsers.map((user) => renderOption(user.id, user.login, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("admin.rulesTeamField")}</span>
                <select data-season-admin-base-team>
                  ${teams.map((team) => renderOption(team.slug, team.title, "")).join("")}
                </select>
              </label>
              <label class="filter-field">
                <span>${t("savedRoster.teamName")}</span>
                <input type="text" data-season-admin-team-name placeholder="${t("season.newRosterNamePlaceholder")}">
              </label>
              <button class="primary-button" type="button" data-season-admin-create-team>${t("season.createAndCommitAction")}</button>
            ` : `<p>${t("season.everyCoachCommittedNote")}</p>`}
          </div>
        </div>
      </section>

      ${renderSeasonRounds(data, true)}

      <section class="content-panel season-card">
        <h2>${t("season.committedTeamsHeading")}</h2>
        ${renderSeasonAdminEntries(data)}
      </section>
    </div>
  `;
}

function renderSeasonAdminEntries(data) {
  return renderSeasonEntriesTable(data, true);
}

function replaceSeasonData(payload) {
  state.season.data = payload;
  state.season.loaded = true;
}

function seasonPairingPayload(row) {
  const homeEntry = row?.querySelector("[data-home-entry]");
  const awayEntry = row?.querySelector("[data-away-entry]");
  const payload = {
    homeTouchdowns: row?.querySelector("[data-home-td]")?.value ?? "",
    awayTouchdowns: row?.querySelector("[data-away-td]")?.value ?? "",
    homeCasualties: row?.querySelector("[data-home-casualties]")?.value ?? "",
    awayCasualties: row?.querySelector("[data-away-casualties]")?.value ?? "",
  };
  if (homeEntry && !homeEntry.disabled) payload.homeEntryId = homeEntry.value;
  if (awayEntry && !awayEntry.disabled) payload.awayEntryId = awayEntry.value;
  return payload;
}

async function saveSeasonPairingRow(row) {
  const pairingId = row?.dataset.pairingRow;
  if (!pairingId || row.dataset.saving === "true") return;
  clearTimeout(Number(row.dataset.saveTimer || 0));
  row.dataset.saveTimer = "";
  row.dataset.saving = "true";
  try {
    replaceSeasonData(await apiRequest(`/api/season/admin/pairings/${pairingId}`, {
      method: "PATCH",
      body: JSON.stringify(seasonPairingPayload(row)),
    }));
    renderSeason(false);
  } catch (error) {
    row.dataset.saving = "false";
    alert(error.message);
  }
}

function wireSeason() {
  view.querySelector("[data-season-refresh]")?.addEventListener("click", () => {
    state.season.loaded = false;
    renderSeason(true);
  });

  view.querySelectorAll("[data-season-tab]").forEach((button) => {
    button.addEventListener("click", () => {
      state.season.activeTab = normalizeSeasonTab(button.dataset.seasonTab);
      renderSeason(false);
    });
  });

  view.querySelector("[data-season-commit]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-commit-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/commit", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-admin-add-team]")?.addEventListener("click", async () => {
    const teamId = view.querySelector("[data-season-admin-team]")?.value;
    if (!teamId) return;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/entries", {
        method: "POST",
        body: JSON.stringify({ teamId }),
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-admin-create-team]")?.addEventListener("click", async () => {
    const userId = view.querySelector("[data-season-admin-user]")?.value;
    const baseTeamSlug = view.querySelector("[data-season-admin-base-team]")?.value;
    const baseTeam = state.data.teams.find((team) => team.slug === baseTeamSlug);
    if (!userId || !baseTeam) return;
    const name = String(view.querySelector("[data-season-admin-team-name]")?.value ?? "").trim() || baseTeam.title;
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/create-team", {
        method: "POST",
        body: JSON.stringify({
          userId,
          name,
          baseTeamSlug,
          roster: makeSeasonStarterRoster(baseTeam, name),
        }),
      }));
      state.myTeams.loaded = false;
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-generate-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds/generate", {
        method: "POST",
        body: "{}",
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelector("[data-season-create-round]")?.addEventListener("click", async () => {
    try {
      replaceSeasonData(await apiRequest("/api/season/admin/rounds", {
        method: "POST",
        body: "{}",
      }));
      renderSeason(false);
    } catch (error) {
      alert(error.message);
    }
  });

  view.querySelectorAll("[data-season-start-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonStartRound}/start`, {
          method: "POST",
          body: "{}",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-delete-round]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmDeleteRound"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonDeleteRound}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-add-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/rounds/${button.dataset.seasonAddPairing}/pairings`, {
          method: "POST",
          body: JSON.stringify({ homeEntryId: "", awayEntryId: "" }),
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-pairing-row]").forEach((row) => {
    const saveNow = () => saveSeasonPairingRow(row);
    const saveSoon = () => {
      clearTimeout(Number(row.dataset.saveTimer || 0));
      row.dataset.saveTimer = String(setTimeout(saveNow, 350));
    };

    row.querySelectorAll("[data-home-entry], [data-away-entry]").forEach((field) => {
      field.addEventListener("change", saveNow);
    });

    row.querySelectorAll("[data-home-td], [data-away-td], [data-home-casualties], [data-away-casualties]").forEach((field) => {
      field.addEventListener("input", saveSoon);
      field.addEventListener("change", saveNow);
    });
  });

  view.querySelectorAll("[data-delete-season-pairing]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmDeletePairing"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/pairings/${button.dataset.deleteSeasonPairing}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });

  view.querySelectorAll("[data-season-remove-entry]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (!confirm(t("season.confirmRemoveTeam"))) return;
      try {
        replaceSeasonData(await apiRequest(`/api/season/admin/entries/${button.dataset.seasonRemoveEntry}`, {
          method: "DELETE",
        }));
        renderSeason(false);
      } catch (error) {
        alert(error.message);
      }
    });
  });
}

async function renderSavedRoster(teamId, refresh = true, options = {}) {
  const isAdminEdit = Boolean(options.adminOwnerId);
  setActiveNav(isAdminEdit ? "administration" : "my-teams");
  setViewSection("teams");
  if (refresh) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="loading">${t("myTeams.loadingTeam")}</div>
    `;
  }
  if (!state.auth.currentUser) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("myTeams.loginRequired")}</div>
    `;
    return;
  }

  let savedTeam = null;
  let owner = state.auth.currentUser;
  if (isAdminEdit) {
    if (!state.auth.currentUser.isAdmin) {
      view.innerHTML = `
        ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), "", { back: true, backFallback: "#/administration" })}
        <div class="empty-state">${t("admin.accessRequired")}</div>
      `;
      return;
    }
    state.admin.editingTeams ??= new Map();
    savedTeam = !refresh ? state.admin.editingTeams.get(teamId) : null;
    owner = savedTeam?._owner ?? owner;
    if (!savedTeam) {
      try {
        const payload = await apiRequest(`/api/admin/teams/${encodeURIComponent(teamId)}`);
        savedTeam = payload.team;
        owner = payload.owner;
        savedTeam._saveEndpoint = `/api/admin/teams/${encodeURIComponent(teamId)}`;
        savedTeam._owner = owner;
        state.admin.editingTeams.set(teamId, savedTeam);
      } catch (error) {
        view.innerHTML = `
          ${renderHeader(t("nav.administration"), t("savedRoster.editingTeamSubtitle"), "", { back: true, backFallback: `#/administration/users/${encodeURIComponent(options.adminOwnerId)}` })}
          <div class="empty-state">${escapeHtml(error.message)}</div>
        `;
        return;
      }
    }
  } else {
    await loadMyTeams(refresh);
    savedTeam = state.myTeams.items.find((item) => item.id === teamId);
  }

  if (!savedTeam) {
    view.innerHTML = `
      ${renderHeader(isAdminEdit ? t("nav.administration") : t("myTeams.title"), isAdminEdit ? t("savedRoster.editingTeamSubtitle") : t("myTeams.subtitle"))}
      <div class="empty-state">${t("savedRoster.notFound")}</div>
    `;
    return;
  }

  // The store owns the draft. A local re-render reuses the very same object;
  // only a fresh load from the server offers a new one, and even then the store
  // keeps the existing draft if it still holds unsaved edits.
  const draft = trackSavedRoster(savedTeam, { refresh });
  const teams = state.data.teams;
  if (!draft.teamSlug && teams[0]) draft.teamSlug = teams[0].slug;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, draft);
  syncMedicalStaffForTeam(team, draft);
  ensureDraftPlayers(team, draft);
  sanitizeFavouredSkillsForTeam(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const warnings = rosterWarnings(team, draft, costs);
  const backUrl = isAdminEdit ? `#/administration/users/${encodeURIComponent(owner?.id || options.adminOwnerId)}` : "#/my-teams";
  const titlePrefix = isAdminEdit ? `${t("common.editing")} "${draft.teamName || savedTeam.name || team.title}"` : `${t("sidebar.teamHeading")} "${draft.teamName || savedTeam.name || team.title}"`;

  view.innerHTML = `
    ${renderHeader(titlePrefix, `${team.title} ${t("savedRoster.rosterSuffix")}${isAdminEdit && owner ? ` · ${owner.login}` : ""}`, "", { back: true, backFallback: backUrl })}
    ${renderRosterNotices({ pending: rosterStore.readPending(savedTeam.id), serverUpdatedAt: savedTeam.updatedAt, conflict: rosterStore.statusOf(savedTeam.id) === SAVE_STATUS.CONFLICT, t })}
    <div class="saved-roster-top-grid">
      ${renderSavedRosterIdentity(team, draft, teams)}
      ${renderSavedRosterSummary(savedTeam, team, draft, costs, warnings)}
    </div>
    ${renderSavedRosterPurchases(team, draft)}
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderSavedPlayerList(team, draft)}
        </section>

        <section class="builder-pool saved-add-player-section">
          <h2>${t("savedRoster.addNewPlayers")}</h2>
          ${renderSavedNewPlayerTable(team, draft)}
        </section>
      </section>
    </div>
  `;
  wireSavedRoster(savedTeam, team, draft, {
    rerender: () => renderSavedRoster(teamId, false, options),
  });
}

function renderSavedRosterSummary(savedTeam, team, draft, costs, warnings) {
  const autosaveStatus = rosterStore.statusOf(savedTeam.id);
  return `
    <aside class="builder-summary saved-roster-summary-panel side-panel">
      <div class="summary-title-block">
        <h3>${t("savedRoster.summaryTitle")}</h3>
        <p class="autosave-status" data-autosave-status data-status="${escapeHtml(autosaveStatus)}">${escapeHtml(autosaveMessageFor(autosaveStatus))}</p>
        <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
      </div>
      <dl class="stat-list summary-stat-grid">
        <dt>${t("savedRoster.activePlayers")}</dt><dd>${costs.playersCount}</dd>
        <dt>${t("savedRoster.totalPlayers")}</dt><dd>${costs.totalPlayersCount}</dd>
        <dt>${t("savedRoster.startingRerolls")}</dt><dd>${draft.startingRerolls ?? 0}</dd>
        <dt>${t("savedRoster.teamRerolls")}</dt><dd>${draft.teamRerolls ?? 0}</dd>
        ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(draft.bribes)}</dd>` : ""}
        <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(draft.dedicatedFans)}</dd>
        <dt>${t("savedRoster.treasury")}</dt><dd data-treasury-display>${countToNumber(draft.treasury)}k</dd>
        <dt>${t("savedRoster.totalSppLabel")}</dt><dd data-total-spp-display>${rosterTotalSpp(team, draft)} SPP</dd>
        <dt>${t("savedRoster.playersCost")}</dt><dd>${costs.playersCost}k</dd>
        <dt>${t("savedRoster.staffCost")}</dt><dd>${costs.staffCost}k</dd>
        <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
      </dl>
      <div class="summary-state-block">
        ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`}
        <div class="summary-actions">
          <button class="primary-button" type="button" data-save-roster>${t("roster.saveChanges")}</button>
          <button class="primary-button" type="button" data-copy-saved-roster>${t("roster.copyRoster")}</button>
          <button class="filter-button danger-action" type="button" data-delete-saved-roster>${t("common.delete")}</button>
        </div>
      </div>
    </aside>
  `;
}

function renderSavedRosterIdentity(team, draft, teams) {
  return `
    <section class="builder-setup-panel roster-identity-panel side-panel">
      <div class="builder-form saved-roster-form">
        <label class="filter-field">
          <span>${t("sidebar.teamHeading")}</span>
          <select data-roster-team>
            ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
          </select>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.teamName")}</span>
          <input type="text" value="${escapeHtml(draft.teamName || team.title)}" data-roster-name>
        </label>
        <label class="filter-field">
          <span>${t("savedRoster.logoField")}</span>
          <input type="file" accept="image/*" data-roster-logo>
        </label>
      </div>
      ${draft.logoData ? `
        <div class="builder-logo-inline roster-logo-inline">
          <img class="builder-logo-preview" src="${escapeHtml(draft.logoData)}" alt="">
          <button class="filter-button compact-action" type="button" data-roster-remove-logo>${t("savedRoster.removeLogo")}</button>
        </div>
      ` : ""}
      ${renderTeamRuleAccess(team, draft, "roster")}
    </section>
  `;
}

function renderSavedRosterPurchases(team, draft) {
  const briberyControl = hasBribery(team) ? renderRosterStaffControl("bribes", t("savedRoster.bribes"), draft.bribes) : "";
  return `
    <div class="roster-purchases-layout">
      <section class="roster-controls-panel roster-resources-panel side-panel">
        <h2>${t("roster.teamResourcesHeading")}</h2>
        <div class="builder-tracker-list roster-resource-list" aria-label="${t("roster.teamResourceTrackersAriaLabel")}">
          ${renderRosterStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), draft.dedicatedFans)}
          ${renderRosterMoneyControl(t("roster.treasuryTitle"), t("roster.treasuryDescription"), draft.treasury, "data-roster-treasury")}
          ${renderRosterMoneyControl("Coach's Safe", t("roster.coachesSafeDescription"), draft.coachesSafe, "data-roster-coaches-safe")}
        </div>
      </section>
      <section class="roster-controls-panel roster-purchases-panel side-panel">
        <h2>${t("roster.purchasesHeading")}</h2>
        <div class="builder-tracker-list roster-tracker-list roster-purchase-grid" aria-label="${t("roster.purchaseTrackersAriaLabel")}">
        ${renderRosterCounterControl(
          t("savedRoster.startingRerolls"),
          `60k ${t("roster.each")}`,
          countToNumber(draft.startingRerolls),
          `<button class="filter-button" type="button" data-roster-reroll="-1" ${countToNumber(draft.startingRerolls) <= 0 ? "disabled" : ""}>-</button>`,
          `<button class="filter-button" type="button" data-roster-reroll="1">+</button>`,
        )}
        ${renderRosterCounterControl(
          t("savedRoster.teamRerolls"),
          `120k ${t("roster.each")}`,
          countToNumber(draft.teamRerolls),
          `<button class="filter-button" type="button" data-roster-team-reroll="-1" ${countToNumber(draft.teamRerolls) <= 0 ? "disabled" : ""}>-</button>`,
          `<button class="filter-button" type="button" data-roster-team-reroll="1" ${countToNumber(draft.teamRerolls) >= builderStaffMaximums.teamRerolls ? "disabled" : ""}>+</button>`,
        )}
        ${briberyControl}
        ${renderRosterStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), draft.assistantCoaches)}
        ${renderRosterStaffControl("cheerleaders", t("savedRoster.cheerleaders"), draft.cheerleaders)}
        ${availableMedicalStaffDefinitions(team).map((staff) => renderRosterStaffControl(staff.key, staff.title, draft[staff.key])).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderRosterMoneyControl(title, description, value, dataAttribute) {
  return `
    <label class="builder-addon compact-staff-control roster-purchase-card roster-money-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <input class="table-input roster-purchase-input" type="number" step="10" value="${countToNumber(value)}" ${dataAttribute}>
    </label>
  `;
}

function renderRosterCounterControl(title, description, value, minusButton, plusButton) {
  return `
    <div class="builder-addon compact-staff-control roster-purchase-card">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${escapeHtml(description)}</span>
      </div>
      <div class="inline-stepper-control">
        ${minusButton}
        <strong>${value}</strong>
        ${plusButton}
      </div>
    </div>
  `;
}

function renderRosterStaffControl(key, title, value) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  const cost = builderStaffCosts[key] ?? 0;
  const description = key === "dedicatedFans" ? t("roster.postMatchValue") : `${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}`;
  return renderRosterCounterControl(
    title,
    description,
    current,
    `<button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>`,
    `<button class="filter-button" type="button" data-roster-staff="${key}" data-roster-staff-step="1" ${current >= max ? "disabled" : ""}>+</button>`,
  );
}

function wireSavedRoster(savedTeam, team, draft, options = {}) {
  wireAutosaveStatus(savedTeam.id);
  const reload = () => renderSavedRoster(savedTeam.id, true, options);
  wireRosterNotices(view, {
    onRestore: () => rosterStore.restorePending(savedTeam.id) && renderSavedRoster(savedTeam.id, false, options),
    onDiscard: () => { rosterStore.discardPending(savedTeam.id); reload(); },
    onReload: reload,
  });
  const autosave = () => scheduleSavedRosterAutosave(savedTeam.id);
  const rerender = () => {
    syncRosterCountsFromPlayers(draft);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
    if (options.rerender) {
      options.rerender();
    } else {
      renderSavedRoster(savedTeam.id, false);
    }
  };

  view.querySelector("[data-roster-team]")?.addEventListener("change", (event) => {
    const nextTeam = state.data.teams.find((item) => item.slug === event.currentTarget.value);
    if (!nextTeam) return;
    draft.teamSlug = nextTeam.slug;
    draft.players = [];
    draft.selectedLeague = "";
    draft.favouredChoice = "";
    syncRosterCountsFromPlayers(draft);
    if (!draft.teamName) draft.teamName = nextTeam.title;
    rerender();
  });
  view.querySelector("[data-roster-name]")?.addEventListener("input", (event) => {
    draft.teamName = event.currentTarget.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-treasury]")?.addEventListener("input", (event) => {
    draft.treasury = countToNumber(event.currentTarget.value);
    updateSavedRosterFields(savedTeam, draft);
    const treasuryDisplay = view.querySelector("[data-treasury-display]");
    if (treasuryDisplay) treasuryDisplay.textContent = `${countToNumber(draft.treasury)}k`;
    autosave();
  });
  view.querySelector("[data-roster-coaches-safe]")?.addEventListener("input", (event) => {
    draft.coachesSafe = countToNumber(event.currentTarget.value);
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-league]")?.addEventListener("change", (event) => {
    draft.selectedLeague = event.currentTarget.value;
    updateSavedRosterFields(savedTeam, draft);
    autosave();
  });
  view.querySelector("[data-roster-favoured]")?.addEventListener("change", (event) => {
    draft.favouredChoice = event.currentTarget.value;
    sanitizeFavouredSkillsForTeam(team, draft);
    rerender();
  });
  view.querySelector("[data-roster-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    draft.logoData = await fileToOptimizedLogoDataUrl(file);
    rerender();
  });
  view.querySelector("[data-roster-remove-logo]")?.addEventListener("click", () => {
    draft.logoData = "";
    rerender();
  });
  view.querySelectorAll("[data-roster-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const previous = countToNumber(draft.startingRerolls);
      draft.startingRerolls = clamp(previous + Number(button.dataset.rosterReroll), 0, builderStaffMaximums.startingRerolls);
      applyPaidStaffChange(draft, "startingRerolls", previous, draft.startingRerolls);
      rerender();
    });
  });
  view.querySelectorAll("[data-roster-team-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.rosterTeamReroll);
      const previous = countToNumber(draft.teamRerolls);
      draft.teamRerolls = clamp(previous + delta, 0, builderStaffMaximums.teamRerolls);
      applyPaidStaffChange(draft, "teamRerolls", previous, draft.teamRerolls);
      rerender();
    });
  });
  view.querySelectorAll("[data-roster-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.rosterStaff;
      const max = builderStaffMaximums[key] ?? 6;
      const delta = Number(button.dataset.rosterStaffStep);
      const previous = countToNumber(draft[key]);
      draft[key] = clamp(previous + delta, 0, max);
      applyPaidStaffChange(draft, key, previous, draft[key]);
      rerender();
    });
  });
  view.querySelectorAll("[data-add-saved-row]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowIndex = Number(button.dataset.addSavedRow);
      const row = rowsForTeam(team)[rowIndex];
      if (!row) return;
      draft.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(draft, rowIndex), { purchased: true }));
      spendTreasury(draft, costToNumber(rowCost(row)));
      syncRosterCountsFromPlayers(draft);
      rerender();
    });
  });
  wireSavedPlayerEditors(team, draft, rerender);
  view.querySelector("[data-save-roster]")?.addEventListener("click", () => saveSavedRoster(savedTeam));
  view.querySelector("[data-copy-saved-roster]")?.addEventListener("click", () => copySavedRoster(team, draft));
  view.querySelector("[data-delete-saved-roster]")?.addEventListener("click", async () => {
    const ownerId = savedTeam._owner?.id || options.adminOwnerId || state.auth.currentUser?.id || "";
    try {
      const deleted = await deleteSavedTeam(savedTeam.id, {
        ownerId,
        teamName: draft.teamName || savedTeam.name || team.title,
      });
      if (!deleted) return;
      location.hash = options.adminOwnerId ? `#/administration/users/${encodeURIComponent(ownerId)}` : "#/my-teams";
    } catch (error) {
      alert(error.message);
    }
  });
}

function moveRosterPlayer(draft, draggedId, targetId, position = "before") {
  if (!draggedId || !targetId || draggedId === targetId || !Array.isArray(draft.players)) return false;
  const fromIndex = draft.players.findIndex((player) => player.id === draggedId);
  if (fromIndex === -1) return false;
  const [dragged] = draft.players.splice(fromIndex, 1);
  const targetIndex = draft.players.findIndex((player) => player.id === targetId);
  if (targetIndex === -1) {
    draft.players.splice(fromIndex, 0, dragged);
    return false;
  }
  const insertIndex = position === "after" ? targetIndex + 1 : targetIndex;
  draft.players.splice(insertIndex, 0, dragged);
  return true;
}

function wireSavedRosterDragAndDrop(draft, rerender) {
  let draggedId = "";
  view.querySelectorAll(".saved-roster-table tbody tr[data-roster-player]").forEach((row) => {
    row.addEventListener("dragstart", (event) => {
      const target = event.target instanceof Element ? event.target : null;
      if (!target?.closest("[data-player-drag-handle]")) {
        event.preventDefault();
        return;
      }
      draggedId = row.dataset.rosterPlayer || "";
      row.classList.add("is-dragging");
      if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData("text/plain", draggedId);
      }
    });

    row.addEventListener("dragover", (event) => {
      if (!draggedId || draggedId === row.dataset.rosterPlayer) return;
      event.preventDefault();
      const rect = row.getBoundingClientRect();
      row.dataset.dropPosition = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
      row.classList.toggle("drop-after", row.dataset.dropPosition === "after");
      row.classList.toggle("drop-before", row.dataset.dropPosition !== "after");
      if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
    });

    row.addEventListener("dragleave", () => {
      row.classList.remove("drop-before", "drop-after");
      delete row.dataset.dropPosition;
    });

    row.addEventListener("drop", (event) => {
      event.preventDefault();
      const targetId = row.dataset.rosterPlayer || "";
      const moved = moveRosterPlayer(draft, draggedId, targetId, row.dataset.dropPosition);
      draggedId = "";
      if (moved) rerender();
    });

    row.addEventListener("dragend", () => {
      draggedId = "";
      view.querySelectorAll(".saved-roster-table tbody tr").forEach((item) => {
        item.classList.remove("is-dragging", "drop-before", "drop-after");
        delete item.dataset.dropPosition;
      });
    });
  });
}

function wireSavedPlayerEditors(team, draft, rerender) {
  const autosave = () => scheduleSavedRosterAutosave(draft.editingTeamId);
  view.querySelectorAll("[data-roster-player]").forEach((card) => {
    const player = draft.players.find((item) => item.id === card.dataset.rosterPlayer);
    if (!player) return;
    card.querySelector("[data-saved-player-expand]")?.addEventListener("click", () => {
      setSavedRosterPlayerExpanded(player.id, true);
      rerender();
    });
    card.querySelector("[data-saved-player-collapse]")?.addEventListener("click", () => {
      setSavedRosterPlayerExpanded(player.id, false);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-spp-action]").forEach((button) => {
      button.addEventListener("click", () => {
        const key = button.dataset.savedPlayerSppAction;
        player.spp = normalizeSppCounters(player.spp);
        player.spp[key] = Math.max(0, countToNumber(player.spp[key]) + 1);
        autosave();
        rerender();
      });
    });
    card.querySelector("[data-saved-player-name]")?.addEventListener("input", (event) => {
      player.name = event.currentTarget.value;
      autosave();
    });
    card.querySelector("[data-saved-player-number]")?.addEventListener("input", (event) => {
      player.number = event.currentTarget.value;
      autosave();
    });
    card.querySelector("[data-saved-player-skip]")?.addEventListener("change", (event) => {
      player.skipNextGame = event.currentTarget.checked;
      rerender();
    });
    card.querySelector("[data-saved-player-nigling]")?.addEventListener("change", (event) => {
      player.niglingInjury = event.currentTarget.checked;
      autosave();
    });
    card.querySelector("[data-saved-player-captain]")?.addEventListener("change", (event) => {
      setRosterCaptain(draft, player.id, event.currentTarget.checked);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-contract-delta]").forEach((button) => {
      button.addEventListener("click", () => {
        const delta = Number(button.dataset.savedPlayerContractDelta);
        player.extendedContracts = Math.max(0, countToNumber(player.extendedContracts) + delta);
        rerender();
      });
    });
    card.querySelectorAll("[data-saved-player-spp]").forEach((input) => {
      input.addEventListener("input", (event) => {
        player.spp = normalizeSppCounters(player.spp);
        player.spp[event.currentTarget.dataset.savedPlayerSpp] = Math.max(0, countToNumber(event.currentTarget.value));
        const rowTotal = card.querySelector("[data-player-spp-total]");
        if (rowTotal) rowTotal.textContent = `${playerSppTotal(team, player)} ${t("roster.sppEarned")}`;
        const available = card.querySelector("[data-player-available-spp]");
        if (available) available.textContent = `${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}`;
        const nextAdvancement = card.querySelector("[data-player-next-advancement]");
        const nextRank = advancementRanks[playerAdvancementLevel(player)];
        if (nextAdvancement && nextRank) {
          nextAdvancement.textContent = `${t("roster.next")}: ${nextRank.rank}, ${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}`;
        }
        const rosterTotal = view.querySelector("[data-total-spp-display]");
        if (rosterTotal) rosterTotal.textContent = `${rosterTotalSpp(team, draft)} SPP`;
        autosave();
      });
    });
    card.querySelectorAll("[data-saved-stat]").forEach((button) => {
      button.addEventListener("click", () => {
      const stat = button.dataset.savedStat;
      const delta = Number(button.dataset.savedStatDelta);
      player.statMods ??= {};
      player.statMods[stat] = clamp(countToNumber(player.statMods[stat]) + delta, -10, 10);
      rerender();
    });
  });
    card.querySelector("[data-saved-player-add-skill]")?.addEventListener("click", () => {
      const input = card.querySelector("[data-saved-player-skill]");
      const row = rowsForTeam(team)[player.rowIndex];
      const typed = String(input?.value || "").trim();
      const option = availableSkillOptionsForPlayer(row, player)
        .find((item) => item.name.toLowerCase() === typed.toLowerCase());
      if (!option) {
        if (input) input.value = "";
        return;
      }
      player.extraSkills ??= [];
      if (player.extraSkills.some((skill) => skill.name === option.name)) return;
      player.extraSkills.push({ name: option.name, access: option.access });
      player.extraSkills = normalizePlayerExtraSkills(row, player.extraSkills);
      sanitizeFavouredSkillsForTeam(team, draft);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-skill]").forEach((button) => {
      button.addEventListener("click", () => {
        player.extraSkills = (player.extraSkills ?? []).filter((skill) => skill.name !== button.dataset.savedPlayerRemoveSkill);
        rerender();
      });
    });
    card.querySelector("[data-saved-player-add-favoured]")?.addEventListener("click", () => {
      const input = card.querySelector("[data-saved-player-favoured-skill]");
      const row = rowsForTeam(team)[player.rowIndex];
      if (!row) return;
      const typed = String(input?.value || "").trim();
      const option = favouredSkillOptionsForPlayer(team, draft, row, player)
        .find((item) => item.name.toLowerCase() === typed.toLowerCase());
      if (!option) {
        if (input) input.value = "";
        return;
      }
      player.favouredSkills ??= [];
      if (player.favouredSkills.some((skill) => skill.name === option.name)) return;
      player.favouredSkills.push({ name: option.name, access: "favoured" });
      sanitizeFavouredSkillsForTeam(team, draft);
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-favoured]").forEach((button) => {
      button.addEventListener("click", () => {
        player.favouredSkills = (player.favouredSkills ?? [])
          .filter((skill) => (typeof skill === "string" ? skill : skill.name) !== button.dataset.savedPlayerRemoveFavoured);
        rerender();
      });
    });
    card.querySelector("[data-saved-player-add-advancement]")?.addEventListener("click", () => {
      const type = card.querySelector("[data-saved-player-advancement-type]")?.value ?? "primary";
      const verdict = canTakeAdvancement(team, player, type);
      if (!verdict.allowed) {
        // Used to fail silently whenever the cost was zero, and to happily let
        // available SPP go negative otherwise.
        alert(t(`validation.${verdict.reason}`, verdict.params));
        return;
      }
      player.advancements = normalizePlayerAdvancements(player.advancements);
      player.advancements.push({ type });
      rerender();
    });
    card.querySelectorAll("[data-saved-player-remove-advancement]").forEach((button) => {
      button.addEventListener("click", () => {
        const index = Number(button.dataset.savedPlayerRemoveAdvancement);
        player.advancements = normalizePlayerAdvancements(player.advancements)
          .filter((_advancement, advancementIndex) => advancementIndex !== index);
        rerender();
      });
    });
  });
  wireSavedRosterDragAndDrop(draft, rerender);
  view.querySelectorAll("[data-remove-saved-player]").forEach((button) => {
    button.addEventListener("click", () => {
      const removed = draft.players.find((player) => player.id === button.dataset.removeSavedPlayer);
      if (removed?.purchased) {
        const row = rowsForTeam(team)[removed.rowIndex];
        refundTreasury(draft, costToNumber(rowCost(row)));
      }
      draft.players = draft.players.filter((player) => player.id !== button.dataset.removeSavedPlayer);
      syncRosterCountsFromPlayers(draft);
      rerender();
    });
  });
}

/**
 * Everything below hands roster saving to src/data/roster-store.mjs.
 *
 * The store owns the draft object and the request queue; this file only decides
 * what a request looks like and how the status is worded.
 */

const rosterSaveTransport = {
  async save(teamId, request, { endpoint } = {}) {
    return apiRequest(endpoint || `/api/teams/${teamId}`, {
      method: "PATCH",
      body: JSON.stringify(request),
    });
  },
};

const rosterStore = createRosterStore({
  transport: rosterSaveTransport,
  storage,
  debounceMs: autosaveDelayMs,
});

/** Turn the live draft into a PATCH body. Async: the logo is re-encoded here. */
async function buildRosterRequest(savedTeam, team, draft) {
  syncRosterCountsFromPlayers(draft);
  draft.logoData = await optimizeLogoDataUrl(draft.logoData);
  updateSavedRosterFields(savedTeam, draft);
  return {
    name: draft.teamName || team.title,
    baseTeamSlug: draft.teamSlug || team.slug,
    logoData: draft.logoData || "",
    roster: draft,
  };
}

/**
 * Hand the team to the store and get back the draft to render.
 *
 * On a local re-render the store returns the same object the screen was already
 * mutating. On a fresh load it takes the newly parsed one — unless edits are
 * still queued, in which case those win and the server copy is ignored.
 */
function trackSavedRoster(savedTeam, { refresh = true } = {}) {
  const existing = rosterStore.getDraft(savedTeam.id);
  const draft = refresh || !existing ? normalizeSavedRoster(savedTeam) : existing;
  const teams = state.data.teams;
  const team = teams.find((item) => item.slug === draft.teamSlug) ?? teams[0];
  return rosterStore.track(savedTeam.id, {
    draft,
    meta: savedTeam,
    endpoint: savedTeam._saveEndpoint || `/api/teams/${savedTeam.id}`,
    buildRequest: (current) => buildRosterRequest(savedTeam, team, current),
  });
}

const autosaveStatusMessages = {
  [SAVE_STATUS.IDLE]: "roster.autosaveDefaultMessage",
  [SAVE_STATUS.DIRTY]: "roster.unsavedStatus",
  [SAVE_STATUS.SAVING]: "roster.savingStatus",
  [SAVE_STATUS.SAVED]: "roster.autosavedStatus",
  [SAVE_STATUS.OFFLINE]: "roster.offlineStatus",
  [SAVE_STATUS.CONFLICT]: "roster.conflictStatus",
  [SAVE_STATUS.ERROR]: "roster.autosaveFailedStatus",
};

function autosaveMessageFor(status) {
  return t(autosaveStatusMessages[status] ?? autosaveStatusMessages[SAVE_STATUS.IDLE]);
}

/** Keep the status line in the summary panel in step with the store. */
function wireAutosaveStatus(teamId) {
  return rosterStore.subscribe(teamId, ({ status }) => {
    const node = view.querySelector("[data-autosave-status]");
    if (!node) return;
    node.textContent = autosaveMessageFor(status);
    node.dataset.status = status;
  });
}

function scheduleSavedRosterAutosave(teamId) {
  if (!teamId) return;
  rosterStore.markDirty(teamId);
}

/** The explicit "save changes" button: write now and say what happened. */
async function saveSavedRoster(savedTeam) {
  const status = await rosterStore.flush(savedTeam.id);
  const button = view.querySelector("[data-save-roster]");
  if (status === SAVE_STATUS.SAVED) {
    if (button) {
      button.textContent = t("roster.savedStatus");
      setTimeout(() => { button.textContent = t("roster.saveChanges"); }, 1200);
    }
    return;
  }
  alert(autosaveMessageFor(status));
}

async function copySavedRoster(team, draft) {
  await navigator.clipboard.writeText(buildRosterTextForDraft(team, draft));
  const button = view.querySelector("[data-copy-saved-roster]");
  if (button) {
    button.textContent = t("roster.copiedStatus");
    setTimeout(() => { button.textContent = t("roster.copyRoster"); }, 1200);
  }
}

const builderDraftStore = createBuilderDraftStore({ storage, debounceMs: autosaveDelayMs });

/** Adopt a stored draft when the builder is opened with nothing in it. */
function restoreBuilderDraft() {
  if (!isEmptyBuilderDraft(state.builder)) return false;
  const teams = state.data.teams;
  const stored = builderDraftStore.read((slug) => teams.some((item) => item.slug === slug));
  if (!stored) return false;
  state.builder = { ...emptyBuilderState(), ...stored, editingTeamId: "" };
  return true;
}

function renderBuilder() {
  setActiveNav("builder");
  setViewSection("teams");
  const teams = state.data.teams;
  if (state.builder.editingTeamId) {
    resetBuilderForTeam(teams[0]);
  }
  const restoredDraft = restoreBuilderDraft();
  if (!state.builder.teamSlug && teams[0]) {
    state.builder.teamSlug = teams[0].slug;
    state.builder.teamName = teams[0].title;
  }
  const team = teams.find((item) => item.slug === state.builder.teamSlug) ?? teams[0];
  ensureDraftLeagueChoice(team, state.builder);
  syncMedicalStaffForTeam(team, state.builder);
  ensureDraftPlayers(team, state.builder);
  sanitizeFavouredSkillsForTeam(team, state.builder);
  const costs = calculateBuilderCosts(team);
  const warnings = builderWarnings(team, costs);

  view.innerHTML = `
    ${renderHeader(t("nav.builder"), t("builder.subtitle"), `<button class="filter-button" type="button" data-builder-reset>${t("builder.startOver")}</button>`)}
    ${restoredDraft ? `<p class="notice-box" data-builder-restored>${t("builder.draftRestored")}</p>` : ""}
    ${renderBuilderInfoPanel(team, teams, costs, warnings)}
    <div class="builder-layout builder-layout-main">
      <section class="builder-panel">
        <section class="builder-pool">
          <h2>${t("builder.availablePlayers")}</h2>
          ${renderAvailablePlayerTable(team, state.builder, true)}
        </section>

        <section class="builder-selected">
          <h2>${t("savedRoster.rosterHeading")}</h2>
          ${renderBuilderPlayerList(team, state.builder)}
        </section>
      </section>
    </div>
  `;
  wireBuilder(team);
}

function renderBuilderInfoPanel(team, teams, costs, warnings) {
  return `
    <section class="builder-info-panel side-panel">
      <div class="builder-info-section builder-info-identity">
        <div class="builder-form builder-identity-form">
          <label class="filter-field">
            <span>${t("sidebar.teamHeading")}</span>
            <select data-builder-team>
              ${teams.map((item) => renderOption(item.slug, item.title, team.slug)).join("")}
            </select>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.teamName")}</span>
            <input type="text" value="${escapeHtml(state.builder.teamName || team.title)}" data-builder-name>
          </label>
          <label class="filter-field">
            <span>${t("savedRoster.logoField")}</span>
            <input type="file" accept="image/*" data-builder-logo>
          </label>
        </div>
        ${state.builder.logoData ? `
          <div class="builder-logo-inline roster-logo-inline">
            <img class="builder-logo-preview" src="${escapeHtml(state.builder.logoData)}" alt="">
            <button class="filter-button compact-action" type="button" data-builder-remove-logo>${t("savedRoster.removeLogo")}</button>
          </div>
        ` : ""}
        ${renderTeamRuleAccess(team, state.builder, "builder")}
      </div>
      <div class="builder-info-grid">
        <div class="builder-info-section builder-info-summary">
          <div class="summary-title-block">
            <h3>${t("savedRoster.summaryTitle")}</h3>
            <a class="builder-team-link" href="${pageUrl(team)}">${escapeHtml(team.title)}</a>
          </div>
          <dl class="stat-list summary-stat-grid">
            <dt>${t("myTeams.table.players")}</dt><dd>${costs.totalPlayersCount}</dd>
            <dt>${t("savedRoster.dedicatedFans")}</dt><dd>${countToNumber(state.builder.dedicatedFans)}</dd>
            ${hasBribery(team) ? `<dt>${t("savedRoster.bribes")}</dt><dd>${countToNumber(state.builder.bribes)}</dd>` : ""}
            <dt>${t("savedRoster.playersCost")}</dt><dd>${costs.playersCost}k</dd>
            <dt>${t("savedRoster.staffCost")}</dt><dd>${costs.staffCost}k</dd>
            <dt>${t("roster.totalCost")}</dt><dd>${costs.total}k</dd>
            <dt>${t("builder.remaining")}</dt><dd class="${costs.remaining < 0 ? "danger-text" : ""}">${costs.remaining}k</dd>
          </dl>
          <div class="summary-state-block">
            ${warnings.length ? `<div class="builder-warnings">${warnings.map((warning) => `<p>${escapeHtml(warning)}</p>`).join("")}</div>` : `<div class="builder-ok">${t("savedRoster.withinLimits")}</div>`}
            <div class="summary-actions">
              <button class="primary-button" type="button" data-save-team ${costs.total > startingBudget || !state.builder.players.length ? "disabled" : ""}>${t("builder.saveTeam")}</button>
              <button class="primary-button" type="button" data-copy-roster>${t("roster.copyRoster")}</button>
            </div>
          </div>
        </div>
        <div class="builder-info-section builder-info-purchases">
          <h2>${t("roster.purchasesHeading")}</h2>
          <div class="builder-tracker-list roster-tracker-list" aria-label="${t("roster.startingRosterTrackersAriaLabel")}">
            <div class="builder-addon compact-staff-control builder-tracker-control">
              <div>
                <strong>${t("savedRoster.startingRerolls")}</strong>
                <span>60k ${t("roster.each")}</span>
              </div>
              <div class="inline-stepper-control">
                <button class="filter-button" type="button" data-builder-reroll="-1" ${state.builder.startingRerolls <= 0 ? "disabled" : ""}>-</button>
                <strong>${state.builder.startingRerolls}</strong>
                <button class="filter-button" type="button" data-builder-reroll="1" ${costs.total + builderStaffCosts.startingRerolls > startingBudget ? "disabled" : ""}>+</button>
              </div>
            </div>
            ${renderBuilderStaffControl("dedicatedFans", t("savedRoster.dedicatedFans"), state.builder.dedicatedFans, costs.total + builderStaffCosts.dedicatedFans > startingBudget)}
            ${hasBribery(team) ? renderBuilderStaffControl("bribes", t("savedRoster.bribes"), state.builder.bribes, costs.total + builderStaffCosts.bribes > startingBudget) : ""}
            ${renderBuilderStaffControl("assistantCoaches", t("savedRoster.assistantCoaches"), state.builder.assistantCoaches, costs.total + builderStaffCosts.assistantCoaches > startingBudget)}
            ${renderBuilderStaffControl("cheerleaders", t("savedRoster.cheerleaders"), state.builder.cheerleaders, costs.total + builderStaffCosts.cheerleaders > startingBudget)}
            ${availableMedicalStaffDefinitions(team).map((staff) => {
              const blocked = costs.total + (builderStaffCosts[staff.key] ?? 0) > startingBudget;
              return renderBuilderStaffControl(staff.key, staff.title, state.builder[staff.key], blocked);
            }).join("")}
          </div>
        </div>
      </div>
    </section>
  `;
}

function renderAvailablePlayerTable(team, draft, enforceBudget = false) {
  const costs = calculateRosterCosts(team, draft, { includeDedicatedFans: enforceBudget });
  const rows = rowsForTeam(team);
  return `
    <div class="table-scroll builder-table-scroll builder-available-table-wrap">
      <table class="builder-table compact-roster-table">
        <thead>
          <tr>
            <th>${t("roster.qtyHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.primary")}</th>
            <th>${t("roster.secondary")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("builder.selectedHeader")}</th>
            <th>${t("common.add")}</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map((row, rowIndex) => {
    const baseCost = costToNumber(rowCost(row));
    const positionFull = !canAddRowToDraft(row, rowIndex, draft, true);
    const budgetBlocked = enforceBudget && costs.total + baseCost > startingBudget;
    const disabled = positionFull || budgetBlocked;
    const current = rowCountInPlayers(draft, rowIndex);
    return `
      <tr class="${disabled ? "disabled-row" : ""}">
        <td>${escapeHtml(row.qty || "-")}</td>
        <td><strong>${escapeHtml(row.position)}</strong></td>
        ${renderRosterStatCells(row)}
        <td class="skills-cell">${renderRosterLinks(row.skills)}</td>
        <td>${renderAccessCell(row.primary)}</td>
        <td>${renderAccessCell(row.secondary)}</td>
        <td>${escapeHtml(rowCost(row) || "-")}</td>
        <td>${current}/${rosterMax(row.qty)}${budgetBlocked ? `<span class="danger-text"> ${t("builder.overBudget")}</span>` : ""}</td>
        <td>
          <button class="primary-button table-plus-button" type="button" data-add-row="${rowIndex}" ${disabled ? "disabled" : ""}>+</button>
        </td>
      </tr>
    `;
          }).join("")}
        </tbody>
      </table>
    </div>
    <div class="builder-mobile-card-list available-player-mobile-list">
      ${rows.map((row, rowIndex) => renderAvailablePlayerCard(row, rowIndex, draft, costs, enforceBudget)).join("")}
    </div>
  `;
}

function renderAvailablePlayerCard(row, rowIndex, draft, costs, enforceBudget = false) {
  const baseCost = costToNumber(rowCost(row));
  const positionFull = !canAddRowToDraft(row, rowIndex, draft, true);
  const budgetBlocked = enforceBudget && costs.total + baseCost > startingBudget;
  const disabled = positionFull || budgetBlocked;
  const current = rowCountInPlayers(draft, rowIndex);
  return `
    <article class="available-player-card ${disabled ? "disabled" : ""}">
      <header class="available-player-head">
        <div>
          <strong>${escapeHtml(row.position)}</strong>
          <em>${escapeHtml(row.qty || "-")} · ${escapeHtml(rowCost(row) || "-")}</em>
        </div>
        <button class="primary-button add-player-button" type="button" data-add-row="${rowIndex}" ${disabled ? "disabled" : ""}>+</button>
      </header>
      ${renderRosterStatGrid(row)}
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(row.skills)}</div>
      </section>
      <footer class="available-player-foot">
        ${t("roster.primary")} ${renderAccessCell(row.primary)} · ${t("roster.secondary")} ${renderAccessCell(row.secondary)} · ${t("roster.selectedLabel")} ${current}/${rosterMax(row.qty)}${budgetBlocked ? ` · ${t("roster.overBudgetLabel")}` : ""}
      </footer>
    </article>
  `;
}

function renderBuilderStaffControl(key, title, value, plusBlocked = false) {
  const max = builderStaffMaximums[key] ?? 6;
  const current = countToNumber(value);
  const cost = builderStaffCosts[key] ?? 0;
  return `
    <div class="builder-addon compact-staff-control builder-tracker-control">
      <div>
        <strong>${escapeHtml(title)}</strong>
        <span>${cost}k${max > 1 ? ` ${t("roster.each")}` : ""}</span>
      </div>
      <div class="inline-stepper-control">
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="-1" ${current <= 0 ? "disabled" : ""}>-</button>
        <strong>${current}</strong>
        <button class="filter-button" type="button" data-builder-staff="${key}" data-builder-staff-step="1" ${current >= max || plusBlocked ? "disabled" : ""}>+</button>
      </div>
    </div>
  `;
}

function renderAccessCell(values = []) {
  const access = parseAccessCodes(values).join(" ");
  return escapeHtml(access || "-");
}

function renderRosterStatCells(row) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => `<td class="stat-table-cell">${escapeHtml(row[stat] || "-")}</td>`)
    .join("");
}

function renderPlayerStatCells(player) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => {
      const value = statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
      return `<td class="stat-table-cell">${escapeHtml(value)}</td>`;
    })
    .join("");
}

function renderEditablePlayerStatCells(player) {
  return ["ma", "st", "ag", "pa", "ar"]
    .map((stat) => {
      const mod = Number(player.statMods?.[stat] ?? 0);
      const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
      const value = statValueForDisplayByStat(stat, player.row[stat], mod);
      return `
        <td class="stat-table-cell ${modClass}">
          <div class="table-stat-control">
            <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
            <strong>${escapeHtml(value)}</strong>
            <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
          </div>
        </td>
      `;
    })
    .join("");
}

function renderBuilderPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  if (!players.length) {
    return `<div class="builder-empty-roster">${t("builder.emptyRosterHint")}</div>`;
  }
  return `
    <div class="table-scroll builder-table-scroll builder-selected-table-wrap">
      <table class="builder-selected-table compact-roster-table">
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
            <th>${t("roster.captain")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderBuilderPlayerRow(player, index)).join("")}
        </tbody>
      </table>
    </div>
    <div class="builder-mobile-card-list builder-selected-mobile-list">
      ${players.map((player, index) => renderBuilderPlayerCard(player, index)).join("")}
    </div>
  `;
}

function renderBuilderPlayerRow(player, index) {
  return `
    <tr>
      <td>${index + 1}</td>
      <td>
        <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
      </td>
      <td><strong>${escapeHtml(player.row.position)}</strong></td>
      ${renderPlayerStatCells(player)}
      <td>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </td>
      <td class="skills-cell">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</td>
      <td>${escapeHtml(rowCost(player.row) || "-")}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderBuilderPlayerStatGrid(player) {
  const value = (stat) => statValueForDisplayByStat(stat, player.row[stat], player.statMods?.[stat] ?? 0);
  return `
    <dl class="team-stat-grid">
      <div><dt>MA</dt><dd>${escapeHtml(value("ma"))}</dd></div>
      <div><dt>ST</dt><dd>${escapeHtml(value("st"))}</dd></div>
      <div><dt>AG</dt><dd>${escapeHtml(value("ag"))}</dd></div>
      <div><dt>PA</dt><dd>${escapeHtml(value("pa"))}</dd></div>
      <div><dt>AR</dt><dd>${escapeHtml(value("ar"))}</dd></div>
    </dl>
  `;
}

function renderBuilderPlayerCard(player, index) {
  return `
    <article class="saved-roster-player-card mobile-roster-player-card builder-selected-player-card">
      <header>
        <div class="mobile-player-title">
          <span>#${index + 1}</span>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-builder-player-name="${escapeHtml(player.id)}">
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}</small>
        </div>
        <button class="filter-button compact-action" type="button" data-remove-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
      </header>
      <section class="mobile-player-section">
        <h3>${t("roster.statsLabel")}</h3>
        ${renderBuilderPlayerStatGrid(player)}
      </section>
      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">${renderRosterLinks(skillNamesForPlayer(player.row, player))}</div>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-builder-player-captain="${escapeHtml(player.id)}" ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </section>
    </article>
  `;
}

function renderSavedPlayerList(team, draft) {
  const players = selectedRosterPlayers(team, draft);
  const hasFavouredAccess = teamFavouredOptions(team).length > 0;
  if (!players.length) {
    return `<div class="builder-empty-roster">${t("savedRoster.noPlayersYet")}</div>`;
  }
  return `
    <div class="table-scroll builder-table-scroll saved-roster-table-wrap">
      <table class="saved-roster-table compact-roster-table">
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
            <th>${t("roster.addSkillHeader")}</th>
            <th>${t("roster.skipHeader")}</th>
            <th>${t("roster.niglingInjury")}</th>
            <th>${t("roster.captain")}</th>
            <th>${t("roster.extendedContracts")}</th>
            <th>SPP</th>
            <th>${t("roster.levelHeader")}</th>
            <th>${t("roster.advancementHeader")}</th>
            ${hasFavouredAccess ? `<th>${t("roster.favouredOf")}</th>` : ""}
            <th>${t("sidebar.cost")}</th>
            <th>${t("roster.actionHeader")}</th>
          </tr>
        </thead>
        <tbody>
          ${players.map((player, index) => renderSavedPlayerRow(team, draft, player, index, hasFavouredAccess)).join("")}
        </tbody>
      </table>
    </div>
    <div class="saved-roster-mobile-list">
      ${players.map((player, index) => renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess)).join("")}
    </div>
  `;
}

function renderSavedNewPlayerTable(team, draft) {
  return `
    <div class="table-scroll builder-table-scroll">
      <table class="builder-table compact-roster-table add-player-table">
        <thead>
          <tr>
            <th>${t("roster.qtyHeader")}</th>
            <th>${t("roster.positionHeader")}</th>
            <th>${t("stats.ma")}</th>
            <th>${t("stats.st")}</th>
            <th>${t("stats.ag")}</th>
            <th>${t("stats.pa")}</th>
            <th>${t("stats.ar")}</th>
            <th>${t("roster.skillsLabel")}</th>
            <th>${t("roster.primary")}</th>
            <th>${t("roster.secondary")}</th>
            <th>${t("sidebar.cost")}</th>
            <th>${t("savedRoster.rosterHeading")}</th>
            <th>${t("common.add")}</th>
          </tr>
        </thead>
        <tbody>
          ${rowsForTeam(team).map((row, rowIndex) => {
    const current = rowCountInPlayers(draft, rowIndex);
    return `
      <tr>
        <td>${escapeHtml(row.qty || "-")}</td>
        <td><strong>${escapeHtml(row.position)}</strong></td>
        ${renderRosterStatCells(row)}
        <td class="skills-cell">${renderRosterLinks(row.skills)}</td>
        <td>${renderAccessCell(row.primary)}</td>
        <td>${renderAccessCell(row.secondary)}</td>
        <td>${escapeHtml(rowCost(row) || "-")}</td>
        <td>${current}/${rosterMax(row.qty)}</td>
        <td>
          <button class="primary-button table-plus-button" type="button" data-add-saved-row="${rowIndex}">+</button>
        </td>
      </tr>
    `;
          }).join("")}
        </tbody>
      </table>
    </div>
  `;
}

function renderSavedPlayerFavouredEditor(team, draft, player, inputId) {
  const choice = ensureDraftFavouredChoice(team, draft);
  if (!choice) return `<span class="muted-text">-</span>`;
  const options = favouredSkillOptionsForPlayer(team, draft, player.row, player);
  return `
    <div class="favoured-skill-editor">
      <small>${escapeHtml(choice)}</small>
      <div class="table-skill-editor">
        <input class="table-input" type="text" list="${escapeHtml(inputId)}" placeholder="${t("roster.favouredSkillPlaceholder")}" data-saved-player-favoured-skill ${!options.length ? "disabled" : ""}>
        <datalist id="${escapeHtml(inputId)}">
          ${options.map((option) => `<option value="${escapeHtml(option.name)}" label="${escapeHtml(option.alignment)}"></option>`).join("")}
        </datalist>
        <button class="filter-button compact-action" type="button" data-saved-player-add-favoured ${!options.length ? "disabled" : ""}>${t("common.add")}</button>
      </div>
    </div>
  `;
}

function renderPlayerContractControls(player) {
  const contracts = Math.max(0, countToNumber(player.extendedContracts));
  return `
    <div class="player-contract-control">
      <div class="inline-stepper-control compact-contract-stepper">
        <button class="filter-button" type="button" data-saved-player-contract-delta="-1" ${contracts <= 0 ? "disabled" : ""}>-</button>
        <strong>${contracts}</strong>
        <button class="filter-button" type="button" data-saved-player-contract-delta="1">+</button>
      </div>
      ${contracts ? `<small class="cost-note">+${contracts * 20}k</small>` : ""}
    </div>
  `;
}

function renderFavouredSkillButtons(player) {
  const favouredSkills = normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []);
  if (!favouredSkills.length) return "";
  return `
    <div class="player-extra-skills table-extra-skills favoured-extra-skills">
      ${favouredSkills.map((skill) => `
        <button class="roster-pill favoured-skill-pill" type="button" data-saved-player-remove-favoured="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
      `).join("")}
    </div>
  `;
}

function renderCaptainSkillBadge(player) {
  if (!player.isCaptain) return "";
  const nonCaptainSkills = new Set([
    ...(player.row.skills ?? []),
    ...normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).map((skill) => skill.name),
    ...normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []).map((skill) => skill.name),
  ]);
  return `
    <div class="player-extra-skills table-extra-skills captain-extra-skills">
      ${nonCaptainSkills.has("Pro") ? "" : renderRosterLinks(["Pro"])}
      <span class="roster-pill roster-pill-muted">${t("roster.captain")}</span>
    </div>
  `;
}

function renderSavedPlayerRow(team, draft, player, index, hasFavouredAccess = false) {
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `skill-options-${index}`;
  const favouredInputId = `favoured-skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <tr data-roster-player="${escapeHtml(player.id)}" draggable="true">
      <td class="saved-number-cell">
        <div class="saved-number-control">
          <button class="filter-button compact-action drag-handle table-drag-handle" type="button" draggable="true" data-player-drag-handle title="${t("roster.dragToReorder")}" aria-label="${t("roster.dragToReorder")}">↕</button>
          <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
        </div>
      </td>
      <td>
        <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>
      </td>
      <td><strong>${escapeHtml(player.row.position)}</strong></td>
      ${renderEditablePlayerStatCells(player)}
      <td class="skills-cell">
        ${renderRosterLinks(player.row.skills)}
        ${extraSkills.length ? `
          <div class="player-extra-skills table-extra-skills">
            ${extraSkills.map((skill) => `
              <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
            `).join("")}
          </div>
        ` : ""}
        ${renderFavouredSkillButtons(player)}
        ${renderCaptainSkillBadge(player)}
        ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
      </td>
      <td>
        <div class="table-skill-editor">
          <input class="table-input" type="text" list="${escapeHtml(skillInputId)}" placeholder="${t("roster.skillPlaceholder")}" data-saved-player-skill>
          <datalist id="${escapeHtml(skillInputId)}">
            ${skillOptions.map((option) => `
              <option value="${escapeHtml(option.name)}" label="${escapeHtml(option.access === "secondary" ? t("roster.secondary") : t("roster.primary"))}"></option>
            `).join("")}
          </datalist>
          <button class="filter-button compact-action" type="button" data-saved-player-add-skill>${t("common.add")}</button>
        </div>
      </td>
      <td>
        <label class="table-checkbox" title="${t("roster.skipNextGame")}">
          <input type="checkbox" data-saved-player-skip ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipHeader")}</span>
        </label>
      </td>
      <td>
        <label class="table-checkbox" title="${t("roster.niglingInjury")}">
          <input type="checkbox" data-saved-player-nigling ${player.niglingInjury ? "checked" : ""}>
          <span>${t("roster.niglingInjury")}</span>
        </label>
      </td>
      <td>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-saved-player-captain ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </td>
      <td>${renderPlayerContractControls(player)}</td>
      <td class="spp-cell">${renderPlayerSppControls(team, player)}</td>
      <td class="level-cell">${renderPlayerLevelCell(team, player)}</td>
      <td class="advancement-cell">${renderPlayerAdvancementControls(team, player)}</td>
      ${hasFavouredAccess ? `<td class="favoured-skill-cell">${renderSavedPlayerFavouredEditor(team, draft, player, favouredInputId)}</td>` : ""}
      <td>${escapeHtml(rowCost(player.row) || "-")}${adjustment ? `<span class="cost-note inline-cost-note">${adjustment > 0 ? "+" : ""}${adjustment}k</span>` : ""}</td>
      <td><button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button></td>
    </tr>
  `;
}

function renderSavedPlayerCard(team, draft, player, index, hasFavouredAccess = false) {
  if (!isSavedRosterPlayerExpanded(player.id)) {
    return renderSavedPlayerPreviewCard(team, player, index);
  }
  const extraSkills = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []);
  const adjustment = playerAdjustmentCost(player);
  const eliteCost = eliteComboCost(player.row, player);
  const skillInputId = `mobile-skill-options-${index}`;
  const favouredInputId = `mobile-favoured-skill-options-${index}`;
  const skillOptions = availableSkillOptionsForPlayer(player.row, player);
  return `
    <article class="saved-roster-player-card mobile-roster-player-card is-expanded" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <label class="mobile-player-number">
            <span>${t("roster.numberAbbr")}</span>
            <input class="table-input table-number-input" type="text" value="${escapeHtml(player.number ?? index + 1)}" data-saved-player-number>
          </label>
          <input class="table-input" type="text" value="${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}" data-saved-player-name>
          <small>${escapeHtml(player.row.position)} · ${escapeHtml(rowCost(player.row) || "-")}${adjustment ? ` · ${adjustment > 0 ? "+" : ""}${adjustment}k` : ""}</small>
        </div>
        <div class="mobile-card-actions">
          <button class="filter-button compact-action" type="button" data-saved-player-collapse="${escapeHtml(player.id)}">${t("roster.previewAction")}</button>
          <button class="filter-button compact-action" type="button" data-remove-saved-player="${escapeHtml(player.id)}">${t("common.remove")}</button>
        </div>
      </header>

      <section class="mobile-player-section">
        <h3>${t("roster.statsHeading")}</h3>
        ${renderEditableStatLine(player)}
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">
          ${renderRosterLinks(player.row.skills)}
          ${extraSkills.map((skill) => `
            <button class="roster-pill" type="button" data-saved-player-remove-skill="${escapeHtml(skill.name)}">${escapeHtml(`${skill.name} x`)}</button>
          `).join("")}
          ${renderFavouredSkillButtons(player)}
          ${renderCaptainSkillBadge(player)}
        </div>
        ${eliteCost ? `<p class="cost-note">${t("roster.eliteCombo")} +${eliteCost}k</p>` : ""}
        <div class="table-skill-editor mobile-skill-editor">
          <input class="table-input" type="text" list="${escapeHtml(skillInputId)}" placeholder="${t("roster.skillPlaceholder")}" data-saved-player-skill>
          <datalist id="${escapeHtml(skillInputId)}">
            ${skillOptions.map((option) => `
              <option value="${escapeHtml(option.name)}" label="${escapeHtml(option.access === "secondary" ? t("roster.secondary") : t("roster.primary"))}"></option>
            `).join("")}
          </datalist>
          <button class="filter-button compact-action" type="button" data-saved-player-add-skill>${t("common.add")}</button>
        </div>
        ${hasFavouredAccess ? renderSavedPlayerFavouredEditor(team, draft, player, favouredInputId) : ""}
      </section>

      <section class="mobile-player-section mobile-player-checks">
        <label class="table-checkbox" title="${t("roster.skipNextGame")}">
          <input type="checkbox" data-saved-player-skip ${player.skipNextGame ? "checked" : ""}>
          <span>${t("roster.skipNextGame")}</span>
        </label>
        <label class="table-checkbox" title="${t("roster.niglingInjury")}">
          <input type="checkbox" data-saved-player-nigling ${player.niglingInjury ? "checked" : ""}>
          <span>${t("roster.niglingInjury")}</span>
        </label>
        <label class="table-checkbox" title="${t("roster.captain")}">
          <input type="checkbox" data-saved-player-captain ${player.isCaptain ? "checked" : ""}>
          <span>${t("roster.captain")}</span>
        </label>
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.extendedContracts")}</h3>
        ${renderPlayerContractControls(player)}
      </section>

      <section class="mobile-player-section">
        <h3>SPP</h3>
        ${renderPlayerSppControls(team, player)}
      </section>

      <section class="mobile-player-section mobile-advancement-section">
        <div>
          <h3>${t("roster.levelHeader")}</h3>
          ${renderPlayerLevelCell(team, player)}
        </div>
        <div>
          <h3>${t("roster.advancementHeader")}</h3>
          ${renderPlayerAdvancementControls(team, player)}
        </div>
      </section>
    </article>
  `;
}

function renderSavedPlayerPreviewCard(team, player, index) {
  return `
    <article class="saved-roster-player-card mobile-roster-player-card is-preview" data-roster-player="${escapeHtml(player.id)}">
      <header>
        <div class="mobile-player-title">
          <strong>${escapeHtml(player.name || `${player.row.position} ${index + 1}`)}</strong>
          <small>${escapeHtml(player.row.position)}</small>
        </div>
        <button class="primary-button compact-action" type="button" data-saved-player-expand="${escapeHtml(player.id)}">${t("roster.advanceAction")}</button>
      </header>

      <section class="mobile-player-section">
        <h3>${t("roster.statsHeading")}</h3>
        ${renderReadonlyStatLine(player)}
      </section>

      <section class="mobile-player-section">
        <h3>${t("roster.skillsLabel")}</h3>
        <div class="mobile-player-pills">
          ${renderPlayerPreviewSkills(player)}
        </div>
      </section>

      <section class="mobile-player-section">
        <div class="mobile-spp-preview-head">
          <h3>SPP</h3>
          <strong>${playerSppTotal(team, player)} ${t("roster.sppEarned")}</strong>
        </div>
        <div class="mobile-spp-action-grid">
          ${renderSppActionButtons(player)}
        </div>
      </section>
    </article>
  `;
}

function renderPlayerPreviewSkills(player) {
  const names = [
    ...(player.row.skills ?? []),
    ...normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).map((skill) => skill.name),
    ...normalizePlayerFavouredSkills(player.row, player.favouredSkills ?? []).map((skill) => skill.name),
  ];
  if (player.isCaptain && !names.includes("Pro")) names.push("Pro");
  const rendered = renderRosterLinks(uniqueSorted(names));
  return `${rendered}${player.isCaptain ? `<span class="roster-pill roster-pill-muted">${t("roster.captain")}</span>` : ""}`;
}

function renderSppActionButtons(player) {
  const spp = normalizeSppCounters(player.spp);
  return sppCounterDefinitions.map(([key, label]) => `
    <button class="filter-button mobile-spp-action" type="button" data-saved-player-spp-action="${escapeHtml(key)}">
      <span>${escapeHtml(label)}</span>
      <strong>${spp[key]}</strong>
      <em>+1</em>
    </button>
  `).join("");
}

function renderReadonlyStatLine(player) {
  const stats = ["ma", "st", "ag", "pa", "ar"];
  return `
    <div class="player-stat-editors readonly-stat-line">
      ${stats.map((stat) => {
    const mod = Number(player.statMods?.[stat] ?? 0);
    const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
    return `
        <div class="player-stat-editor ${modClass}">
          <span>${stat.toUpperCase()}</span>
          <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
        </div>
      `;
  }).join("")}
    </div>
  `;
}

function renderPlayerSppControls(team, player) {
  const spp = normalizeSppCounters(player.spp);
  return `
    <div class="spp-counter-grid">
      ${sppCounterDefinitions.map(([key, label]) => `
        <label class="spp-counter-field">
          <span>${escapeHtml(label)}</span>
          <input type="number" min="0" step="1" value="${spp[key]}" data-saved-player-spp="${key}">
        </label>
      `).join("")}
    </div>
    <strong class="spp-total" data-player-spp-total>${playerSppTotal(team, player)} ${t("roster.sppEarned")}</strong>
  `;
}

function renderPlayerLevelCell(team, player) {
  const level = playerAdvancementLevel(player);
  return `
    <div class="player-level-stack">
      <strong>${level}</strong>
      <span>${escapeHtml(playerLevelRank(player))}</span>
      <small data-player-spent-spp>${playerAdvancementSpent(player)} ${t("roster.sppSpent")}</small>
      <small data-player-available-spp>${playerAvailableSpp(team, player)} ${t("roster.sppAvailable")}</small>
    </div>
  `;
}

function renderPlayerAdvancementControls(team, player) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  const level = playerAdvancementLevel(player);
  const nextRank = advancementRanks[level];
  const available = playerAvailableSpp(team, player);
  const canAdvance = Boolean(nextRank);
  return `
    <div class="advancement-control">
      ${canAdvance ? `
        <div class="advancement-add-row">
          <select class="table-select" data-saved-player-advancement-type>
            ${Object.entries(advancementTypeLabels).map(([type, label]) => {
    const verdict = canTakeAdvancement(team, player, type);
    return `
              <option value="${type}" ${verdict.allowed ? "" : "disabled"}>${escapeHtml(`${label} (${nextRank.costs[type]} SPP)${verdict.allowed ? "" : ` — ${t("roster.notEnoughSpp")}`}`)}</option>
            `;
  }).join("")}
          </select>
          <button class="filter-button compact-action" type="button" data-saved-player-add-advancement>${t("common.add")}</button>
        </div>
        <small class="advancement-next" data-player-next-advancement>${t("roster.next")}: ${escapeHtml(nextRank.rank)}, ${available} ${t("roster.sppAvailable")}</small>
      ` : `<span class="muted-text">${t("roster.maxLevel")}</span>`}
      <div class="advancement-list">
        ${advancements.length ? advancements.map((advancement, index) => {
    const cost = advancementRanks[index]?.costs?.[advancement.type] ?? 0;
    const label = advancementTypeLabels[advancement.type] ?? advancement.type;
    return `
            <button class="roster-pill advancement-pill" type="button" data-saved-player-remove-advancement="${index}">
              ${escapeHtml(`${index + 1}. ${label}: ${cost} SPP x`)}
            </button>
          `;
  }).join("") : `<span class="muted-text">${t("roster.noAdvancementsYet")}</span>`}
      </div>
    </div>
  `;
}

function renderEditableStatLine(player) {
  const stats = ["ma", "st", "ag", "pa", "ar"];
  return `
    <div class="player-stat-editors editable-stat-line">
      ${stats.map((stat) => {
        const mod = Number(player.statMods?.[stat] ?? 0);
        const modClass = mod > 0 ? "stat-up" : mod < 0 ? "stat-down" : "";
        return `
          <div class="player-stat-editor ${modClass}">
            <span>${stat.toUpperCase()}</span>
            <strong>${escapeHtml(statValueForDisplayByStat(stat, player.row[stat], mod))}</strong>
            <div class="mini-stepper">
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="-1">-</button>
              <button type="button" data-saved-stat="${stat}" data-saved-stat-delta="1">+</button>
            </div>
          </div>
        `;
      }).join("")}
    </div>
  `;
}

function calculateBuilderCosts(team) {
  return calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
}

function builderWarnings(team, costs) {
  return rosterWarnings(team, state.builder, costs);
}

/** Domain violations rendered in the current locale. */
function warningMessages(violations) {
  return violations.map((violation) => t(`validation.${violation.code}`, violation.params));
}

function rosterWarnings(team, draft, costs) {
  return warningMessages(validateRoster(team, draft, costs));
}

function wireBuilder(team) {
  // Any control in the builder mutates state.builder directly, so listening on
  // the container is enough to know something changed.
  const persistDraft = () => builderDraftStore.save(state.builder);
  for (const event of ["input", "click", "change"]) view.addEventListener(event, persistDraft);
  view.querySelector("[data-builder-reset]")?.addEventListener("click", () => {
    if (!isEmptyBuilderDraft(state.builder) && !confirm(t("builder.startOverConfirm"))) return;
    builderDraftStore.clear();
    resetBuilderForTeam(state.data.teams[0]);
    renderBuilder();
  });
  view.querySelector("[data-builder-team]")?.addEventListener("change", (event) => {
    state.builder.teamSlug = event.currentTarget.value;
    const nextTeam = state.data.teams.find((item) => item.slug === state.builder.teamSlug);
    resetBuilderForTeam(nextTeam);
    renderBuilder();
  });
  view.querySelector("[data-builder-league]")?.addEventListener("change", (event) => {
    state.builder.selectedLeague = event.currentTarget.value;
  });
  view.querySelector("[data-builder-favoured]")?.addEventListener("change", (event) => {
    state.builder.favouredChoice = event.currentTarget.value;
  });
  view.querySelector("[data-builder-name]")?.addEventListener("input", (event) => {
    state.builder.teamName = event.currentTarget.value;
  });
  view.querySelector("[data-builder-logo]")?.addEventListener("change", async (event) => {
    const file = event.currentTarget.files?.[0];
    if (!file) return;
    if (file.size > logoUploadMaxBytes) {
      alert(t("savedRoster.logoTooLarge"));
      event.currentTarget.value = "";
      return;
    }
    state.builder.logoData = await fileToOptimizedLogoDataUrl(file);
    renderBuilder();
  });
  view.querySelector("[data-builder-remove-logo]")?.addEventListener("click", () => {
    state.builder.logoData = "";
    renderBuilder();
  });
  view.querySelectorAll("[data-add-row]").forEach((button) => {
    button.addEventListener("click", () => {
      const rowIndex = Number(button.dataset.addRow);
      const row = rowsForTeam(team)[rowIndex];
      if (!row) return;
      const costs = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
      if (costs.total + costToNumber(rowCost(row)) > startingBudget) return;
      if (!canAddRowToDraft(row, rowIndex, state.builder, true)) return;
      state.builder.players.push(makeRosterPlayer(row, rowIndex, rowCountInPlayers(state.builder, rowIndex)));
      syncRosterCountsFromPlayers(state.builder);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-remove-player]").forEach((button) => {
    button.addEventListener("click", () => {
      state.builder.players = state.builder.players.filter((player) => player.id !== button.dataset.removePlayer);
      syncRosterCountsFromPlayers(state.builder);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-player-name]").forEach((input) => {
    input.addEventListener("input", (event) => {
      const player = state.builder.players.find((item) => item.id === input.dataset.builderPlayerName);
      if (player) player.name = event.currentTarget.value;
    });
  });
  view.querySelectorAll("[data-builder-player-captain]").forEach((input) => {
    input.addEventListener("change", (event) => {
      setRosterCaptain(state.builder, input.dataset.builderPlayerCaptain, event.currentTarget.checked);
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-reroll]").forEach((button) => {
    button.addEventListener("click", () => {
      const delta = Number(button.dataset.builderReroll);
      const next = clamp(countToNumber(state.builder.startingRerolls) + delta, 0, builderStaffMaximums.startingRerolls);
      const previous = countToNumber(state.builder.startingRerolls);
      const projected = calculateRosterCosts(team, { ...state.builder, startingRerolls: next }, { includeDedicatedFans: true }).total;
      if (projected > startingBudget && next > previous) return;
      state.builder.startingRerolls = next;
      renderBuilder();
    });
  });
  view.querySelectorAll("[data-builder-staff]").forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.dataset.builderStaff;
      const delta = Number(button.dataset.builderStaffStep);
      const max = builderStaffMaximums[key] ?? 6;
      const next = clamp(countToNumber(state.builder[key]) + delta, 0, max);
      const previous = countToNumber(state.builder[key]);
      const projected = calculateRosterCosts(team, { ...state.builder, [key]: next }, { includeDedicatedFans: true }).total;
      if (projected > startingBudget && next > previous) return;
      state.builder[key] = next;
      renderBuilder();
    });
  });
  view.querySelector("[data-copy-roster]")?.addEventListener("click", () => copyRoster(team));
  view.querySelector("[data-save-team]")?.addEventListener("click", () => saveTeam(team));
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result || "")));
    reader.addEventListener("error", reject);
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener("load", () => resolve(image), { once: true });
    image.addEventListener("error", reject, { once: true });
    image.src = dataUrl;
  });
}

function canvasToDataUrl(canvas, mimeType, quality) {
  try {
    return canvas.toDataURL(mimeType, quality);
  } catch (_error) {
    return "";
  }
}

async function optimizeLogoDataUrl(dataUrl) {
  const source = String(dataUrl || "");
  if (!source.startsWith("data:image/")) return source;
  if (source.startsWith("data:image/webp") && source.length <= logoOptimizeSkipLength) return source;
  if (logoOptimizationCache.has(source)) return logoOptimizationCache.get(source);

  let optimized = source;
  try {
    const image = await loadImageFromDataUrl(source);
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (width > 0 && height > 0) {
      const scale = Math.min(1, logoOptimizeMaxDimension / Math.max(width, height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(width * scale));
      canvas.height = Math.max(1, Math.round(height * scale));
      const context = canvas.getContext("2d", { alpha: true });
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
      const webp = canvasToDataUrl(canvas, "image/webp", logoOptimizeQuality);
      if (webp.startsWith("data:image/webp") && webp.length < source.length) {
        optimized = webp;
      }
    }
  } catch (_error) {
    optimized = source;
  }

  logoOptimizationCache.set(source, optimized);
  return optimized;
}

async function fileToOptimizedLogoDataUrl(file) {
  const source = await fileToDataUrl(file);
  return optimizeLogoDataUrl(source);
}

async function copyRoster(team) {
  const lines = buildRosterText(team, state.builder);
  await navigator.clipboard.writeText(lines);
  const button = view.querySelector("[data-copy-roster]");
  if (button) {
    button.textContent = t("roster.copiedStatus");
    setTimeout(() => { button.textContent = t("roster.copyRoster"); }, 1200);
  }
}

async function saveTeam(team) {
  if (!state.auth.currentUser) {
    openAuthModal("login");
    return;
  }
  syncRosterCountsFromPlayers(state.builder);
  const payload = builderPayload(team);
  payload.logoData = await optimizeLogoDataUrl(payload.logoData);
  state.builder.logoData = payload.logoData;
  const startupCosts = calculateRosterCosts(team, state.builder, { includeDedicatedFans: true });
  payload.treasury = Math.max(0, startingBudget - startupCosts.total);
  const request = {
    name: payload.teamName,
    baseTeamSlug: team.slug,
    logoData: payload.logoData,
    roster: payload,
  };
  try {
    const result = await apiRequest("/api/teams", {
      method: "POST",
      body: JSON.stringify(request),
    });
    state.builder.editingTeamId = result.team.id;
    builderDraftStore.clear();
    state.myTeams.loaded = false;
    const button = view.querySelector("[data-save-team]");
    if (button) {
      button.textContent = t("roster.savedStatus");
      setTimeout(() => {
        location.hash = `#/my-teams/${encodeURIComponent(result.team.id)}`;
      }, 700);
    }
  } catch (error) {
    alert(error.message);
  }
}

function buildRosterText(team) {
  return buildRosterTextForDraft(team, state.builder);
}

function buildRosterTextForDraft(team, draft) {
  const selected = selectedRosterPlayers(team, draft);
  const costs = calculateRosterCosts(team, draft);
  const lines = [
    `${draft.teamName || team.title} (${team.title})`,
    draft.selectedLeague ? `League Access: ${draft.selectedLeague}` : "",
    draft.favouredChoice ? `Favoured Of: ${draft.favouredChoice}` : "",
    `Total Cost: ${costs.total}k`,
    `Treasury: ${draft.treasury ?? 0}k`,
    `Coach's Safe: ${draft.coachesSafe ?? 0}k`,
    "",
    ...selected.map((player) => [
      `#${player.number ?? player.index + 1} ${player.name} (${player.row.position}) - ${rowCost(player.row)}${playerStatusText(player) !== "-" ? ` - ${playerStatusText(player)}` : ""}`,
      `  Stats: MA ${statValueForDisplayByStat("ma", player.row.ma, player.statMods.ma ?? 0)} / ST ${statValueForDisplayByStat("st", player.row.st, player.statMods.st ?? 0)} / AG ${statValueForDisplayByStat("ag", player.row.ag, player.statMods.ag ?? 0)} / PA ${statValueForDisplayByStat("pa", player.row.pa, player.statMods.pa ?? 0)} / AR ${statValueForDisplayByStat("ar", player.row.ar, player.statMods.ar ?? 0)}`,
      `  Skills: ${skillNamesForPlayer(player.row, player).join(", ") || "-"}`,
    ].join("\n")),
    draft.teamRerolls ? `Team Rerolls: ${draft.teamRerolls}` : "",
    draft.startingRerolls ? `Starting Rerolls: ${draft.startingRerolls}` : "",
    draft.bribes ? `Bribes: ${draft.bribes}` : "",
    draft.dedicatedFans ? `Dedicated Fans: ${draft.dedicatedFans}` : "",
    draft.assistantCoaches ? `Assistant Coaches: ${draft.assistantCoaches}` : "",
    draft.cheerleaders ? `Cheerleaders: ${draft.cheerleaders}` : "",
    ...medicalStaffDefinitions.map((staff) => draft[staff.key] ? `${staff.title}: ${draft[staff.key]}` : ""),
  ].filter(Boolean).join("\n");
  return lines;
}

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
  season: () => renderSeason(),
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
