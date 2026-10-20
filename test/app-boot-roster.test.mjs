import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { bootPage } from "./helpers/boot-page.mjs";

// The app as it boots, opened on a team's roster: what the router draws there is the 3.0 roster (plan 07a, Task 9); a
// fallen player's own address is his 3.0 profile (stage 07b, Task 10).
const api = installFakeApi();
const { document, replaced } = bootPage(api, { hash: "#/t/t1/roster" });
const COACH = { id: "u1", login: "felstell", isAdmin: false, managedByServer: false, preferences: { activeTeamId: "t1" } };
const TEAM = {
  id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 2,
  roster: { players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann" }, { id: "p2", rowIndex: 3, number: "2", name: "Bors" }] },
};
api.items.set("gata-league-auth-token", "tok");
api.reply("GET /api/auth/me", 200, { user: COACH });
api.reply("GET /api/teams", 200, { teams: [TEAM] });
api.reply("GET /api/teams/t1", 200, { team: TEAM });
api.reply("GET /api/teams/t1/events", 200, { events: [], revision: 2 });
api.reply("GET /api/teams/t1/fallen", 200, { fallen: [] });
api.reply("GET /api/games", 200, { games: [], currentGames: [] });
api.reply("GET /api/season", 200, {});

await import("../src/app.js");
const turns = async (count = 30) => { for (let turn = 0; turn < count; turn += 1) await new Promise((resolve) => { setImmediate(resolve); }); };

test("the 3.0 roster is what the team's roster address draws", async () => {
  await turns();
  const view = document.querySelector("#app-view");
  assert.ok(view.querySelector('[data-screen="team-roster"]'), "the roster screen, not the 2.x editor");
  assert.ok(view.querySelector("table.g-rtable"));
  assert.deepEqual(view.querySelectorAll(".g-rtable__name").map((name) => name.textContent), ["Ann", "Bors"]);
  assert.equal(view.querySelector("[data-roster-player]"), null, "nothing of the 2.x editor");
  api.assertAnswered();
});

test("a fallen player's address draws his profile", async () => {
  const pike = { id: "f1", player: { id: "d1", rowIndex: 3, number: "8", name: "Pike" }, cause: "Foul", pairingId: null, roundNumber: null, diedAt: "2026-10-18T10:00:00Z", fromMatch: false };
  api.reply("GET /api/teams/t1/fallen", 200, { fallen: [pike] });
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  // Stage 07e: his page reads his career by match.
  api.reply("GET /api/teams/t1/players/d1/history", 200, { history: { playerId: "d1", matches: [], outside: {} } });
  location.replace("#/t/t1/roster/d1");
  await turns();
  const view = document.querySelector("#app-view");
  assert.equal(replaced.at(-1), "#/t/t1/roster/d1");
  assert.ok(view.querySelector('[data-screen="team-player"]'), "the profile, not the 2.x editor");
  assert.equal(view.querySelector("h1").textContent, "Pike");
  assert.ok(view.querySelector("[data-roster-undo]"));
  assert.ok(view.querySelector(".g-fallen .g-career"), "his career by match");
  assert.ok(!view.querySelector(".matchday-editor"));
  api.assertAnswered();
});
