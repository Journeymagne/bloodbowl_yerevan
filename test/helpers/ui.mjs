/**
 * What every src/ui test needs: the real dictionaries, one fake document, a
 * parser for render output, and the checks every component owes the site —
 * nothing injected, nothing the CSP refuses, nothing left unstyled.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { setDictionaries } from "../../src/core/i18n.mjs";
import { createDocument, parseHtml } from "./fake-dom.mjs";

const read = (file) => readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");

export const document = createDocument();
globalThis.document = document;
const dictionaries = { en: JSON.parse(read("src/i18n/en.json")), ru: JSON.parse(read("src/i18n/ru.json")) };
setDictionaries(dictionaries);

/** A name a coach could type that would be markup if anything forgot to escape it. */
export const HOSTILE = `<img src=x onerror="alert(1)"> & 'Grak'`;

/**
 * Parse render output and put it on the page, so focus and closest() behave as
 * on one. One page at a time: the next mount disconnects the earlier fragment
 * (and takes focus back to the body if it held it), so document.querySelector,
 * querySelectorAll and activeElement never see another test's markup. Parsing
 * comes first: markup that does not parse leaves the page that is up alone.
 */
export function mount(markup) {
  const fragment = parseHtml(document, markup);
  for (const child of [...document.body.childNodes]) document.body.removeChild(child);
  document.body.appendChild(fragment);
  return fragment;
}

/** A render that produced nothing would pass every check below for the wrong reason. */
function assertRendered(fragment) {
  assert.ok([...fragment.walk()].length > 1, "nothing rendered");
}

const URL_ATTRIBUTES = new Set(["href", "src", "action", "formaction"]);

/** The check src/ui/markup.mjs assertLinkHref makes: a browser drops tabs, newlines and control characters before it reads the scheme. */
const isScriptUrl = (value) => /^javascript:/i.test(value.replace(/[\x00-\x20]/g, ""));

/**
 * No style attribute, no on* handler, no <style>, no javascript: URL: the site's
 * CSP refuses all four. Attribute names are compared in lower case, as a browser
 * reads them. A <script> never gets this far: parseHtml refuses it.
 */
export function assertCspSafe(fragment) {
  assertRendered(fragment);
  for (const node of fragment.walk()) {
    if (node.nodeType !== 1) continue;
    assert.notEqual(node.tagName, "STYLE", "a <style> element");
    for (const { name, value } of node.attributes) {
      const lower = name.toLowerCase();
      assert.notEqual(lower, "style", `${node.tagName} carries a style attribute`);
      assert.ok(!lower.startsWith("on"), `${node.tagName} carries ${name}`);
      if (URL_ATTRIBUTES.has(lower)) assert.ok(!isScriptUrl(value), `${node.tagName} ${name} is a javascript: URL`);
    }
  }
}

/**
 * Every g-* class in the markup is defined in base.css or one of the named
 * stylesheets. A name with a slash is a path from the root of the repository
 * (`src/shell/app-header.css`); a bare one is a `src/ui` sheet.
 */
export function assertStyled(fragment, ...sheets) {
  assertRendered(fragment);
  // A class named only in a comment is not styled.
  const css = ["base.css", ...sheets].map((sheet) => read(sheet.includes("/") ? sheet : `src/ui/${sheet}`)).join("\n").replace(/\/\*[\s\S]*?\*\//g, "");
  for (const node of fragment.walk()) {
    if (node.nodeType !== 1) continue;
    for (const name of (node.getAttribute("class") ?? "").split(/\s+/).filter((part) => part.startsWith("g-"))) {
      assert.match(css, new RegExp(`\\.${name}(?![\\w-])`), `.${name} is not styled`);
    }
  }
}

/** Every key a file asks `t("…")` for in a literal is in both dictionaries; the files are paths from the root of the repository. */
export function assertDictionaryCovers(...files) {
  assert.ok(files.length, "no files to check the dictionaries against");
  for (const file of files) {
    for (const [, key] of read(file).matchAll(/\bt\(\s*"([^"]+)"/g)) {
      assert.ok(dictionaries.en[key], `${file}: en ${key}`);
      assert.ok(dictionaries.ru[key], `${file}: ru ${key}`);
    }
  }
}
