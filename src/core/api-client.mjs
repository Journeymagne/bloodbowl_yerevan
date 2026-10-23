/**
 * The one HTTP client every screen uses, and where the session token lives.
 *
 * Mechanically moved out of src/app.js. Screens across the whole app call
 * `apiRequest` (auth, admin, season, games, my-teams, builder, roster),
 * so — like core/state.mjs and core/view.mjs before it — this has to live
 * somewhere both app.js and src/screens/*.mjs can import it from, or they'd
 * import each other.
 *
 * One deliberate change: `onUnauthorized` used to call `updateAuthButton()`
 * directly, which would make this module import the screens' side of the app.
 * `setOnUnauthorized` lets app.js register the handler instead — it registers
 * `sessionEnded` (data/session.mjs), which resets the coach's state and tells
 * the session's listeners — once during startup, before any screen can
 * trigger a 401.
 *
 * The handler is for a 401 and nothing else. A 403 is a refusal ("not your
 * fixture", "wrong current password"): the server session is alive, so the
 * token stays and the screen that asked explains the refusal itself. And a 401
 * ends only the session whose token its request carried: one sent before the
 * coach signed in again (or as someone else) speaks of a token already gone.
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

/** Register what happens when a request comes back 401; it is handed the coach whose session it was. Call once, at startup. */
export function setOnUnauthorized(handler) {
  onUnauthorized = handler;
}

/**
 * The token the page's session was read with ("" for none): data/session.mjs says which each time it
 * reads or ends one. The token itself is the browser's, shared by every tab: another tab that signs out,
 * or in as someone else, stores another one under this page, which still shows the coach it read.
 */
let sessionToken = "";
let onTokenMoved = () => {};

/** @param {string} token what the session was just read with, or "" once it has none */
export function rememberSessionToken(token) {
  sessionToken = token;
}

/** Register what follows a token another tab changed (data/session.mjs reads the session again, or ends it). Once, at startup. */
export function setOnTokenMoved(handler) {
  onTokenMoved = handler;
}

/** Whether the stored token is not the one the session was read with: another tab signed in or out since. */
export function tokenMoved() {
  return authToken() !== sessionToken;
}

/**
 * Ask before a write to the coach's account: false when another tab has moved the token, and then the
 * page follows it (the registered handler) and the caller sends nothing, since the request would go out
 * as whoever that tab signed in, under the coach this page shows. A page that read no token has no coach
 * of its own to write for, so there is nothing to hold.
 * @returns {boolean}
 */
export function sessionTokenHolds() {
  if (!sessionToken || !tokenMoved()) return true;
  onTokenMoved();
  return false;
}

const apiClient = createApiClient({
  getToken: authToken,
  onUnauthorized: (error, { token } = {}) => {
    // A request of an older session, answered after a new sign-in stored another token: the new one is alive.
    if (token !== authToken()) return;
    // The session died under us. Say so once, instead of letting every screen
    // report its own mystery failure — and say whose it was.
    const user = state.auth.currentUser;
    if (!user) return;
    state.auth.currentUser = null;
    setAuthToken("");
    onUnauthorized(user);
  },
  // The site was closed for maintenance under us: hand the page over to the
  // maintenance screen instead of failing every save one by one.
  onMaintenance: () => reloadForMaintenance(),
});

/** Errors from here carry a `kind`; see src/core/api.mjs. */
export async function apiRequest(path, options = {}) {
  return apiClient.request(path, options);
}
