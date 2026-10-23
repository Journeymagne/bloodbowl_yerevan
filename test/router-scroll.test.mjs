import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { mountView, referenceData } from "./helpers/ref-screen.mjs";

// Stage 13, decision 6: another route starts at the top of the page, before it is drawn; the same route drawn again
// (another player, another team, a language switch) leaves the place to the screen, as drawScreen does (core/dom.mjs).
// A screen may itself start the page over once it has drawn (drawScreen, on another `data-screen`): the router's own
// calls are the ones made before the screen's first `await` (pre-flight L30), which a team's address always has.

/** The window's events: a screen listens for «online» and the like on it. */
const page = new EventTarget();
for (const name of ["addEventListener", "removeEventListener", "dispatchEvent"]) globalThis[name] = page[name].bind(page);
const api = installFakeApi();
mountView();
const replaced = [];
// A browser's replace() changes the hash at once; the hashchange that draws the new address comes later.
globalThis.location = { hash: "#/", replace(url) { replaced.push(url); this.hash = url; } };
const scrolls = [];
globalThis.scrollY = 0;
globalThis.scrollTo = (x, y) => { scrolls.push([x, y]); };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });

const { renderRoute } = await import("../src/core/router.mjs");
const { state } = await import("../src/core/state.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");

const settle = async (turns = 6) => { for (let turn = 0; turn < turns; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };
const TEAMS = [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human" }, { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc" }];

/** A coach with two teams, t1 active, on a page that has read them and the reference; no screen drawn yet. */
function coach() {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: TEAMS, loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = referenceData("en");
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
}

/**
 * The address changes to `hash` and the router draws it: what the router itself scrolled, before the screen's first
 * `await`. The screen is then let finish (its own scrolls are its own), so the next address starts from a quiet page.
 */
async function go(hash) {
  globalThis.location.hash = hash;
  const before = scrolls.length;
  renderRoute();
  const own = scrolls.slice(before);
  await settle();
  return own;
}

test("another route starts at the top; the same route drawn again keeps its place", async () => {
  coach();
  await go("#/t/t1");
  assert.deepEqual(await go("#/t/t1/roster"), [[0, 0]], "the team's page to its roster: once, to the top");
  assert.deepEqual(await go("#/t/t1/roster/p1"), [[0, 0]], "the roster to a player's address is another route");
  assert.deepEqual(await go("#/t/t1/roster/p2"), [], "one player to another (one name, teamPlayer): the screen decides");
  assert.deepEqual(await go("#/t/t1/roster/p2"), [], "the same address drawn again, as a language switch draws it");
  releaseCurrentScreen();
});

test("another team's page is the same route: the router leaves the place to the screen (L30)", async () => {
  coach();
  await go("#/t/t1");
  assert.deepEqual(await go("#/t/t2"), [], "`team` to `team`");
  releaseCurrentScreen();
});

test("an address the router sends on scrolls nothing, and the route before it stays the one drawn", async () => {
  coach();
  await go("#/t/t1");
  replaced.length = 0;
  assert.deepEqual(await go("#/"), [], "`#/` with a team active is sent on to it");
  assert.deepEqual(replaced, ["#/t/t1"]);
  assert.deepEqual(await go("#/t/t1"), [], "and the address it is sent to is the team's page that was drawn: its place is kept");
  assert.deepEqual(await go("#/t/t1/matches"), [[0, 0]], "a route after it is another one");
  releaseCurrentScreen();
});
