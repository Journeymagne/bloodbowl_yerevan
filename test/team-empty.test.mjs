import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { valuesOf } from "./helpers/contrast.mjs";

const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
const replaced = [];
globalThis.location = { hash: "#/", replace(url) { replaced.push(url); } };
const { noTeamMarkup, renderNoTeam } = await import("../src/screens/team/empty.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");

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

test("on a desk «Create a team» is as wide as its words, not the whole content (M1, 7)", () => {
  assert.ok(valuesOf("src/screens/team/empty.css", ".g-team-empty .g-btn--primary", "width").includes("auto"));
  assert.ok(valuesOf("src/screens/team/empty.css", ".g-team-empty .g-btn--primary", "min-width").includes("240px"));
});

// R10: a coach /me knows, whose list of teams could not be read, is not a coach with no team.
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const SERVER_ERROR = { error: { code: "SERVER_ERROR", params: {}, message: "x" } };
function unread(error = "The server did not answer. Try again in a minute.") {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  replaced.length = 0;
  state.auth.currentUser = { id: "u1", login: "coach", preferences: {} };
  state.myTeams = { items: [], loaded: false, loading: false, error };
  state.activeTeamId = null;
  releaseCurrentScreen();
  renderNoTeam();
}
const retry = () => view.querySelector("button[data-teams-retry]");

test("a list that could not be read is said as such, with a way to read it again, not as no team", () => {
  unread();
  assert.equal(view.querySelector("h1").textContent, "Your teams did not load");
  assert.equal(view.querySelector(".g-team-empty__text").textContent, "The server did not answer. Try again in a minute.");
  assert.equal(retry().textContent.trim(), "Try again");
  assert.equal(view.querySelector('a[href="#/teams/new"]'), null, "no offer to create a first team to a coach who may have five");
  assertCspSafe(view);
  assertStyled(view, "src/screens/team/empty.css", "button.css");
});

test("reading it again goes on to the active team once the list comes", async () => {
  unread();
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1" }, { id: "t2" }] });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } });
  fireEvent(retry(), "click");
  await settle();
  await settle();
  assert.equal(state.myTeams.loaded, true);
  assert.deepEqual(replaced, ["#/t/t1"], "as resolveRedirect sends a coach's #/ on, the address replaced");
  api.assertAnswered();
});

test("a list that comes back empty is a coach with no team after all, and one that fails again says so again", async () => {
  unread();
  api.reply("GET /api/teams", 500, SERVER_ERROR);
  fireEvent(retry(), "click");
  await settle();
  assert.ok(retry(), "still the way to try again");
  api.reply("GET /api/teams", 200, { teams: [] });
  fireEvent(retry(), "click");
  await settle();
  assert.equal(view.querySelector("h1").textContent, "Create your first team");
  assert.deepEqual(replaced, []);
  api.assertAnswered();
});

test("an answer that comes after the coach left draws nothing over the next screen", async () => {
  unread();
  api.reply("GET /api/teams", 200, { teams: [] });
  const gate = api.hold("GET /api/teams");
  fireEvent(retry(), "click");
  releaseCurrentScreen();
  view.innerHTML = "<p>the next screen</p>";
  gate.release();
  await settle();
  assert.equal(view.querySelector("p").textContent, "the next screen");
  api.assertAnswered();
});
