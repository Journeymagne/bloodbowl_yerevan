import test, { mock } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";

import { rerollsHeldBy, rollFitsAdvancement, rolledDice, siteRollReferences, skillsRerolledAgainst } from "../src/domain/roster/dice.mjs";
import { normalizePlayerAdvancements } from "../src/domain/roster/players.mjs";
import { settleRosterRolls } from "../server/api/dice-rolls.mjs";
import { matchReference } from "../server/domain/match-reference.mjs";
import { callApi, loggingErrors, recording, seedCoach, seedTeam, withApiDatabase } from "./helpers/api-db.mjs";
import { scratchSkip } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const site = (id) => ({ id, via: "site" });

test("the site rolls a roster refers to, one per advancement; table rolls and rolls with no id are not", () => {
  const roster = { players: [
    { id: "a", advancements: [{ type: "stat", grants: { stat: "ma" }, roll: site("r1") }, { type: "primary", roll: { via: "table" } }] },
    { id: "b", advancements: [{ type: "random", grants: { skill: "Block" }, roll: { via: "site" } }, "stat"] }, { id: "c" }] };
  assert.deepEqual(siteRollReferences(roster), [{ id: "r1", playerId: "a", type: "stat", grants: { stat: "ma" } }]);
});

test("a roll fits the advancement its purpose and result were for, and a skill may stand in for a characteristic", () => {
  const stat = { purpose: "stat", result: { roll: 3, stats: ["ar", "ma", "pa"] } }, skill = { purpose: "random_skill", result: { skill: "Mighty Blow (+1)" } };
  assert.equal(rollFitsAdvancement(stat, { type: "stat", grants: { stat: "ma" } }), true);
  assert.equal(rollFitsAdvancement(stat, { type: "stat", grants: { skill: "Block" } }), true);
  assert.equal(rollFitsAdvancement(stat, { type: "stat", grants: { stat: "st" } }), false);
  assert.equal(rollFitsAdvancement(skill, { type: "random", grants: { skill: "Mighty Blow" } }), true);
  assert.equal(rollFitsAdvancement(skill, { type: "random", grants: { skill: "Block" } }), false);
  assert.equal(rollFitsAdvancement(skill, { type: "primary", grants: { skill: "Mighty Blow" } }), false);
  assert.equal(rollFitsAdvancement(stat, { type: "random", grants: { skill: "Block" } }), false);
});

test("an advancement that does not say what it granted fits no roll, and a roll with no result fits no advancement", () => {
  const stat = { purpose: "stat", result: { roll: 8, stats: ["ma", "st", "ag", "pa", "ar"] } }, skill = { purpose: "random_skill", result: { skill: "Block" } };
  for (const grants of [null, undefined, {}]) {
    assert.equal(rollFitsAdvancement(stat, { type: "stat", grants }), false, JSON.stringify(grants));
    assert.equal(rollFitsAdvancement(skill, { type: "random", grants }), false, JSON.stringify(grants));
  }
  assert.equal(rollFitsAdvancement({ purpose: "stat", result: {} }, { type: "stat", grants: { stat: "ma" } }), false);
  assert.equal(rollFitsAdvancement({ purpose: "random_skill", result: {} }, { type: "random", grants: { skill: "Block" } }), false);
});

test("a roll fits only the kind of advancement it was rolled for, whatever its result holds", () => {
  const both = { roll: 8, stats: ["ma", "st", "ag", "pa", "ar"], skill: "Block" };
  assert.equal(rollFitsAdvancement({ purpose: "random_skill", result: { skill: "Block" } }, { type: "stat", grants: { skill: "Block" } }), false,
    "a skill in place of a characteristic takes a characteristic roll, not a random skill");
  assert.equal(rollFitsAdvancement({ purpose: "random_skill", result: both }, { type: "stat", grants: { stat: "ma" } }), false);
  assert.equal(rollFitsAdvancement({ purpose: "stat", result: both }, { type: "random", grants: { skill: "Block" } }), false);
  assert.equal(rollFitsAdvancement({ purpose: "stat", result: both }, { type: "stat", grants: { stat: "ma" } }), true);
  assert.equal(rollFitsAdvancement({ purpose: "random_skill", result: both }, { type: "random", grants: { skill: "Block" } }), true);
});

test("a stored roster is read as it is, raw or normalised: both name the same rolls", () => {
  const raw = { players: [
    { id: "a", advancements: ["stat", { type: "stat", grants: { stat: " MA " }, roll: { id: " r1 ", via: "site", extra: 1 } }, { type: "mvp", roll: site("r9") }] },
    null, "b", { id: "c", advancements: { 0: { type: "random", roll: site("r8") } } },
    { id: "d", advancements: [{ type: "random", grants: { skill: " Block " }, roll: site("r2") }, { type: "stat", roll: site("r3") }] }] };
  const normalised = { players: raw.players.map((player) => (player?.id ? { ...player, advancements: normalizePlayerAdvancements(player.advancements) } : player)) };
  const expected = [
    { id: "r1", playerId: "a", type: "stat", grants: { stat: "ma" } },
    { id: "r2", playerId: "d", type: "random", grants: { skill: "Block" } },
    { id: "r3", playerId: "d", type: "stat", grants: null }];
  assert.deepEqual(siteRollReferences(raw), expected);
  assert.deepEqual(siteRollReferences(normalised), expected);
  for (const nothing of [undefined, null, {}, { players: null }, { players: "p0" }]) assert.deepEqual(siteRollReferences(nothing), [], JSON.stringify(nothing));
});

test("a random skill's rerolls are explained by the roster it is used on: every skill thrown again as held is held there", () => {
  const roll = { purpose: "random_skill", result: { attempts: [
    { roll: 16, skill: null, duplicate: false }, { roll: 2, skill: "Mighty Blow", duplicate: true }, { roll: 1, skill: "Block", duplicate: false }], skill: "Block" } };
  assert.equal(rerollsHeldBy(roll, new Set(["Mighty Blow", "Block"])), true);
  assert.equal(rerollsHeldBy(roll, new Set(["Mighty Blow"])), true, "the skill it ended on is the advancement's own, never a reroll");
  assert.equal(rerollsHeldBy(roll, new Set(["Block"])), false, "Mighty Blow was thrown again as held, and is held no more");
  assert.equal(rerollsHeldBy({ purpose: "random_skill", result: { attempts: [{ roll: 1, skill: "Block", duplicate: false }], skill: "Block" } }, new Set()), true);
  assert.equal(rerollsHeldBy({ purpose: "stat", result: { roll: 3, stats: ["ar", "ma", "pa"] } }, new Set()), true, "a characteristic roll throws nothing again");
  assert.equal(rerollsHeldBy({ purpose: "random_skill", result: {} }, new Set()), true);
});

test("a Pro thrown again is the captaincy's only on a roll made while the player was captain", () => {
  const attempts = [{ roll: 6, skill: "Pro", duplicate: true }, { roll: 3, skill: "Fend", duplicate: true }, { roll: 1, skill: "Block", duplicate: false }];
  const roll = (params) => ({ purpose: "random_skill", params, result: { attempts, skill: "Block" } });
  assert.deepEqual(skillsRerolledAgainst(roll({ category: "General", captain: true })), ["Fend"], "the captaincy held Pro, and comes and goes");
  for (const params of [{ category: "General", captain: false }, { category: "General" }, {}, undefined]) {
    assert.deepEqual(skillsRerolledAgainst(roll(params)), ["Pro", "Fend"], `${JSON.stringify(params)}: a Pro held some other way, or a roll from before rolls kept the captaincy`);
  }
  assert.equal(rerollsHeldBy(roll({ captain: true }), new Set(["Fend"])), true);
  assert.equal(rerollsHeldBy(roll({ captain: false }), new Set(["Fend"])), false);
});

/** A die of a two-dice roll that came up `skill` at once. */
const cameUp = (roll, skill) => ({ attempts: [{ roll, skill, duplicate: false }], skill });

