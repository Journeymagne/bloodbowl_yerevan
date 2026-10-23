/**
 * The desk panel shows the whole of itself, as DeskRosterLive.html's does, and the page scrolls (fix round 2): it has
 * no scroll box of its own. It sticks beside the table only while it fits the window below its top offset; taller than
 * that, it gets `g-roster__aside--tall` (roster.css) and goes with the page, or its foot — the next match and the pair
 * of actions — would stay below the window until the table ended. A class only, never an inline style.
 *
 * Measured after every draw (a patch may draw the panel anew, and its class with it), when the window is resized, and
 * when the panel changes size by itself (a font arriving, a sheet's words). A page with no layout to ask — a test's,
 * a phone's hidden panel at zero height — leaves the panel as it is drawn.
 */

/** The class of a panel taller than the window can hold. */
export const TALL = "g-roster__aside--tall";
/** The panel's top offset while it sticks: roster.css's `top: var(--space-24)`. */
export const STICKY_TOP = 24;

/**
 * Whether a panel `height` tall fits a window `windowHeight` tall when it sticks `top` below the window's edge.
 * @param {number} height @param {number} windowHeight @param {number} [top]
 */
export const fitsWindow = (height, windowHeight, top = STICKY_TOP) => windowHeight - top >= height;

/**
 * The panel's fit kept up to date under `root`: `fit()` measures it now (the screen calls it after each draw),
 * `release()` stops listening (on leave).
 * @param {{querySelector: (selector: string) => Element|null}} root
 * @returns {{fit: () => void, release: () => void}}
 */
export function wireAsideFit(root) {
  let watched = null;
  const observer = typeof globalThis.ResizeObserver === "function" ? new globalThis.ResizeObserver(() => fit()) : null;
  function fit() {
    const aside = root.querySelector(".g-roster__aside");
    if (aside !== watched) {
      if (watched) observer?.unobserve(watched);
      if (aside) observer?.observe(aside);
      watched = aside;
    }
    if (!aside) return;
    const height = aside.getBoundingClientRect?.().height;
    const windowHeight = globalThis.innerHeight;
    if (!(height > 0) || !Number.isFinite(windowHeight)) return;
    aside.classList.toggle(TALL, !fitsWindow(height, windowHeight));
  }
  globalThis.addEventListener?.("resize", fit);
  return {
    fit,
    release() {
      observer?.disconnect();
      watched = null;
      globalThis.removeEventListener?.("resize", fit);
    },
  };
}
