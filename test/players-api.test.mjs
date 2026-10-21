import test from "node:test";
import assert from "node:assert/strict";

import { publicTeamRoll } from "../server/routes/players.mjs";
import { callApi, seedCoach, seedTeam, sessionFor, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const UUID = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const NOBODY = "44444444-4444-4444-8444-444444444444";
const TWO_DICE = { dice: [
  { skill: "Block", attempts: [{ roll: 3, skill: "Dodge", duplicate: true }, { roll: 1, skill: "Block", duplicate: false }] },
  { skill: "Fend", attempts: [{ roll: 7, skill: "Fend", duplicate: false }] },
] };
/** A roll the site kept for `team`'s player `p1`: used unless `used` is false, `age` before now. */
const put = (client, n, team, { purpose = "random_skill", result = TWO_DICE, used = true, age = "0 seconds", by = null } = {}) => client.query(
  `INSERT INTO dice_rolls (id, saved_team_id, player_id, purpose, params, result, used_at, rolled_by, created_at)
   VALUES ($1, $2, 'p1', $3, '{"sides":16,"category":"General","candidates":["Block","Fend"]}', $4,
           CASE WHEN $5::boolean THEN now() END, $6, now() - $7::interval)`,
  [UUID(n), team, purpose, JSON.stringify(result), used, by, age]);
const publicTeam = async (client, owner, teamId, viewer) =>
  callApi("GET", `/api/players/${owner}/teams/${teamId}`, { token: await sessionFor(client, viewer) });

test("a public roll is the roll's id, its player, its purpose and its dice' skills, and nothing else of the row", () => {
  const row = { id: UUID(1), saved_team_id: UUID(9), player_id: 7, purpose: "random_skill", params: { sides: 16, candidates: ["Block"] },
    result: TWO_DICE, rolled_by: UUID(8), used_at: new Date(), created_at: new Date() };
  assert.deepEqual(publicTeamRoll(row), { id: UUID(1), playerId: "7", purpose: "random_skill", result: { dice: [{ skill: "Block" }, { skill: "Fend" }] } });
});

test("a coach's public team carries its used random-skill rolls as the skills of their dice, and nothing else of them", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), viewer = await seedCoach(client, "wolf");
  const teamId = await seedTeam(client, owner.id);
  await put(client, 1, teamId, { by: owner.id });
  const answer = await publicTeam(client, owner.id, teamId, viewer.id);
  assert.equal(answer.status, 200);
  assert.deepEqual(Object.keys(answer.body), ["user", "team", "rolls"]);
  assert.deepEqual(answer.body.rolls, [{ id: UUID(1), playerId: "p1", purpose: "random_skill", result: { dice: [{ skill: "Block" }, { skill: "Fend" }] } }]);
}));

test("a waiting roll, a characteristic's roll and another team's are not sent", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), viewer = await seedCoach(client, "bear");
  const teamId = await seedTeam(client, owner.id), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  await put(client, 1, teamId, { used: false });
  await put(client, 2, teamId, { purpose: "stat", result: { roll: 5 } });
  await put(client, 3, theirs);
  const answer = await publicTeam(client, owner.id, teamId, viewer.id);
  assert.equal(answer.status, 200);
  assert.deepEqual(answer.body.rolls, []);
  assert.deepEqual((await publicTeam(client, other.id, theirs, viewer.id)).body.rolls.map(({ id }) => id), [UUID(3)]);
}));

test("a roll kept before there were two dice is one die", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), viewer = await seedCoach(client, "wolf");
  const teamId = await seedTeam(client, owner.id);
  await put(client, 1, teamId, { result: { skill: "Dodge", attempts: [{ roll: 2, skill: "Block", duplicate: true }, { roll: 4, skill: "Dodge", duplicate: false }] } });
  assert.deepEqual((await publicTeam(client, owner.id, teamId, viewer.id)).body.rolls,
    [{ id: UUID(1), playerId: "p1", purpose: "random_skill", result: { dice: [{ skill: "Dodge" }] } }]);
}));

test("the rolls are in the order they were rolled", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), viewer = await seedCoach(client, "wolf");
  const teamId = await seedTeam(client, owner.id);
  await put(client, 1, teamId, { age: "5 minutes" });
  await put(client, 2, teamId, { age: "2 hours" }); // the higher id, and the earlier roll: the id is not the order
  assert.deepEqual((await publicTeam(client, owner.id, teamId, viewer.id)).body.rolls.map(({ id }) => id), [UUID(2), UUID(1)]);
}));

test("a team without rolls answers an empty list; a stranger's team is still 404, a guest still 401", db, () => withApiDatabase(async ({ client }) => {
  const owner = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const teamId = await seedTeam(client, owner.id), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  await put(client, 1, theirs);
  const empty = await publicTeam(client, owner.id, teamId, other.id);
  assert.deepEqual([empty.status, empty.body.rolls], [200, []]);
  const stranger = await publicTeam(client, owner.id, theirs, other.id);
  assert.deepEqual([stranger.status, stranger.body.error.code, "rolls" in stranger.body], [404, "TEAM_NOT_FOUND", false]);
  const nobody = await publicTeam(client, NOBODY, teamId, other.id);
  assert.deepEqual([nobody.status, nobody.body.error.code, "rolls" in nobody.body], [404, "PLAYER_NOT_FOUND", false]);
  const guest = await callApi("GET", `/api/players/${owner.id}/teams/${teamId}`);
  assert.deepEqual([guest.status, guest.body.error.code, "rolls" in guest.body], [401, "NOT_AUTHORIZED", false]);
}));
