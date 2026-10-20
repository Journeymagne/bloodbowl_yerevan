import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { serverDie } from "../server/api/dice-rolls.mjs";
import { matchReference } from "../server/domain/match-reference.mjs";
import { callApi, recording, seedCoach, seedTeam, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const NOBODY = "44444444-4444-4444-8444-444444444444";
const roll = (id, pid, token, body) => callApi("POST", `/api/teams/${id}/players/${pid}/rolls`, { token, body });
const rows = async (client, id) => (await client.query("SELECT id, purpose, used_at FROM dice_rolls WHERE saved_team_id = $1", [id])).rows;
/** How each request of a race ended, and a rejected one rethrown: a TypeError on `.value` would hide why it was rejected. */
const answers = (results) => results.map((result) => { if (result.status === "rejected") throw result.reason; return result.value; });
/** The General column of the Skill Table, in its order: what a Human Lineman may roll for. */
const generalSkills = async () => (await matchReference()).skillGroups.find((group) => group.category === "General").skills;
const holding = (skills) => skills.map((name) => ({ name, access: "primary" }));
/** `crypto.randomInt` showing `faces` in turn, with the `[min, max)` it was asked for each; `done()` puts the real one back. */
function scriptedServerDie(...faces) {
  const asked = [], die = mock.method(crypto, "randomInt", (min, max) => { asked.push([min, max]); return faces.shift(); });
  return { asked, done: () => die.mock.restore() };
}

test("the server's die shows every face of a D8 and a D16 and nothing else", () => {
  for (const sides of [8, 16]) {
    const seen = new Set(Array.from({ length: 2000 }, () => serverDie(sides)));
    assert.deepEqual([...seen].sort((a, b) => a - b), Array.from({ length: sides }, (_, i) => i + 1));
  }
});

test("a characteristic roll is a D8 the server rolls once: asked again for the same step, the same roll", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const first = await roll(id, "p0", coach.token, { purpose: "stat" });
  assert.equal(first.status, 200);
  assert.deepEqual([first.body.roll.purpose, first.body.roll.params, first.body.roll.usedAt], ["stat", { sides: 8 }, null]);
  assert.ok(first.body.roll.result.roll >= 1 && first.body.roll.result.roll <= 8);
  assert.equal((await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll.id, first.body.roll.id);
  assert.equal((await rows(client, id)).length, 1);
}));

test("a random skill is a D16 in a primary category; asking in another category returns the roll already waiting", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const general = await roll(id, "p0", coach.token, { purpose: "random_skill", category: "General" });
  assert.deepEqual([general.body.roll.params.category, general.body.roll.params.sides], ["General", 16]);
  assert.ok(general.body.roll.params.candidates.includes(general.body.roll.result.skill));
  assert.equal((await roll(id, "p0", coach.token, { purpose: "random_skill", category: "Strength" })).body.roll.id, general.body.roll.id);
  assert.notEqual((await roll(id, "p1", coach.token, { purpose: "random_skill", category: "General" })).body.roll.id, general.body.roll.id);
}));

test("a roll asked twice at once is still one roll", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const results = answers(await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 },
    [() => roll(id, "p0", coach.token, { purpose: "stat" }), () => roll(id, "p0", coach.token, { purpose: "stat" })]));
  assert.deepEqual(results.map((result) => result.status), [200, 200]);
  assert.equal(results[0].body.roll.id, results[1].body.roll.id);
  assert.equal((await rows(client, id)).length, 1);
}));

test("what cannot be rolled is refused before the die: a category the player cannot take, a bad body, a stranger's team", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), id = await seedTeam(client, coach.id);
  const agility = await roll(id, "p0", coach.token, { purpose: "random_skill", category: "Agility" });
  assert.deepEqual([agility.status, agility.body.error.code], [422, "DICE_CATEGORY"]);
  assert.equal((await roll(id, "p0", coach.token, { purpose: "mvp" })).body.error.params.field, "purpose");
  assert.equal((await roll(id, "p0", coach.token, { purpose: "random_skill" })).body.error.params.field, "category");
  assert.equal((await roll(id, "ghost", coach.token, { purpose: "stat" })).body.error.code, "PLAYER_NOT_FOUND");
  assert.equal((await roll(id, "p0", other.token, { purpose: "stat" })).body.error.code, "TEAM_NOT_FOUND");
  assert.deepEqual(await rows(client, id), []);
}));

