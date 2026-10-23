/**
 * Contrast worked out from the stylesheets themselves: the value a selector
 * gives a property, resolved through tokens.css in each of the eight
 * palettes, against what it sits on, as the WCAG 2 ratio.
 *
 * The stylesheets are read by css.mjs (innermost `selectors { body }` blocks);
 * the colour parser here is as small on purpose: one colour per value — a
 * hex, a `var(--token)` or a two-colour `color-mix(in srgb, …)`. A value it
 * cannot read fails the test rather than passing it.
 */
import assert from "node:assert/strict";

import { blocks, read, splitTopLevel, valuesOf } from "./css.mjs";

// The stylesheet readers live in css.mjs; the contrast tests have always taken them from here, and still may.
export { blocks, inMedia, mediaText, read, splitTopLevel, valuesOf } from "./css.mjs";

export const PALETTES = { grass: "light", parchment: "light", ice: "light", imperial: "light", night: "dark", dungeon: "dark", embers: "dark", abyss: "dark" };

const customProperties = (body) => Object.fromEntries([...body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map(([, name, value]) => [name, value.trim()]));

/** Every custom property a palette sees: tokens.css for its mode and palette. */
export function tokensOf(palette) {
  const rules = blocks(read("src/styles/tokens.css"));
  const declared = (selector) => rules.filter((block) => block.selectors.includes(selector)).map((block) => customProperties(block.body));
  return Object.assign(
    {},
    ...declared(":root"),
    ...(PALETTES[palette] === "dark" ? declared(':root[data-mode="dark"]') : []),
    ...declared(`:root[data-palette="${palette}"]`),
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
export function assertContrast(colour, backgrounds, minimum, { what = colour } = {}) {
  for (const palette of Object.keys(PALETTES)) {
    const tokens = tokensOf(palette);
    for (const background of backgrounds) {
      const ratio = contrast(colourOf(asColour(colour), tokens), colourOf(asColour(background), tokens));
      assert.ok(ratio >= minimum, `${what} on ${background} in ${palette} is ${ratio.toFixed(2)}:1, below ${minimum}:1`);
    }
  }
}

/** The colour `selector` gives `property` (its last value in the file) must hold `minimum`:1 on every one of `backgrounds`. */
export function assertReadable(file, selector, property, backgrounds, minimum) {
  const values = valuesOf(file, selector, property);
  assert.ok(values.length, `${file} has no ${property} for ${selector}`);
  const value = values.at(-1);
  assertContrast(value, backgrounds, minimum, { what: `${selector} ${property} ${value}` });
}
