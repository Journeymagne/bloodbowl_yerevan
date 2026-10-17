import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import * as maintenance from "../public/maintenance/palettes.mjs";
import { THEME_MODES as SERVER_THEME_MODES } from "../server/api/preferences.mjs";
import { applyStaticI18n, setDictionaries } from "../src/core/i18n.mjs";
import { STORAGE_KEYS, createStorage } from "../src/core/storage.mjs";
import {
  DEFAULT_CHOICE, DEFAULT_PALETTE, LEGACY_THEME_PALETTE, PALETTE_KEYS, THEME_MODES,
  choiceFromPreferences, choiceFromSelect, effectivePalette, initTheme, isThemeChosen, normalizeChoice,
  readStoredChoice, selectValue, setThemeChoice, themeChoice, themePreferences,
} from "../src/core/theme.mjs";
import { createDocument, el, fireEvent } from "./helpers/fake-dom.mjs";
import { storedStates } from "./helpers/theme-cases.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

/** A page with the interim picker, a storage over a Map, and a system preference that can change. */
function page({ palette = null, legacy = null, dark = false, refuse = false } = {}) {
  const document = createDocument();
  const select = el(document, "select", { id: "theme-select" });
  document.body.appendChild(select);
  const backend = new Map();
  if (palette !== null) backend.set("gata-league-palette", palette);
  if (legacy !== null) backend.set("gata-league-theme", legacy);
  const fail = () => { throw new Error("SecurityError"); };
  const store = createStorage(refuse ? { getItem: fail, setItem: fail, removeItem: fail } : {
    getItem: (key) => backend.get(key) ?? null,
    setItem: (key, value) => backend.set(key, String(value)),
    removeItem: (key) => backend.delete(key),
  });
  const listeners = [];
  const media = {
    matches: dark,
    addEventListener: (_type, listener) => listeners.push(listener),
    removeEventListener: (_type, listener) => {
      const at = listeners.indexOf(listener);
      if (at >= 0) listeners.splice(at, 1);
    },
  };
  const root = document.documentElement;
  return {
    root, select, backend,
    env: { root, select, store, matchMedia: () => media },
    setSystemDark(value) { media.matches = value; for (const listener of listeners) listener({ matches: value }); },
    /** How many listeners the system preference has now. */
    listenerCount: () => listeners.length,
  };
}

test("the palette tables are the maintenance page's", () => {
  assert.deepEqual(PALETTE_KEYS, maintenance.PALETTE_KEYS);
  assert.deepEqual(DEFAULT_PALETTE, maintenance.DEFAULT_PALETTE);
  assert.deepEqual(LEGACY_THEME_PALETTE, maintenance.LEGACY_THEME_PALETTE);
  assert.equal(`gata-league-${STORAGE_KEYS.palette}`, maintenance.PALETTE_STORAGE_KEY);
});

test("this module and the maintenance page read every stored state the same way", () => {
  for (const state of storedStates()) {
    const { choice } = readStoredChoice(state.palette, state.legacyTheme);
    assert.deepEqual(effectivePalette(choice, state.prefersDark), maintenance.paletteFor(state), JSON.stringify(state));
  }
});

test("a 2.x theme becomes a 3.0 choice of the same mode", () => {
  assert.deepEqual(readStoredChoice(null, "dark-dugout"), { choice: { mode: "dark", light: "grass", dark: "embers" }, source: "legacy" });
  assert.deepEqual(readStoredChoice(null, "light-altdorf"), { choice: { mode: "light", light: "ice", dark: "night" }, source: "legacy" });
  assert.deepEqual(readStoredChoice(null, "constructor"), { choice: DEFAULT_CHOICE, source: "default" });
  assert.equal(readStoredChoice(JSON.stringify({ mode: "light" }), "dark-gata").source, "palette");
});

test("a broken choice is repaired field by field", () => {
  assert.deepEqual(normalizeChoice({ mode: "sepia", light: "ice", dark: "neon" }), { mode: "system", light: "ice", dark: "night" });
  assert.deepEqual(normalizeChoice(null), DEFAULT_CHOICE);
  assert.deepEqual(normalizeChoice({ mode: "dark", light: "night", dark: "grass" }), { mode: "dark", light: "grass", dark: "night" });
});

