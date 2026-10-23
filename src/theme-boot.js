/**
 * Put the reader's palette on the page before anything paints.
 *
 * A classic, blocking script in <head>, deliberately: it has to run before the
 * stylesheet does its first paint, or a coach who chose a light palette gets a
 * flash of dark on every navigation. That is also why it cannot be a module —
 * modules are deferred.
 *
 * It used to be inline in index.html, which is why the site's
 * Content-Security-Policy had to allow `script-src 'unsafe-inline'` — a policy
 * that permits any injected <script> to run, which is most of what a CSP is
 * for. Moving it here (step 17.5) is what let the policy become enforcing.
 *
 * It sets two attributes on <html>, `data-mode` ("light" or "dark", never
 * "system": the system is settled here) and `data-palette`, always together.
 * src/styles/tokens.css keeps a `:root:not([data-mode])` fallback that ties in
 * specificity with `:root[data-palette]`, so one attribute without the other
 * would let the fallback win.
 *
 * The tables below are duplicated from src/core/theme.mjs on purpose:
 * importing them would make this a module, and a module cannot run early
 * enough. test/theme-boot.test.mjs runs this file against every state a
 * browser can have in storage and compares the result with theme.mjs and the
 * maintenance page (public/maintenance/palettes.mjs), the other readers of the
 * cache. This script only reads: `gata-league-palette` is written by theme.mjs
 * alone, and the 2.x `gata-league-theme` is mapped here, never rewritten.
 */
(() => {
  try {
    const PALETTE_KEYS = {
      light: ["grass", "parchment", "ice", "imperial"],
      dark: ["night", "dungeon", "embers", "abyss"],
    };
    const DEFAULT_PALETTE = { light: "grass", dark: "night" };
    const LEGACY_THEME_PALETTE = {
      "dark-gata": ["dark", "night"],
      "dark-dugout": ["dark", "embers"],
      "dark-warpstone": ["dark", "dungeon"],
      "light-parchment": ["light", "parchment"],
      "light-sideline": ["light", "grass"],
      "light-altdorf": ["light", "ice"],
    };

    // Storage can refuse (blocked cookies make even touching `localStorage`
    // throw), so each read stands alone: a failed one is null, not a stop.
    const attempt = (read) => {
      try {
        return read();
      } catch (_error) {
        return null;
      }
    };
    const paletteText = attempt(() => localStorage.getItem("gata-league-palette"));
    const legacyTheme = attempt(() => localStorage.getItem("gata-league-theme"));
    const prefersDark = attempt(() => window.matchMedia("(prefers-color-scheme: dark)").matches) === true;

    // The 3.0 cache: an object, not junk, `null` or an array.
    let choice = null;
    if (typeof paletteText === "string") {
      try {
        const parsed = JSON.parse(paletteText);
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) choice = parsed;
      } catch (_error) {}
    }

    const systemMode = prefersDark ? "dark" : "light";
    let mode = systemMode;
    let key = DEFAULT_PALETTE[systemMode];
    if (choice) {
      if (choice.mode === "light" || choice.mode === "dark") mode = choice.mode;
      key = PALETTE_KEYS[mode].includes(choice[mode]) ? choice[mode] : DEFAULT_PALETTE[mode];
    } else if (typeof legacyTheme === "string" && Object.prototype.hasOwnProperty.call(LEGACY_THEME_PALETTE, legacyTheme)) {
      [mode, key] = LEGACY_THEME_PALETTE[legacyTheme];
    }

    // Both, back to back, once both are known.
    const root = document.documentElement.dataset;
    root.mode = mode;
    root.palette = key;
  } catch (_error) {}
})();
