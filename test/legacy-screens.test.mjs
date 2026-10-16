import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * The 2.x screens were put on the 3.0 tokens through legacy-aliases.css and not
 * moved (stage 04). Comparing before/after screenshots found a few places where
 * an alias, or a literal 2.x colour, left something pale or half drawn; each
 * fix is one value in a 2.x stylesheet, and the tests here keep it fixed in all
 * eight palettes.
 */

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const PALETTES = { grass: "light", parchment: "light", ice: "light", imperial: "light", night: "dark", dungeon: "dark", embers: "dark", abyss: "dark" };

/** Every innermost `selectors { body }` block, so a rule inside @media keeps its own selector. */
function blocks(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: selectors.split(",").map((part) => part.trim().replace(/\s+/g, " ")),
    body,
  }));
}

/** The values a stylesheet gives a property of one selector, in file order. */
function valuesOf(file, selector, property) {
  const declaration = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return blocks(read(file))
    .filter((block) => block.selectors.includes(selector))
    .flatMap((block) => [...block.body.matchAll(declaration)].map(([, value]) => value.trim()));
}

const customProperties = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

/** Every custom property a palette sees: tokens.css for its mode and palette, then the 2.x names. */
function tokensOf(palette) {
  const rules = blocks(read("src/styles/tokens.css"));
  const declared = (selector) => rules.filter((block) => block.selectors.includes(selector)).map((block) => customProperties(block.body));
  return Object.assign(
    {},
    ...declared(":root"),
    ...(PALETTES[palette] === "dark" ? declared(':root[data-mode="dark"]') : []),
    ...declared(`:root[data-palette="${palette}"]`),
    ...blocks(read("src/styles/legacy-aliases.css")).map((block) => customProperties(block.body)),
  );
}

/** `a, b, c` at the top level of a function's arguments. */
function splitArguments(text) {
  const parts = [];
  let depth = 0;
  let start = 0;
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] === "(") depth += 1;
    else if (text[index] === ")") depth -= 1;
    else if (text[index] === "," && depth === 0) {
      parts.push(text.slice(start, index).trim());
      start = index + 1;
    }
  }
  return [...parts, text.slice(start).trim()];
}

/** [r, g, b] of a colour written as a hex, a `var(--token)` or a two-colour `color-mix(in srgb, …)`. */
function rgb(value, tokens) {
  const text = value.trim();
  const variable = text.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (variable) {
    assert.ok(tokens[variable[1]], `${variable[1]} is not defined`);
    return rgb(tokens[variable[1]], tokens);
  }
  const hex = text.match(/^#([0-9a-f]{6})$/i);
  if (hex) return [0, 2, 4].map((at) => parseInt(hex[1].slice(at, at + 2), 16));
  const mix = text.match(/^color-mix\(\s*in srgb\s*,(.*)\)$/s);
  assert.ok(mix, `cannot tell what colour "${value}" is: use one token`);
  const [first, second] = splitArguments(mix[1]).map((part) => part.match(/^(.*?)(?:\s+([\d.]+)%)?$/s));
  const share = first[2] === undefined ? 50 : Number(first[2]);
  const [one, other] = [rgb(first[1], tokens), rgb(second[1], tokens)];
  return one.map((channel, at) => channel * (share / 100) + other[at] * (1 - share / 100));
}

function luminance(colour) {
  const [red, green, blue] = colour.map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** The colour `selector` gives `property` must hold `minimum`:1 on every one of `backgrounds`, in every palette. */
function assertReadable(file, selector, property, backgrounds, minimum) {
  const values = valuesOf(file, selector, property);
  assert.ok(values.length, `${file} has no ${property} for ${selector}`);
  const value = values.at(-1);
  for (const palette of Object.keys(PALETTES)) {
    const tokens = tokensOf(palette);
    for (const background of backgrounds) {
      const ratio = contrast(rgb(value, tokens), rgb(`var(${background})`, tokens));
      assert.ok(ratio >= minimum, `${selector} ${property} ${value} on ${background} in ${palette} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
    }
  }
}

test("the numerals, the tile arrows and the VS between player cards are readable, not a tint of the surface", () => {
  const sheet = "src/styles/site-matchday.css";
  assertReadable(sheet, ".site-card-index", "color", ["--surface", "--surface-2"], 3);
  assertReadable(sheet, ".site-quick-links a span:last-child", "color", ["--page", "--accent-tint-soft"], 3);
  assertReadable(sheet, ".game-versus > strong", "color", ["--surface", "--surface-2"], 3);
  assertReadable("src/styles/matchday.css", ".matchday-edition", "color", ["--surface-2"], 3);
});

test("an improved stat on a roster card is text-accent green, not the button fill, on a dark surface too", () => {
  const selector = ".matchday-player-card .readonly-stat-line .stat-up strong";
  assertReadable("src/styles/matchday.css", selector, "color", ["--surface", "--surface-2"], 4.5);
});
