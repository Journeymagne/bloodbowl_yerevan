import test from "node:test";
import assert from "node:assert/strict";
import pg from "pg";

import { PLAYER_ID_SOURCE, UUID_SOURCE, isUuid, teamConflict, teamForUser } from "../server/api/team-access.mjs";
import { SAVED_TEAM_COLUMNS } from "../server/api/team-queries.mjs";
import { API_ROUTES } from "../server/routes/index.mjs";
import { callApi, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const ID = "0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d";
const NOBODY = "44444444-4444-4444-8444-444444444444";

/** A user as `currentUser` hands one to a route: the row's id, and whether it is an admin. */
const as = (coach, isAdmin = false) => ({ id: coach.id, is_admin: isAdmin });

test("a uuid is 36 hex characters in five groups, in either case, and nothing else", () => {
  assert.equal(isUuid(ID), true);
  assert.equal(isUuid(ID.toUpperCase()), true);
  for (const bad of ["", "p0", ` ${ID}`, `${ID}\n`, ID.replaceAll("-", ""), ID.replace("a", "g"), "1'; DROP TABLE saved_teams; --", null, undefined, 7, [ID]]) {
    assert.equal(isUuid(bad), false, String(bad));
  }
  const groups = ID.split("-"); // every group one character short, and one too long
  for (const [at, group] of groups.entries()) {
    for (const wrong of [group.slice(1), `${group}0`]) {
      assert.equal(isUuid(groups.map((other, index) => (index === at ? wrong : other)).join("-")), false, `group ${at}: ${wrong}`);
    }
  }
});

test("the path fragments take a team's uuid and a player's id and stop at the slash", () => {
  const route = new RegExp(`^/api/teams/(${UUID_SOURCE})/players/(${PLAYER_ID_SOURCE})$`, "i");
  const hit = (path) => route.exec(path)?.slice(1);
  assert.deepEqual(hit(`/api/teams/${ID}/players/p0`), [ID, "p0"]);
  assert.deepEqual(hit(`/api/teams/${ID.toUpperCase()}/players/home-0`), [ID.toUpperCase(), "home-0"]);
  assert.deepEqual(hit(`/api/teams/${ID}/players/${NOBODY}`), [ID, NOBODY]);
  assert.deepEqual(hit(`/api/teams/${ID}/players/a_b.c-d`), [ID, "a_b.c-d"]);
  assert.equal(hit(`/api/teams/${ID}/players/${"x".repeat(200)}`)?.[1].length, 200);
  for (const path of [`/api/teams/${ID}/players/${"x".repeat(201)}`, `/api/teams/${ID}/players/`, `/api/teams/${ID}/players/a/b`,
    `/api/teams/p0/players/p0`, `/api/teams/${ID}0/players/p0`, `/api/teams/${ID}/players/p0/x`]) {
    assert.equal(hit(path), undefined, path);
  }
});

test("a team is its owner's: to anybody else it is as missing as a team that is not there", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), boss = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, owner.id);
  const refusal = (asking) => asking.then(() => assert.fail("let through"), (error) => [error.status, error.code, error.params, error.message]);
  assert.equal((await teamForUser(client, id, as(owner))).user_id, owner.id);
  const stranger = await refusal(teamForUser(client, id, as(other)));
  assert.deepEqual(stranger, [404, "TEAM_NOT_FOUND", {}, "Team not found."]);
  assert.deepEqual(await refusal(teamForUser(client, NOBODY, as(other))), stranger);
  // An admin is let through only where the route says so, and a coach cannot say so for themselves.
  assert.deepEqual(await refusal(teamForUser(client, id, as(boss, true))), stranger);
  assert.equal((await teamForUser(client, id, as(boss, true), { admin: true })).id, id);
  assert.deepEqual(await refusal(teamForUser(client, id, as(other), { admin: true })), stranger);
}));

test("an unlocked read holds nothing, a locked one holds the team's row until the transaction ends", db, () => withApiDatabase(async ({ client, url }) => {
  const owner = await seedCoach(client, "lion"), id = await seedTeam(client, owner.id, { name: "Lions", stage: "draft" });
  const row = await teamForUser(client, id, as(owner));
  assert.deepEqual([row.id, row.name, row.stage, row.revision, row.roster.treasury], [id, "Lions", "draft", 1, 100]);
  const [sql, values] = lockRow("saved_teams", id), other = new pg.Client({ connectionString: url });
  await other.connect();
  try {
    const grab = () => other.query(`${sql} NOWAIT`, values); // refused at once, 55P03, while somebody holds the row
    await client.query("BEGIN");
    await teamForUser(client, id, as(owner));
    await grab();
    await client.query("COMMIT");
    await client.query("BEGIN");
    await teamForUser(client, id, as(owner), { lock: true });
    await assert.rejects(grab(), { code: "55P03" });
    await client.query("COMMIT");
    await grab();
  } finally { await other.end(); }
}));

test("an id that is no uuid is no team, and the database is never asked", async () => {
  const database = { query: async () => assert.fail("asked the database") };
  for (const bad of ["p0", "1; DROP TABLE saved_teams", "", undefined, null, 7]) {
    await assert.rejects(teamForUser(database, bad, as({ id: NOBODY })), { status: 404, code: "TEAM_NOT_FOUND" }, String(bad));
  }
});

test("a user with no usable id is nobody's: the owner check is never dropped by accident, and the database is never asked", async () => {
  const database = { query: async () => assert.fail("asked the database") };
  for (const user of [{}, { id: undefined, is_admin: false }, { id: null, is_admin: true }, { id: "not-a-uuid", is_admin: false }]) {
    await assert.rejects(teamForUser(database, ID, user), { status: 404, code: "TEAM_NOT_FOUND" }, JSON.stringify(user));
  }
});

test("a conflict is the 409 PATCH answers: the code, and the team as it now stands beside it", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), id = await seedTeam(client, owner.id, { stage: "draft" });
  const { body: { team } } = await callApi("GET", `/api/teams/${id}`, { token: owner.token });
  const patched = await callApi("PATCH", `/api/teams/${id}`, { token: owner.token,
    body: { name: team.name, baseTeamSlug: team.baseTeamSlug, roster: team.roster, revision: team.revision - 1 } });
  assert.equal(patched.status, 409);

  const row = (await client.query(`SELECT ${SAVED_TEAM_COLUMNS} FROM saved_teams WHERE id = $1`, [id])).rows[0];
  const conflict = teamConflict(row);
  assert.deepEqual([conflict.status, conflict.code], [409, "TEAM_SAVED_ELSEWHERE"]);
  API_ROUTES.unshift(async () => { throw conflict; });
  try {
    const answered = await callApi("GET", "/api/any-route");
    assert.deepEqual([answered.status, answered.body], [patched.status, patched.body]);
  } finally { API_ROUTES.shift(); }
}));