test("rolls go with their team, and outlive the coach who rolled them (012's ON DELETE)", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), roller = await seedCoach(client, "roller"), id = await seedTeam(client, coach.id);
  await client.query(`INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, rolled_by) VALUES ($1, 'p0', 'stat', '{}', '{}', $2)`, [id, roller.id]);
  await client.query("DELETE FROM users WHERE id = $1", [roller.id]);
  assert.equal((await client.query("SELECT rolled_by FROM dice_rolls")).rows[0].rolled_by, null);
  await client.query("DELETE FROM saved_teams WHERE id = $1", [id]);
  assert.equal((await client.query("SELECT count(*)::int AS n FROM dice_rolls")).rows[0].n, 0);
}));

test("the route's die is the server's: a D8 for a characteristic, a D16 for a skill, rolled again while it lands on one the player has", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills();
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [
    { id: "p0", rowIndex: 0, spp: {} }, { id: "p1", rowIndex: 0, spp: {}, extraSkills: holding([general[1]]) }] } });
  const stat = scriptedServerDie(3);
  try {
    const { body: { roll: rolled } } = await roll(id, "p0", coach.token, { purpose: "stat" });
    assert.deepEqual([rolled.params, rolled.result], [{ sides: 8 }, { roll: 3, stats: ["ar", "ma", "pa"] }], "what the die showed is what was recorded");
    assert.deepEqual(stat.asked, [[1, 9]], "one throw, of a D8");
  } finally { stat.done(); }
  const skill = scriptedServerDie(2, 3);
  try {
    const { body: { roll: rolled } } = await roll(id, "p1", coach.token, { purpose: "random_skill", category: "General" });
    assert.deepEqual(rolled.result, { attempts: [{ roll: 2, skill: general[1], duplicate: true }, { roll: 3, skill: general[2], duplicate: false }], skill: general[2] });
    assert.deepEqual(skill.asked, [[1, 17], [1, 17]], "every throw is of a D16");
  } finally { skill.done(); }
  assert.deepEqual((await rows(client, id)).map((row) => row.purpose).sort(), ["random_skill", "stat"]);
}));

test("a blank face of the D16 is part of the roll: kept as an attempt with no skill, in the answer and in the stored row", db, () => withApiDatabase(async ({ client }) => {
  const strength = (await matchReference()).skillGroups.find((group) => group.category === "Strength").skills;
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [{ id: "ogre", rowIndex: 5, spp: {} }] } });
  assert.ok(strength.length < 15, "a column with blank faces");
  const die = scriptedServerDie(16, strength.length + 1, 1);
  let rolled;
  try {
    const { status, body } = await roll(id, "ogre", coach.token, { purpose: "random_skill", category: "Strength" });
    assert.equal(status, 200);
    rolled = body.roll;
  } finally { die.done(); }
  const attempts = [{ roll: 16, skill: null, duplicate: false }, { roll: strength.length + 1, skill: null, duplicate: false }, { roll: 1, skill: strength[0], duplicate: false }];
  assert.deepEqual(rolled.result, { attempts, skill: strength[0] });
  const stored = (await client.query("SELECT result FROM dice_rolls WHERE id = $1", [rolled.id])).rows[0].result;
  assert.deepEqual(stored, { attempts, skill: strength[0] });
}));

test("a player with every skill of the category but one can only roll that one; with all of them there is nothing to roll", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), last = general.at(-1);
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [
    { id: "p0", rowIndex: 0, spp: {}, extraSkills: holding(general) },
    { id: "p1", rowIndex: 0, spp: {}, extraSkills: holding(general.slice(0, -1)) }] } });
  const die = scriptedServerDie();
  try {
    const { result, log } = await recording(() => roll(id, "p0", coach.token, { purpose: "random_skill", category: "General" }));
    assert.deepEqual([result.status, result.body.error.code, result.body.error.message], [422, "DICE_NO_SKILL", "The player already has every skill in this category."]);
    assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
    assert.ok(!log.includes("COMMIT") && !log.some((sql) => sql.startsWith("INSERT")), "refused before anything was written");
    assert.deepEqual(die.asked, [], "the die is not touched when there is nothing to roll for");
  } finally { die.done(); }
  assert.deepEqual(await rows(client, id), []);
  const rolled = (await roll(id, "p1", coach.token, { purpose: "random_skill", category: "General" })).body.roll;
  assert.equal(rolled.result.skill, last);
  assert.deepEqual(rolled.result.attempts.map((attempt) => attempt.duplicate), [...Array(rolled.result.attempts.length - 1).fill(true), false]);
  assert.equal(rolled.result.attempts.at(-1).skill, last);
}));

