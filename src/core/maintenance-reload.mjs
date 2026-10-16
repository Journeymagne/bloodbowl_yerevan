/**
 * Send a page that is still open on the old version to the maintenance page.
 *
 * During maintenance every API call answers 503 MAINTENANCE. A coach whose tab
 * was open before the work started would otherwise see each save fail with no
 * explanation. Reloading hands them the maintenance page, which reloads them
 * again into the new version once the work is done.
 *
 * The gap is the guard against a loop: if the page reloads into the app while
 * the API still refuses, it waits before trying again. sessionStorage, not
 * localStorage (src/core/storage.mjs): the stamp belongs to this tab only.
 */
const RELOAD_KEY = "gata-league-maintenance-reload";
export const MIN_RELOAD_GAP_MS = 30_000;

export function reloadForMaintenance({
  session,
  location = globalThis.location,
  now = Date.now(),
} = {}) {
  // Reading the global itself can throw (a browser refusing storage outright),
  // so it happens here, inside the guard, and not in the parameter default.
  let storage = session;
  if (storage === undefined) {
    try {
      storage = globalThis.sessionStorage;
    } catch {
      storage = null;
    }
  }
  let last = -Infinity;
  try {
    const stamp = storage?.getItem(RELOAD_KEY);
    if (stamp) last = Number(stamp);
  } catch {
    // Storage refused (the property or a method): the reload below still
    // happens, and the next page load starts from a fresh module, so it
    // cannot repeat in a tight loop.
  }
  if (now - last < MIN_RELOAD_GAP_MS) return false;
  try {
    storage?.setItem(RELOAD_KEY, String(now));
  } catch {
    // As above.
  }
  location?.reload();
  return true;
}
