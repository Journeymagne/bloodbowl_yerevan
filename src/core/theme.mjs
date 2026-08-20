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

const known = new Set(THEME_IDS);

export function normalizeTheme(theme) {
  return known.has(theme) ? theme : DEFAULT_THEME;
}

export function storedTheme() {
  return normalizeTheme(storage.get(STORAGE_KEYS.theme));
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
}
