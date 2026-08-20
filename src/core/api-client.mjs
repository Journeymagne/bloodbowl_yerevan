/**
 * The one HTTP client every screen uses, and where the session token lives.
 *
 * Mechanically moved out of src/app.js. Screens across the whole app call
 * `apiRequest` (auth, admin, season, games, my-teams, builder, saved-roster),
 * so — like core/state.mjs and core/view.mjs before it — this has to live
 * somewhere both app.js and src/screens/*.mjs can import it from, or they'd
 * import each other.
 *
 * One deliberate change: `onUnauthorized` used to call `updateAuthButton()`
 * directly. That function lives in app.js (it touches the auth-modal DOM
 * refs, which nothing outside app.js needs), so calling it here would be the
 * same cycle again. `setOnUnauthorized` lets app.js register it instead —
 * call it once during startup, before any screen can trigger a 401.
 */
import { createApiClient } from "./api.mjs";
import { state } from "./state.mjs";

const authTokenKey = "gata-league-auth-token";

export function authToken() {
  return localStorage.getItem(authTokenKey) || "";
}

export function setAuthToken(token = "") {
  if (token) {
    localStorage.setItem(authTokenKey, token);
  } else {
    localStorage.removeItem(authTokenKey);
  }
}

let onUnauthorized = () => {};

/** Register what happens when a request comes back 401. Call once, at startup. */
export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

const apiClient = createApiClient({
  getToken: authToken,
  onUnauthorized: () => {
    // The session died under us. Say so once, instead of letting every screen
    // report its own mystery failure.
    if (!state.auth.currentUser) return;
    state.auth.currentUser = null;
    setAuthToken("");
    onUnauthorized();
  },
});

/** Errors from here carry a `kind`; see src/core/api.mjs. */
export async function apiRequest(path, options = {}) {
  return apiClient.request(path, options);
}
