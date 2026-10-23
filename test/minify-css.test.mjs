import assert from "node:assert/strict";
import fs, { readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { inlineCssImports } from "../scripts/lib/inline-css.mjs";
import { minifyCss } from "../scripts/lib/minify-css.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const STYLES = path.join(rootDir, "src", "styles.css");
const read = (file) => readFileSync(path.join(rootDir, file), "utf8");

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

test("every calc() in the bundled stylesheet is still valid once minified", async () => {
  // The bundle the build writes: the same inliner over the same entry (see "the build and the test inline the same stylesheet").
  const minified = minifyCss(await inlineCssImports(STYLES));
  const bodies = calcBodies(minified).map(withoutNames);
  assert.ok(bodies.length > 10, `expected the bundle to hold calc() calls, found ${bodies.length}`);
  const broken = bodies.filter(
    // An operator glued to the token before it, a + glued to the token after
    // it, or a - glued to a token that follows a value (not a unary minus).
    (body) => /[^\s(,*/][+-]/.test(body) || /\+\S/.test(body) || /[\w%)]\s-[\d.(]/.test(body),
  );
  assert.deepEqual(broken, []);
});

test("the build and the test inline the same stylesheet", async () => {
  const build = read("scripts/build-site.mjs");
  assert.match(build, /^import \{ inlineCssImports \} from "\.\/lib\/inline-css\.mjs";$/m);
  assert.match(build, /minifyCss\(await inlineCssImports\(stylesPath\)\)/, "dist/src/styles.css is the inlined entry, minified");
  assert.doesNotMatch(build, /function inlineCssImports|@import url\\\(/, "no second inliner beside the shared one");
  // What it gives back: every sheet the entry names, whole, in the entry's order, and no @import left to fetch.
  const bundle = await inlineCssImports(STYLES);
  const sheets = [...read("src/styles.css").matchAll(/@import url\("([^"]+)"\);/g)].map(([, sheet]) => sheet);
  assert.ok(sheets.length > 50, `src/styles.css names ${sheets.length} sheets`);
  assert.ok(bundle === sheets.map((sheet) => read(`src/${sheet}`)).join("\n"), "the sheets src/styles.css names, whole and in its order");
  assert.doesNotMatch(bundle.replace(/\/\*[\s\S]*?\*\//g, ""), /@import/);
});

/** A scratch entry and its sheets, inlined; the directory goes afterwards. */
async function inlineScratch(files) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "inline-css-"));
  try {
    for (const [name, text] of Object.entries(files)) {
      fs.mkdirSync(path.dirname(path.join(dir, name)), { recursive: true });
      fs.writeFileSync(path.join(dir, name), text);
    }
    return await inlineCssImports(path.join(dir, "styles.css"));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

test("the entry's imports are folded in order from beside it; an entry without one comes back as written", async () => {
  const entry = '/* the sheets */\n@import url("a/one.css");\n@import url("two.css");\n';
  assert.equal(await inlineScratch({ "styles.css": entry, "a/one.css": ".a{}", "two.css": ".b{}" }), ".a{}\n.b{}");
  assert.equal(await inlineScratch({ "styles.css": ".c { color: red; }\n" }), ".c { color: red; }\n");
});

test("a rule beside the imports, an import it does not read, or an @import inside a sheet is refused, not dropped", async () => {
  const sheets = { "one.css": ".a{}" };
  await assert.rejects(inlineScratch({ ...sheets, "styles.css": '@import url("one.css");\n.c { color: red; }\n' }), /inline-css: .*styles\.css .*\.c \{ color: red; \}/);
  await assert.rejects(inlineScratch({ ...sheets, "styles.css": '@import url("one.css");\n@import "two.css";\n' }), /inline-css: .*@import "two\.css";/);
  await assert.rejects(inlineScratch({ "styles.css": '@import url("one.css");\n', "one.css": '@import url("deep.css");\n.a{}' }), /inline-css: one\.css has an @import of its own/);
  await assert.rejects(inlineScratch({ "styles.css": '@import url("missing.css");\n' }), /ENOENT/);
});
