import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import "./helpers/ui.mjs"; // the real dictionaries
import { overviewCards } from "../src/data/overview-cards-en.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { askSearchFocus, listFilter, refQuery, rollerState, setListFilter, setRefQuery, setRoller, takeSearchFocus } from "../src/screens/ref/memory.mjs";
import { normalizeText, searchReference } from "../src/screens/ref/search.mjs";

const data = (locale) => expandCollections(JSON.parse(readFileSync(new URL(`../public/data.${locale}.json`, import.meta.url), "utf8")));
const en = data("en");

test("a name is found by its title first, then by what pages say about it", () => {
  const { results } = searchReference({ data: en, overviewCards, query: "block" });
  assert.equal(results[0].href, "#/skills/block");
  assert.equal(results[0].caption, "Skills");
  assert.ok(results.some((result) => result.href === "#/skills/multiple-block"));
  assert.ok(results.findIndex((result) => !normalizeText(result.title).includes("block")) > results.findIndex((result) => result.href === "#/skills/multiple-block"));
});

test("case, spaces and ё do not matter", () => {
  assert.equal(normalizeText("  Ёлка   БЛОК "), "елка блок");
  assert.deepEqual(searchReference({ data: en, query: "  MIGHTY   blow" }).results.slice(0, 1).map((r) => r.href), ["#/skills/mighty-blow"]);
});

test("a section and an overview card are found too, each with the place it lives", () => {
  const sections = searchReference({ data: en, overviewCards, query: "inducements" }).results;
  assert.equal(sections[0].href, "#/ref/inducements");
  const card = searchReference({ data: en, overviewCards, query: "code of conduct" }).results[0];
  assert.deepEqual([card.href, card.caption], ["#/overview/code-of-conduct", "League Rules"]);
});

test("a result says where it lives: the group of an article or a list, otherwise the reference", () => {
  const first = (query) => searchReference({ data: en, overviewCards, query }).results[0];
  assert.deepEqual([first("kick-off table").href, first("kick-off table").caption], ["#/kick-off-table", "Before and during a match"]);
  assert.equal(first("inducements").caption, "Before and during a match");
  assert.deepEqual([first("reference sources").href, first("reference sources").caption], ["#/reference-sources", "Reference"]);
});

test("the list stops at the limit and says how many there were", () => {
  const { total, results } = searchReference({ data: en, query: "a", limit: 50 });
  assert.equal(results.length, 50);
  assert.ok(total > 50);
  const all = searchReference({ data: en, overviewCards, query: "a", limit: Infinity });
  assert.equal(new Set(all.results.map((result) => result.key)).size, all.total);
});

test("an empty or blank query is not a search", () => {
  for (const query of ["", "   ", undefined]) assert.deepEqual(searchReference({ data: en, query }), { total: 0, results: [] });
});

test("each list keeps its own filter, and the search focus is handed over once", () => {
  setListFilter("skills", { query: "dodge", category: "Agility" });
  assert.deepEqual(listFilter("traits"), { query: "", category: "all" });
  assert.deepEqual(listFilter("skills"), { query: "dodge", category: "Agility" });
  askSearchFocus();
  assert.deepEqual([takeSearchFocus(), takeSearchFocus()], [true, false]);
});

test("a section with nothing to list is not offered as a result", () => {
  assert.equal(en.cheatsheets.length, 0);
  const { results } = searchReference({ data: en, overviewCards, query: "cheat" });
  assert.ok(!results.some((result) => result.href === "#/ref/cheatsheets"));
});

test("the search box keeps what was typed, and the skill die its last throw", () => {
  assert.equal(refQuery(), "");
  setRefQuery("mighty");
  assert.equal(refQuery(), "mighty");
  assert.deepEqual(rollerState(), { category: "Agility", face: null, skill: "" });
  setRoller({ category: "General", face: 4, skill: "Fend" });
  assert.deepEqual(rollerState(), { category: "General", face: 4, skill: "Fend" });
  rollerState().category = "Strength"; // what a caller gets is a copy
  assert.equal(rollerState().category, "General");
});