test("a two-dice roll fits a random advancement of either skill, by canonical name, and no other", () => {
  const pair = { purpose: "random_skill", result: { dice: [cameUp(4, "Frenzy"), { attempts: [{ roll: 2, skill: "Mighty Blow (+1)", duplicate: false }], skill: "Mighty Blow (+1)" }] } };
  assert.equal(rollFitsAdvancement(pair, { type: "random", grants: { skill: "Frenzy" } }), true, "the first die's");
  assert.equal(rollFitsAdvancement(pair, { type: "random", grants: { skill: "Mighty Blow" } }), true, "the second die's, by canonical name");
  assert.equal(rollFitsAdvancement(pair, { type: "random", grants: { skill: "Block" } }), false, "neither die's");
  assert.equal(rollFitsAdvancement(pair, { type: "stat", grants: { skill: "Frenzy" } }), false, "a characteristic takes a D8");
});

test("both dice's rerolls are the roster's to hold; a twin is none", () => {
  const roll = { purpose: "random_skill", result: { dice: [
    { attempts: [{ roll: 1, skill: "Block", duplicate: true }, { roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" },
    { attempts: [{ roll: 4, skill: "Frenzy", duplicate: false, twin: true }, { roll: 3, skill: "Fend", duplicate: true }, { roll: 10, skill: "Tackle", duplicate: false }],
      skill: "Tackle" }] } };
  assert.deepEqual(skillsRerolledAgainst(roll), ["Block", "Fend"], "the first die's Frenzy thrown again by the second is no skill of the player's");
  assert.equal(rerollsHeldBy(roll, new Set(["Block"])), false, "Fend, the second die's reroll, is held no more");
  assert.equal(rerollsHeldBy(roll, new Set(["Block", "Fend"])), true);
});

test("a roll kept with one die (stage 03) reads as one; anything else as none", () => {
  assert.deepEqual(rolledDice({ purpose: "random_skill", result: { attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }], skill: "Frenzy" } }),
    [{ face: 4, skill: "Frenzy" }]);
  assert.deepEqual(rolledDice({ purpose: "random_skill", result: { dice: [cameUp(4, "Frenzy"), { attempts: [{ roll: 16, skill: null, duplicate: false }, { roll: 3, skill: "Fend", duplicate: false }], skill: "Fend" }] } }),
    [{ face: 4, skill: "Frenzy" }, { face: 3, skill: "Fend" }], "a die's face is where it ended");
  assert.deepEqual(rolledDice({ purpose: "random_skill", result: { skill: "Block" } }), [{ face: null, skill: "Block" }], "a die with no attempts kept");
  assert.deepEqual(rolledDice({ purpose: "random_skill", result: { dice: [{ attempts: [] }, cameUp(1, "Block")] } }), [{ face: 1, skill: "Block" }], "a die with no skill is no die");
  for (const roll of [{ purpose: "stat", result: { roll: 3, stats: ["ar", "ma", "pa"] } }, { purpose: "random_skill", result: {} }, { purpose: "random_skill", result: null }, null]) {
    assert.deepEqual(rolledDice(roll), [], JSON.stringify(roll));
  }
});

test("a save that names no new roll and drops none costs no query", async () => {
  const asked = [], client = { query: async (...args) => { asked.push(args); return { rows: [] }; } };
  const kept = { players: [{ id: "p0", advancements: ["stat", { type: "random", roll: { via: "table" } }, { type: "stat", grants: { stat: "ma" }, roll: site("00000000-0000-4000-8000-000000000001") }] }] };
  for (const [before, after] of [[{}, {}], [{ players: [] }, { players: [{ id: "p0" }] }], [kept, kept], [kept, structuredClone(kept)]]) {
    assert.deepEqual(await settleRosterRolls(client, { teamId: "00000000-0000-4000-8000-000000000099", before, after }), { used: [], freed: [] });
  }
  assert.deepEqual(asked, []);
});

/** Saves the roster as the editor would: `players` says what changes on each of them, `roster` what changes on the team. */
async function save(id, token, revision, { players = {}, roster = {} } = {}) {
  const team = (await callApi("GET", `/api/teams/${id}`, { token })).body.team;
  const edited = team.roster.players.map((item) => players[item.id] ? { ...item, spp: { touchdowns: 10 }, ...players[item.id] } : item);
  return callApi("PATCH", `/api/teams/${id}`, { token, body: { name: team.name, baseTeamSlug: team.baseTeamSlug, revision, roster: { ...team.roster, ...roster, players: edited } } });
}
/** Saves the roster with one advancement on p0 (or on `player`), as the editor would. */
const saveWith = (id, token, revision, advancement, player = "p0") => save(id, token, revision, { players: { [player]: { advancements: advancement ? [advancement] : [] } } });
const usedAt = async (client, rollId) => (await client.query("SELECT used_at FROM dice_rolls WHERE id = $1", [rollId])).rows[0].used_at;
const rollFor = (id, token, player, body) => callApi("POST", `/api/teams/${id}/players/${player}/rolls`, { token, body });
/** A characteristic advancement taking `roll`, for one of the characteristics its face offers. */
const taking = (roll, stat = roll.result.stats[0]) => ({ type: "stat", grants: { stat }, roll: site(roll.id) });
const touchesRolls = (log) => log.some((sql) => sql.includes("dice_rolls"));
const ledgerLines = async (client, id) => (await client.query("SELECT kind FROM team_ledger WHERE saved_team_id = $1", [id])).rows;
const stored = async (client, id) => (await client.query("SELECT revision, roster FROM saved_teams WHERE id = $1", [id])).rows[0];
const wrote = (log) => log.some((sql) => /^(INSERT|UPDATE|DELETE)\b/.test(sql));
const rollCount = async (client, id) => (await client.query("SELECT count(*)::int AS n FROM dice_rolls WHERE saved_team_id = $1", [id])).rows[0].n;
/** `crypto.randomInt` showing `faces` in turn; `done()` puts the real one back. */
function scriptedServerDie(...faces) {
  const die = mock.method(crypto, "randomInt", () => faces.shift());
  return { done: () => die.mock.restore() };
}
const generalSkills = async () => (await matchReference()).skillGroups.find((group) => group.category === "General").skills;
/** Where the second die of these General rolls lands: a skill none of these players holds, so it rerolls nothing. */
const SECOND = "Wrestle";
/** A roll as the route keeps one, with a result chosen by the test and, with `age`, rolled that long ago. */
async function putRoll(client, teamId, playerId, purpose, result, age = "0 seconds") {
  const { rows: [row] } = await client.query(`INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, created_at)
    VALUES ($1, $2, $3, '{}', $4, now() - $5::interval) RETURNING id`, [teamId, playerId, purpose, JSON.stringify(result), age]);
  return { id: row.id, playerId, purpose, result };
}

test("an advancement that takes its site roll uses it once; undone, the roll waits again and is the one handed out", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const { body: { roll } } = await callApi("POST", `/api/teams/${id}/players/p0/rolls`, { token: coach.token, body: { purpose: "stat" } });
  const ask = () => callApi("POST", `/api/teams/${id}/players/p0/rolls`, { token: coach.token, body: { purpose: "stat" } });
  const taken = { type: "stat", grants: { stat: roll.result.stats[0] }, roll: site(roll.id) };
  assert.equal((await saveWith(id, coach.token, 1, taken)).status, 200);
  assert.ok(await usedAt(client, roll.id));
  assert.notEqual((await ask()).body.roll.id, roll.id, "a used roll is not handed out again");
  assert.equal((await saveWith(id, coach.token, 2, null)).status, 200);
  assert.equal(await usedAt(client, roll.id), null);
  assert.equal((await ask()).body.roll.id, roll.id, "of the two waiting, the earliest — the one the undone advancement had");
}));

