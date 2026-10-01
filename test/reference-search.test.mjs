import test from "node:test";
import assert from "node:assert/strict";
import { searchPages } from "../src/data/search.mjs";

const pages = [
  { id: "rule", title: "Weather", text: "Check Block before resolving the weather.", tags: [] },
  { id: "skill", title: "Block", text: "A player skill.", tags: [] },
  { id: "ru", title: "Таблица травм", text: "Результаты травм игроков.", tags: [] },
];

test("a rule named by the query ranks before incidental body mentions", () => {
  assert.deepEqual(searchPages(pages, " block ").map(p => p.id), ["skill", "rule"]);
});

test("search matches Cyrillic without case sensitivity", () => {
  assert.deepEqual(searchPages(pages, "ТРАВМ").map(p => p.id), ["ru"]);
});

test("empty queries return no results and incomplete entries do not throw", () => {
  assert.deepEqual(searchPages(pages, "  "), []);
  assert.deepEqual(searchPages([{ title: "Block" }], "block"), [{ title: "Block" }]);
  assert.deepEqual(searchPages(pages, "not present"), []);
});
