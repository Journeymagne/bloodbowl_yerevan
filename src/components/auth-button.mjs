/**
 * The 2.x header's sign-in button, and the admin-only nav links it gates.
 *
 * It lives apart from src/app.js because screens/administration/user.mjs has
 * to refresh the button after an admin edits their own account, and importing
 * it from app.js would make app.js and the screen modules import each other.
 * A press leads to a screen now, the 2.x modal being gone: a coach's settings,
 * or a guest's way in. The 3.0 shell (Task 14) takes its place.
 */
import { t } from "../core/i18n.mjs";
import { authUrl, settingsUrl } from "../core/routes.mjs";
import { state } from "../core/state.mjs";

export const authButton = document.querySelector("#auth-button");

export function updateAuthButton() {
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

/** Attach the press. Called once, from bootstrap. */
export function wireAuthButton() {
  authButton?.addEventListener("click", () => {
    location.hash = state.auth.currentUser ? settingsUrl() : authUrl();
  });
}