test("a roll that does not fit, is not this team's or this player's, or is not a roll id at all is refused, and nothing is saved", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), id = await seedTeam(client, coach.id), theirs = await seedTeam(client, other.id);
  // A face of 3, kept as the route keeps a roll: a characteristic it does not offer is always there to ask for (a face of 8 offers all five).
  const mine = await putRoll(client, id, "p0", "stat", { roll: 3, stats: ["ar", "ma", "pa"] });
  const foreign = (await callApi("POST", `/api/teams/${theirs}/players/p0/rolls`, { token: other.token, body: { purpose: "stat" } })).body.roll;
  const unrolled = ["ma", "st", "ag", "pa", "ar"].find((stat) => !mine.result.stats.includes(stat));
  for (const advancement of [
    { type: "stat", grants: { stat: unrolled }, roll: site(mine.id) },
    { type: "primary", grants: { skill: "Block" }, roll: site(mine.id) },
    { type: "stat", grants: { stat: foreign.result.stats[0] }, roll: site(foreign.id) },
    { type: "stat", grants: { stat: "ar" }, roll: site("not-a-uuid") }]) {
    const refused = await saveWith(id, coach.token, 1, advancement);
    assert.deepEqual([refused.status, refused.body.error.code], [422, "DICE_ROLL_MISMATCH"], JSON.stringify(advancement));
  }
  assert.equal((await saveWith(id, coach.token, 1, { type: "stat", grants: { stat: mine.result.stats[0] }, roll: site(mine.id) }, "p1")).body.error.code, "DICE_ROLL_MISMATCH");
  assert.equal(await usedAt(client, mine.id), null);
  assert.equal((await client.query("SELECT revision FROM saved_teams WHERE id = $1", [id])).rows[0].revision, 1);
}));

test("a roll already used is not used again, a table roll needs no row", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const { body: { roll } } = await callApi("POST", `/api/teams/${id}/players/p0/rolls`, { token: coach.token, body: { purpose: "stat" } });
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [roll.id]);
  const used = await saveWith(id, coach.token, 1, { type: "stat", grants: { stat: roll.result.stats[0] }, roll: site(roll.id) });
  assert.deepEqual([used.status, used.body.error.code], [409, "DICE_ROLL_USED"]);
  assert.equal((await saveWith(id, coach.token, 1, { type: "stat", grants: { stat: "ar" }, roll: { via: "table" } })).status, 200);
}));

test("a roll one advancement took cannot go to another as well, nor one roll to two advancements at once", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const roll = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  assert.equal((await saveWith(id, coach.token, 1, taking(roll))).status, 200, "taken through the site's own path: asked for, then saved");
  assert.ok(await usedAt(client, roll.id));
  const moved = await save(id, coach.token, 2, { players: { p0: { advancements: [{ ...taking(roll), roll: { via: "table" } }, { type: "random", grants: { skill: "Block" }, roll: site(roll.id) }] } } });
  assert.deepEqual([moved.status, moved.body.error.code], [409, "DICE_ROLL_USED"], "the advancement that had it says table now, and another kind of advancement claims it");
  const elsewhere = await save(id, coach.token, 2, { players: { p0: { advancements: [] }, p1: { advancements: [taking(roll)] } } });
  assert.deepEqual([elsewhere.status, elsewhere.body.error.code], [409, "DICE_ROLL_USED"], "taken off one player and given to another");
  const retyped = await saveWith(id, coach.token, 2, { ...taking(roll), type: "random" });
  assert.deepEqual([retyped.status, retyped.body.error.code], [409, "DICE_ROLL_USED"], "the same grant under another type is another advancement");
  const again = await save(id, coach.token, 2, { players: { p0: { advancements: [taking(roll), { type: "stat", grants: { skill: "Block" }, roll: site(roll.id) }] } } });
  assert.deepEqual([again.status, again.body.error.code], [409, "DICE_ROLL_USED"], "kept by its advancement and claimed by a second");
  const fresh = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  const twice = await save(id, coach.token, 2, { players: { p1: { advancements: [taking(fresh), { type: "stat", grants: { skill: "Block" }, roll: site(fresh.id) }] } } });
  assert.deepEqual([twice.status, twice.body.error.code], [409, "DICE_ROLL_USED"], "a roll nobody has taken yet, claimed twice in one save");
  const capitals = await saveWith(id, coach.token, 2, taking({ ...fresh, id: fresh.id.toUpperCase() }), "p1");
  assert.deepEqual([capitals.status, capitals.body.error.code], [422, "DICE_ROLL_MISMATCH"], "an id is the roll's own, as the server wrote it");
  assert.equal(await usedAt(client, fresh.id), null);
  assert.ok(await usedAt(client, roll.id));
  assert.equal((await stored(client, id)).revision, 2);
}));

test("a roll moved from one advancement to another is refused on the blob alone, whatever its row says", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const roll = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  // A stored advancement naming a roll its row calls unused: no path of the site writes that, which is the point.
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,advancements}', $2::jsonb) WHERE id = $1", [id, JSON.stringify([taking(roll)])]);
  const moved = await recording(() => saveWith(id, coach.token, 1, { type: "random", grants: { skill: "Block" }, roll: site(roll.id) }));
  assert.deepEqual([moved.result.status, moved.result.body.error.code], [409, "DICE_ROLL_USED"], "the characteristic gone, a random skill claims its roll");
  assert.ok(!touchesRolls(moved.log), "the blob says it all: the row is not asked");
  assert.equal(await usedAt(client, roll.id), null);
}));

test("the advancement that took a roll may change to another grant the same roll offers, in one save; one it does not offer is refused", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const roll = await putRoll(client, id, "p0", "stat", { roll: 3, stats: ["ar", "ma", "pa"] });
  const granting = (grants) => ({ type: "stat", grants, roll: site(roll.id) });
  assert.equal((await saveWith(id, coach.token, 1, granting({ stat: "ma" }))).status, 200);
  const taken = await usedAt(client, roll.id);
  assert.ok(taken);
  const corrected = await recording(() => saveWith(id, coach.token, 2, granting({ stat: "pa" })));
  assert.equal(corrected.result.status, 200, "MA corrected to PA: the same face offered both");
  assert.ok(touchesRolls(corrected.log) && !corrected.log.some((sql) => sql.startsWith("UPDATE dice_rolls")), "the roll is read to check the new grant, and stays as it was used");
  assert.deepEqual(await usedAt(client, roll.id), taken);
  const notOffered = await saveWith(id, coach.token, 3, granting({ stat: "st" }));
  assert.deepEqual([notOffered.status, notOffered.body.error.code, notOffered.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }]);
  assert.equal((await saveWith(id, coach.token, 3, granting({ skill: "Block" }))).status, 200, "a skill in place of the characteristic");
  assert.deepEqual(await usedAt(client, roll.id), taken);
}));

test("a roll taken is the step's: the next roll can be looked at, but not swapped in for it — the earliest roll a save leaves unused goes first", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const ask = async () => (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const first = await ask();
  assert.equal((await saveWith(id, coach.token, 1, taking(first))).status, 200);
  const next = await ask();
  assert.notEqual(next.id, first.id, "the first is used: asking again rolls the next advancement's die");
  const swapped = await saveWith(id, coach.token, 2, { type: "stat", grants: { stat: next.result.stats.at(-1) }, roll: site(next.id) });
  assert.deepEqual([swapped.status, swapped.body.error.code], [409, "DICE_ROLL_USED"], "the first roll freed and the next taken in its place, in one save");
  assert.deepEqual([Boolean(await usedAt(client, first.id)), await usedAt(client, next.id)], [true, null]);
  assert.equal((await saveWith(id, coach.token, 2, null)).status, 200, "undone: the first roll waits again, ahead of the next");
  const ahead = await saveWith(id, coach.token, 3, taking(next));
  assert.deepEqual([ahead.status, ahead.body.error.code], [409, "DICE_ROLL_USED"], "the next roll cannot be taken while the first waits");
  assert.equal((await save(id, coach.token, 3, { players: { p0: { advancements: [taking(first), taking(next)] } } })).status, 200,
    "two advancements take the two in one save: they are the first two waiting");
  assert.deepEqual([Boolean(await usedAt(client, first.id)), Boolean(await usedAt(client, next.id))], [true, true]);
}));

