import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
const EN = dictionary("en");
const RU = dictionary("ru");

/**
 * The names `t()` fills in a string, sorted, each once. The pattern is the one in src/core/i18n.mjs: a name the other
 * dictionary does not write is a value the caller passes and one locale never shows (a count, a team, a price),
 * and a name only one writes is printed there as `{name}`.
 */
function placeholders(value) {
  return [...new Set([...String(value).matchAll(/\{(\w+)\}/g)].map(([, name]) => name))].sort();
}

test("every key's placeholders are the same in both dictionaries", () => {
  const keys = [...new Set([...Object.keys(EN), ...Object.keys(RU)])].sort();
  const differ = keys
    .map((key) => ({ key, en: key in EN ? placeholders(EN[key]) : null, ru: key in RU ? placeholders(RU[key]) : null }))
    .filter((row) => row.en?.join() !== row.ru?.join());
  assert.deepEqual(differ, []);
  // Not a pass by finding nothing to compare: hundreds of strings carry a placeholder.
  assert.ok(keys.filter((key) => placeholders(EN[key]).length).length > 100);
});

test("a placeholder is a name in braces, as t() reads it", () => {
  assert.deepEqual(placeholders("{from} → {to}, {from} again"), ["from", "to"]);
  assert.deepEqual(placeholders("no braces, { spaced }, {}"), []);
});
