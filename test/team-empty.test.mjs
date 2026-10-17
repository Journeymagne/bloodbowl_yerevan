import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";

document.body.appendChild(el(document, "section", { id: "app-view" }));
const { noTeamMarkup } = await import("../src/screens/team/empty.mjs");

test("a coach with no team sees an empty overview with one way forward", () => {
  const fragment = mount(noTeamMarkup());
  assert.equal(fragment.querySelectorAll("h1").length, 1);
  assert.equal(fragment.querySelector("a.g-btn--primary").getAttribute("href"), "#/teams/new");
  assertCspSafe(fragment);
  assertStyled(fragment, "src/screens/team/empty.css", "button.css");
  assertDictionaryCovers("src/screens/team/empty.mjs");
});

test("the empty overview's stylesheet reaches the page", () => {
  const styles = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  assert.ok(styles.includes('@import url("screens/team/empty.css");'));
});
