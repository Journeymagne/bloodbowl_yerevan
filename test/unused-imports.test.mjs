import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { unusedImports } from "../scripts/lib/js-modules.mjs";

const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");

test("a name imported and never used is reported, under the name the module gave it", () => {
  const source = [
    'import { a, b as c, d } from "./x.mjs";',
    'import { e } from "./y.mjs";',
    "export const f = () => a + d;",
  ].join("\n");
  assert.deepEqual(unusedImports(source), ["c", "e"]);
});

test("a use is any place code says the name: a call, an argument, a spread, a shorthand, a template's ${}", () => {
  const source = [
    'import { call, arg, spread, short, inside } from "./x.mjs";',
    "const one = call();",
    "const two = [1].map(arg);",
    "const three = [...spread];",
    "const four = { short };",
    "const five = `<b>${inside(one)}</b>`;",
    "export { two, three, four, five };",
  ].join("\n");
  assert.deepEqual(unusedImports(source), []);
});

test("a mention is not a use: a comment, a JSDoc, a plain string, an object's property, a longer name", () => {
  const source = [
    'import { inLine, inBlock, inDoc, inQuotes, asProperty, prefix } from "./x.mjs";',
    "// inLine is said here only",
    "/* inBlock too */",
    "/** @see inDoc */",
    'const words = "inQuotes";',
    "const value = words.asProperty;",
    "export const prefixed = value + prefixLonger;",
  ].join("\n");
  assert.deepEqual(unusedImports(source), ["inLine", "inBlock", "inDoc", "inQuotes", "asProperty", "prefix"]);
});

test("an import over several lines, and one after a default import, are read; a commented-out import is not one", () => {
  const source = [
    "import fallback, { used } from \"./x.mjs\";",
    "import {",
    "  first,",
    "  second,",
    "} from './y.mjs';",
    '// import { gone } from "./z.mjs";',
    "export const all = [fallback, used, second];",
  ].join("\n");
  assert.deepEqual(unusedImports(source), ["first"]);
});

test("a URL or a `//` inside a string does not hide the rest of its line", () => {
  const source = [
    'import { link } from "./x.mjs";',
    'export const href = "https://example.org/" + link();',
  ].join("\n");
  assert.deepEqual(unusedImports(source), []);
});

test("advance-sheet.mjs imports nothing it does not use, and the orphan `closedMarkup` would be caught (09b fix wave A7)", () => {
  const source = read("src/screens/team/roster/advance-sheet.mjs");
  assert.deepEqual(unusedImports(source), []);
  assert.doesNotMatch(source, /\bclosedMarkup\b/);
  // The line 36f153a took out, put back where it stood: npm run check (check-dead-code.mjs) counts it.
  const panel = 'import { prepResetWords } from "./panel.mjs";\n';
  assert.ok(source.includes(panel));
  const orphaned = source.replace(panel, `${panel}import { closedMarkup } from "./player-access.mjs";\n`);
  assert.deepEqual(unusedImports(orphaned), ["closedMarkup"]);
});