test("rolls are given back last in, first out: an earlier roll cannot be dropped while a later one of its step stays taken", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const ask = async () => (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const first = await ask();
  const a = taking(first);
  assert.equal((await saveWith(id, coach.token, 1, a)).status, 200, "1-2: A takes the first roll");
  const next = await ask();
  const b = taking(next, next.result.stats.at(-1));
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [a, b] } } })).status, 200, "3-4: B takes the next, the earliest one waiting");
  const swapped = await recording(() => save(id, coach.token, 3, { players: { p0: { advancements: [b] } } }));
  assert.deepEqual([swapped.result.status, swapped.result.body.error.code], [409, "DICE_ROLL_USED"], "5: A dropped, B kept — the advancement would sit on the later die");
  assert.ok(!wrote(swapped.log), "nothing freed");
  assert.deepEqual([Boolean(await usedAt(client, first.id)), Boolean(await usedAt(client, next.id))], [true, true]);
  assert.equal((await save(id, coach.token, 3, { players: { p0: { advancements: [a] } } })).status, 200, "the later one given back first");
  assert.equal(await usedAt(client, next.id), null);
  assert.equal((await save(id, coach.token, 4, { players: { p0: { advancements: [] } } })).status, 200, "then the earlier one");
  assert.deepEqual([await usedAt(client, first.id), await usedAt(client, next.id)], [null, null]);
}));

test("a random skill used on a roster that does not hold what its die threw again is refused: the rerolls must be that roster's own", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), fake = general.find((skill) => skill !== "Block");
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const held = (name) => ({ name, access: "primary" });
  assert.equal((await save(id, coach.token, 1, { players: { p0: { extraSkills: [held(fake)] } } })).status, 200, `p0 is said to hold ${fake} while the die is asked`);
  const die = scriptedServerDie(general.indexOf(fake) + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1);
  let roll;
  try { roll = (await rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
  assert.deepEqual(roll.result.dice[0].attempts.map((attempt) => [attempt.skill, attempt.duplicate]), [[fake, true], ["Block", false]], "the die was turned off the skill he held");
  const block = { type: "random", grants: { skill: "Block" }, roll: site(roll.id) };
  const steered = await save(id, coach.token, 2, { players: { p0: { advancements: [block], extraSkills: [held("Block")] } } });
  assert.deepEqual([steered.status, steered.body.error.code, steered.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }],
    `${fake} dropped as the roll is used: the reroll is explained by nothing`);
  assert.equal(await usedAt(client, roll.id), null);
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [block], extraSkills: [held(fake), held("Block")] } } })).status, 200,
    `${fake} still held: the reroll is the roster's own`);
  assert.ok(await usedAt(client, roll.id));
}));

/** A General skill roll for p0 with `held` held while it is asked, the first die turned off `rerolled` onto Block, the second on `SECOND`. */
async function steeredRoll(id, token, rerolled, held) {
  const general = await generalSkills();
  assert.equal((await save(id, token, 1, { players: { p0: { extraSkills: held.map((name) => ({ name, access: "primary" })) } } })).status, 200);
  const die = scriptedServerDie(general.indexOf(rerolled) + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1);
  try { return (await rollFor(id, token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
}

test("a used random roll keeps the skills it was rerolled against: a later save that drops one is refused, and nothing of it is saved", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), [fake] = general.filter((skill) => skill !== "Block");
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const held = (...names) => names.map((name) => ({ name, access: "primary" }));
  const roll = await steeredRoll(id, coach.token, fake, [fake]);
  const block = { type: "random", grants: { skill: "Block" }, roll: site(roll.id) };
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [block], extraSkills: held(fake, "Block") } } })).status, 200,
    "taken with the skill it was rerolled against still held");
  const before = await stored(client, id);
  const dropped = await recording(() => save(id, coach.token, 3, { players: { p0: { advancements: [block], extraSkills: held("Block") } } }));
  assert.deepEqual([dropped.result.status, dropped.result.body.error.code, dropped.result.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }],
    `${fake} dropped a save later: the roll that was rerolled against it would be explained by nothing`);
  assert.ok(touchesRolls(dropped.log) && !wrote(dropped.log), "the used rolls were read, nothing was written");
  assert.deepEqual(dropped.log.slice(-2), ["ROLLBACK", "release"]);
  assert.deepEqual(await stored(client, id), before, `${fake} is still held, the revision as it was`);
  assert.ok(await usedAt(client, roll.id));
  assert.equal((await save(id, coach.token, 3, { players: { p0: { advancements: [], extraSkills: [] } } })).status, 200,
    "the roll given back with the skill: a roll no longer used has nothing to explain");
  assert.equal(await usedAt(client, roll.id), null);
}));

test("a save that drops a skill no used roll was rerolled against is let be; one that drops none does not look", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), [fake, other] = general.filter((skill) => skill !== "Block");
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const held = (...names) => names.map((name) => ({ name, access: "primary" }));
  const roll = await steeredRoll(id, coach.token, fake, [fake, other]);
  const block = { type: "random", grants: { skill: "Block" }, roll: site(roll.id) };
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [block], extraSkills: held(fake, other, "Block") } } })).status, 200);
  const honest = await recording(() => save(id, coach.token, 3, { players: { p0: { advancements: [block], extraSkills: held(fake, "Block") } } }));
  assert.equal(honest.result.status, 200, `${other} dropped: the die never threw it`);
  assert.ok(touchesRolls(honest.log), "p0 holds less and names a random roll: his used rolls were looked at");
  const renamed = await recording(() => save(id, coach.token, 4, { players: { p0: { name: "Griff", advancements: [block], extraSkills: held(fake, "Block") } } }));
  assert.equal(renamed.result.status, 200);
  assert.ok(!touchesRolls(renamed.log), "he holds what he held: nothing to look at");
}));

test("a roll given back takes its rerolls with it, and a save answers only for the players who hold less", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), [fake] = general.filter((skill) => skill !== "Block" && skill !== "Tackle");
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const held = (...names) => names.map((name) => ({ name, access: "primary" }));
  const ask = async (...faces) => {
    const die = scriptedServerDie(...faces);
    try { return (await rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
  };
  const first = await ask(general.indexOf("Tackle") + 1, general.indexOf(SECOND) + 1); // nothing thrown again
  const tackle = { type: "random", grants: { skill: "Tackle" }, roll: site(first.id) };
  assert.equal((await save(id, coach.token, 1, { players: { p0: { advancements: [tackle], extraSkills: held("Tackle", fake) } } })).status, 200);
  const second = await ask(general.indexOf(fake) + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1); // thrown again off the skill p0 holds
  const block = { type: "random", grants: { skill: "Block" }, roll: site(second.id) };
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [tackle, block], extraSkills: held("Tackle", fake, "Block") } } })).status, 200);
  // p1 answers for nothing here: his roll's reroll is unexplained already (left so by a path that settles no rolls), and he holds what he held.
  const theirs = await putRoll(client, id, "p1", "random_skill", { attempts: [{ roll: 2, skill: fake, duplicate: true }, { roll: 5, skill: "Kick", duplicate: false }], skill: "Kick" });
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = $1", [theirs.id]);
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,1,advancements}', $2::jsonb) WHERE id = $1",
    [id, JSON.stringify([{ type: "random", grants: { skill: "Kick" }, roll: site(theirs.id) }])]);
  const back = await save(id, coach.token, 3, { players: { p0: { advancements: [tackle], extraSkills: held("Tackle") } } });
  assert.equal(back.status, 200, `the later roll given back, ${fake} dropped with it; the first roll threw nothing again`);
  assert.deepEqual([Boolean(await usedAt(client, first.id)), await usedAt(client, second.id), Boolean(await usedAt(client, theirs.id))], [true, null, true]);
}));

test("dropping a skill a used roll really was rerolled against is refused: an earlier advancement undone under a later random one", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills();
  const coach = await seedCoach(client, "lion");
  const held = (...names) => names.map((name) => ({ name, access: "primary" }));
  // Pro too: bought, not the captaincy's, it is a skill like any other.
  for (const skill of ["Fend", "Pro"]) {
    const id = await seedTeam(client, coach.id, { name: `Lions ${skill}` });
    const chosen = { type: "primary", grants: { skill }, roll: { via: "table" } };
    assert.equal((await save(id, coach.token, 1, { players: { p0: { advancements: [chosen], extraSkills: held(skill) } } })).status, 200, `${skill} chosen, an advancement of his own`);
    const die = scriptedServerDie(general.indexOf(skill) + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1);
    let roll;
    try { roll = (await rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
    const block = { type: "random", grants: { skill: "Block" }, roll: site(roll.id) };
    assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [chosen, block], extraSkills: held(skill, "Block") } } })).status, 200);
    const undone = await save(id, coach.token, 3, { players: { p0: { advancements: [block], extraSkills: held("Block") } } });
    assert.deepEqual([undone.status, undone.body.error.code, undone.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }],
      `${skill} goes while the roll that was rerolled off it stays: undo the random advancement first`);
  }
}));

