import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { blankCommentsAndStrings, collectSourceFiles, relative } from "../scripts/lib/js-modules.mjs";

/**
 * fake-dom hands back an array from `querySelectorAll` and `childNodes`; a browser hands back a NodeList, which has
 * `forEach`, `item`, `entries`, `keys` and `values` and none of the other array methods. So
 * `root.querySelectorAll("a").map(f)` passes every test and throws on the page. Making fake-dom's lists NodeLists
 * would change some 380 calls in the tests (stage 13, decision 26); this reads src instead. Straight on the list:
 * a NodeList method, an index or `.length`; anything else after `[...list]` or `Array.from(list)`.
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const NODE_LIST = new Set(["forEach", "item", "entries", "keys", "values"]);

/** Where the bracket opened at `open` closes. Strings and comments are blank in `code`, so a `:not(…)` in a selector does not count. */
function closingAt(code, open) {
  let depth = 0;
  for (let index = open; index < code.length; index += 1) {
    if (code[index] === "(") depth += 1;
    else if (code[index] === ")" && (depth -= 1) === 0) return index;
  }
  return -1;
}

/** The method called straight after `at` (`.name(` or `?.name(`, across a line break), or null. */
function methodAt(code, at) {
  return /^\s*\??\.\s*([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(at))?.[1] ?? null;
}

/** Every NodeList the source asks for, each with its line and the method called straight on it (null for none). */
function listUses(source) {
  const code = blankCommentsAndStrings(source, { templateCode: true });
  const line = (at) => code.slice(0, at).split("\n").length;
  const uses = [];
  for (const match of code.matchAll(/\bquerySelectorAll\s*\(/g)) {
    const end = closingAt(code, match.index + match[0].length - 1);
    uses.push({ list: "querySelectorAll", line: line(match.index), method: end === -1 ? null : methodAt(code, end + 1) });
  }
  for (const match of code.matchAll(/\.childNodes\b/g)) {
    uses.push({ list: "childNodes", line: line(match.index), method: methodAt(code, match.index + match[0].length) });
  }
  return uses;
}

/** `file:line .method(` for every array method src calls straight on one kind of list, and how many of that list it saw. */
async function arrayCallsOn(list) {
  const found = [];
  let seen = 0;
  for (const file of await collectSourceFiles(rootDir, ["src"])) {
    for (const use of listUses(readFileSync(file, "utf8")).filter((entry) => entry.list === list)) {
      seen += 1;
      if (use.method && !NODE_LIST.has(use.method)) found.push(`${relative(rootDir, file)}:${use.line} .${use.method}(`);
    }
  }
  return { found, seen };
}

test("no array method is called straight on querySelectorAll in src", async () => {
  const { found, seen } = await arrayCallsOn("querySelectorAll");
  assert.deepEqual(found, [], "spread the NodeList first: [...root.querySelectorAll(…)]");
  assert.ok(seen > 10, `the scan found ${seen} calls; it should see the ones src makes`);
});

test("nor on childNodes, which a browser hands back as a NodeList too", async () => {
  const { found, seen } = await arrayCallsOn("childNodes");
  assert.deepEqual(found, [], "Array.from(node.childNodes) first");
  assert.ok(seen > 0);
});

test("the scan sees through brackets in a selector, optional calls, line breaks and templates, and skips prose", () => {
  const cases = [
    ['root.querySelectorAll("a:not(.b)").map(f);', "map"],
    ["root.querySelectorAll(`[data-x=\"${id(1)}\"]`)\n  .filter(Boolean);", "filter"],
    ["root?.querySelectorAll(selector)?.some(g);", "some"],
    ["root.querySelectorAll(TAB).at(-1);", "at"],
    ["root.querySelectorAll(\"a\").forEach(f);", "forEach"],
    ["root.querySelectorAll(\"a\").length;", null],
    ["root?.querySelectorAll(selector) ?? [];", null],
    ["[...root.querySelectorAll(\"a\")].map(f);", null],
    ["Array.from(root.querySelectorAll(\"a\")).find(f);", null],
  ];
  for (const [source, method] of cases) assert.deepEqual(listUses(source).map((use) => use.method), [method], source);
  assert.deepEqual(listUses("node.childNodes.at(-1); Array.from(node.childNodes).map(f);").map((use) => use.method), ["at", null]);
  assert.deepEqual(listUses('// root.querySelectorAll("a").map(f)\nconst words = "querySelectorAll(x).map(y)";'), []);
  assert.deepEqual(listUses("root.querySelectorAll(\"a\")\n\n  .map(f);").map((use) => use.line), [1]);
});
