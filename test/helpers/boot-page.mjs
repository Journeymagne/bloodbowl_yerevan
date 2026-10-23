/**
 * The page src/app.js boots on, for the tests that boot the app itself: index.html's empty frame in a fake
 * document, a window to listen on, an address bar, a system that prefers light, and the dictionaries and the
 * reference data served where app.js fetches them.
 *
 * The address bar's `replace` swaps the hash at once and fires `hashchange` later, in a task of its own, as a
 * browser does: a listener added after an `await` that outlasts that task never hears it.
 *
 * app.js starts itself when it is imported, once per test file (a module runs once), so a file boots one page.
 */
import { readFileSync } from "node:fs";

import { createDocument, el } from "./fake-dom.mjs";
import { setDictionaries } from "../../src/core/i18n.mjs";

const read = (file) => JSON.parse(readFileSync(new URL(`../../${file}`, import.meta.url), "utf8"));

/**
 * @param {ReturnType<import("./fake-api.mjs").installFakeApi>} api installed before any src module is imported
 * @param {{hash: string}} options the address the page is opened at
 * @returns {{document: object, replaced: string[], window: EventTarget}}
 */
export function bootPage(api, { hash }) {
  const document = createDocument();
  globalThis.document = document;
  document.body.appendChild(el(document, "div", { id: "app-frame", class: "g-frame" },
    el(document, "aside", { id: "side-nav" }),
    el(document, "div", { class: "g-frame__main" },
      el(document, "header", { id: "app-header" }),
      el(document, "section", { id: "app-view", tabindex: "-1" }),
      el(document, "footer", { id: "site-footer" }))));
  const window = new EventTarget();
  for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = window[name].bind(window);
  globalThis.window = globalThis;
  globalThis.history = { length: 1, back() {} };
  globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  const replaced = [];
  globalThis.location = {
    hash,
    replace(url) {
      replaced.push(url);
      this.hash = url;
      setImmediate(() => window.dispatchEvent(new Event("hashchange")));
    },
  };
  // The dictionaries are the fetched ones; these are only for a test that reads a text before the app has them.
  setDictionaries({ en: read("src/i18n/en.json"), ru: read("src/i18n/ru.json") });
  for (const locale of ["en", "ru"]) api.reply(`GET src/i18n/${locale}.json?v=dev`, 200, read(`src/i18n/${locale}.json`));
  api.reply("GET public/data.en.json?v=dev", 200, read("public/data.en.json"));
  api.items.set("gata-league-locale", "en");
  return { document, replaced, window };
}
