import test from "node:test";
import assert from "node:assert/strict";

import { PREFERENCE_KEYS, PREFERENCE_LOCALES, THEME_MODES, checkPreferences, mergePreferences } from "../server/api/preferences.mjs";
import { PALETTE_KEYS } from "../public/maintenance/palettes.mjs";
import { SUPPORTED_LOCALES } from "../src/core/i18n.mjs";

const TEAM = "11111111-1111-4111-8111-111111111111";

test("five known keys, the modes of the palette cache and the site's locales", () => {
  assert.deepEqual([...PREFERENCE_KEYS], ["themeMode", "lightPalette", "darkPalette", "activeTeamId", "locale"]);
  assert.deepEqual([...THEME_MODES], ["light", "dark", "system"]);
  assert.deepEqual([...PREFERENCE_LOCALES], [...SUPPORTED_LOCALES]);
});

test("a full, valid set is accepted as it is", () => {
  const value = { themeMode: "system", lightPalette: "ice", darkPalette: "abyss", activeTeamId: TEAM, locale: "ru" };
  assert.deepEqual(checkPreferences(value), { ok: true, value });
});

test("each palette belongs to its own mode", () => {
  for (const key of PALETTE_KEYS.light) {
    assert.equal(checkPreferences({ lightPalette: key }).ok, true);
    assert.deepEqual(checkPreferences({ darkPalette: key }), { ok: false, key: "darkPalette", reason: "INVALID_VALUE" });
  }
  for (const key of PALETTE_KEYS.dark) assert.equal(checkPreferences({ darkPalette: key }).ok, true);
});

test("an unknown key or a value outside the list is refused, naming the key", () => {
  assert.deepEqual(checkPreferences({ theme: "dark-gata" }), { ok: false, key: "theme", reason: "UNKNOWN_KEY" });
  for (const [key, value] of [["themeMode", "dark-gata"], ["locale", "de"], ["activeTeamId", "abc"], ["lightPalette", "night"], ["themeMode", null]]) {
    assert.deepEqual(checkPreferences({ [key]: value }), { ok: false, key, reason: "INVALID_VALUE" }, `${key}=${value}`);
  }
});

test("clearing the active team is allowed", () => {
  assert.deepEqual(checkPreferences({ activeTeamId: null }), { ok: true, value: { activeTeamId: null } });
});

test("a body that is not an object is refused", () => {
  for (const input of [null, [], "dark", 3]) assert.deepEqual(checkPreferences(input), { ok: false, key: "", reason: "NOT_AN_OBJECT" });
});

test("merging keeps what is still valid, applies the patch, and drops a cleared key", () => {
  assert.deepEqual(mergePreferences({ themeMode: "dark", bogus: 1, lightPalette: "retired" }, { activeTeamId: TEAM }),
    { themeMode: "dark", activeTeamId: TEAM });
  assert.deepEqual(mergePreferences({ themeMode: "dark", activeTeamId: TEAM }, { activeTeamId: null }), { themeMode: "dark" });
  assert.deepEqual(mergePreferences(null, {}), {});
});

test("the key and the value must both be right, and the first thing wrong is the one named", () => {
  assert.deepEqual(checkPreferences({ theme: 1, locale: "de" }), { ok: false, key: "theme", reason: "UNKNOWN_KEY" });
  assert.deepEqual(checkPreferences({ locale: "de", theme: 1 }), { ok: false, key: "locale", reason: "INVALID_VALUE" });
  assert.deepEqual(checkPreferences({ themeMode: "dark", locale: "de" }), { ok: false, key: "locale", reason: "INVALID_VALUE" });
});