test("the interim picker round-trips every choice", () => {
  const current = { mode: "dark", light: "ice", dark: "abyss" };
  assert.equal(selectValue({ ...current, mode: "system" }), "system");
  assert.equal(selectValue(current), "dark:abyss");
  assert.deepEqual(choiceFromSelect("light:imperial", current), { mode: "light", light: "imperial", dark: "abyss" });
  assert.deepEqual(choiceFromSelect("system", current), { mode: "system", light: "ice", dark: "abyss" });
  assert.deepEqual(choiceFromSelect("dark:grass", current), current, "a light palette is not a dark one");
  assert.deepEqual(choiceFromSelect("bogus", current), current);
});

test("index.html offers system and every palette, each with a key in both languages", () => {
  const html = read("index.html");
  const select = html.slice(html.indexOf('<select id="theme-select"'), html.indexOf("</select>"));
  const values = [...select.matchAll(/<option value="([^"]+)"/g)].map(([, value]) => value);
  assert.deepEqual(values, ["system", ...PALETTE_KEYS.light.map((key) => `light:${key}`), ...PALETTE_KEYS.dark.map((key) => `dark:${key}`)]);
  const en = JSON.parse(read("src/i18n/en.json"));
  const ru = JSON.parse(read("src/i18n/ru.json"));
  const keys = [...select.matchAll(/data-i18n(?:-label|-aria-label)?="([^"]+)"/g)].map(([, key]) => key);
  assert.equal(keys.length, 12);
  for (const key of keys) { assert.ok(en[key], `en ${key}`); assert.ok(ru[key], `ru ${key}`); }
});

test("the server's preference keys carry the same choice", () => {
  const choice = { mode: "dark", light: "ice", dark: "embers" };
  assert.deepEqual(themePreferences(choice), { themeMode: "dark", lightPalette: "ice", darkPalette: "embers" });
  assert.deepEqual(choiceFromPreferences(themePreferences(choice)), choice);
  assert.equal(choiceFromPreferences({}), null, "empty: the local choice is what gets written");
  assert.equal(choiceFromPreferences({ activeTeamId: "t1", locale: "ru" }), null);
  assert.equal(choiceFromPreferences(null), null);
  assert.deepEqual(choiceFromPreferences({ themeMode: "light" }), { mode: "light", light: "grass", dark: "night" });
});

test("the account's settings lie over this browser's choice, not over the defaults", () => {
  const local = { mode: "dark", light: "ice", dark: "embers" };
  assert.deepEqual(choiceFromPreferences({ themeMode: "light" }, local), { mode: "light", light: "ice", dark: "embers" });
  assert.deepEqual(choiceFromPreferences({ darkPalette: "abyss" }, local), { mode: "dark", light: "ice", dark: "abyss" });
  assert.equal(choiceFromPreferences({ activeTeamId: "t1" }, local), null);
  assert.deepEqual(choiceFromPreferences({ themeMode: "light" }), { mode: "light", light: "grass", dark: "night" });
});

test("a null in the account's settings is as good as a missing one", () => {
  const local = { mode: "dark", light: "ice", dark: "embers" };
  assert.deepEqual(choiceFromPreferences({ themeMode: null, darkPalette: "abyss" }, local), { mode: "dark", light: "ice", dark: "abyss" });
  assert.equal(choiceFromPreferences({ themeMode: null, lightPalette: null, darkPalette: null }, local), null);
});

test("the client and the server know the same modes", () => {
  assert.deepEqual([...THEME_MODES], [...SERVER_THEME_MODES]);
});

test("a second initTheme replaces the first one's listeners", () => {
  const p = page();
  initTheme(p.env);
  initTheme(p.env);
  assert.equal(p.listenerCount(), 1);
});