test("a category the player cannot take is refused as 422, a nonsense one too, and neither rolls nor writes anything", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const die = scriptedServerDie();
  try {
    for (const category of ["Agility", "Strength", "Passing", "Devious", "Mutation", "general", " General", "Nonsense"]) {
      const { result, log } = await recording(() => roll(id, "p0", coach.token, { purpose: "random_skill", category }));
      assert.deepEqual([result.status, result.body.error.code, result.body.error.message], [422, "DICE_CATEGORY", "A random skill can only be rolled in one of the player's primary categories."], category);
      assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"], category);
      assert.ok(!log.includes("COMMIT") && !log.some((sql) => sql.startsWith("INSERT")), category);
    }
    assert.deepEqual(die.asked, [], "the die is not touched for a category that cannot be rolled");
  } finally { die.done(); }
  assert.deepEqual(await rows(client, id), []);
}));

test("the player's own position decides what he may roll and what he already has: a Lineman cannot take Strength, an Ogre can and has Mighty Blow", db, () => withApiDatabase(async ({ client }) => {
  const { skillGroups } = await matchReference(), strength = skillGroups.find((group) => group.category === "Strength").skills;
  const mightyBlow = strength.indexOf("Mighty Blow") + 1;
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { players: [
    { id: "lineman", rowIndex: 0, spp: {} }, { id: "ogre", rowIndex: 5, spp: {} }] } }); // Human rows 0 (primary G) and 5 (primary S, base Mighty Blow)
  assert.equal((await roll(id, "lineman", coach.token, { purpose: "random_skill", category: "Strength" })).body.error.code, "DICE_CATEGORY");
  const die = scriptedServerDie(mightyBlow, 1);
  try {
    const { status, body } = await roll(id, "ogre", coach.token, { purpose: "random_skill", category: "Strength" });
    assert.equal(status, 200);
    assert.deepEqual(body.roll.result.attempts, [{ roll: mightyBlow, skill: "Mighty Blow", duplicate: true }, { roll: 1, skill: strength[0], duplicate: false }]);
    assert.deepEqual([body.roll.params.category, body.roll.params.candidates], ["Strength", strength]);
  } finally { die.done(); }
  assert.deepEqual((await rows(client, id)).map((row) => row.purpose), ["random_skill"], "the Lineman's refusal wrote nothing");
}));

test("a body the site does not accept is a 400 for its field, costs no transaction, and rolls nothing", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const die = scriptedServerDie();
  try {
    for (const [body, field] of [
      [{}, "purpose"], [null, "body"], ["stat", "body"], [[], "body"], [{ purpose: "mvp" }, "purpose"], [{ purpose: "STAT" }, "purpose"], // no object: the body (readJson)
      [{ purpose: 7 }, "purpose"], [{ purpose: null }, "purpose"], [{ purpose: ["stat"] }, "purpose"], [{ purpose: { stat: true } }, "purpose"],
      [{ purpose: "random_skill" }, "category"], [{ purpose: "random_skill", category: "" }, "category"], [{ purpose: "random_skill", category: null }, "category"],
      [{ purpose: "random_skill", category: 7 }, "category"], [{ purpose: "random_skill", category: ["General"] }, "category"]]) {
      const { result, log } = await recording(() => roll(id, "p0", coach.token, body));
      assert.deepEqual([result.status, result.body.error.code, result.body.error.params], [400, "FIELD_INVALID", { field }], JSON.stringify(body));
      assert.deepEqual(log, [], `${JSON.stringify(body)}: a bad body costs no transaction`);
    }
    assert.deepEqual(die.asked, []);
  } finally { die.done(); }
  assert.deepEqual(await rows(client, id), []);
  // A characteristic has no use for a category: what comes with it is not read.
  assert.equal((await roll(id, "p3", coach.token, { purpose: "stat", category: 7 })).status, 200);
}));

