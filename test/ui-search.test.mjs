import assert from "node:assert/strict";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertStyled, document, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { patch } from "../src/core/dom.mjs";
import { renderSearchField } from "../src/ui/search-field.mjs";
import { renderFilterChips, wireFilterChips } from "../src/ui/filter-chips.mjs";

const CHIPS = { label: "Category", items: [{ value: "all", label: "All", count: 82 }, { value: "Agility", label: "Agility", count: 13 }], selected: "all" };

test("a search field is a labelled search input that keeps what was typed, as text", () => {
  const fragment = mount(renderSearchField({ id: "q", label: "Search the reference", placeholder: "Skills…", value: HOSTILE, data: { searchAll: "" } }));
  const input = fragment.querySelector("input#q");
  assert.deepEqual([input.getAttribute("type"), input.getAttribute("value"), input.hasAttribute("data-search-all")], ["search", HOSTILE, true]);
  assert.equal(fragment.querySelector('label[for="q"]').textContent, "Search the reference");
  assert.equal(fragment.querySelector("img"), null);
  assertCspSafe(fragment);
  assertStyled(fragment, "search-field.css");
  assert.throws(() => renderSearchField({ id: "q" }), /label/);
  assert.throws(() => renderSearchField({ id: '"x', label: "L" }), /id/);
});

test("filter chips are one radio group with their counts, one checked", () => {
  const fragment = mount(renderFilterChips(CHIPS));
  assert.equal(fragment.querySelector('[role="radiogroup"]').getAttribute("aria-label"), "Category");
  assert.deepEqual(fragment.querySelectorAll(".g-chip").map((chip) => [chip.getAttribute("aria-checked"), chip.getAttribute("tabindex"), chip.querySelector(".g-chip__count").textContent]),
    [["true", "0", "82"], ["false", "-1", "13"]]);
  assertCspSafe(fragment);
  assertStyled(fragment, "filter-chips.css");
  assert.throws(() => renderFilterChips({ ...CHIPS, selected: "Mutation" }), /selected/);
});

test("a chip reports its value once; a redraw after an arrow keeps the focus on it; the listener can be removed", () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  patch(root, renderFilterChips(CHIPS));
  const picked = [];
  const off = wireFilterChips(root, (value) => { picked.push(value); patch(root, renderFilterChips({ ...CHIPS, selected: value })); });
  root.querySelector('[data-chip-value="all"]').focus();
  fireEvent(root.querySelector('[data-chip-value="all"]'), "keydown", { key: "ArrowRight" });
  assert.deepEqual(picked, ["Agility"]);
  assert.equal(document.activeElement, root.querySelector('[data-chip-value="Agility"]'));
  off();
  fireEvent(root.querySelector('[data-chip-value="all"]'), "click");
  assert.deepEqual(picked, ["Agility"]);
});

test("a chip is a 44px target and reads in every palette, chosen or not", () => {
  assert.deepEqual(valuesOf("src/ui/filter-chips.css", ".g-chip", "min-height"), ["44px"]);
  assertReadable("src/ui/filter-chips.css", ".g-chip", "color", ["--surface"], 4.5);
  assertReadable("src/ui/filter-chips.css", '.g-chip[aria-checked="true"]', "color", ["--header"], 4.5);
  assertReadable("src/ui/search-field.css", ".g-search__input", "color", ["--surface-2"], 4.5);
});

test("a row wired by its group name ignores the other rows; a count of zero is drawn; a row without chips or a name is refused", () => {
  const root = document.createElement("div");
  document.body.appendChild(root);
  const second = { label: "Roll", items: [{ value: "a", label: "A", count: 0 }, { value: "b", label: "B" }], selected: "a", data: { chipGroup: "roller" } };
  patch(root, renderFilterChips(CHIPS) + renderFilterChips(second));
  const picked = [];
  const off = wireFilterChips(root, (value) => picked.push(value), { group: "roller" });
  fireEvent(root.querySelector('[data-chip-value="Agility"]'), "click");
  assert.deepEqual(picked, []);
  fireEvent(root.querySelector('[data-chip-value="b"]'), "click");
  assert.deepEqual(picked, ["b"]);
  assert.equal(root.querySelector('[data-chip-value="a"] .g-chip__count').textContent, "0");
  assert.equal(root.querySelector('[data-chip-value="b"] .g-chip__count'), null);
  off();
  assert.throws(() => wireFilterChips(root, () => {}, { group: '"x' }), /group/);
  assert.throws(() => renderFilterChips({ ...CHIPS, items: [] }), /chips/);
  assert.throws(() => renderFilterChips({ ...CHIPS, label: "" }), /label/);
});
