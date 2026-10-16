/**
 * What a browser can have in storage, for every reader of the palette cache:
 * src/theme-boot.js, src/core/theme.mjs and public/maintenance/palettes.mjs
 * must land on the same palette for each of these.
 */
import { LEGACY_THEME_PALETTE } from "../../public/maintenance/palettes.mjs";

export const STORED_PALETTES = [
  null, "", "{oops", "[]", "null", "42",
  JSON.stringify({ mode: "dark", light: "ice", dark: "embers" }),
  JSON.stringify({ mode: "system", light: "ice", dark: "abyss" }),
  JSON.stringify({ mode: "light", light: "neon" }),
  JSON.stringify({ mode: "sepia" }),
  JSON.stringify({ mode: "dark", dark: "constructor" }),
];

export const STORED_THEMES = [null, "", "sepia", "constructor", "__proto__", "toString", ...Object.keys(LEGACY_THEME_PALETTE)];

export function* storedStates() {
  for (const palette of STORED_PALETTES) {
    for (const legacyTheme of STORED_THEMES) {
      for (const prefersDark of [false, true]) yield { palette, legacyTheme, prefersDark };
    }
  }
}