test("rolling is the owner's: a stranger and an administrator are told the team is not there, whatever the body, and nothing is rolled", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), boss = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id);
  const missing = (await roll(NOBODY, "p0", other.token, { purpose: "stat" })).body;
  assert.equal(missing.error.code, "TEAM_NOT_FOUND");
  for (const [who, token] of [["a stranger", other.token], ["an administrator", boss.token]]) {
    for (const [label, pid, body] of [["a roll", "p0", { purpose: "stat" }], ["a skill roll", "p0", { purpose: "random_skill", category: "General" }],
      ["a bad purpose", "p0", { purpose: "mvp" }], ["no category", "p0", { purpose: "random_skill" }], ["no body", "p0", {}], ["a player who is not there", "ghost", { purpose: "stat" }]]) {
      const refused = await roll(id, pid, token, body);
      assert.equal(refused.status, 404, `${who}, ${label}`);
      assert.deepEqual(refused.body, missing, `${who}, ${label}: the same answer as a team that is not there`);
    }
  }
  const anonymous = await roll(id, "p0", undefined, { purpose: "stat" });
  assert.deepEqual([anonymous.status, anonymous.body.error.code], [401, "NOT_AUTHORIZED"]);
  for (const method of ["GET", "PUT", "PATCH", "DELETE"]) {
    const other = await callApi(method, `/api/teams/${id}/players/p0/rolls`, { token: coach.token, body: method === "GET" ? undefined : { purpose: "stat" } });
    assert.deepEqual([other.status, other.body.error.code], [404, "ROUTE_NOT_FOUND"], `${method} is no way to ask for a roll`);
  }
  assert.deepEqual(await rows(client, id), []);
}));

test("a roll is answered as the whitelist says and stored as the owner's, for that team and player", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const { status, body } = await roll(id, "p4", coach.token, { purpose: "stat" });
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(body), ["roll"]);
  assert.deepEqual(Object.keys(body.roll).sort(), ["createdAt", "id", "params", "playerId", "purpose", "result", "usedAt"]);
  assert.equal(body.roll.playerId, "p4");
  const stored = (await client.query("SELECT * FROM dice_rolls WHERE id = $1", [body.roll.id])).rows[0];
  assert.deepEqual([stored.saved_team_id, stored.player_id, stored.purpose, stored.rolled_by, stored.used_at], [id, "p4", "stat", coach.id, null]);
  assert.deepEqual([stored.params, stored.result], [body.roll.params, body.roll.result]);
  assert.equal(new Date(body.roll.createdAt).getTime(), stored.created_at.getTime());
  const again = await roll(id, "p4", coach.token, { purpose: "stat" });
  assert.deepEqual(again.body, body, "asked again, the very same answer");
}));

test("each step has its own roll: a purpose, a player, and a team (two teams both have a p0)", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const id = await seedTeam(client, coach.id), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  const ask = (team, token, pid, body) => roll(team, pid, token, body).then((answer) => answer.body.roll.id);
  const stat = await ask(id, coach.token, "p0", { purpose: "stat" });
  // One roll waits for a player at a time (R15): the characteristic is used before p0 rolls for a skill.
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [stat]);
  const ids = [stat, await ask(id, coach.token, "p0", { purpose: "random_skill", category: "General" }),
    await ask(id, coach.token, "p1", { purpose: "stat" }), await ask(theirs, other.token, "p0", { purpose: "stat" })];
  assert.equal(new Set(ids).size, 4);
  assert.deepEqual([await ask(id, coach.token, "p0", { purpose: "random_skill", category: "General" }),
    await ask(id, coach.token, "p1", { purpose: "stat" }), await ask(theirs, other.token, "p0", { purpose: "stat" })], ids.slice(1));
  assert.deepEqual([(await rows(client, id)).length, (await rows(client, theirs)).length], [3, 1]);
}));

test("of the unused rolls of a step the earliest is handed out, then the lowest id; a used one, another step's and another team's never", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf");
  const id = await seedTeam(client, coach.id), theirs = await seedTeam(client, other.id, { name: "Wolves" });
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const put = (n, team, player, purpose, { age, used = false }) => client.query(
    `INSERT INTO dice_rolls (id, saved_team_id, player_id, purpose, params, result, used_at, created_at)
     VALUES ($1, $2, $3, $4, '{}', '{}', CASE WHEN $5::boolean THEN now() END, now() - $6::interval)`, [uuid(n), team, player, purpose, used, age]);
  await put(1, id, "p0", "stat", { age: "5 hours", used: true });
  await put(2, id, "p0", "random_skill", { age: "10 minutes" }); // another purpose, later: an earlier one would be p0's turn (R35)
  await put(3, id, "p1", "stat", { age: "3 hours" });
  await put(4, theirs, "p0", "stat", { age: "2 hours" });
  await put(5, id, "p0", "stat", { age: "30 minutes" }); // the lower id, and the later roll
  await put(9, id, "p0", "stat", { age: "1 hour" });     // the higher id, written second, and the earlier roll: neither the id nor the table's order is the answer
  assert.equal((await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll.id, uuid(9));
  await client.query(`INSERT INTO dice_rolls (id, saved_team_id, player_id, purpose, params, result, created_at) VALUES
    ($2, $1, 'p2', 'stat', '{}', '{}', '2026-01-01 00:00:00+00'), ($3, $1, 'p2', 'stat', '{}', '{}', '2026-01-01 00:00:00+00')`, [id, uuid(8), uuid(7)]);
  assert.equal((await roll(id, "p2", coach.token, { purpose: "stat" })).body.roll.id, uuid(7), "the same moment: the lower id, though it was written second");
  assert.equal((await rows(client, id)).length, 7, "nothing was rolled: every answer was a roll already waiting");
}));