/** p0 is captain; his General roll is rerolled off Pro (the captaincy's) onto Block and taken, with Kick held beside it. */
async function captainsRoll(client, { id: ownerId, token }) {
  const general = await generalSkills();
  const id = await seedTeam(client, ownerId, {
    roster: { players: Array.from({ length: 11 }, (_, n) => ({ id: `p${n}`, rowIndex: 0, spp: {}, ...(n === 0 ? { isCaptain: true } : {}) })) } });
  const die = scriptedServerDie(general.indexOf("Pro") + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1);
  let roll;
  try { roll = (await rollFor(id, token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
  assert.deepEqual(roll.result.dice[0].attempts.map((attempt) => [attempt.skill, attempt.duplicate]), [["Pro", true], ["Block", false]], "a captain cannot roll Pro");
  const block = { type: "random", grants: { skill: "Block" }, roll: site(roll.id) };
  assert.equal((await save(id, token, 1, { players: { p0: { advancements: [block], extraSkills: [{ name: "Block", access: "primary" }, { name: "Kick", access: "primary" }] } } })).status, 200);
  return { id, roll, block };
}

test("a captain's Pro may come and go: the captaincy moved off a player whose roll was rerolled off Pro, then an unrelated skill dropped", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const { id, roll, block } = await captainsRoll(client, coach);
  const moved = await recording(() => save(id, coach.token, 2, { players: { p0: { isCaptain: false }, p1: { isCaptain: true } } }));
  assert.equal(moved.result.status, 200, "captaincy is the match's, not the player's: his Pro goes with it");
  assert.ok(touchesRolls(moved.log) && !moved.log.some((sql) => /^(INSERT INTO|UPDATE) dice_rolls/.test(sql)),
    "his used rolls are read for whether they were rolled while captain (R18), and none is touched");
  const unrelated = await save(id, coach.token, 3, { players: { p0: { advancements: [block], extraSkills: [{ name: "Block", access: "primary" }] } } });
  assert.equal(unrelated.status, 200, "Kick dropped: the roll was never rerolled off it");
  assert.ok(await usedAt(client, roll.id));
}));

test("a captaincy moved where no roll is settled leaves later saves free to drop what the roll was not rerolled against", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const { id, block } = await captainsRoll(client, coach);
  // The post-match sets the captain for the next match straight in the blob, without a settled save: done so here.
  await client.query(`UPDATE saved_teams SET roster = jsonb_set(jsonb_set(roster, '{players,0,isCaptain}', 'false'), '{players,1,isCaptain}', 'true') WHERE id = $1`, [id]);
  const unrelated = await save(id, coach.token, 2, { players: { p0: { advancements: [block], extraSkills: [{ name: "Block", access: "primary" }] } } });
  assert.equal(unrelated.status, 200, "only what this save drops is looked at: Kick, which the roll was not rerolled off");
}));

test("a roll remembers whether its player was the captain: a random skill keeps it with the roll, a characteristic has no use for it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  // p1 is captain the old way (`captain`, which the roster still reads); p0 is not.
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, spp: {} }, { id: "p1", rowIndex: 0, spp: {}, captain: true }, { id: "p2", rowIndex: 0, spp: {} }] } });
  const stored = async (rollId) => (await client.query("SELECT params FROM dice_rolls WHERE id = $1", [rollId])).rows[0].params;
  for (const [player, captain] of [["p0", false], ["p1", true]]) {
    const { status, body: { roll } } = await rollFor(id, coach.token, player, { purpose: "random_skill", category: "General" });
    assert.deepEqual([status, roll.params.captain, (await stored(roll.id)).captain], [200, captain, captain], player);
    assert.deepEqual(Object.keys(roll.params).sort(), ["candidates", "captain", "category", "sides"], player);
  }
  const stat = (await rollFor(id, coach.token, "p2", { purpose: "stat" })).body.roll;
  assert.deepEqual([stat.params, await stored(stat.id)], [{ sides: 8 }, { sides: 8 }]);
}));

test("the captaincy may move before a captain's roll is taken: the Pro his die was turned off is the captaincy's", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills();
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: Array.from({ length: 11 }, (_, n) => ({ id: `p${n}`, rowIndex: 0, spp: {}, ...(n === 0 ? { isCaptain: true } : {}) })) } });
  const die = scriptedServerDie(general.indexOf("Pro") + 1, general.indexOf("Block") + 1, general.indexOf(SECOND) + 1);
  let roll;
  try { roll = (await rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" })).body.roll; } finally { die.done(); }
  assert.deepEqual([roll.params.captain, roll.result.dice[0].attempts.map((attempt) => [attempt.skill, attempt.duplicate])], [true, [["Pro", true], ["Block", false]]]);
  assert.equal((await save(id, coach.token, 1, { players: { p0: { isCaptain: false }, p1: { isCaptain: true } } })).status, 200);
  const taken = await save(id, coach.token, 2, { players: { p0: { advancements: [{ type: "random", grants: { skill: "Block" }, roll: site(roll.id) }], extraSkills: [{ name: "Block", access: "primary" }] } } });
  assert.equal(taken.status, 200, "taken by a player who is captain no more");
  assert.ok(await usedAt(client, roll.id));
}));

test("a roll from before rolls kept the captaincy is held to its Pro like any skill", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: Array.from({ length: 11 }, (_, n) => ({ id: `p${n}`, rowIndex: 0, spp: {}, ...(n === 0 ? { isCaptain: true } : {}) })) } });
  const old = await putRoll(client, id, "p0", "random_skill", { attempts: [{ roll: 6, skill: "Pro", duplicate: true }, { roll: 1, skill: "Block", duplicate: false }], skill: "Block" });
  const block = { type: "random", grants: { skill: "Block" }, roll: site(old.id) };
  assert.equal((await save(id, coach.token, 1, { players: { p0: { advancements: [block], extraSkills: [{ name: "Block", access: "primary" }] } } })).status, 200,
    "taken while captain: the Pro is held");
  const moved = await save(id, coach.token, 2, { players: { p0: { isCaptain: false }, p1: { isCaptain: true } } });
  assert.deepEqual([moved.status, moved.body.error.code, moved.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }],
    "no `captain` in its params reads as not the captain's: the Pro it was turned off cannot go");
}));

test("a player who names no random roll drops skills without a dice query", db, () => withApiDatabase(async ({ client }) => {
  const general = await generalSkills(), [fake] = general.filter((skill) => skill !== "Block");
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const roll = await steeredRoll(id, coach.token, fake, [fake]);
  const stat = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  assert.equal((await save(id, coach.token, 2, { players: {
    p0: { advancements: [{ type: "random", grants: { skill: "Block" }, roll: site(roll.id) }], extraSkills: [{ name: fake, access: "primary" }, { name: "Block", access: "primary" }] },
    p1: { advancements: [taking(stat)], extraSkills: [{ name: "Kick", access: "primary" }, { name: "Fend", access: "primary" }] } } })).status, 200);
  const dropped = await recording(() => save(id, coach.token, 3, { players: { p1: { advancements: [taking(stat)], extraSkills: [] } } }));
  assert.equal(dropped.result.status, 200);
  assert.ok(!touchesRolls(dropped.log), "p1's only roll is a characteristic: no random roll of his to look at");
}));

