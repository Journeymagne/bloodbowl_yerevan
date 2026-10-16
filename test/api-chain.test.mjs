import test from "node:test";
import assert from "node:assert/strict";

import { API_ROUTES } from "../server/routes/index.mjs";
import { callApi, seedCoach, seedTeam, sessionFor, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

test("the API chain is the one server.mjs ran, in its order", () => {
  assert.deepEqual(API_ROUTES.map((route) => route.name),
    ["handleAuthRoutes", "handleTeamRoutes", "handleAdminRoutes", "handlePlayerRoutes", "handleGameRoutes", "handleSeasonRoutes"]);
});

test("a path no module answers is a 404 with its code, through the same chain", async () => {
  const { status, body } = await callApi("GET", "/api/no-such-route");
  assert.equal(status, 404);
  assert.equal(body.error.code, "ROUTE_NOT_FOUND");
});

test("what the seeding helpers write is what the chain serves: sessions, a password, a team", { skip: scratchSkip }, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true });
  const me = (token) => callApi("GET", "/api/auth/me", { token });
  const mine = (await me(coach.token)).body.user;
  assert.deepEqual([mine.login, mine.isAdmin], ["lion", false]);
  assert.equal((await me(boss.token)).body.user.isAdmin, true);
  const another = await sessionFor(client, coach.id);
  assert.notEqual(another, coach.token);
  assert.equal((await me(another)).body.user.id, coach.id);
  assert.equal((await me("no-such-session")).body.user, null);
  assert.equal((await callApi("POST", "/api/auth/login", { body: { login: coach.login, password: coach.password } })).status, 200);

  const id = await seedTeam(client, coach.id, { players: 3, roster: { treasury: 40 }, stage: "draft" });
  const { body: { team } } = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  assert.deepEqual([team.name, team.baseTeamSlug, team.roster.treasury], ["Lions", "teams/human", 40]);
  assert.deepEqual(team.roster.players, [0, 1, 2].map((n) => ({ id: `p${n}`, rowIndex: 0, spp: {} })));
  const row = await teamRow(client, id);
  assert.deepEqual([row.user_id, row.stage, row.revision], [coach.id, "draft", 1]);
  const full = await teamRow(client, await seedTeam(client, coach.id, { name: "Wolves" }));
  assert.deepEqual([full.name, full.stage, full.roster.treasury, full.roster.players.length], ["Wolves", "active", 100, 11]);
}));
