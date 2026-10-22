import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertContrast, assertReadable, blocks, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";

const SHEET = "src/screens/ref/prose.css";
const css = readFileSync(new URL(`../${SHEET}`, import.meta.url), "utf8");

test("the build's four table classes are styled here, on 3.0 tokens, not borrowed from roster.css", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-prose .fit-cell", "width"), ["1%"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .fit-cell", "white-space"), ["nowrap"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .center-cell", "text-align"), ["center"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .number-cell", "text-align"), ["right"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .number-cell", "font-variant-numeric"), ["tabular-nums"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll table.fit-table", "min-width"), ["0"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll table:not(.fit-table)", "width"), ["max-content"]);
});

test("cells draw their own background and lines, one rule each", () => {
  for (const [selector, property] of [[".g-prose th", "background"], [".g-prose td", "background"], [".g-prose th", "border"], [".g-prose td", "border"], [".g-prose th", "padding"]]) {
    assert.equal(valuesOf(SHEET, selector, property).length, 1, `${selector} ${property}`);
  }
});

// What season.css and responsive.css gave the build's tables, kept here when they went (stage 13, Task 23: not a pixel
// moved): a head cell's text at its top, the Skill Table's 48px number column centred, a scroll box that never scrolls
// up and down and keeps a sideways swipe to itself, and the 8px bar of an engine that styles only the webkit scrollbar,
// rounded.
test("what the 2.x table rules drew is drawn here: head cells at the top, the numbered column, the scroll box", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-prose th", "vertical-align"), ["top"]);
  for (const cell of ["th", "td"]) {
    const selector = `.g-prose .numbered-table ${cell}:first-child`;
    assert.deepEqual(valuesOf(SHEET, selector, "width"), ["48px"], selector);
    assert.deepEqual(valuesOf(SHEET, selector, "min-width"), ["48px"], selector);
    assert.deepEqual(valuesOf(SHEET, selector, "text-align"), ["center"], selector);
    assert.deepEqual(valuesOf(SHEET, selector, "color"), ["var(--muted)"], selector);
  }
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll", "overflow-y"), ["hidden"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll", "overscroll-behavior-inline"), ["contain"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll::-webkit-scrollbar", "height"), ["8px"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll::-webkit-scrollbar-thumb", "border-radius"), ["999px"]);
});

test("text, links, head cells and a missing link read on the article and on the page, in every palette", () => {
  for (const [selector, property] of [[".g-prose", "color"], [".g-prose a", "color"], [".g-prose td", "color"], [".g-prose .missing-link", "color"]]) {
    assertReadable(SHEET, selector, property, ["--surface", "--page"], 4.5);
  }
  assertReadable(SHEET, ".g-prose th", "color", ["--surface-2"], 4.5);
  assertReadable(SHEET, ".g-prose a", "color", ["--surface-2"], 4.5); // a link in a head cell
  assertReadable(SHEET, ".g-prose .numbered-table td:first-child", "color", ["--surface", "--page"], 4.5);
});

test("every heading sets its own face and case, and the sheet breaks at 900/901 only", () => {
  for (const { selectors, body } of blocks(css)) {
    if (!selectors.some((selector) => /\bh[1-6]\b/.test(selector))) continue;
    assert.match(body, /(^|;|\s)font:/, selectors.join(", "));
    assert.match(body, /text-transform:\s*none/, selectors.join(", "));
  }
  assertBreakpoints(SHEET);
});

test("the headings the build writes are h2 to h5 at 24, 22, 18 and 16px, and none of them is left to the 2.x h1-h6 rule", () => {
  const sizes = { h2: "24px", h3: "22px", h4: "18px", h5: "16px" };
  for (const [heading, size] of Object.entries(sizes)) {
    const [font] = valuesOf(SHEET, `.g-prose ${heading}`, "font");
    assert.match(font, new RegExp(`^600 ${size}/[\\d.]+ var\\(--font-display\\)$`), heading);
    assert.deepEqual(valuesOf(SHEET, `.g-prose ${heading}`, "letter-spacing"), ["0"], heading);
  }
});

test("lists are drawn here, not left on browser defaults: ol.numbered-list and ul keep their margin, indent and marker, and li its spacing", () => {
  for (const selector of [".g-prose ol", ".g-prose ul"]) {
    for (const property of ["margin", "padding", "list-style"]) assert.equal(valuesOf(SHEET, selector, property).length, 1, `${selector} ${property}`);
  }
  assert.match(valuesOf(SHEET, ".g-prose ol", "list-style")[0], /^decimal\b/);
  assert.match(valuesOf(SHEET, ".g-prose ul", "list-style")[0], /^disc\b/);
  for (const property of ["margin", "padding"]) assert.equal(valuesOf(SHEET, ".g-prose li", property).length, 1, `.g-prose li ${property}`);
});

test("the sheet reaches only what sits inside .g-prose", () => {
  for (const { selectors } of blocks(css)) {
    for (const selector of selectors) assert.match(selector, /^\.g-prose\b/, selector);
  }
});

test("a scrolling table wears the page's scrollbar, and it shows on the card", () => {
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll", "scrollbar-color"), ["var(--faint) transparent"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll", "scrollbar-width"), ["thin"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll::-webkit-scrollbar-track", "background"), ["transparent"]);
  assert.deepEqual(valuesOf(SHEET, ".g-prose .table-scroll::-webkit-scrollbar-thumb", "background"), ["var(--faint)"]);
  assertContrast("--faint", ["--surface"], 3, { what: "the scrollbar thumb" });
});

test("a link in an article shows keyboard focus with the ring base.css draws for every element, and draws none of its own", () => {
  for (const property of ["outline", "outline-offset"]) assert.deepEqual(valuesOf(SHEET, ".g-prose a:focus-visible", property), [], property);
  assert.deepEqual(valuesOf("src/ui/base.css", ":where(:focus-visible)", "outline"), ["3px solid var(--accent-text)"]);
  assertContrast("--accent-text", ["--surface", "--page"], 3, { what: "the focus ring" });
});
