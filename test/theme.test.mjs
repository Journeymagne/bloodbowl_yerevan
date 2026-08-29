import assert from "node:assert/strict";
import test from "node:test";

import { DEFAULT_LIGHT_THEME, DEFAULT_THEME, normalizeTheme, systemTheme } from "../src/core/theme.mjs";

/** A matchMedia that answers one question one way. */
const matchMedia = (prefersLight) => (query) => ({ matches: query.includes("light") && prefersLight });

test("a system set to light opens a light theme", () => {
  assert.equal(systemTheme(matchMedia(true)), DEFAULT_LIGHT_THEME);
});

test("anything else opens the league's own dark", () => {
  assert.equal(systemTheme(matchMedia(false)), DEFAULT_THEME);
  // Browsers without matchMedia, and the tests themselves.
  assert.equal(systemTheme(undefined), DEFAULT_THEME);
});

test("an unknown stored theme is not trusted", () => {
  assert.equal(normalizeTheme("dark-mordor"), DEFAULT_THEME);
  assert.equal(normalizeTheme("light-parchment"), "light-parchment");
});
