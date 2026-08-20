import { matchRoute, routeFromHash } from "./core/routes.mjs";
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
import { setActiveNav, setViewSection } from "./components/page-chrome.mjs";
import { authButton, updateAuthButton } from "./components/auth-button.mjs";
import { renderHome } from "./screens/home.mjs";
import { renderOverviewDetail } from "./screens/overview.mjs";
import { renderSection } from "./screens/section.mjs";
import { renderDetail } from "./screens/detail.mjs";
import { renderLegal } from "./screens/legal.mjs";
import { renderMyTeams } from "./screens/my-teams.mjs";
import { renderSavedRoster, rosterStore } from "./screens/saved-roster.mjs";
import { renderBuilder } from "./screens/builder.mjs";
import { renderSeason } from "./screens/season/index.mjs";
import { loadGames, renderMyGames } from "./screens/games/my-games.mjs";
import { renderGamePage } from "./screens/games/game.mjs";
import { renderAdministration } from "./screens/administration/users.mjs";
import { renderAdminUserProfile } from "./screens/administration/user.mjs";
import { renderPlayerProfile } from "./screens/players/profile.mjs";
import { renderPublicTeamProfile } from "./screens/players/team.mjs";

const searchInput = document.querySelector("#global-search");
const generatedAt = document.querySelector("#generated-at");
const langToggle = document.querySelector("#lang-toggle");
const navToggle = document.querySelector("#nav-toggle");
const navOverlay = document.querySelector("#nav-overlay");
const navList = document.querySelector(".nav-list");
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
