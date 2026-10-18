/**
 * What the reference screens' tests share: the page they draw into, the content of a language as the
 * app holds it, and the check that no link a screen draws is one the router sends on.
 *
 * `mountView` comes before the screens are imported: core/view.mjs looks for `#app-view` once, when it
 * loads. Like helpers/ui.mjs this is one document for the file; a test that calls ui.mjs' `mount` would
 * clear the page, `#app-view` with it.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { document } from "./ui.mjs";
import { el } from "./fake-dom.mjs";
import { setLocale } from "../../src/core/i18n.mjs";
import { resolveRedirect, routeFromHash } from "../../src/core/routes.mjs";
import { state } from "../../src/core/state.mjs";
import { expandCollections } from "../../src/data/reference.mjs";

const cache = new Map();

/** The content vault of a language as the app reads it: the build's file with its collections expanded. */
export function referenceData(locale = "en") {
  if (!cache.has(locale)) {
    cache.set(locale, expandCollections(JSON.parse(readFileSync(new URL(`../../public/data.${locale}.json`, import.meta.url), "utf8"))));
  }
  return cache.get(locale);
}

/** `#app-view` on the page of helpers/ui.mjs (once, however many times it is asked for). */
export function mountView() {
  const existing = document.querySelector("#app-view");
  if (existing) return existing;
  const view = el(document, "section", { id: "app-view" });
  document.body.appendChild(view);
  return view;
}

/** The page speaks `locale` and holds its content, as after a language switch. */
export function useLocale(locale) {
  setLocale(locale);
  state.locale = locale;
  state.data = referenceData(locale);
}

/** Where every link under `root` leads, as written. */
export function hrefsIn(root) {
  return root.querySelectorAll("a[href]").map((link) => link.getAttribute("href"));
}

/** The three shapes a visitor has, each with the active team the router would know. */
const VISITORS = {
  guest: { signedIn: false, activeTeamId: null },
  coach: { signedIn: true, activeTeamId: "team-1" },
  teamless: { signedIn: true, activeTeamId: null },
};

/**
 * No href is one `resolveRedirect` sends on, for each visitor named in `as`. A link only a guest is shown
 * (`#/login`) is checked with `as: ["guest"]`: a signed-in coach is sent back from it.
 */
export function assertNotSentOn(hrefs, { as = ["guest", "coach", "teamless"] } = {}) {
  assert.ok(hrefs.length, "no links to check");
  for (const who of as) {
    assert.ok(Object.hasOwn(VISITORS, who), `unknown visitor: ${who}`);
    for (const href of hrefs) {
      const { target } = resolveRedirect(routeFromHash(href), { ...VISITORS[who], hash: href });
      assert.equal(target, null, `${who}: ${href} is sent on to ${target}`);
    }
  }
}
