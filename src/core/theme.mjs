/**
 * Mode and palette.
 *
 * 3.0: the reader picks a mode (light, dark, or follow the system) and one
 * palette for each mode. The choice is cached as JSON in `gata-league-palette`
 * — {mode, light, dark} — and painted onto <html> as two attributes,
 * `data-mode` and `data-palette`, which src/styles/tokens.css turns into
 * colours.
 *
 * The cache has three readers: src/theme-boot.js (before first paint), the
 * maintenance page (public/maintenance/palettes.mjs, served while the app is
 * not) and this module. The tables below are a copy of the maintenance page's,
 * and test/theme.test.mjs compares the two. This module is the only writer.
 *
 * The cache may also carry `from: "account"`: the choice came from the reader's
 * account and was only applied here, so it is not something this browser's
 * reader picked and is never the account of the next coach to sign in (see
 * isThemeChosen). The other readers look at `mode`, `light` and `dark` alone.
 *
 * 2.x stored one theme id under `gata-league-theme`. It is read once, mapped to
 * the nearest palette and written as a 3.0 choice. The old key is never
 * deleted, so a rollback to 2.1 still finds the reader's theme.
 *
 * `#theme-select` is the interim picker, until `#/settings` arrives in stage 05.
 */
import { STORAGE_KEYS, storage } from "./storage.mjs";

export const PALETTE_KEYS = Object.freeze({
  light: Object.freeze(["grass", "parchment", "ice", "imperial"]),
  dark: Object.freeze(["night", "dungeon", "embers", "abyss"]),
});

export const DEFAULT_PALETTE = Object.freeze({ light: "grass", dark: "night" });

/** The six 2.x theme ids and the [mode, palette] each one turns into. */
export const LEGACY_THEME_PALETTE = Object.freeze({
  "dark-gata": Object.freeze(["dark", "night"]),
  "dark-dugout": Object.freeze(["dark", "embers"]),
  "dark-warpstone": Object.freeze(["dark", "dungeon"]),
  "light-parchment": Object.freeze(["light", "parchment"]),
  "light-sideline": Object.freeze(["light", "grass"]),
  "light-altdorf": Object.freeze(["light", "ice"]),
});

export const THEME_MODES = Object.freeze(["light", "dark", "system"]);

export const DEFAULT_CHOICE = Object.freeze({ mode: "system", ...DEFAULT_PALETTE });

const DARK_QUERY = "(prefers-color-scheme: dark)";

/** @typedef {{mode: "light"|"dark"|"system", light: string, dark: string}} ThemeChoice */

/**
 * A usable choice out of whatever was stored or sent. Each field is repaired
 * on its own, so one bad value does not cost the reader the other two.
 * @returns {ThemeChoice}
 */
export function normalizeChoice(value) {
  const source = value !== null && typeof value === "object" ? value : {};
  return {
    mode: THEME_MODES.includes(source.mode) ? source.mode : DEFAULT_CHOICE.mode,
    light: PALETTE_KEYS.light.includes(source.light) ? source.light : DEFAULT_PALETTE.light,
    dark: PALETTE_KEYS.dark.includes(source.dark) ? source.dark : DEFAULT_PALETTE.dark,
  };
}

