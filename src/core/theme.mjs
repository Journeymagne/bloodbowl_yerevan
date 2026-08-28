/**
 * The six colour themes.
 *
 * Self-contained: the list of themes, the stored preference and the `<select>`
 * in the topbar all live here, so nothing else has to know a theme exists.
 *
 * index.html applies the stored theme inline before the stylesheet loads, to
 * avoid a flash of the default one. That snippet has its own copy of the theme
 * ids — THEME_IDS below is the list it must agree with.
 */
import { STORAGE_KEYS, storage } from "./storage.mjs";

export const THEME_IDS = Object.freeze([
  "dark-gata",
  "dark-dugout",
  "dark-warpstone",
  "light-parchment",
  "light-sideline",
  "light-altdorf",
]);

export const DEFAULT_THEME = "dark-gata";

/** What the six themes fall back to when the system asks for light. */
export const DEFAULT_LIGHT_THEME = "light-parchment";

const known = new Set(THEME_IDS);

export function normalizeTheme(theme) {
  return known.has(theme) ? theme : DEFAULT_THEME;
}

/**
 * The theme to use when nobody has picked one.
 *
 * Step 15.6. Before this the site opened dark for everybody, including a
 * reader whose system is set to light because dark is hard for them to read.
 * A stored choice still wins — this only answers the case of no choice.
 */
export function systemTheme(matchMediaFn = globalThis.matchMedia) {
  return matchMediaFn?.("(prefers-color-scheme: light)")?.matches ? DEFAULT_LIGHT_THEME : DEFAULT_THEME;
}

export function storedTheme() {
  const stored = storage.get(STORAGE_KEYS.theme);
  return stored === null ? systemTheme() : normalizeTheme(stored);
}

/**
 * @param {string} theme
 * @param {boolean} persist false while restoring the stored value on boot
 */
export function applyTheme(theme, persist = true) {
  const normalized = normalizeTheme(theme);
  document.documentElement.dataset.theme = normalized;
  const select = document.querySelector("#theme-select");
  if (select) select.value = normalized;
  if (persist) storage.set(STORAGE_KEYS.theme, normalized);
  return normalized;
}

/** Restore the stored theme and keep the picker in step with it. */
export function initTheme() {
  applyTheme(storedTheme(), false);
  document.querySelector("#theme-select")?.addEventListener("change", (event) => {
    applyTheme(event.currentTarget.value);
  });
  // Someone who has not picked a theme follows their system, including when
  // it changes at sunset. Someone who has picked one is left alone.
  globalThis.matchMedia?.("(prefers-color-scheme: light)")?.addEventListener?.("change", () => {
    if (storage.get(STORAGE_KEYS.theme) === null) applyTheme(systemTheme(), false);
  });
}
