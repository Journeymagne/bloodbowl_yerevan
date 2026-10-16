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
setDictionaries({ en: JSON.parse(read("src/i18n/en.json")), ru: JSON.parse(read("src/i18n/ru.json")) });

/** A name a coach could type that would be markup if anything forgot to escape it. */
export const HOSTILE = `<img src=x onerror="alert(1)"> & 'Grak'`;

/** Parse render output and attach it, so focus and closest() behave as on a page. */
export function mount(markup) {
  const fragment = parseHtml(document, markup);
  document.body.appendChild(fragment);
  return fragment;
}

/** No style attribute, no on* handler, no script: the site's CSP refuses all three. */
export function assertCspSafe(fragment) {
  for (const node of fragment.walk()) {
    if (node.nodeType !== 1) continue;
    assert.notEqual(node.tagName, "SCRIPT");
    for (const { name } of node.attributes) {
      assert.notEqual(name, "style", `${node.tagName} carries a style attribute`);
      assert.ok(!name.startsWith("on"), `${node.tagName} carries ${name}`);
    }
  }
}

/** Every g-* class in the markup is defined in base.css or one of the named src/ui stylesheets. */
export function assertStyled(fragment, ...sheets) {
  const css = ["base.css", ...sheets].map((sheet) => read(`src/ui/${sheet}`)).join("\n");
  for (const node of fragment.walk()) {
    if (node.nodeType !== 1) continue;
    for (const name of (node.getAttribute("class") ?? "").split(/\s+/).filter((part) => part.startsWith("g-"))) {
      assert.match(css, new RegExp(`\\.${name}(?![\\w-])`), `.${name} is not styled`);
    }
  }
}
