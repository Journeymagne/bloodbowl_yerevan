/**
 * The sign-in / register / account modal.
 *
 * Mechanically moved out of src/app.js. The header button it toggles lives in
 * components/auth-button.mjs (moved in 6.8, because the admin screens refresh
 * it too); everything else about the modal is here, so app.js is left as
 * bootstrap only. The session it signs in and out is data/session.mjs's, and
 * so is what follows a change of it: the modal only closes.
 *
 * `wireAuthModal` attaches the listeners app.js used to attach inline, and is
 * the one thing bootstrap has to call.
 *
 * Known debt, untouched by this move: the five validation messages below are
 * hardcoded English instead of going through `t()`. That is part of the i18n
 * gap catalogued in section 16 of the design spec and belongs to task 13.
 */
import { errorText } from "../core/api.mjs";
import { t } from "../core/i18n.mjs";
import { state } from "../core/state.mjs";
import { apiRequest } from "../core/api-client.mjs";
import { mergeCurrentUser, register, signIn, signOut } from "../data/session.mjs";
import { authButton, updateAuthButton } from "./auth-button.mjs";

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

function setAuthError(message = "") {
  if (!authError) return;
  authError.hidden = !message;
  authError.textContent = message;
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

export function openAuthModal(mode = "login") {
  if (!authModal) return;
  authModal.hidden = false;
  document.body.classList.add("auth-open");
  setAuthMode(state.auth.currentUser && mode !== "register" ? "account" : mode);
  const form = state.auth.mode === "account" ? authProfileForm : authForm;
  form?.querySelector("input")?.focus();
}

export function closeAuthModal() {
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
    if (state.auth.mode === "register") {
      await register({ login, password, telegram });
    } else {
      await signIn({ login, password });
    }
    closeAuthModal();
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
    mergeCurrentUser(payload.user);
    updateAuthButton();
    setAuthMode("account");
    setAuthError("");
  } catch (error) {
    setAuthError(errorText(error));
  }
}

async function logoutAuth() {
  await signOut();
  closeAuthModal();
}


/** Attach every listener the modal needs. Called once, from bootstrap. */
export function wireAuthModal() {
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
}
