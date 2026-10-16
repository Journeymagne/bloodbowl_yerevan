/**
 * Contrast worked out from the stylesheets themselves: the value a selector
 * gives a property, resolved through tokens.css in each of the eight
 * palettes, against what it sits on, as the WCAG 2 ratio.
 *
 * The parser is small on purpose: innermost `selectors { body }` blocks, and
 * one colour per value — a hex, a `var(--token)` or a two-colour
 * `color-mix(in srgb, …)`. A value it cannot read fails the test rather than
 * passing it.
 *
 * The 2.x screens see the 2.x names too: their tests pass legacy-aliases.css
 * as a layer. Stage 13 deletes that file, and with it those tests.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

export const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

export const PALETTES = { grass: "light", parchment: "light", ice: "light", imperial: "light", night: "dark", dungeon: "dark", embers: "dark", abyss: "dark" };

/** `a, b, c` split at the top level only, so `:where(a, b)` or `color-mix(…, …)` stays one part. */
export function splitTopLevel(text) {
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

/** Every innermost `selectors { body }` block, so a rule inside @media keeps its own selector. */
export function blocks(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: splitTopLevel(selectors).map((part) => part.replace(/\s+/g, " ")),
    body,
  }));
}

/** The values a stylesheet gives a property of one selector, in file order. */
export function valuesOf(file, selector, property) {
  const declaration = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return blocks(read(file))
    .filter((block) => block.selectors.includes(selector))
    .flatMap((block) => [...block.body.matchAll(declaration)].map(([, value]) => value.trim()));
}

const customProperties = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

/** Every custom property a palette sees: tokens.css for its mode and palette, then each layer's. */
export function tokensOf(palette, layers = []) {
  const rules = blocks(read("src/styles/tokens.css"));
  const declared = (selector) => rules.filter((block) => block.selectors.includes(selector)).map((block) => customProperties(block.body));
  return Object.assign(
    {},
    ...declared(":root"),
    ...(PALETTES[palette] === "dark" ? declared(':root[data-mode="dark"]') : []),
    ...declared(`:root[data-palette="${palette}"]`),
    ...layers.flatMap((file) => blocks(read(file)).map((block) => customProperties(block.body))),
  );
}

/** [r, g, b] of a colour written as a hex, a `var(--token)` or a two-colour `color-mix(in srgb, …)`. */
export function colourOf(value, tokens) {
  const text = value.trim();
  const variable = text.match(/^var\(\s*(--[\w-]+)\s*\)$/);
  if (variable) {
    assert.ok(tokens[variable[1]], `${variable[1]} is not defined`);
    return colourOf(tokens[variable[1]], tokens);
  }
  const hex = text.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const digits = hex[1].length === 3 ? [...hex[1]].map((digit) => digit + digit).join("") : hex[1];
    return [0, 2, 4].map((at) => parseInt(digits.slice(at, at + 2), 16));
  }
  const mix = text.match(/^color-mix\(\s*in srgb\s*,(.*)\)$/s);
  assert.ok(mix, `cannot tell what colour "${value}" is: use one token`);
  const [first, second] = splitTopLevel(mix[1]).map((part) => part.match(/^(.*?)(?:\s+([\d.]+)%)?$/s));
  const share = first[2] === undefined ? 50 : Number(first[2]);
  const [one, other] = [colourOf(first[1], tokens), colourOf(second[1], tokens)];
  return one.map((channel, at) => channel * (share / 100) + other[at] * (1 - share / 100));
}

function luminance(colour) {
  const [red, green, blue] = colour.map((channel) => {
    const unit = channel / 255;
    return unit <= 0.03928 ? unit / 12.92 : ((unit + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrast(first, second) {
  const [light, dark] = [luminance(first), luminance(second)].sort((a, b) => b - a);
  return (light + 0.05) / (dark + 0.05);
}

/** A token name stands for its var(). */
const asColour = (value) => (value.startsWith("--") ? `var(${value})` : value);

/** `colour` must hold `minimum`:1 on every one of `backgrounds` (tokens or colours), in every palette. */
export function assertContrast(colour, backgrounds, minimum, { what = colour, layers = [] } = {}) {
  for (const palette of Object.keys(PALETTES)) {
    const tokens = tokensOf(palette, layers);
    for (const background of backgrounds) {
      const ratio = contrast(colourOf(asColour(colour), tokens), colourOf(asColour(background), tokens));
      assert.ok(ratio >= minimum, `${what} on ${background} in ${palette} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
    }
  }
}

/** The colour `selector` gives `property` (its last value in the file) must hold `minimum`:1 on every one of `backgrounds`. */
export function assertReadable(file, selector, property, backgrounds, minimum, { layers = [] } = {}) {
  const values = valuesOf(file, selector, property);
  assert.ok(values.length, `${file} has no ${property} for ${selector}`);
  const value = values.at(-1);
  assertContrast(value, backgrounds, minimum, { what: `${selector} ${property} ${value}`, layers });
}