test("one roll waits for a player at a time: another purpose is refused until it is used, and the same purpose is the same roll", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const skillAsk = () => rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" });
  const stat = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const refused = await recording(() => skillAsk());
  assert.deepEqual([refused.result.status, refused.result.body.error.code, refused.result.body.error.params], [409, "DICE_ROLL_WAITING", { purpose: "stat" }]);
  assert.equal(refused.result.body.error.message, "This player has a roll waiting for another type of advancement. Use it before rolling again.");
  assert.ok(!wrote(refused.log));
  assert.equal(await rollCount(client, id), 1, "no row");
  assert.equal((await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll.id, stat.id, "the same purpose: the roll that waits");
  assert.equal((await saveWith(id, coach.token, 1, taking(stat))).status, 200);
  const skill = await skillAsk();
  assert.deepEqual([skill.status, skill.body.roll.purpose], [200, "random_skill"], "the characteristic roll used: the skill is rolled");
  const back = await rollFor(id, coach.token, "p0", { purpose: "stat" });
  assert.deepEqual([back.status, back.body.error.params], [409, { purpose: "random_skill" }], "and now that one waits");
  // A stale roll waits as much as any: p1 holds what his roll ended on.
  const stale = await putRoll(client, id, "p1", "random_skill", { attempts: [{ roll: 1, skill: "Block", duplicate: false }], skill: "Block" });
  assert.equal((await save(id, coach.token, 2, { players: { p1: { extraSkills: [{ name: "Block", access: "primary" }] } } })).status, 200);
  const blocked = await rollFor(id, coach.token, "p1", { purpose: "stat" });
  assert.deepEqual([blocked.status, blocked.body.error.code, blocked.body.error.params], [409, "DICE_ROLL_WAITING", { purpose: "random_skill" }]);
  assert.deepEqual([(await skillAsk()).body.roll.id, (await rollFor(id, coach.token, "p1", { purpose: "random_skill", category: "General" })).body.roll.stale],
    [skill.body.roll.id, true]);
  assert.equal(await usedAt(client, stale.id), null);
}));

test("a player's rolls are one turn, whatever their purpose: an earlier roll of another purpose is waited for, another player's is not", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  // Seeded: both purposes waiting for p0 at once comes only from an undo, which a test of the turns need not walk through.
  const waiting = await putRoll(client, id, "p0", "stat", { roll: 3, stats: ["ar", "ma", "pa"] }, "3 hours"); // the earliest roll of all
  const skill = await putRoll(client, id, "p0", "random_skill", { attempts: [{ roll: 13, skill: "Tackle", duplicate: false }], skill: "Tackle" }, "2 hours");
  const stat = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  assert.equal((await saveWith(id, coach.token, 1, taking(stat), "p1")).status, 200, "p0's rolls wait, and p1's own is his to take");
  const tackle = { type: "random", grants: { skill: skill.result.skill }, roll: site(skill.id) };
  const ahead = await recording(() => save(id, coach.token, 2, { players: { p0: { advancements: [tackle] } } }));
  assert.deepEqual([ahead.result.status, ahead.result.body.error.code], [409, "DICE_ROLL_USED"], "the skill is p0's second roll: his characteristic comes first");
  assert.ok(!wrote(ahead.log));
  assert.deepEqual([await usedAt(client, waiting.id), await usedAt(client, skill.id)], [null, null]);
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [taking(waiting), tackle] } } })).status, 200, "both, in their turn");
  assert.deepEqual([Boolean(await usedAt(client, waiting.id)), Boolean(await usedAt(client, skill.id)), Boolean(await usedAt(client, stat.id))], [true, true, true]);
}));

test("rolls of both purposes are given back last first per player, and an undone site advancement is taken again before the next roll", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const statAsk = () => rollFor(id, coach.token, "p0", { purpose: "stat" });
  const skillAsk = () => rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" });
  const random = (roll) => ({ type: "random", grants: { skill: rolledDice(roll)[0].skill }, roll: site(roll.id) });
  const keep = (revision, ...advancements) => save(id, coach.token, revision, { players: { p0: { advancements } } });
  const r1 = (await statAsk()).body.roll;
  assert.equal((await keep(1, taking(r1))).status, 200, "R1, a characteristic");
  const r2 = (await skillAsk()).body.roll;
  assert.equal((await keep(2, taking(r1), random(r2))).status, 200, "R2, a skill");
  const r3 = (await statAsk()).body.roll;
  assert.equal((await keep(3, taking(r1), random(r2), taking(r3))).status, 200, "R3, a characteristic again");
  const skillFirst = await keep(4, taking(r1), taking(r3));
  assert.deepEqual([skillFirst.status, skillFirst.body.error.code], [409, "DICE_ROLL_USED"], "R2 cannot go back while R3, a later roll of another purpose, stays");
  assert.equal((await keep(4, taking(r1), random(r2))).status, 200, "R3 undone first");
  assert.equal((await keep(5, taking(r1))).status, 200, "then R2");
  const stat = await statAsk();
  assert.deepEqual([stat.status, stat.body.error.code, stat.body.error.params], [409, "DICE_ROLL_WAITING", { purpose: "random_skill" }],
    "R2 is the player's earliest waiting roll: the characteristic R3 is not handed out ahead of it");
  const ahead = await keep(6, taking(r1), taking(r3));
  assert.deepEqual([ahead.status, ahead.body.error.code], [409, "DICE_ROLL_USED"], "nor taken ahead of it");
  assert.equal((await skillAsk()).body.roll.id, r2.id, "asked for a skill: R2, as it was");
  assert.equal((await keep(6, taking(r1), random(r2))).status, 200, "R2 taken again");
  assert.equal((await statAsk()).body.roll.id, r3.id, "and now R3 is the one handed out");
  assert.equal(await rollCount(client, id), 3, "no die was thrown after the third");
}));

test("a dropped reference frees this team's roll only, whatever the blob named", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), id = await seedTeam(client, coach.id), theirs = await seedTeam(client, other.id);
  const foreign = (await rollFor(theirs, other.token, "p0", { purpose: "stat" })).body.roll;
  assert.equal((await saveWith(theirs, other.token, 1, taking(foreign))).status, 200);
  // Their roll named in this team's stored blob: no path of the site writes that, which is the point.
  await client.query("UPDATE saved_teams SET roster = jsonb_set(roster, '{players,0,advancements}', $2::jsonb) WHERE id = $1", [id, JSON.stringify([taking(foreign)])]);
  assert.equal((await saveWith(id, coach.token, 1, null)).status, 200);
  assert.ok(await usedAt(client, foreign.id), "the other team's advancement still has it");
}));

test("a save is checked in order — revision, stage, rolls — and its rolls are settled before the team is written", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { stage: "draft" });
  const roll = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const stale = await recording(() => saveWith(id, coach.token, 0, taking(roll)));
  assert.deepEqual([stale.result.status, stale.result.body.error.code], [409, "TEAM_SAVED_ELSEWHERE"]);
  const locked = await recording(() => save(id, coach.token, 1, { roster: { teamRerolls: 1 }, players: { p0: { advancements: [taking(roll)] } } }));
  assert.deepEqual([locked.result.status, locked.result.body.error.code], [422, "STAGE_PURCHASE_LOCKED"]);
  for (const { log } of [stale, locked]) assert.ok(!touchesRolls(log), "refused before its rolls were looked at");
  assert.equal(await usedAt(client, roll.id), null);
  const taken = await recording(() => saveWith(id, coach.token, 1, taking(roll)));
  assert.equal(taken.result.status, 200);
  const order = [/ FOR UPDATE$/, /^SELECT .* FROM dice_rolls /, /^UPDATE dice_rolls /, /^UPDATE saved_teams /, /^COMMIT$/]
    .map((pattern) => taken.log.findIndex((sql) => pattern.test(sql)));
  assert.ok(order.every((at) => at > 0), JSON.stringify(taken.log));
  assert.deepEqual(order, [...order].sort((a, b) => a - b), "lock, look, use, write, commit");
}));

test("a reference a save does not change is not looked up again: another edit, or undoing an earlier advancement, keeps it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const roll = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const earlier = { type: "random", grants: { skill: "Block" }, roll: { via: "table" } };
  assert.equal((await save(id, coach.token, 1, { players: { p0: { advancements: [earlier, taking(roll)] } } })).status, 200);
  const renamed = await recording(() => save(id, coach.token, 2, { players: { p0: { name: "Griff", advancements: [earlier, taking(roll)] } } }));
  assert.equal(renamed.result.status, 200);
  assert.ok(!touchesRolls(renamed.log), "nothing to look up: the advancement had this roll before");
  assert.equal((await save(id, coach.token, 3, { players: { p0: { advancements: [taking(roll)] } } })).status, 200,
    "the earlier advancement undone: the roll moves up a place with its own advancement");
  assert.ok(await usedAt(client, roll.id));
}));