test("a value of the wrong type is refused, whatever it would turn into as text", () => {
  const wrong = [3, true, ["dark"], ["ru"], { toString: () => "dark" }, "", " dark", "DARK"];
  for (const key of PREFERENCE_KEYS) {
    for (const value of wrong) {
      assert.deepEqual(checkPreferences({ [key]: value }), { ok: false, key, reason: "INVALID_VALUE" }, `${key}=${JSON.stringify(value)}`);
    }
  }
  for (const value of [[TEAM], { toString: () => TEAM }, TEAM.slice(1), `${TEAM}\n`, ` ${TEAM}`, TEAM.replaceAll("-", ""), TEAM.replace("1", "g")]) {
    assert.deepEqual(checkPreferences({ activeTeamId: value }), { ok: false, key: "activeTeamId", reason: "INVALID_VALUE" }, JSON.stringify(value));
  }
});

test("only null clears, and only the active team", () => {
  for (const key of PREFERENCE_KEYS.filter((name) => name !== "activeTeamId")) {
    assert.deepEqual(checkPreferences({ [key]: null }), { ok: false, key, reason: "INVALID_VALUE" }, key);
  }
});

test("prototype keys are unknown keys, as the parsed JSON of a request has them", () => {
  for (const name of ["__proto__", "constructor", "prototype", "toString", "hasOwnProperty"]) {
    const input = JSON.parse(`{"${name}": {"themeMode": "dark"}}`);
    assert.deepEqual(checkPreferences(input), { ok: false, key: name, reason: "UNKNOWN_KEY" }, name);
    assert.deepEqual(checkPreferences({ [name]: "dark" }), { ok: false, key: name, reason: "UNKNOWN_KEY" }, name);
  }
});

test("only a plain object is a body", () => {
  for (const input of [undefined, new Date(), new Map(), new Set(), () => ({}), Object.create({ themeMode: "dark" })]) {
    assert.deepEqual(checkPreferences(input), { ok: false, key: "", reason: "NOT_AN_OBJECT" });
  }
  assert.deepEqual(checkPreferences({}), { ok: true, value: {} });
  assert.deepEqual(checkPreferences(Object.create(null)), { ok: true, value: {} });
});

test("an accepted body is a copy, not the object that was sent", () => {
  const input = { locale: "en" };
  const result = checkPreferences(input);
  assert.notEqual(result.value, input);
  assert.equal(Object.getPrototypeOf(result.value), Object.prototype);
});

test("merging never lets a prototype key, an unknown key or a bad value into what is stored", () => {
  const stored = JSON.parse('{"__proto__": {"themeMode": "dark"}, "constructor": 1, "locale": "de", "darkPalette": "ice", "themeMode": "light"}');
  const patch = JSON.parse('{"__proto__": {"locale": "ru"}, "extra": 1, "lightPalette": "ice"}');
  const merged = mergePreferences(stored, patch);
  assert.deepEqual(merged, { themeMode: "light", lightPalette: "ice" });
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.equal({}.themeMode, undefined);
});

test("merging replaces a stored value, and keeps the stored ones the patch does not mention", () => {
  const stored = { themeMode: "dark", darkPalette: "abyss", activeTeamId: TEAM, locale: "ru" };
  assert.deepEqual(mergePreferences(stored, { themeMode: "system", locale: "en" }),
    { themeMode: "system", darkPalette: "abyss", activeTeamId: TEAM, locale: "en" });
  assert.deepEqual(mergePreferences(stored, {}), stored);
});

test("merging does not change what it was given, and treats a missing stored value as empty", () => {
  const stored = { themeMode: "dark", activeTeamId: TEAM };
  const patch = { activeTeamId: null, locale: "ru" };
  mergePreferences(stored, patch);
  assert.deepEqual(stored, { themeMode: "dark", activeTeamId: TEAM });
  assert.deepEqual(patch, { activeTeamId: null, locale: "ru" });
  for (const empty of [undefined, null, [], "dark", 3]) assert.deepEqual(mergePreferences(empty, { locale: "en" }), { locale: "en" });
});

test("merging drops a null left in the stored value, and a patch value that is not valid", () => {
  assert.deepEqual(mergePreferences({ activeTeamId: null, locale: "ru" }, {}), { locale: "ru" });
  assert.deepEqual(mergePreferences({ locale: "ru" }, { locale: "de" }), {});
});
