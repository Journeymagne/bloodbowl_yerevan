import assert from "node:assert/strict";
import test from "node:test";

import { document, mount } from "./helpers/ui.mjs";

// The page keeps an HTML comment the fake document cannot parse, so the screen
// draws into a stand-in that keeps the markup as text; the doors are mounted from it.
const stage = { dataset: {}, innerHTML: "" };
const find = document.querySelector.bind(document);
document.querySelector = (selector) => (selector === "#app-view" ? stage : find(selector));

const { state } = await import("../src/core/state.mjs");
const { renderHome } = await import("../src/screens/home.mjs");
const { matchRoute, resolveRedirect, routeFromHash } = await import("../src/core/routes.mjs");

/** The front page's four doors, as a visitor of this kind sees them: `[href, label]`. */
function quickLinks(currentUser) {
  state.auth.currentUser = currentUser;
  renderHome();
  const nav = stage.innerHTML.match(/<nav class="site-quick-links"[\s\S]*?<\/nav>/)[0];
  return mount(nav).querySelectorAll("a").map((link) => [link.getAttribute("href"), link.querySelector("strong").textContent]);
}

test("a coach's front page opens their teams and their games", () => {
  assert.deepEqual(quickLinks({ id: "u1", login: "coach" }), [["#/teams", "My Teams"], ["#/my-games", "My Games"], ["#/season", "Season"], ["#/ref", "References"]]);
});

test("a guest is not offered My Teams, which would land in the reference; both coach doors ask them to sign in", () => {
  const links = quickLinks(null);
  assert.equal(links.length, 4, "the grid keeps its four doors");
  for (const [href, label] of links) {
    const { target } = resolveRedirect(routeFromHash(href), { signedIn: false, hash: href });
    assert.ok(!String(target).startsWith("#/ref"), `${label} (${href}) leads on to ${target}`);
  }
  const [teams, games] = links;
  assert.equal(teams[1], "My Teams");
  assert.equal(matchRoute(routeFromHash(teams[0])).name, "login");
  assert.equal(resolveRedirect(routeFromHash(games[0]), { signedIn: false, hash: games[0] }).target, "#/login");
});
