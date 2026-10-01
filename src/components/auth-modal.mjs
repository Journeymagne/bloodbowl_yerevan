/**
 * The sign-in / register / account modal, and the session it manages.
 *
 * Mechanically moved out of src/app.js. The header button it toggles lives in
 * components/auth-button.mjs (moved in 6.8, because the admin screens refresh
 * it too); everything else about the modal is here, so app.js is left as
 * bootstrap only.
 *
 * `wireAuthModal` attaches the listeners app.js used to attach inline, and is
 * the one thing bootstrap has to call.
 *
 */
import { errorText } from "../core/api.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { apiRequest, authToken, setAuthToken } from "../core/api-client.mjs";
import { renderRoute } from "../core/router.mjs";
import { loadGames } from "../screens/games/my-games.mjs";
import { authButton, updateAuthButton } from "./auth-button.mjs";

const authModal = document.querySelector("#auth-modal");
const authForm = document.querySelector("#auth-form");
const authTitle = document.querySelector("#auth-title");
const authSubmit = document.querySelector("#auth-submit");
const authSwitch = document.querySelector("#auth-switch");
const authSwitchHint = document.querySelector("#auth-switch-hint");
let authReturnFocus;
const authError = document.querySelector("#auth-error");
const authAccount = document.querySelector("#auth-account");
const authAccountText = document.querySelector("#auth-account-text");
const authProfileForm = document.querySelector("#auth-profile-form");
const authLogout = document.querySelector("#auth-logout");
const authTelegramField = document.querySelector("[data-auth-telegram]");

function setAuthError(message = "") {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message;
}

export async function loadAuthSession() {
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

export function setAuthMode(mode) {
  state.auth.mode = mode;
  setAuthError("");
  const isAccount = mode === "account" && state.auth.currentUser;
  const isRegister = mode === "register";

  if (authTitle) {
    authTitle.textContent = isAccount ? t("auth.account") : isRegister ? t("auth.register") : t("auth.login");
  }
  if (authForm) {
    authForm.hidden = isAccount;
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
    authSubmit.textContent = isRegister ? t("auth.createAccount") : t("auth.signIn");
  }
  if (authSwitch) {
    authSwitch.textContent = isRegister ? t("auth.signIn") : t("auth.createAccount");
  }
  if (authSwitchHint) authSwitchHint.textContent = isRegister ? t("auth.haveAccount") : t("auth.noAccount");
  authForm?.elements.password.setAttribute("autocomplete", isRegister ? "new-password" : "current-password");
}

function openAuthModal(mode = "login") {
  if (!authModal) return;
  authReturnFocus = document.activeElement;
  authForm?.reset();
  document.querySelector(".app-shell").inert = true;
  document.querySelector("[data-skip-to-content]").inert = true;
  authModal.hidden = false;
  document.body.classList.add("auth-open");
  setAuthMode(state.auth.currentUser && mode !== "register" ? "account" : mode);
  const form = state.auth.mode === "account" ? authProfileForm : authForm;
  form?.querySelector("input")?.focus();
}

export function closeAuthModal() {
  if (!authModal || authModal.hidden) return;
  authModal.hidden = true;
  document.body.classList.remove("auth-open");
  document.querySelector(".app-shell").inert = false;
  document.querySelector("[data-skip-to-content]").inert = false;
  (authReturnFocus?.isConnected ? authReturnFocus : authButton)?.focus();
  setAuthError("");
}

async function handleAuthSubmit(event) {
  event.preventDefault();
  const data = new FormData(authForm);
  const login = String(data.get("login") ?? "").trim();
  const password = String(data.get("password") ?? "");
  const telegram = String(data.get("telegram") ?? "").trim();

  if (login.length < 3) {
    setAuthError(t("auth.validation.login"));
    return;
  }
  if (password.length < 4) {
    setAuthError(t("auth.validation.password"));
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
    setAuthError(errorText(error));
  }
}

async function handleProfileSubmit(event) {
  event.preventDefault();
  const data = new FormData(authProfileForm);
  const login = String(data.get("login") ?? "").trim();
  const telegram = String(data.get("telegram") ?? "").trim();
  const password = String(data.get("password") ?? "");

  if (login.length < 3) {
    setAuthError(t("auth.validation.login"));
    return;
  }
  if (!telegram) {
    setAuthError(t("auth.validation.telegram"));
    return;
  }
  if (password && password.length < 4) {
    setAuthError(t("auth.validation.password"));
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
    setAuthError(errorText(error));
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


/** Attach every listener the modal needs. Called once, from bootstrap. */
export function wireAuthModal() {
  authButton?.addEventListener("click", () => openAuthModal());
  authModal?.addEventListener("keydown", event => {
    if (event.key !== "Tab") return;
    const controls = [...authModal.querySelectorAll('button:not([tabindex="-1"]), input')]
      .filter(control => !control.disabled && control.getClientRects().length);
    const first = controls[0];
    const last = controls.at(-1);
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault(); last?.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault(); first?.focus();
    }
  });
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
}
