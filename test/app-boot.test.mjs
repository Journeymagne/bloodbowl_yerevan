import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { bootPage } from "./helpers/boot-page.mjs";

// R13-M7 (final review M7): the orders src/app.js keeps, which no other test imports it to see. A coach opens `#/`.
const api = installFakeApi();
const { document, replaced, window } = bootPage(api, { hash: "#/" });
const COACH = { id: "u1", login: "felstell", telegram: "@felstell", isAdmin: false, managedByServer: false,
  preferences: { themeMode: "dark", lightPalette: "grass", darkPalette: "embers", activeTeamId: "t2" } };
const TEAMS = [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human" }, { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc" }];
api.items.set("gata-league-auth-token", "tok");
api.reply("GET /api/auth/me", 200, { user: COACH });
api.reply("GET /api/teams", 200, { teams: TEAMS });
api.reply("GET /api/season", 200, {});
api.reply("GET /api/games", 200, { games: [], currentGames: [] });
// The frame's match card waits on the games; the screen must not: they stay unanswered until the screen is drawn.
const games = api.hold("GET /api/games");

const { state } = await import("../src/core/state.mjs");
const session = await import("../src/data/session.mjs");
await import("../src/app.js");
// app.js has wired its own listener by now (its start is waiting on the dictionaries); this one runs after it.
const atFirstChange = [];
session.onSessionChange(() => {
  atFirstChange.push({
    activeTeam: state.activeTeamId,
    replaced: [...replaced],
    palette: document.documentElement.getAttribute("data-palette"),
  });
});
const view = document.querySelector("#app-view");
const turns = async (count = 20) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

test("the first change of session settles the theme and the active team before it draws: a coach's #/ goes on to their team", async () => {
  await turns();
  assert.equal(atFirstChange.length, 1, "one change of session at start");
  const [first] = atFirstChange;
  assert.equal(first.palette, "embers", "the account's palette is on the page (syncThemeWithAccount runs on every change)");
  assert.equal(first.activeTeam, "t2", "the account's team is active before the route is drawn");
  assert.deepEqual(first.replaced, ["#/t/t2"], "so the router sends #/ on to it, replacing the address");
});

test("the redirect's hashchange finds the listener: nothing between the session and the wiring waits on the network", async () => {
  await turns();
  assert.equal(games.count, 1, "the games are still on their way");
  assert.equal(location.hash, "#/t/t2");
  assert.ok(view.querySelector(".g-pagehead h1"), "the team's screen is drawn, so its hashchange was heard");
  assert.match(document.querySelector("#side-nav").textContent, /Grimtusk Raiders/, "and the frame around it names the team");
  games.release();
  await turns();
  api.assertAnswered();
});

test("a token another tab changes moves this page too: app.js listens to the window's storage event", async () => {
  api.items.set("gata-league-auth-token", "other-tab");
  // The same coach, signed in again over there: the page stays on the team it shows.
  api.reply("GET /api/auth/me", 200, { user: { ...COACH, preferences: { ...COACH.preferences } } });
  window.dispatchEvent(new Event("storage"));
  await turns();
  assert.equal(api.calls.filter((call) => call.headers.Authorization === "Bearer other-tab").length > 0, true, "read again with the token there now");
  assert.equal(state.auth.currentUser?.id, "u1");
  assert.equal(state.activeTeamId, "t2");
  api.assertAnswered();
});
