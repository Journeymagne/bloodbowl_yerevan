/**
 * The one place that speaks to a screen reader without showing anything.
 *
 * Step 15.5. `#app-view` used to be `aria-live="polite"`, which meant the
 * whole screen was a live region: every keystroke in the roster editor
 * re-rendered it, and a reader announced the entire page again. What should
 * have been "saved" was the team name, the roster table and the summary read
 * back from the top.
 *
 * So the announcements are narrow instead: this region is off-screen, holds
 * one sentence at a time, and only the two things a sighted user learns from
 * a glance are put in it — which screen opened, and what the autosave did.
 *
 * Toasts have their own region (components/toast.mjs) because they are also
 * visible; this one exists for what has no visual counterpart of its own.
 */
let region = null;

function liveRegion() {
  if (region?.isConnected) return region;
  region = document.createElement("div");
  region.className = "sr-only";
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  document.body.append(region);
  return region;
}

/**
 * Say something once.
 *
 * @param {string} message already translated
 */
export function announce(message) {
  const text = String(message ?? "").trim();
  if (!text) return;
  const node = liveRegion();
  // Same text twice is not announced again unless the region empties first —
  // two saves in a row should both be heard. The gap is a timeout rather than
  // an animation frame: a background tab never paints, and a coach who saves
  // and switches away should still be told what happened when they return.
  node.textContent = "";
  setTimeout(() => { node.textContent = text; }, 0);
}