test("a roll that has been used is not handed out again: the next ask is a new roll", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const first = (await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll;
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [first.id]);
  const second = (await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll;
  assert.notEqual(second.id, first.id);
  assert.equal(second.usedAt, null);
  assert.equal((await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll.id, second.id);
  assert.equal((await rows(client, id)).length, 2);
}));

test("a new roll is one transaction that locks the team first and writes once; an old one is handed back without a write", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const written = (log) => log.filter((sql) => /^(INSERT|UPDATE|DELETE)/.test(sql));
  const before = await teamRow(client, id);
  const rolled = await recording(() => roll(id, "p0", coach.token, { purpose: "stat" }));
  assert.equal(rolled.result.status, 200);
  assert.deepEqual([rolled.log[0], ...rolled.log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  assert.match(rolled.log[1], /^SELECT .* FROM saved_teams .* FOR UPDATE$/, "the team is locked before anything else is read");
  assert.equal(written(rolled.log).length, 1);
  assert.match(written(rolled.log)[0], /^INSERT INTO dice_rolls/);
  const again = await recording(() => roll(id, "p0", coach.token, { purpose: "stat" }));
  assert.deepEqual([again.log[0], ...again.log.slice(-2)], ["BEGIN", "COMMIT", "release"]);
  assert.match(again.log[1], /^SELECT .* FROM saved_teams .* FOR UPDATE$/);
  assert.deepEqual(written(again.log), [], "the roll that was waiting is read, not rewritten");
  assert.deepEqual(again.result.body, rolled.result.body);
  assert.deepEqual(await teamRow(client, id), before, "a roll is not a save: the team is as it was, and an editor open on it is not told it changed");
}));

test("a player who is not on the roster has no roll, even one that is waiting; and the roll is there again when he is", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const waiting = (await roll(id, "p5", coach.token, { purpose: "stat" })).body.roll;
  const roster = (await client.query("SELECT roster FROM saved_teams WHERE id = $1", [id])).rows[0].roster;
  const without = { ...roster, players: roster.players.filter((player) => player.id !== "p5") };
  await client.query("UPDATE saved_teams SET roster = $2 WHERE id = $1", [id, JSON.stringify(without)]);
  const refused = await recording(() => roll(id, "p5", coach.token, { purpose: "stat" }));
  assert.deepEqual([refused.result.status, refused.result.body.error.code], [404, "PLAYER_NOT_FOUND"]);
  assert.deepEqual(refused.log.slice(-2), ["ROLLBACK", "release"]);
  await client.query("UPDATE saved_teams SET roster = $2 WHERE id = $1", [id, JSON.stringify(roster)]);
  assert.equal((await roll(id, "p5", coach.token, { purpose: "stat" })).body.roll.id, waiting.id);
  assert.equal((await rows(client, id)).length, 1);
}));

test("a roster stored with two players under one id (2.x) rolls for neither: 422 naming both, and nothing is rolled", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "x", name: "Alpha", rowIndex: 0 }, { id: "x", name: "Bravo", rowIndex: 0 }, { id: 5, rowIndex: 0 }, null] } });
  const refused = await roll(id, "x", coach.token, { purpose: "stat" });
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.violations],
    [422, "ROSTER_BREAKS_THE_RULES", [{ code: "DUPLICATE_PLAYER_ID", params: { playerId: "x", names: "Alpha, Bravo" } }]]);
  assert.deepEqual(await rows(client, id), []);
  const numbered = await roll(id, "5", coach.token, { purpose: "stat" });
  assert.deepEqual([numbered.status, numbered.body.roll?.playerId], [200, "5"], "a number for an id, and a hole in the list, are no reason to fail");
}));

