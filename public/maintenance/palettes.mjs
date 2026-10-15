/**
 * Which of the 3.0 palettes the maintenance page wears.
 *
 * The page is served while the app is not, so it cannot ask the server or the
 * app's modules. What it has is the browser's cache of the reader's choice:
 *
 * - 3.0 stores `gata-league-palette` as JSON: {mode: "light"|"dark"|"system",
 *   light: <key>, dark: <key>} (src/core/theme.mjs writes it from stage 4 of
 *   the redesign — the two must agree);
 * - 2.x stored one theme id under `gata-league-theme`, mapped below to the
 *   nearest palette. src/core/theme.mjs takes the same table in stage 4.
 *
 * The colours themselves live in maintenance.css, one block per key, so the
 * page sets two attributes and never a style.
 */
export const PALETTE_STORAGE_KEY = "gata-league-palette";

export const PALETTE_KEYS = Object.freeze({
  light: Object.freeze(["grass", "parchment", "ice", "imperial"]),
  dark: Object.freeze(["night", "dungeon", "embers", "abyss"]),
});

export const DEFAULT_PALETTE = Object.freeze({ light: "grass", dark: "night" });

export const LEGACY_THEME_PALETTE = Object.freeze({
  "dark-gata": Object.freeze(["dark", "night"]),
  "dark-dugout": Object.freeze(["dark", "embers"]),
  "dark-warpstone": Object.freeze(["dark", "dungeon"]),
  "light-parchment": Object.freeze(["light", "parchment"]),
  "light-sideline": Object.freeze(["light", "grass"]),
  "light-altdorf": Object.freeze(["light", "ice"]),
});

function parseChoice(text) {
  if (typeof text !== "string") return null;
  try {
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * @param {{palette: string|null, legacyTheme: string|null, prefersDark: boolean}} stored
 * @returns {{mode: "light"|"dark", key: string}}
 */
export function paletteFor({ palette, legacyTheme, prefersDark }) {
  const systemMode = prefersDark ? "dark" : "light";
  const choice = parseChoice(palette);
  if (choice) {
    const mode = choice.mode === "light" || choice.mode === "dark" ? choice.mode : systemMode;
    const key = PALETTE_KEYS[mode].includes(choice[mode]) ? choice[mode] : DEFAULT_PALETTE[mode];
    return { mode, key };
  }
  const legacy = Object.hasOwn(LEGACY_THEME_PALETTE, legacyTheme ?? "") ? LEGACY_THEME_PALETTE[legacyTheme] : null;
  if (legacy) return { mode: legacy[0], key: legacy[1] };
  return { mode: systemMode, key: DEFAULT_PALETTE[systemMode] };
}
