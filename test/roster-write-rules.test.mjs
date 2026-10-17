import test from "node:test";
import assert from "node:assert/strict";

import { callApi, seedCoach, seedTeam, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const count = async (client, table) => (await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
const body = (roster, revision) => ({ name: "Lions", baseTeamSlug: "teams/human", ...(revision === undefined ? {} : { revision }),
  roster: { teamSlug: "teams/human", treasury: 100, ...roster } });
const refusal = (answer) => [answer.status, answer.body.error?.code, answer.body.violations];
const refused = (code, params) => [422, "ROSTER_BREAKS_THE_RULES", [{ code, params }]];

test("an SPP counter outside 0…999 refuses a roster save, the owner's and the admin's, and changes nothing; 999 is a counter", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 998 } }] } });
  const before = await teamRow(client, id);
  const save = (token, path, spp) => callApi("PATCH", path, { token, body: body({ players: [{ id: "a", rowIndex: 0, spp }] }, 1) });
  const out = (counter) => refused("SPP_OUT_OF_RANGE", { playerId: "a", counter });
  for (const value of ["100000", 2.5, -1, 1000]) {
    assert.deepEqual(refusal(await save(coach.token, `/api/teams/${id}`, { touchdowns: value })), out("touchdowns"), JSON.stringify(value));
  }
  assert.deepEqual(refusal(await save(coach.token, `/api/teams/${id}`, { touchdowns: 998, mvps: 1000 })), out("mvps"), "MVPs are a counter too");
  assert.deepEqual(refusal(await save(boss.token, `/api/admin/teams/${id}`, { touchdowns: 1000 })), out("touchdowns"), "the admin's save");
  const after = await teamRow(client, id);
  assert.deepEqual([after.revision, after.roster, after.updated_at.getTime(), await count(client, "match_events")],
    [before.revision, before.roster, before.updated_at.getTime(), 0], "nothing is written");
  const saved = await save(coach.token, `/api/teams/${id}`, { touchdowns: 999, mvps: 999 });
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.body.team.roster.players[0].spp.touchdowns, saved.body.team.roster.players[0].spp.mvps, await count(client, "match_events")], [999, 999, 1]);
}));

test("two players under one id refuse a roster on every write — PATCH, the admin's PATCH, a create that reads it, a create that stores it as sent — and nothing is written; two players without an id are fine", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true }), rookie = await seedCoach(client, "rookie");
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "a", rowIndex: 0 }, { id: "b", rowIndex: 0 }] } });
  const twins = { players: [{ id: "a", rowIndex: 0 }, { id: "a", rowIndex: 0 }] };
  const legacy = { players: [{ rowIndex: 0, name: "Old" }, { rowIndex: 0, name: "Older" }] };
  const twice = refused("DUPLICATE_PLAYER_ID", { playerId: "a" });
  const asSent = (roster) => callApi("POST", "/api/season/admin/create-team", { token: boss.token, body: { userId: rookie.id, ...body(roster) } });
  const before = { team: await teamRow(client, id), teams: await count(client, "saved_teams"), seasons: await count(client, "seasons") };
  assert.deepEqual(refusal(await callApi("PATCH", `/api/teams/${id}`, { token: coach.token, body: body(twins, 1) })), twice, "PATCH");
  assert.deepEqual(refusal(await callApi("PATCH", `/api/admin/teams/${id}`, { token: boss.token, body: body(twins, 1) })), twice, "the admin's PATCH");
  assert.deepEqual(refusal(await callApi("POST", "/api/teams", { token: coach.token, body: body(twins) })), twice, "a create read through readTeamBody");
  assert.deepEqual(refusal(await asSent(twins)), twice, "a create that stores the roster as sent");
  assert.deepEqual(refusal(await asSent({ players: [{ id: "x", rowIndex: 0, spp: { bonus: -1 } }] })), refused("SPP_OUT_OF_RANGE", { playerId: "x", counter: "bonus" }),
    "which holds the SPP rule too");
  const team = await teamRow(client, id);
  assert.deepEqual([team.revision, team.roster, await count(client, "saved_teams"), await count(client, "seasons")],
    [before.team.revision, before.team.roster, before.teams, before.seasons], "nothing is written, no season is made");
  assert.equal((await callApi("PATCH", `/api/teams/${id}`, { token: coach.token, body: body(legacy, 1) })).status, 200, "two players without an id never clash");
  assert.equal((await asSent(legacy)).status, 201, "nor as sent");
}));
