import test from "node:test";
import assert from "node:assert/strict";

import { callApi, seedCoach, seedTeam, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const NOBODY = "44444444-4444-4444-8444-444444444444";

test("an admin moves a draft team to active once: the stage, its date and a new revision; again changes nothing", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  const first = await callApi("POST", `/api/teams/${id}/activate`, { token: admin.token });
  assert.equal(first.status, 200);
  assert.equal(first.body.team.stage, "active");
  assert.ok(Date.parse(first.body.team.activatedAt));
  assert.equal(first.body.team.revision, 2);
  const again = await callApi("POST", `/api/teams/${id}/activate`, { token: admin.token });
  assert.deepEqual([again.status, again.body.team.revision, again.body.team.activatedAt], [200, 2, first.body.team.activatedAt]);
}));

test("only an admin activates: a coach is refused for their own team, a stranger is not signed in, an unknown team is 404", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  assert.equal((await callApi("POST", `/api/teams/${id}/activate`, { token: coach.token })).body.error.code, "ADMIN_REQUIRED");
  assert.equal((await callApi("POST", `/api/teams/${id}/activate`)).status, 401);
  assert.equal((await callApi("POST", `/api/teams/${NOBODY}/activate`, { token: admin.token })).body.error.code, "TEAM_NOT_FOUND");
  assert.equal((await teamRow(client, id)).stage, "draft");
}));

test("a team says its stage and when it became active; a team active since before 3.0 has no date", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const one = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  assert.deepEqual([one.body.team.stage, one.body.team.activatedAt], ["active", null]);
  const list = await callApi("GET", "/api/teams", { token: coach.token });
  assert.ok(list.body.teams.every((team) => team.stage === "active"));
}));

test("a coach cannot find out whether a team exists by trying to activate it, and an id that is no uuid is no route", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  const refusals = [];
  for (const [token, target] of [[other.token, id], [other.token, NOBODY], [coach.token, NOBODY]]) {
    const { status, body } = await callApi("POST", `/api/teams/${target}/activate`, { token });
    refusals.push([status, body.error.code]);
  }
  assert.deepEqual(refusals, Array(3).fill([403, "ADMIN_REQUIRED"]));
  const notUuid = await callApi("POST", "/api/teams/p0/activate", { token: admin.token });
  assert.deepEqual([notUuid.status, notUuid.body.error.code], [404, "ROUTE_NOT_FOUND"]);
  assert.equal((await teamRow(client, id)).stage, "draft");
}));

test("a team that was playing before 3.0 is already active: the answer says so and nothing is written, no date, no new revision", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id);
  const { status, body } = await callApi("POST", `/api/teams/${id}/activate`, { token: admin.token });
  assert.deepEqual([status, body.team.stage, body.team.activatedAt, body.team.revision], [200, "active", null, 1]);
  assert.equal(body.team.inActiveSeason, false); // read back the way GET reads a team
  const row = await teamRow(client, id);
  assert.deepEqual([row.stage, row.activated_at, row.revision], ["active", null, 1]);
}));

test("only a POST moves a team: any other method on the path is no route and changes nothing", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const { status, body } = await callApi(method, `/api/teams/${id}/activate`, { token: admin.token });
    assert.deepEqual([status, body.error.code], [404, "ROUTE_NOT_FOUND"], method);
  }
  const row = await teamRow(client, id);
  assert.deepEqual([row.stage, row.revision, row.activated_at], ["draft", 1, null]);
}));

test("the team's id in the path may be in either case, as on the other team routes", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  const { status, body } = await callApi("POST", `/api/teams/${id.toUpperCase()}/activate`, { token: admin.token });
  assert.deepEqual([status, body.team.id, body.team.stage], [200, id, "active"]);
}));

test("two admins activating together move the team once: one date, one new revision, both are answered", db, () => withApiDatabase(async ({ client, url }) => {
  const [first, second] = [await seedCoach(client, "boss", { admin: true }), await seedCoach(client, "chief", { admin: true })];
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { stage: "draft" });
  const activate = (admin) => () => callApi("POST", `/api/teams/${id}/activate`, { token: admin.token });
  const results = await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 }, [activate(first), activate(second)]);
  const [one, two] = results.map((result) => (result.status === "fulfilled" ? result.value : assert.fail(`a request was rejected: ${result.reason?.stack ?? result.reason}`)));
  assert.deepEqual([one.status, two.status], [200, 200]);
  assert.deepEqual([one.body.team.revision, two.body.team.revision], [2, 2]);
  assert.equal(one.body.team.activatedAt, two.body.team.activatedAt);
  const row = await teamRow(client, id);
  assert.deepEqual([row.stage, row.revision], ["active", 2]);
}));

test("an editor open before the activation is told to read again: its save is refused with the team as it now stands", db, () => withApiDatabase(async ({ client }) => {
  const admin = await seedCoach(client, "boss", { admin: true }), coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { stage: "draft" });
  const { body: { team: opened } } = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  assert.deepEqual([opened.stage, opened.revision], ["draft", 1]);
  await callApi("POST", `/api/teams/${id}/activate`, { token: admin.token });
  const save = await callApi("PATCH", `/api/teams/${id}`, { token: coach.token,
    body: { name: opened.name, baseTeamSlug: opened.baseTeamSlug, roster: opened.roster, revision: opened.revision } });
  assert.deepEqual([save.status, save.body.error.code, save.body.team.stage, save.body.team.revision], [409, "TEAM_SAVED_ELSEWHERE", "active", 2]);
}));