test("an id that is not a roll id is refused before the database is asked; one already stored is kept or dropped without asking", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const legacy = { type: "stat", grants: { stat: "ar" }, roll: site("legacy-roll") };
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, spp: { touchdowns: 10 }, advancements: [legacy] }, { id: "p1", rowIndex: 0, spp: {} }] } });
  const refused = await recording(() => saveWith(id, coach.token, 1, { type: "stat", grants: { stat: "ar" }, roll: site("not-a-uuid") }, "p1"));
  assert.deepEqual([refused.result.status, refused.result.body.error.code, refused.result.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p1" }]);
  assert.ok(!touchesRolls(refused.log), "refused before any query: a non-UUID never reaches ::uuid[]");
  assert.deepEqual(refused.log.slice(-2), ["ROLLBACK", "release"]);
  assert.equal((await save(id, coach.token, 1, { players: { p0: { name: "Old Hand", advancements: [legacy] } } })).status, 200, "unchanged, it is not checked");
  const dropped = await recording(() => saveWith(id, coach.token, 2, null));
  assert.equal(dropped.result.status, 200, "dropped, there is no roll to free — and no 22P02");
  assert.ok(!touchesRolls(dropped.log));
}));

test("settling a save answers which rolls it used and which it freed, and writes just those", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const rolls = [];
  for (const player of ["p0", "p1", "p2"]) rolls.push((await rollFor(id, coach.token, player, { purpose: "stat" })).body.roll);
  const [kept, dropped, taken] = rolls;
  await client.query("UPDATE dice_rolls SET used_at = now() WHERE id = ANY($1::uuid[])", [[kept.id, dropped.id]]);
  const naming = (...named) => ({ players: named.map((roll) => ({ id: roll.playerId, advancements: [taking(roll)] })) });
  assert.deepEqual(await settleRosterRolls(client, { teamId: id, before: naming(kept, dropped), after: naming(kept, taken) }), { used: [taken.id], freed: [dropped.id] });
  const used = [];
  for (const roll of rolls) used.push(Boolean(await usedAt(client, roll.id)));
  assert.deepEqual(used, [true, false, true], "kept, dropped, taken");
}));

test("a roll that refuses a save refuses it before anything is written: the blob, the ledger and every roll as they were", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const old = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  assert.equal((await saveWith(id, coach.token, 1, taking(old))).status, 200);
  const next = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  const before = await stored(client, id);
  const { result: refused, log } = await recording(() => save(id, coach.token, 2, { roster: { treasury: 90 }, players: {
    p0: { advancements: [] }, p1: { advancements: [{ type: "random", grants: { skill: "Block" }, roll: site(next.id) }] } } }));
  assert.deepEqual([refused.status, refused.body.error.code, refused.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p1" }]);
  assert.ok(!wrote(log), "refused on what it read: freeing p0's roll, the team and the journal line were never written");
  assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
  assert.ok(await usedAt(client, old.id), "the undone advancement's roll is not freed");
  assert.equal(await usedAt(client, next.id), null);
  assert.deepEqual(await stored(client, id), before);
  assert.deepEqual(await ledgerLines(client, id), []);
}));

test("a save that fails after its rolls were settled takes them back with the blob and the ledger", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const old = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  assert.equal((await saveWith(id, coach.token, 1, taking(old))).status, 200);
  const next = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  const before = await stored(client, id);
  const change = { roster: { treasury: 90 }, players: { p0: { advancements: [] }, p1: { advancements: [taking(next)] } } };
  // The journal line is the last thing a save writes: refusing it fails the save after the rolls were settled.
  await client.query("ALTER TABLE team_ledger ADD CONSTRAINT refuse_every_line CHECK (false) NOT VALID");
  const { result: failed, logged } = await loggingErrors(() => save(id, coach.token, 2, change));
  assert.equal(failed.status, 500);
  assert.equal(logged.length, 1);
  assert.ok(await usedAt(client, old.id), "freeing the undone advancement's roll went with the save");
  assert.equal(await usedAt(client, next.id), null, "so did using the new one");
  assert.deepEqual(await stored(client, id), before);
  assert.deepEqual(await ledgerLines(client, id), []);
  await client.query("ALTER TABLE team_ledger DROP CONSTRAINT refuse_every_line");
  assert.equal((await save(id, coach.token, 2, change)).status, 200, "the same save, with the journal back, lands");
  assert.deepEqual([await usedAt(client, old.id), Boolean(await usedAt(client, next.id))], [null, true]);
  assert.deepEqual(await ledgerLines(client, id), [{ kind: "manual" }]);
}));

test("an administrator's save of the team is held to its rolls the same way", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true }), id = await seedTeam(client, coach.id);
  const roll = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  const team = (await callApi("GET", `/api/teams/${id}`, { token: coach.token })).body.team;
  const asAdmin = (advancement) => callApi("PATCH", `/api/admin/teams/${id}`, { token: boss.token, body: { name: team.name, baseTeamSlug: team.baseTeamSlug,
    roster: { ...team.roster, players: team.roster.players.map((player) => player.id === "p0" ? { ...player, advancements: [advancement] } : player) } } });
  const refused = await asAdmin({ type: "primary", grants: { skill: "Block" }, roll: site(roll.id) });
  assert.deepEqual([refused.status, refused.body.error.code], [422, "DICE_ROLL_MISMATCH"]);
  assert.equal(await usedAt(client, roll.id), null);
  assert.equal((await asAdmin(taking(roll))).status, 200);
  assert.ok(await usedAt(client, roll.id));
}));

test("a random skill the player has since come to hold both skills of is still the step's roll: handed back marked stale, not spent and not replaced", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const ask = () => rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" });
  const first = (await ask()).body.roll, [skill, other] = rolledDice(first).map((die) => die.skill);
  assert.equal(Object.hasOwn(first, "stale"), false);
  assert.ok(other && other !== skill, "a General roll for a Lineman with no skills is two dice");
  // One die's skill taken at the table instead: the editor gives the skill with the advancement that grants it (applyAdvancement).
  const atTable = { advancements: [{ type: "random", grants: { skill }, roll: { via: "table" } }], extraSkills: [{ name: skill, access: "primary" }] };
  assert.equal((await save(id, coach.token, 1, { players: { p0: atTable } })).status, 200);
  const one = (await ask()).body.roll;
  assert.deepEqual([one.id, Object.hasOwn(one, "stale")], [first.id, false], "one of the two held: the other die's skill is still there to take");
  // The other added by hand: he holds both.
  assert.equal((await save(id, coach.token, 2, { players: { p0: { ...atTable, extraSkills: [...atTable.extraSkills, { name: other, access: "primary" }] } } })).status, 200);
  const again = await recording(() => ask());
  assert.deepEqual([again.result.body.roll.id, again.result.body.roll.stale, again.result.body.roll.usedAt], [first.id, true, null],
    "the same roll, marked: spending it for a fresh die would be a reroll for nothing");
  assert.ok(!wrote(again.log), "handed back with no write at all");
  assert.deepEqual([await usedAt(client, first.id), await rollCount(client, id)], [null, 1]);
  // The duplicates gone: the same roll again, no longer stale, and it can be taken.
  assert.equal((await save(id, coach.token, 3, { players: { p0: { advancements: [], extraSkills: [] } } })).status, 200);
  const back = (await ask()).body.roll;
  assert.deepEqual([back.id, Object.hasOwn(back, "stale")], [first.id, false]);
  const onSite = { advancements: [{ type: "random", grants: { skill }, roll: site(first.id) }], extraSkills: [{ name: skill, access: "primary" }] };
  assert.equal((await save(id, coach.token, 4, { players: { p0: onSite } })).status, 200);
  assert.ok(await usedAt(client, first.id));
}));

