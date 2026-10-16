import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import vm from "node:vm";

import { paletteFor } from "../public/maintenance/palettes.mjs";
import { effectivePalette, readStoredChoice } from "../src/core/theme.mjs";
import { storedStates } from "./helpers/theme-cases.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const source = read("src/theme-boot.js");

/** Run the classic script the way <head> does, against a storage and a system preference. */
function boot({ palette = null, legacyTheme = null, prefersDark = false, refuse = false }) {
  const items = { "gata-league-palette": palette, "gata-league-theme": legacyTheme };
  const writes = [];
  const fail = () => { throw new Error("SecurityError"); };
  const localStorage = refuse
    ? { getItem: fail, setItem: fail }
    : { getItem: (key) => items[key] ?? null, setItem: (...args) => writes.push(args) };
  const dataset = {};
  vm.runInNewContext(source, {
    localStorage,
    window: { matchMedia: (query) => ({ matches: query.includes("dark") && prefersDark }) },
    document: { documentElement: { dataset } },
  });
  return { applied: { mode: dataset.mode, key: dataset.palette }, writes };
}

test("theme-boot.js, theme.mjs and the maintenance page agree on every stored state", () => {
  for (const state of storedStates()) {
    const { applied, writes } = boot(state);
    assert.deepEqual(applied, paletteFor(state), JSON.stringify(state));
    assert.deepEqual(applied, effectivePalette(readStoredChoice(state.palette, state.legacyTheme).choice, state.prefersDark));
    assert.deepEqual(writes, [], "the boot script only reads; theme.mjs writes");
  }
});

test("storage that throws still gets the system's palette", () => {
  assert.deepEqual(boot({ refuse: true, prefersDark: true }).applied, { mode: "dark", key: "night" });
  assert.deepEqual(boot({ refuse: true, prefersDark: false }).applied, { mode: "light", key: "grass" });
});

test("it stays a classic, blocking script that runs before the stylesheets", () => {
  assert.doesNotMatch(source, /^\s*(import|export)\b/m);
  const html = read("index.html");
  const at = html.indexOf('<script src="src/theme-boot.js?v=');
  assert.ok(at > 0, "loaded from index.html");
  assert.ok(at < html.indexOf('rel="stylesheet"'), "before the first stylesheet");
  assert.doesNotMatch(html.slice(at, html.indexOf(">", at)), /type="module"|\bdefer\b|\basync\b/);
});