/** The cache text as an object, or null when it is not one (nothing, junk, an array, `null`). */
function parseObject(text) {
  if (typeof text !== "string") return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * What the browser has stored, as a choice, and where it came from.
 * A 3.0 cache wins ("account" if it says the account applied it, else
 * "palette"); a 2.x theme id is mapped to its nearest palette; nothing usable
 * means the default, which is not a choice and is not to be written down.
 * @param {string|null} paletteText `gata-league-palette`
 * @param {string|null} legacyTheme `gata-league-theme`
 * @returns {{choice: ThemeChoice, source: "palette"|"account"|"legacy"|"default"}}
 */
export function readStoredChoice(paletteText, legacyTheme) {
  const parsed = parseObject(paletteText);
  if (parsed) return { choice: normalizeChoice(parsed), source: parsed.from === "account" ? "account" : "palette" };
  if (typeof legacyTheme === "string" && Object.hasOwn(LEGACY_THEME_PALETTE, legacyTheme)) {
    const [mode, key] = LEGACY_THEME_PALETTE[legacyTheme];
    const choice = {
      mode,
      light: mode === "light" ? key : DEFAULT_PALETTE.light,
      dark: mode === "dark" ? key : DEFAULT_PALETTE.dark,
    };
    return { choice, source: "legacy" };
  }
  return { choice: { ...DEFAULT_CHOICE }, source: "default" };
}

/**
 * The palette on screen: "system" is settled by the system's preference.
 * Expects a normalized choice (normalizeChoice): it looks the palette up, it does not repair.
 */
export function effectivePalette(choice, prefersDark) {
  const mode = choice.mode === "system" ? (prefersDark ? "dark" : "light") : choice.mode;
  return { mode, key: choice[mode] };
}

/** The interim picker's value for a choice: "system", or "light:ice". */
export function selectValue(choice) {
  return choice.mode === "system" ? "system" : `${choice.mode}:${choice[choice.mode]}`;
}

/** The choice a picker value stands for; the palette of the other mode stays as it was. */
export function choiceFromSelect(value, current) {
  if (value === "system") return { ...current, mode: "system" };
  const [mode, key] = String(value).split(":");
  if ((mode === "light" || mode === "dark") && PALETTE_KEYS[mode].includes(key)) {
    return { ...current, mode, [mode]: key };
  }
  return { ...current };
}

/** The choice as the server's preferences name it (data/preferences.mjs writes it there). */
export function themePreferences(choice) {
  return { themeMode: choice.mode, lightPalette: choice.light, darkPalette: choice.dark };
}

/**
 * The choice held in the server's preferences, or null when they hold none —
 * then the local choice is what gets written there, not the other way round.
 * A field they lack is this browser's (`base`), not the default: a device that
 * picked its own light palette keeps it when another device only set the mode.
 * @param {object|null} preferences `user.preferences` of `/api/auth/me`
 * @param {ThemeChoice} [base] the choice on screen now
 * @returns {ThemeChoice|null}
 */
export function choiceFromPreferences(preferences, base = DEFAULT_CHOICE) {
  if (preferences === null || typeof preferences !== "object") return null;
  const { themeMode, lightPalette, darkPalette } = preferences;
  if ([themeMode, lightPalette, darkPalette].every((field) => field === undefined || field === null)) return null;
  return normalizeChoice({ mode: themeMode ?? base.mode, light: lightPalette ?? base.light, dark: darkPalette ?? base.dark });
}

/**
 * What initTheme() is attached to: the choice and where it came from, the page
 * it paints and the system preference.
 */
let state = null;

/** What removes the listeners of the last initTheme(), so a second call does not add a second set. */
let detach = () => {};

/** Put the choice on the page: both attributes, back to back, and the picker. */
function paint({ choice, root, select, media }) {
  const { mode, key } = effectivePalette(choice, media?.matches === true);
  root.dataset.mode = mode;
  root.dataset.palette = key;
  if (select) select.value = selectValue(choice);
}

/**
 * Read the stored choice, paint it, and keep the page in step with the picker
 * and, while the mode is "system", with the system's light/dark setting.
 * `env` is for tests; the defaults are looked up now, not when the module loads.
 * @returns {ThemeChoice}
 */
export function initTheme(env = {}) {
  detach();
  const store = env.store ?? storage;
  const { choice, source } = readStoredChoice(store.get(STORAGE_KEYS.palette), store.get(STORAGE_KEYS.theme));
  // A 2.x reader is migrated here, once; the next boot finds the 3.0 cache.
  if (source === "legacy") store.setJson(STORAGE_KEYS.palette, choice);
  const matchMedia = env.matchMedia ?? globalThis.matchMedia?.bind(globalThis);
  const select = env.select === undefined ? (globalThis.document?.querySelector("#theme-select") ?? null) : env.select;
  state = {
    choice,
    source,
    store,
    select,
    root: env.root ?? globalThis.document.documentElement,
    media: matchMedia?.(DARK_QUERY),
  };
  paint(state);
  const { media } = state;
  const onPick = () => setThemeChoice(choiceFromSelect(select.value, state.choice));
  // Someone who follows the system keeps following it, including at sunset.
  const onSystemChange = () => {
    if (state.choice.mode === "system") paint(state);
  };
  select?.addEventListener("change", onPick);
  media?.addEventListener?.("change", onSystemChange);
  detach = () => {
    select?.removeEventListener("change", onPick);
    media?.removeEventListener?.("change", onSystemChange);
  };
  return { ...state.choice };
}

/**
 * Apply a choice, remember it and move the picker. Returns the repaired choice.
 * A choice the reader made is this browser's own. One the account holds
 * (`fromAccount`) is painted and cached all the same, but marked as the
 * account's: it must not be written to the next account that signs in here.
 * @param {ThemeChoice} choice
 * @param {{fromAccount?: boolean}} [options]
 */
export function setThemeChoice(choice, { fromAccount = false } = {}) {
  if (!state) throw new Error("initTheme() has not run");
  state.choice = normalizeChoice(choice);
  state.source = fromAccount ? "account" : "palette";
  paint(state);
  state.store.setJson(STORAGE_KEYS.palette, fromAccount ? { ...state.choice, from: "account" } : state.choice);
  return { ...state.choice };
}

/** The choice on screen now; the default before initTheme() has run. */
export function themeChoice() {
  return { ...(state?.choice ?? DEFAULT_CHOICE) };
}

/**
 * Whether the reader has made a choice in this browser: one picked here, in the
 * cache or since, or one carried over from 2.x. The default is not one, and nor
 * is a palette the account applied: both are not the account's to be given, and
 * the second would carry one coach's palette to the next coach's account.
 */
export function isThemeChosen() {
  return state !== null && (state.source === "palette" || state.source === "legacy");
}
