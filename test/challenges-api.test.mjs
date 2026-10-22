import test from "node:test";
import assert from "node:assert/strict";

import { callApi, seedCoach, seedTeam, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };

test("the list names every other coach with a team, each of his teams newest first, and nothing else of them", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion"), wolf = await seedCoach(client, "wolf"), bear = await seedCoach(client, "bear");
  await seedTeam(client, lion.id, { name: "Lions" });
  const old = await seedTeam(client, wolf.id, { name: "Wolves", slug: "teams/orc" });
  const pack = await seedTeam(client, wolf.id, { name: "Pack", slug: "teams/skaven" });
  await client.query("UPDATE saved_teams SET updated_at = now() - interval '1 day' WHERE id = $1", [old]);
  const answer = await callApi("GET", "/api/challenges", { token: await sessionFor(client, lion.id) });
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.opponents, [{ id: wolf.id, login: "wolf", teams: [
    { id: pack, name: "Pack", baseTeamSlug: "teams/skaven" }, { id: old, name: "Wolves", baseTeamSlug: "teams/orc" }] }]);
  assert.ok(!answer.body.opponents.some(({ id }) => id === bear.id || id === lion.id), "a coach without a team and oneself are not offered");
}));

test("a challenge names the challenging team's race", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion"), wolf = await seedCoach(client, "wolf");
  await seedTeam(client, lion.id, { name: "Lions" });
  const pack = await seedTeam(client, wolf.id, { name: "Pack", slug: "teams/skaven" });
  const sent = await callApi("POST", "/api/challenges", { token: wolf.token, body: { opponentId: lion.id, teamId: pack } });
  assert.equal(sent.status, 201);
  for (const coach of [lion, wolf]) {
    const answer = await callApi("GET", "/api/challenges", { token: coach.token });
    assert.equal(answer.status, 200);
    assert.deepEqual(Object.keys(answer.body), ["challenges", "teams", "opponents"], "the answer keeps what it sent before");
    const [challenge] = answer.body.challenges;
    assert.equal(challenge.id, sent.body.id);
    assert.deepEqual(Object.keys(challenge), ["id", "sender", "recipient", "team", "status", "gameId", "createdAt", "updatedAt"]);
    assert.deepEqual(challenge.team, { id: pack, name: "Pack", baseTeamSlug: "teams/skaven" });
  }
}));

test("a coach's own id in capitals is still his own: CHALLENGE_SELF, and nothing is written", db, () => withApiDatabase(async ({ client }) => {
  const lion = await seedCoach(client, "lion");
  const lions = await seedTeam(client, lion.id, { name: "Lions" });
  const answer = await callApi("POST", "/api/challenges", { token: lion.token, body: { opponentId: lion.id.toUpperCase(), teamId: lions } });
  assert.deepEqual([answer.status, answer.body.error?.code], [400, "CHALLENGE_SELF"]);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM friendly_challenges")).rows[0].n, 0);
}));
