/**
 * What a screen owes back when the user leaves it.
 *
 * Screens subscribe to stores and start timers; nothing used to cancel them.
 * A screen registers a teardown under a key, and the registry runs it either
 * when that key is re-registered (the same screen re-rendered, so the earlier
 * subscription is stale) or when the router moves to another route.
 *
 * This lives apart from core/router.mjs on purpose: the router imports every
 * screen module, so a screen importing the router back would be an import
 * cycle. ES modules would tolerate it — nothing is dereferenced during
 * evaluation — but the registry is its own concern, and a leaf module keeps
 * the graph one-way.
 *
 * Task 6.4 of the refactor plan asks for a full
 * `render(params) → { html, mount(root), destroy() }` screen contract. That
 * rewrites all seventeen screens and changes when markup is produced, so it
 * waits for task 8's targeted rendering; this is the teardown half, which is
 * what the leak actually needed.
 */

/** @type {Map<string, () => void>} teardowns owed by whatever is on screen. */
const cleanups = new Map();

function run(cleanup) {
  if (!cleanup) return;
  try {
    cleanup();
  } catch (error) {
    // A failed teardown must not stop the next screen from rendering.
    console.error(error);
  }
}

/**
 * @param {string} key stable per subscription, e.g. "saved-roster:autosave-status"
 * @param {() => void} cleanup
 */
export function onScreenLeave(key, cleanup) {
  run(cleanups.get(key));
  cleanups.set(key, cleanup);
}

/** Run and forget every teardown. The router calls this on each route change. */
export function releaseCurrentScreen() {
  const pending = [...cleanups.values()];
  cleanups.clear();
  for (const cleanup of pending) run(cleanup);
}

/** Test seam: how many teardowns are outstanding right now. */
export function pendingScreenCleanupCount() {
  return cleanups.size;
}