test("a team with nothing to find a player in — a race the site does not know, a roster that is no object — has no player to roll for: 404, not a crash", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), unknown = await seedTeam(client, coach.id, { slug: "teams/no-such-race" }), empty = await seedTeam(client, coach.id);
  await client.query("UPDATE saved_teams SET roster = 'null'::jsonb WHERE id = $1", [empty]);
  for (const id of [unknown, empty]) {
    const refused = await roll(id, "p0", coach.token, { purpose: "stat" });
    assert.deepEqual([refused.status, refused.body.error.code], [404, "PLAYER_NOT_FOUND"], id);
    assert.deepEqual(await rows(client, id), []);
  }
}));

const rolls = (id, token) => callApi("GET", `/api/teams/${id}/rolls`, { token });

test("the team's rolls are read as they are kept: used and waiting, in the order they were rolled, each as the whitelist says", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const first = (await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll;
  const second = (await roll(id, "p1", coach.token, { purpose: "random_skill", category: "General" })).body.roll;
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [first.id]);
  const read = await rolls(id, coach.token);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.rolls.map((item) => item.id), [first.id, second.id], "in the order they were rolled");
  for (const item of read.body.rolls) assert.deepEqual(Object.keys(item).sort(), ["createdAt", "id", "params", "playerId", "purpose", "result", "usedAt"], "nothing but what a client may read");
  assert.deepEqual(read.body.rolls.map((item) => [item.playerId, item.purpose]), [["p0", "stat"], ["p1", "random_skill"]]);
  assert.notEqual(read.body.rolls[0].usedAt, null, "a roll an advancement took says when");
  assert.equal(read.body.rolls[1].usedAt, null, "a roll still waiting has no usedAt");
  assert.deepEqual([read.body.rolls[1].params, read.body.rolls[1].result], [second.params, second.result], "what the die showed, as it was kept");
}));

// T3 review m2/m3 (final wave): the order is the rolls' own time, then the lower id — never the table's order — and a
// roll stays the team's when its player has left the roster (the client asks by `playerId`).
test("the team's rolls are read by when they were rolled, the lower id first at the same moment, whatever order they were written in; a departed player's are there too", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
  const put = (n, player, at) => client.query(
    "INSERT INTO dice_rolls (id, saved_team_id, player_id, purpose, params, result, created_at) VALUES ($1, $2, $3, 'stat', '{}', '{}', $4)", [uuid(n), id, player, at]);
  await put(5, "p0", "2026-03-01 00:00:00+00"); // written first, rolled last
  await put(9, "p1", "2026-02-01 00:00:00+00"); // the higher id, rolled before it
  await put(8, "gone", "2026-01-01 00:00:00+00"); // a player no longer on the roster
  await put(7, "p2", "2026-01-01 00:00:00+00"); // the same moment: the lower id first, though written after
  const read = await rolls(id, coach.token);
  assert.equal(read.status, 200);
  assert.deepEqual(read.body.rolls.map((item) => item.id), [uuid(7), uuid(8), uuid(9), uuid(5)]);
  assert.deepEqual(read.body.rolls.map((item) => item.playerId), ["p2", "gone", "p1", "p0"], "the departed player's roll with the rest");
}));

test("reading the rolls is the owner's and an administrator's; a stranger is told the team is not there, and nobody without a session reads anything", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), admin = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id);
  const rolled = (await roll(id, "p0", coach.token, { purpose: "stat" })).body.roll;
  for (const [who, token] of [["the owner", coach.token], ["an administrator", admin.token]]) {
    const read = await rolls(id, token);
    assert.deepEqual([read.status, read.body.rolls.map((item) => item.id)], [200, [rolled.id]], who);
  }
  const stranger = await rolls(id, other.token);
  assert.deepEqual([stranger.status, stranger.body.error.code], [404, "TEAM_NOT_FOUND"]);
  const nobody = await rolls(id, undefined);
  assert.deepEqual([nobody.status, nobody.body.error.code], [401, "NOT_AUTHORIZED"]);
  assert.equal((await rolls(NOBODY, coach.token)).body.error.code, "TEAM_NOT_FOUND", "a team that is not there");
  assert.equal((await rolls("not-a-team", coach.token)).status, 404, "an id that is no UUID is no team either");
}));

test("a team with no rolls reads none, and another team's rolls are not in the answer", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), busy = await seedTeam(client, coach.id, { name: "Cubs" });
  assert.deepEqual((await rolls(id, coach.token)).body, { rolls: [] });
  await roll(busy, "p0", coach.token, { purpose: "stat" });
  assert.deepEqual((await rolls(id, coach.token)).body, { rolls: [] });
  assert.equal((await rolls(busy, coach.token)).body.rolls.length, 1);
}));
