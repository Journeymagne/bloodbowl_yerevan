/**
 * A stylesheet as the tests read it: its text without its comments, its innermost rules, the values a selector gives a
 * property, and what it says inside or outside its `@media` blocks — so no test cuts a block out of the text by hand.
 *
 * The parser is small on purpose: innermost `selectors { body }` blocks, and an `@media` block's end found by counting
 * its braces. A stylesheet whose braces do not close is cut at its end rather than read past it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/** A file of the repository as text. */
export const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

/** `css` without its comments. */
export const bare = (css) => css.replace(/\/\*[\s\S]*?\*\//g, "");

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
  return [...bare(css).matchAll(/([^{}]+)\{([^{}]*)\}/g)].map(([, selectors, body]) => ({
    selectors: splitTopLevel(selectors).map((part) => part.replace(/\s+/g, " ")),
    body,
  }));
}

/** The values `css` gives a property of one selector, in its order. */
function valuesIn(css, selector, property) {
  const declaration = new RegExp(`(?:^|[;\\s])${property}\\s*:\\s*([^;]+)`, "g");
  return blocks(css)
    .filter((block) => block.selectors.includes(selector))
    .flatMap((block) => [...block.body.matchAll(declaration)].map(([, value]) => value.trim()));
}

/** The values a stylesheet gives a property of one selector, in file order. */
export function valuesOf(file, selector, property) {
  return valuesIn(read(file), selector, property);
}

/**
 * Every `@media` block of a stylesheet's text without comments, in file order: its query as written ("(max-width:
 * 900px)"), where the block starts and ends, and what stands between its braces. A block inside another is listed too.
 */
function mediaBlocks(css) {
  const found = [];
  for (const media of css.matchAll(/@media\s*([^{]+)\{/g)) {
    const inner = media.index + media[0].length;
    let depth = 1;
    let at = inner;
    for (; depth && at < css.length; at += 1) depth += css[at] === "{" ? 1 : css[at] === "}" ? -1 : 0;
    found.push({ query: media[1].trim(), start: media.index, end: at, body: css.slice(inner, depth ? at : at - 1) });
  }
  return found;
}

/** A query as `@media` writes it: "min-width: 901px" and "(min-width: 901px)" are the same one. */
const asQuery = (query) => (query.trim().startsWith("(") ? query.trim() : `(${query.trim()})`);

/** The query of every `@media` block of a stylesheet, as written and in file order: ["(max-width: 900px)", …]. */
export function mediaQueries(file) {
  return mediaBlocks(bare(read(file))).map(({ query }) => query);
}

/**
 * What a stylesheet says inside its `@media (query)` blocks (`query` without the brackets: "min-width: 901px"), in file
 * order and without its comments, as one text: its rules for one width, whatever stands before or after them.
 */
export function mediaText(file, query) {
  const wanted = asQuery(query);
  return mediaBlocks(bare(read(file))).filter((block) => block.query === wanted).map(({ body }) => body).join("\n");
}

/** What a stylesheet says outside its `@media (query)` blocks, without its comments: the rules every other width reads. */
export function outsideMedia(file, query) {
  const wanted = asQuery(query);
  const css = bare(read(file));
  let outside = "";
  let cursor = 0;
  for (const block of mediaBlocks(css)) {
    if (block.query !== wanted || block.start < cursor) continue;
    outside += css.slice(cursor, block.start);
    cursor = block.end;
  }
  return outside + css.slice(cursor);
}

/** The values a stylesheet gives a property of one selector inside its `@media (query)` blocks, in file order. */
export function inMedia(file, query, selector, property) {
  return valuesIn(mediaText(file, query), selector, property);
}

/** The stage's two breakpoints: a phone up to 900px, a desk from 901px. */
const BREAKPOINTS = ["(max-width: 900px)", "(min-width: 901px)"];

/**
 * A stylesheet breaks at the stage's two widths only (`also`: the queries a sheet may add on purpose, as "(max-width:
 * 369px)"). Returns its queries, in file order.
 */
export function assertBreakpoints(file, { also = [] } = {}) {
  const allowed = [...BREAKPOINTS, ...also.map(asQuery)];
  const queries = mediaQueries(file);
  for (const query of queries) assert.ok(allowed.includes(query), `${file}: @media ${query} is not one of ${allowed.join(", ")}`);
  return queries;
}
