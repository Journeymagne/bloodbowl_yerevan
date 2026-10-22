import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import test from "node:test";

import { assertContrast, blocks, inMedia, valuesOf } from "./helpers/contrast.mjs";
import { assertBreakpoints } from "./helpers/css.mjs";
import { icon } from "../src/ui/icons.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const sources = (dir) => readdirSync(new URL(`../${dir}/`, import.meta.url), { recursive: true })
  .filter((name) => name.endsWith(".mjs") || name.endsWith(".js"))
  .map((name) => `${dir}/${name}`);

// Stage 11's hand-off to 13 (spec :474), the plan's decision 25: what the reference repeated, said once.

test("the reference wraps prose in one helper", async () => {
  const { proseMarkup } = await import("../src/screens/ref/prose.mjs");
  assert.equal(proseMarkup("<h3>Spring</h3>"), '<div class="g-prose"><h3>Spring</h3></div>');
  assert.equal(proseMarkup(""), '<div class="g-prose"></div>');
  for (const file of sources("src")) {
    if (file === "src/screens/ref/prose.mjs") continue;
    assert.doesNotMatch(read(file), /class="g-prose"/, `${file} writes the wrapper itself`);
  }
  // The six places that wrapped a page's prose by hand: the article, the overview's card, the legal page, the
  // Skill Table without its roller, a skill's panel and the roster's sheet of a skill.
  for (const file of ["src/screens/ref/article.mjs", "src/screens/ref/bodies.mjs", "src/screens/ref/skill.mjs", "src/screens/team/roster/sheets.mjs"]) {
    assert.match(read(file), /import \{[^}]*\bproseMarkup\b[^}]*\} from "[./]*(?:ref\/)?prose\.mjs";/, file);
  }
});

test("the catalog lays its groups out flat once, for everything it asks of their items", () => {
  const flats = sources("src/screens/ref").flatMap((file) => [...read(file).matchAll(/REF_GROUPS\.flatMap\(/g)].map(() => file));
  assert.deepEqual(flats, ["src/screens/ref/catalog.mjs"]);
});

const SEARCH = "src/ui/search-field.css";
const CLEAR = ".g-search__input::-webkit-search-cancel-button";

/** The SVG a mask's url() carries, as text. */
function maskSvg(value) {
  const url = value.match(/url\("data:image\/svg\+xml,([^"]+)"\)/);
  assert.ok(url, `the mask is an SVG in the sheet: ${value}`);
  return decodeURIComponent(url[1]);
}

test("the native search's clear button wears the palette", () => {
  assert.deepEqual(valuesOf(SEARCH, CLEAR, "-webkit-appearance"), ["none"]);
  assert.deepEqual(valuesOf(SEARCH, CLEAR, "appearance"), ["none"]);
  // The glyph is the kit's close icon at 18px, the size of the magnifier at the other end of the field.
  const [mask] = valuesOf(SEARCH, CLEAR, "-webkit-mask");
  assert.ok(mask, "the button is a mask");
  assert.match(mask, /\bcenter \/ 18px 18px no-repeat$/);
  const svg = maskSvg(mask);
  const shape = icon("close").match(/<path d="([^"]+)"\/>/)[1];
  assert.ok(svg.includes(`<path d='${shape}'/>`), `the close icon's own shape: ${svg}`);
  for (const attribute of ["viewBox='0 0 24 24'", "fill='none'", "stroke-width='2.4'", "stroke-linecap='round'"]) assert.ok(svg.includes(attribute), attribute);
  // The mask keeps only the glyph's shape; its colour is the background under it, a token.
  assert.deepEqual(valuesOf(SEARCH, CLEAR, "background-color"), ["var(--muted)"]);
  const rule = blocks(read(SEARCH)).filter((block) => block.selectors.includes(CLEAR)).map((block) => block.body.replace(/url\("[^"]*"\)/g, "")).join(";");
  assert.doesNotMatch(rule, /#[0-9a-f]{3,8}\b|\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(|\b(?:black|white|gr[ae]y|currentcolor|transparent)\b/i, "no colour of its own");
  assert.doesNotMatch(svg, /#[0-9a-f]{3,8}\b|\brgba?\(/i, "nor in the glyph");
  assertContrast("--muted", ["--surface-2"], 3, { what: "the clear button on the field" });
});

test("the clear button is a 44px target on a phone and 24px from 901px, its 18px glyph where the magnifier's mirror stands", () => {
  // D2: 44 up to 900px; from 901px not under 24. The field is 48px tall, so either fits in it.
  assert.deepEqual([valuesOf(SEARCH, CLEAR, "width"), valuesOf(SEARCH, CLEAR, "height")], [["44px", "24px"], ["44px", "24px"]]);
  assert.deepEqual([inMedia(SEARCH, "min-width: 901px", CLEAR, "width"), inMedia(SEARCH, "min-width: 901px", CLEAR, "height")], [["24px"], ["24px"]]);
  // The magnifier stands --space-14 in from the left edge; the glyph, centred in its target, as far in from the right.
  assert.deepEqual(valuesOf(SEARCH, CLEAR, "margin-right"), ["calc((18px - 44px) / 2)", "calc((18px - 24px) / 2)"]);
  assert.deepEqual(valuesOf(SEARCH, ".g-search > .g-icon", "left"), ["var(--space-14)"]);
  assert.match(valuesOf(SEARCH, ".g-search__input", "padding")[0], /^0 var\(--space-14\) /);
  assertBreakpoints(SEARCH);
});

const SHEETS = ["src/screens/ref/article.css", "src/screens/ref/prose.css", "src/screens/ref/team.css"];
// The figures the --space-N tokens hold (tokens.css): spacing equal to one of them is written as the token.
const TOKEN_FIGURE = /(?<![\d.])(?:4|6|8|10|12|14|16|20|22|24)px\b/;
const SPACING = /^(?:[a-z-]*-)?(?:margin|padding|gap)(?:-[a-z-]+)?$/;

function declarations(file) {
  return blocks(read(file)).flatMap(({ selectors, body }) => body.split(";").map((part) => part.trim()).filter(Boolean).map((part) => {
    const at = part.indexOf(":");
    return { selectors, property: part.slice(0, at).trim(), value: part.slice(at + 1).trim() };
  }));
}

test("spacing in the reference's sheets is the tokens'", () => {
  for (const file of SHEETS) {
    for (const declaration of declarations(file)) {
      if (!SPACING.test(declaration.property)) continue;
      assert.doesNotMatch(declaration.value, TOKEN_FIGURE, `${file}: ${declaration.selectors.join(", ")} { ${declaration.property}: ${declaration.value} }`);
    }
  }
});

test("the spacing check reads a figure as a figure: 28px is not 8px, 1px is not a token's", () => {
  for (const value of ["28px 0 var(--space-10)", "0 0 0 28px", "1px", "2px", "11px var(--space-12)", "32px 40px", "var(--space-24)"]) assert.doesNotMatch(value, TOKEN_FIGURE, value);
  for (const value of ["24px", "0 0 0 4px", "var(--space-10) 12px", "-8px"]) assert.match(value, TOKEN_FIGURE, value);
  for (const property of ["margin", "margin-top", "padding-inline-start", "gap", "row-gap", "column-gap", "scroll-margin-top"]) assert.match(property, SPACING, property);
  for (const property of ["top", "min-height", "border-width", "font"]) assert.doesNotMatch(property, SPACING, property);
});
