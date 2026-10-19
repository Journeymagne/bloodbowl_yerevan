import assert from "node:assert/strict";
import test, { beforeEach } from "node:test";

import { HOSTILE, assertCspSafe, mount } from "./helpers/ui.mjs";
import { referenceData } from "./helpers/ref-screen.mjs";

const { renderRosterLinks, renderRuleLinks } = await import("../src/components/content-links.mjs");
const { pageForName } = await import("../src/screens/ref/catalog.mjs");
const { pageUrl } = await import("../src/core/routes.mjs");
const { state } = await import("../src/core/state.mjs");

const pageTitled = (title) => state.data.pages.find((page) => page.title === title);

beforeEach(() => {
  state.data = referenceData("en");
});

/** The pills a render drew, as [tag, href, text]: a link carries its address, a pill that leads nowhere has none. */
function pills(markup) {
  const root = mount(markup);
  return root.querySelectorAll(".roster-pill").map((pill) => [pill.tagName, pill.getAttribute("href"), pill.textContent]);
}

test("a roster's skill links to the page the reference finds, whatever the spelling", () => {
  const names = ["Bone Head", "Loner (4+)", "Mighty Blow (+1)", "Animosity (All)", "No Such Skill"];
  const drawn = pills(renderRosterLinks(names));
  assert.equal(drawn.length, names.length);

  // Whatever page the reference's one rule finds for a name is the page the roster's link leads to.
  for (const [index, name] of names.slice(0, 4).entries()) {
    const page = pageForName(state.data, name);
    assert.ok(page, `${name} has a page`);
    assert.deepEqual(drawn[index], ["A", pageUrl(page), name]);
  }
  assert.deepEqual(drawn.slice(0, 3).map(([, href]) => href), ["#/traits/bonehead", "#/traits/loner-x", "#/skills/mighty-blow-1"]);
  assert.equal(drawn[3][1], pageUrl(state.data.traits.find((page) => page.title === "Animosity (X)")));

  // A name the vault has no page for is a pill, not a link.
  assert.deepEqual(drawn[4], ["SPAN", null, "No Such Skill"]);
});

test("a team's rule: a league leads to Leagues, a special rule to Special Rules, any other name to the page it stands for", () => {
  const drawn = pills(renderRuleLinks(["Old World Classic", "Brawlin' Brutes", "Bone Head"]));
  assert.deepEqual(drawn, [
    ["A", "#/leagues", "Old World Classic"],
    ["A", pageUrl(pageTitled("Special Rules")), "Brawlin' Brutes"],
    ["A", "#/traits/bonehead", "Bone Head"],
  ]);
  assert.equal(drawn[0][1], pageUrl(pageTitled("Leagues")));
  assert.equal(drawn[1][1], "#/special-rules");
});

test("a rule with a parameter finds the page of its template, as a skill does", () => {
  const names = ["Loner (3+)", "Animosity (Underworld Goblin Linemen)", "Hatred (Troll)"];
  const drawn = pills(renderRuleLinks(names));
  for (const [index, name] of names.entries()) {
    assert.deepEqual(drawn[index], ["A", pageUrl(pageForName(state.data, name)), name]);
  }
  assert.deepEqual(drawn.map(([, href]) => href), ["#/traits/loner-x", "#/traits/animosity-x", "#/traits/hatred-x"]);
});

test("a name is text", () => {
  for (const render of [renderRosterLinks, renderRuleLinks]) {
    const root = mount(render([HOSTILE]));
    assertCspSafe(root);
    assert.equal(root.querySelectorAll("a").length, 0);
    assert.equal(root.querySelectorAll("img").length, 0);
    const [pill] = root.querySelectorAll(".roster-pill");
    assert.equal(pill.tagName, "SPAN");
    assert.equal(pill.textContent, HOSTILE);
  }
});

test("a list with nothing in it is a dash", () => {
  for (const render of [renderRosterLinks, renderRuleLinks]) {
    const root = mount(render([]));
    assert.equal(root.querySelectorAll("a").length, 0);
    assert.equal(root.querySelector(".muted-text").textContent, "-");
  }
});
