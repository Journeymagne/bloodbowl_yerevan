/**
 * What a user may keep in `users.preferences` (migration 013).
 *
 * The server takes only the keys and values it knows (rollout spec §3.5): a typo or a
 * palette that was retired is an error the client sees, not a string stored until some
 * screen trips over it.
 *
 * The palettes come from the module the maintenance page reads, so the lists cannot drift
 * from the ones the browser caches (`gata-league-palette`). The languages are written here:
 * src/core/i18n.mjs pulls in browser storage, which the server must not load —
 * test/preferences.test.mjs holds them equal to SUPPORTED_LOCALES.
 *
 * Whose team `activeTeamId` is, is for the endpoint to check (plan stage 03). Here it is only
 * a UUID, or `null` to say "no active team".
 */
import { PALETTE_KEYS } from "../../public/maintenance/palettes.mjs";

export const PREFERENCE_KEYS = Object.freeze(["themeMode", "lightPalette", "darkPalette", "activeTeamId", "locale"]);
export const THEME_MODES = Object.freeze(["light", "dark", "system"]);
export const PREFERENCE_LOCALES = Object.freeze(["en", "ru"]);

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Looked up only for a key PREFERENCE_KEYS lists, so a name like "constructor" never reaches it.
const ACCEPTS = Object.freeze({
  themeMode: (value) => THEME_MODES.includes(value),
  lightPalette: (value) => PALETTE_KEYS.light.includes(value),
  darkPalette: (value) => PALETTE_KEYS.dark.includes(value),
  activeTeamId: (value) => value === null || (typeof value === "string" && UUID.test(value)),
  locale: (value) => PREFERENCE_LOCALES.includes(value),
});

function isPlainObject(value) {
  if (value === null || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * The first thing wrong with a body, or the body as the settings it says. Own keys only, in
 * the order they were sent. `null` is a value only for `activeTeamId`, where it clears the key.
 *
 * @param {unknown} input
 * @returns {{ ok: true, value: object } | { ok: false, key: string, reason: "NOT_AN_OBJECT" | "UNKNOWN_KEY" | "INVALID_VALUE" }}
 */
export function checkPreferences(input) {
  if (!isPlainObject(input)) return { ok: false, key: "", reason: "NOT_AN_OBJECT" };
  const value = {};
  for (const key of Object.keys(input)) {
    if (!PREFERENCE_KEYS.includes(key)) return { ok: false, key, reason: "UNKNOWN_KEY" };
    if (!ACCEPTS[key](input[key])) return { ok: false, key, reason: "INVALID_VALUE" };
    value[key] = input[key];
  }
  return { ok: true, value };
}

/**
 * What to store after a patch: the stored settings that are still known and valid (a key or
 * a palette retired since they were saved is dropped, not carried), with the patch over them.
 * A key the patch sets to `null` is removed. The patch is read for known keys only, whatever
 * else it holds; run it through checkPreferences first to learn what was wrong with it.
 *
 * @param {unknown} stored `users.preferences` as it is now; anything that is not an object counts as `{}`
 * @param {object} patch the value of an `ok` checkPreferences
 * @returns {object}
 */
export function mergePreferences(stored, patch) {
  const merged = {};
  for (const key of PREFERENCE_KEYS) {
    const source = isPlainObject(patch) && Object.hasOwn(patch, key) ? patch : stored;
    if (!isPlainObject(source) || !Object.hasOwn(source, key)) continue;
    const value = source[key];
    if (value !== null && ACCEPTS[key](value)) merged[key] = value;
  }
  return merged;
}
