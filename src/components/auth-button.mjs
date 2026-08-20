/**
 * The header's sign-in button, and the admin-only nav links it gates.
 *
 * Mechanically moved out of src/app.js. The rest of the auth chrome (the
 * modal, its forms and modes) stays there; only this piece moved, because
 * screens/administration/user.mjs has to refresh the button after an admin
 * edits their own account — and importing it from app.js would make app.js
 * and the screen modules import each other.
 */
import { t } from "../core/i18n.mjs";
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
