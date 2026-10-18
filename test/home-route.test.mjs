import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

// A coach's `#/` with no team active (resolveRedirect sends one with a team active on to it): never the 2.x front page.
const api = installFakeApi();
document.body.appendChild(el(document, "section", { id: "app-view" }));
const replaced = [];
globalThis.location = { hash: "#/", replace(url) { replaced.push(url); } };
const { renderRoute } = await import("../src/core/router.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { addMyTeam } = await import("../src/data/teams.mjs");
const { clearActiveTeamCache } = await import("../src/data/active-team.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const TEAMS = [{ id: "t1", name: "Ashgrove Wardens" }, { id: "t2", name: "Grimtusk Raiders" }];

/** A coach on `#/` with this list and account, no team active and the page empty, then the route drawn. */
function coachHome(myTeams, preferences = {}, replies = []) {
  api.reset();
  for (const [key, status, body] of replies) api.reply(key, status, body);
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  clearActiveTeamCache(); // the browser's memory of the team before, which outlives the fake storage's reset
  replaced.length = 0;
  releaseCurrentScreen();
  view.innerHTML = "";
  globalThis.location.hash = "#/";
  state.auth.currentUser = { id: "u1", login: "coach", preferences };
  state.myTeams = { loading: false, error: "", ...myTeams };
  state.activeTeamId = null;
  renderRoute();
}

test("a coach with teams and none active goes on to the one their account names, the address replaced", async () => {
  coachHome({ items: TEAMS, loaded: true }, { activeTeamId: "t2" });
  assert.deepEqual(replaced, ["#/t/t2"]);
  assert.equal(state.activeTeamId, "t2", "settled before the address changes, as resolveRedirect would need it");
  assert.equal(view.querySelector("*"), null, "nothing is drawn on the way: the team's screen comes with the hashchange");
  await settle();
  api.assertAnswered();
});

test("one whose account names no team goes on to the first of the list, and the account is told", async () => {
  coachHome({ items: TEAMS, loaded: true }, {}, [["PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t1" } }]]);
  assert.deepEqual(replaced, ["#/t/t1"]);
  assert.equal(state.activeTeamId, "t1");
  await settle();
  assert.deepEqual(api.calls.filter(({ key }) => key === "PATCH /api/auth/preferences").map(({ body }) => body), [{ activeTeamId: "t1" }]);
  api.assertAnswered();
});

test("a coach whose list came back empty gets the overview of no team, which goes on once a team appears", async () => {
  coachHome({ items: [], loaded: true });
  assert.equal(view.querySelector("h1").textContent, "Create your first team");
  assert.equal(view.querySelector('a[href="#/teams/new"]').textContent.trim(), "Create a team");
  assert.deepEqual(replaced, []);
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t9" } });
  addMyTeam({ id: "t9", name: "Iron Rooks" });
  assert.deepEqual(replaced, ["#/t/t9"]);
  await settle();
  api.assertAnswered();
  releaseCurrentScreen();
});

test("a coach whose list could not be read is told so, with a way to read it again, and is not offered a first team", () => {
  coachHome({ items: [], loaded: false, error: "The server did not answer. Try again in a minute." });
  assert.equal(view.querySelector("h1").textContent, "Your teams did not load");
  assert.ok(view.querySelector("button[data-teams-retry]"));
  assert.equal(view.querySelector('a[href="#/teams/new"]'), null);
  assert.deepEqual(replaced, []);
  releaseCurrentScreen();
});