test("a second initTheme leaves one picker listener, and the picker still works", () => {
  const p = page();
  initTheme(p.env);
  initTheme(p.env);
  assert.equal(p.select.listeners.get("change").length, 1);
  p.select.value = "dark:abyss";
  fireEvent(p.select, "change");
  assert.equal(p.root.getAttribute("data-palette"), "abyss");
  assert.deepEqual(JSON.parse(p.backend.get("gata-league-palette")), { mode: "dark", light: "grass", dark: "abyss" });
});

test("a default is not a choice; a stored, a migrated or a picked palette is", () => {
  initTheme(page().env);
  assert.equal(isThemeChosen(), false);
  initTheme(page({ legacy: "dark-gata" }).env);
  assert.equal(isThemeChosen(), true);
  initTheme(page().env);
  setThemeChoice({ mode: "light", light: "ice", dark: "night" });
  assert.equal(isThemeChosen(), true);
});

test("a stored palette is a choice; junk in the cache is not", () => {
  initTheme(page({ palette: JSON.stringify({ mode: "light", light: "ice", dark: "night" }) }).env);
  assert.equal(isThemeChosen(), true);
  initTheme(page({ palette: "not json" }).env);
  assert.equal(isThemeChosen(), false);
});

test("a 2.x theme is migrated once and then left alone", () => {
  const first = page({ legacy: "dark-warpstone" });
  initTheme(first.env);
  assert.equal(first.root.getAttribute("data-mode"), "dark");
  assert.equal(first.root.getAttribute("data-palette"), "dungeon");
  assert.deepEqual(JSON.parse(first.backend.get("gata-league-palette")), { mode: "dark", light: "grass", dark: "dungeon" });
  assert.equal(first.backend.get("gata-league-theme"), "dark-warpstone", "kept for a rollback to 2.1");
  first.select.value = "light:ice";
  fireEvent(first.select, "change");
  const second = page({ palette: first.backend.get("gata-league-palette"), legacy: "dark-warpstone" });
  initTheme(second.env);
  assert.equal(second.root.getAttribute("data-palette"), "ice");
  assert.equal(second.select.value, "light:ice");
});

test("nothing stored follows the system, live, and is not written down", () => {
  const p = page({ dark: false });
  assert.deepEqual(initTheme(p.env), DEFAULT_CHOICE);
  assert.equal(p.root.getAttribute("data-palette"), "grass");
  assert.equal(p.select.value, "system");
  p.setSystemDark(true);
  assert.equal(p.root.getAttribute("data-mode"), "dark");
  assert.equal(p.root.getAttribute("data-palette"), "night");
  assert.equal(p.backend.has("gata-league-palette"), false, "a default is not a choice");
});

test("an explicit mode ignores the system", () => {
  const p = page({ palette: JSON.stringify({ mode: "light", light: "imperial", dark: "night" }) });
  initTheme(p.env);
  p.setSystemDark(true);
  assert.equal(p.root.getAttribute("data-palette"), "imperial");
});

test("setThemeChoice applies, persists and moves the picker", () => {
  const p = page();
  initTheme(p.env);
  assert.deepEqual(setThemeChoice({ mode: "dark", light: "grass", dark: "abyss" }), { mode: "dark", light: "grass", dark: "abyss" });
  assert.equal(p.root.getAttribute("data-palette"), "abyss");
  assert.equal(p.select.value, "dark:abyss");
  assert.deepEqual(JSON.parse(p.backend.get("gata-league-palette")), themeChoice());
});

test("a browser that refuses storage still switches palettes for the session", () => {
  const p = page({ refuse: true, dark: true });
  initTheme(p.env);
  assert.equal(p.root.getAttribute("data-palette"), "night");
  setThemeChoice({ mode: "light", light: "parchment", dark: "night" });
  assert.equal(p.root.getAttribute("data-palette"), "parchment");
  assert.equal(themeChoice().light, "parchment");
});

test("optgroup labels are translated like the rest of the chrome", () => {
  setDictionaries({ en: { "theme.mode.light": "Light" }, ru: {} });
  const document = createDocument();
  const group = el(document, "optgroup", { label: "x", "data-i18n-label": "theme.mode.light" });
  document.body.appendChild(group);
  applyStaticI18n(document.body);
  assert.equal(group.getAttribute("label"), "Light");
});
