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
 *
 * The handler is for a 401 and nothing else. A 403 is a refusal ("not your
 * fixture", "wrong current password"): the server session is alive, so the
 * token stays and the screen that asked explains the refusal itself.
 */
import { createApiClient } from "./api.mjs";
import { reloadForMaintenance } from "./maintenance-reload.mjs";
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
  // The site was closed for maintenance under us: hand the page over to the
  // maintenance screen instead of failing every save one by one.
  onMaintenance: () => reloadForMaintenance(),
});

/** Errors from here carry a `kind`; see src/core/api.mjs. */
export async function apiRequest(path, options = {}) {
  return apiClient.request(path, options);
}