test("a stale roll can also take the place of the table advancement that made it stale, whichever die's skill it gave", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const ask = () => rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" });
  const first = (await ask()).body.roll, [other, skill] = rolledDice(first).map((die) => die.skill);
  const extraSkills = [{ name: skill, access: "primary" }, { name: other, access: "primary" }];
  // The second die's skill taken at the table, the first die's added by hand.
  assert.equal((await save(id, coach.token, 1, { players: { p0: { advancements: [{ type: "random", grants: { skill }, roll: { via: "table" } }], extraSkills } } })).status, 200);
  assert.equal((await ask()).body.roll.stale, true);
  assert.equal((await save(id, coach.token, 2, { players: { p0: { advancements: [{ type: "random", grants: { skill }, roll: site(first.id) }], extraSkills } } })).status, 200,
    "rolled at the table, now said to be rolled on the site: the roll the site did roll");
  assert.ok(await usedAt(client, first.id));
}));

test("a random advancement takes either die's skill; a skill neither die rolled is DICE_ROLL_MISMATCH", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const pair = { dice: [cameUp(1, "Block"), cameUp(3, "Fend")] };
  const id = await seedTeam(client, coach.id), roll = await putRoll(client, id, "p0", "random_skill", pair);
  assert.equal((await saveWith(id, coach.token, 1, { type: "random", grants: { skill: "Fend" }, roll: site(roll.id) })).status, 200, "the second die's skill");
  assert.ok(await usedAt(client, roll.id));
  const fresh = await seedTeam(client, coach.id, { name: "Cubs" }), other = await putRoll(client, fresh, "p0", "random_skill", pair);
  const neither = await saveWith(fresh, coach.token, 1, { type: "random", grants: { skill: "Tackle" }, roll: site(other.id) });
  assert.deepEqual([neither.status, neither.body.error.code, neither.body.error.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }]);
  assert.equal(await usedAt(client, other.id), null);
  assert.equal((await saveWith(fresh, coach.token, 1, { type: "random", grants: { skill: "Block" }, roll: site(other.id) })).status, 200, "the first die's skill");
  assert.ok(await usedAt(client, other.id));
}));

test("a characteristic roll is never stale: improved at the table meanwhile, the player is handed the same roll", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const first = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll, stat = first.result.stats[0];
  const atTable = { advancements: [{ type: "stat", grants: { stat }, roll: { via: "table" } }], statMods: { [stat]: 1 } };
  assert.equal((await save(id, coach.token, 1, { players: { p0: atTable } })).status, 200);
  const again = (await rollFor(id, coach.token, "p0", { purpose: "stat" })).body.roll;
  assert.deepEqual([again.id, Object.hasOwn(again, "stale")], [first.id, false]);
  assert.equal(await usedAt(client, first.id), null);
}));

test("of two waiting skill rolls the earliest is handed back even when stale, and the later one cannot be taken ahead of it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: [{ id: "p0", rowIndex: 0, spp: {}, extraSkills: [{ name: "Mighty Blow (+1)", access: "primary" }] }] } });
  const held = await putRoll(client, id, "p0", "random_skill", { attempts: [], skill: "Mighty Blow" }, "2 hours"); // held, by its canonical name
  const later = await putRoll(client, id, "p0", "random_skill", { attempts: [], skill: "Tackle" }, "1 hour");
  const asked = await recording(() => rollFor(id, coach.token, "p0", { purpose: "random_skill", category: "General" }));
  assert.deepEqual([asked.result.body.roll.id, asked.result.body.roll.stale], [held.id, true]);
  assert.ok(!wrote(asked.log));
  const ahead = await saveWith(id, coach.token, 1, { type: "random", grants: { skill: "Tackle" }, roll: site(later.id) });
  assert.deepEqual([ahead.status, ahead.body.error.code], [409, "DICE_ROLL_USED"]);
  assert.deepEqual([await usedAt(client, held.id), await usedAt(client, later.id), await rollCount(client, id)], [null, null, 2], "nothing was spent, nothing rolled");
}));

test("an ask that is refused writes nothing and leaves the waiting roll as it was; a waiting roll, stale or not, is handed back with no write at all", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion");
  const id = await seedTeam(client, coach.id, { roster: { players: [
    { id: "p0", rowIndex: 0, spp: {}, extraSkills: [{ name: "Block", access: "primary" }] }, { id: "p1", rowIndex: 0, spp: {} }, { id: "p2", rowIndex: 0, spp: {} }] } });
  const rows = async () => (await client.query("SELECT * FROM dice_rolls WHERE saved_team_id = $1 ORDER BY id", [id])).rows;
  const characteristic = (await rollFor(id, coach.token, "p1", { purpose: "stat" })).body.roll;
  const before = await rows();
  for (const [player, body, status, code] of [["p1", { purpose: "random_skill", category: "General" }, 409, "DICE_ROLL_WAITING"], ["p2", { purpose: "random_skill", category: "Agility" }, 422, "DICE_CATEGORY"]]) {
    const refused = await recording(() => rollFor(id, coach.token, player, body));
    assert.deepEqual([refused.result.status, refused.result.body.error.code], [status, code], player);
    assert.ok(!wrote(refused.log), player);
    assert.deepEqual(refused.log.slice(-2), ["ROLLBACK", "release"], player);
  }
  assert.deepEqual(await rows(), before, "the waiting roll untouched");
  const stale = await putRoll(client, id, "p0", "random_skill", { attempts: [], skill: "Block" });
  for (const [player, body, expected] of [["p1", { purpose: "stat" }, characteristic.id], ["p0", { purpose: "random_skill", category: "Agility" }, stale.id]]) {
    const handed = await recording(() => rollFor(id, coach.token, player, body));
    assert.deepEqual([handed.result.status, handed.result.body.roll.id], [200, expected], player);
    assert.ok(!wrote(handed.log), player);
  }
  assert.equal((await rows()).length, 2);
}));

test("a team is created with no rolls: every way of creating one refuses a roster that names a site roll, and creates nothing", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), boss = await seedCoach(client, "boss", { admin: true });
  const named = { type: "stat", grants: { stat: "ar" }, roll: site("00000000-0000-4000-8000-000000000001") };
  const rosterWith = (advancement) => ({ treasury: 0, players: [{ id: "p0", rowIndex: 0, spp: { touchdowns: 10 }, advancements: [advancement] }] });
  const ways = [
    ["POST /api/teams", "/api/teams", coach.token, {}],
    ["POST /api/admin/users/:id/teams", `/api/admin/users/${coach.id}/teams`, boss.token, {}],
    ["POST /api/season/admin/create-team", "/api/season/admin/create-team", boss.token, { userId: coach.id }],
    ["POST /api/season/admin/coaches", "/api/season/admin/coaches", boss.token, { login: "newcoach", password: "newcoach-pw", telegram: "@newcoach" }]];
  const created = async () => (await client.query(`SELECT (SELECT count(*) FROM saved_teams)::int AS teams, (SELECT count(*) FROM users)::int AS users,
    (SELECT count(*) FROM seasons)::int AS seasons, (SELECT count(*) FROM season_entries)::int AS entries`)).rows[0];
  const nothing = await created();
  for (const [way, path, token, extra] of ways) {
    // The season's own create stores the body as sent, so it gets the raw shape: the id with spaces round it.
    for (const roll of [named.roll, { via: "site", id: ` ${named.roll.id} ` }]) {
      const refused = await callApi("POST", path, { token, body: { name: "Forged", baseTeamSlug: "teams/human", roster: rosterWith({ ...named, roll }), ...extra } });
      assert.deepEqual([refused.status, refused.body.error?.code, refused.body.error?.params], [422, "DICE_ROLL_MISMATCH", { playerId: "p0" }], way);
    }
  }
  assert.deepEqual(await created(), nothing, "no team, no coach, no season, no season entry");
  for (const [way, path, token, extra] of ways) {
    const tabled = await callApi("POST", path, { token, body: { name: `Tabled ${way}`, baseTeamSlug: "teams/human", roster: rosterWith({ ...named, roll: { via: "table" } }), ...extra } });
    assert.equal(tabled.status, 201, `${way}: a table roll names no row`);
  }
  assert.equal((await created()).teams, nothing.teams + 4);
}));
