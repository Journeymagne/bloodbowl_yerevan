import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";

// The screen draws into the page's own #app-view: its markup is parsed as a browser would parse it.
document.body.appendChild(el(document, "section", { id: "app-view" }));

const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { renderHome } = await import("../src/screens/home.mjs");
const { matchRoute, resolveRedirect, routeFromHash } = await import("../src/core/routes.mjs");

/** The front page's four doors, as a visitor of this kind sees them: `[href, label]`. */
function quickLinks(currentUser) {
  state.auth.currentUser = currentUser;
  renderHome();
  return view.querySelectorAll(".site-quick-links a").map((link) => [link.getAttribute("href"), link.querySelector("strong").textContent]);
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

// Final-wave item 6: the reason for the h2 is a comment in the code, not in the page.
test("the hero is the screen's one heading, and the overview under it is a section of it", () => {
  quickLinks(null);
  assert.equal(view.querySelectorAll("h1").length, 1);
  assert.equal(view.querySelector(".page-head h2").textContent, "Overview");
  assert.equal(view.querySelector(".page-head h1"), null);
});
