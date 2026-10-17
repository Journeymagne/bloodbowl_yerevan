/**
 * The address to come back to after signing in.
 *
 * resolveRedirect (core/routes.mjs) decides it; the router keeps it here
 * between one hashchange and the next, and the 2.x builder sets it before it
 * sends a guest to sign in. A leaf with no imports, so the router and a screen
 * can both reach it without a cycle.
 *
 * It lives in memory, not in storage: signing in happens on the same page
 * load, and a reload of the sign-in screen forgets it (the visitor then lands
 * home, as in 2.x).
 */
let pending = "";

/** @returns {string} the `#/…` address to return to, or "" */
export function peekReturn() {
  return pending;
}

/** @param {string} hash a `#/…` address, or "" to forget it */
export function setReturn(hash) {
  pending = String(hash ?? "");
}
