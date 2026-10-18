import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { blocks } from "./helpers/contrast.mjs";
import { state } from "../src/core/state.mjs";

const RETIRED = /\.(catalog-|team-catalog-card|star-catalog-card|reference-|skill-roll-|skill-table-|team-roster-|league-reference-|league-link-list|league-star-list|overview-card|overview-detail|overview-list|detail-layout|content-body|filter-panel|compact-panel|meta-line)/;

test("the retired-reference pattern finds a retired name wherever a selector puts it, and nothing that stays", () => {
  for (const selector of [".catalog-card h3", ".card-grid .team-catalog-card", "body .overview-card-section", ".skill-table-mobile li"]) assert.match(selector, RETIRED, selector);
  for (const selector of [".overview-grid", ".overview-index-card", ".team-stat-grid div", ".card-grid", ".site-card-index", ".g-ref-row"]) assert.doesNotMatch(selector, RETIRED, selector);
});

test("no stylesheet styles the retired reference screens", () => {
  for (const name of readdirSync(new URL("../src/styles/", import.meta.url)).filter((file) => file.endsWith(".css"))) {
    for (const { selectors } of blocks(readFileSync(new URL(`../src/styles/${name}`, import.meta.url), "utf8"))) {
      for (const selector of selectors) assert.doesNotMatch(selector, RETIRED, `${name}: ${selector}`);
    }
  }
});

test("the stage's stylesheets set their own type on every heading and break at 900/901 only", () => {
  for (const file of ["src/screens/ref/ref.css", "src/screens/ref/article.css", "src/screens/ref/prose.css", "src/screens/home/guest.css", "src/ui/search-field.css", "src/ui/filter-chips.css"]) {
    const css = readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
    for (const { selectors, body } of blocks(css)) {
      if (!selectors.some((selector) => /\bh[1-6]\b|__title|__lead/.test(selector)) || !/(^|;|\s)(color|font-family):/.test(body)) continue; // a breakpoint's size override is not a heading's base rule
      assert.match(body, /(^|;|\s)font:/, `${file}: ${selectors.join(", ")}`);
      assert.match(body, /(^|;|\s)text-transform:\s*\S/, `${file}: ${selectors.join(", ")}`); // explicit, not necessarily none: a group title is uppercase on purpose
    }
    for (const [, query] of css.matchAll(/@media\s*([^{]+)\{/g)) assert.match(query.trim(), /^\((max-width: 900px|min-width: 901px)\)$/, file);
  }
});

test("the 2.x reference modules are gone, and the state keeps nothing of them", () => {
  for (const file of ["section", "detail", "leagues", "legal"].map((name) => `src/screens/${name}.mjs`).concat("src/components/cards.mjs", "src/components/filters.mjs")) {
    assert.equal(existsSync(new URL(`../${file}`, import.meta.url)), false, file);
  }
  for (const key of ["query", "skillFilters", "skillTableRoller"]) assert.equal(key in state, false, key);
});
