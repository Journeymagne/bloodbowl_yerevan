import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { minifyCss } from "../scripts/lib/minify-css.mjs";

const stylesDir = new URL("../src/", import.meta.url);

/** src/styles.css with its @import lines folded in, as the build does it. */
function bundledSource() {
  const entry = readFileSync(new URL("styles.css", stylesDir), "utf8");
  const parts = [...entry.matchAll(/@import url\("([^"]+)"\);/g)].map((match) =>
    readFileSync(new URL(match[1], stylesDir), "utf8"),
  );
  return parts.join("\n");
}

/** The text inside every calc( … ), balanced, nested calls included. */
function calcBodies(css) {
  const bodies = [];
  for (let start = css.indexOf("calc("); start !== -1; start = css.indexOf("calc(", start + 1)) {
    let depth = 0;
    for (let i = start + 4; i < css.length; i++) {
      if (css[i] === "(") depth++;
      if (css[i] === ")" && --depth === 0) {
        bodies.push(css.slice(start + 5, i));
        break;
      }
    }
  }
  return bodies;
}

/**
 * Names carry hyphens (--space-14, safe-area-inset-bottom) that are not
 * operators; blank them so what is left is numbers, units and operators.
 */
function withoutNames(body) {
  return body.replace(/--[\w-]+/g, "N").replace(/env\(\s*[\w-]+/g, "env(N");
}

test("calc() keeps the spaces around + (a custom property and a length)", () => {
  const minified = minifyCss(".a { padding-left: calc(var(--a) + 18px); }");
  assert.equal(minified, ".a{padding-left: calc(var(--a) + 18px)}");
});

test("calc() keeps the spaces around + before env()", () => {
  const minified = minifyCss(".dock { padding-bottom: calc(1px + env(safe-area-inset-bottom)); }");
  assert.equal(minified, ".dock{padding-bottom: calc(1px + env(safe-area-inset-bottom))}");
});

test("calc() keeps the spaces around -", () => {
  assert.equal(minifyCss(".a { width: calc(100% - 2px); }"), ".a{width: calc(100% - 2px)}");
});

test("a sibling combinator still selects", () => {
  const minified = minifyCss("h2 + p { margin: 0; }");
  assert.match(minified, /^h2 ?\+ ?p\{margin: 0\}$/);
});

test("the other combinators and separators are compacted", () => {
  assert.equal(
    minifyCss("ul > li ,\n a ~ b {\n  color : red ;\n  margin : 0 ;\n}"),
    "ul>li,a~b{color : red;margin : 0}",
  );
});

test("comments are removed", () => {
  assert.equal(minifyCss("/* head */ .a { /* inner */ color: red; }"), ".a{color: red}");
});

test("the last semicolon in a block goes", () => {
  assert.equal(minifyCss(".a { color: red; } .b { color: blue; }"), ".a{color: red}.b{color: blue}");
});

test("every calc() in the bundled stylesheet is still valid once minified", () => {
  const minified = minifyCss(bundledSource());
  const bodies = calcBodies(minified).map(withoutNames);
  assert.ok(bodies.length > 10, `expected the bundle to hold calc() calls, found ${bodies.length}`);
  const broken = bodies.filter(
    // An operator glued to the token before it, a + glued to the token after
    // it, or a - glued to a token that follows a value (not a unary minus).
    (body) => /[^\s(,*/][+-]/.test(body) || /\+\S/.test(body) || /[\w%)]\s-[\d.(]/.test(body),
  );
  assert.deepEqual(broken, []);
});
