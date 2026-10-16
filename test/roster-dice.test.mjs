import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { DICE_PURPOSES, STAT_ROLL_TABLE, randomSkillRoll, statRoll, statsForRoll } from "../src/domain/roster/dice.mjs";
import { PLAYER_STATS, rowsForTeam } from "../src/domain/roster/values.mjs";
import { canonicalSkillName, heldSkillKeys, normalizePlayerAdvancements } from "../src/domain/roster/players.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.json", import.meta.url), "utf8")));
const [lineman, , , blitzer] = rowsForTeam(data.teams.find((team) => team.slug === "teams/human")); // Human Lineman (G), Blitzer (G S; Block, Tackle)
const general = data.skillGroups.find((group) => group.category === "General").skills;
const strength = data.skillGroups.find((group) => group.category === "Strength").skills;
const ratOgre = rowsForTeam(data.teams.find((team) => team.slug === "teams/skaven")).find((row) => row.position === "Rat Ogre"); // primary S, base Mighty Blow (+1)

/** A die that answers from a script and remembers what it was asked to roll. */
function scripted(...faces) {
  const asked = [];
  return Object.assign((sides) => { asked.push(sides); return faces.shift(); }, { asked });
}

test("the D8 table is the one in Player Advancement.md", () => {
  const text = readFileSync(new URL("../content/Gata/General Information/Player Advancement.md", import.meta.url), "utf8");
  const names = { AV: "ar", MA: "ma", PA: "pa", AG: "ag", ST: "st" };
  const fromContent = [...text.split("## Characteristic Improvements")[1].matchAll(/^\| (\d+)(?:-(\d+))? \| (.+?) \|$/gm)]
    .map(([, from, to, label]) => ({ from: Number(from), to: Number(to ?? from),
      stats: label.startsWith("Any") ? [...PLAYER_STATS] : label.replace(/ \+1$/, "").split("/").map((name) => names[name]) }));
  assert.deepEqual(STAT_ROLL_TABLE.map((row) => ({ from: row.from, to: row.to, stats: [...row.stats] })), fromContent);
});

test("every face of the D8 gives the stats of its row, and only 1–8 are faces", () => {
  for (const row of STAT_ROLL_TABLE) for (let face = row.from; face <= row.to; face += 1) assert.deepEqual(statsForRoll(face), [...row.stats]);
  assert.deepEqual(statsForRoll(0), []);
  assert.deepEqual(statsForRoll(9), []);
});

test("a stat roll asks for one D8 and records it", () => {
  const rng = scripted(3);
  assert.deepEqual(statRoll(rng), { ok: true, params: { die: 8 }, result: { roll: 3, stats: ["ar", "ma", "pa"] } });
  assert.deepEqual(rng.asked, [8]);
});

test("a die that answers outside its faces is refused", () => {
  for (const face of [0, 9, 2.5, undefined]) assert.throws(() => statRoll(scripted(face)), RangeError);
});

test("a random skill rolls over the category's Skill Table column and rerolls what the player already has", () => {
  const rng = scripted(2, 3);
  const roll = randomSkillRoll({ row: lineman, player: { extraSkills: [{ name: "Dauntless", access: "primary" }] },
    category: "General", skillGroups: data.skillGroups, rng });
  assert.deepEqual(roll, { ok: true, params: { category: "General", candidates: general }, result: {
    attempts: [{ roll: 2, skill: "Dauntless", duplicate: true }, { roll: 3, skill: "Fend", duplicate: false }], skill: "Fend" } });
  assert.deepEqual(rng.asked, [general.length, general.length]);
});

test("a base skill counts as already held", () => {
  const roll = randomSkillRoll({ row: blitzer, player: {}, category: "General", skillGroups: data.skillGroups, rng: scripted(1, 2) });
  assert.deepEqual(roll.result.attempts.map((attempt) => attempt.duplicate), [true, false]);
  assert.equal(roll.result.skill, "Dauntless");
});

test("only the player's primary categories can be rolled", () => {
  assert.deepEqual(randomSkillRoll({ row: lineman, player: {}, category: "Agility", skillGroups: data.skillGroups, rng: scripted() }),
    { ok: false, reason: "DICE_CATEGORY" });
});

test("a player who holds the whole column gets no roll, and the die is not touched", () => {
  const rng = scripted();
  const player = { extraSkills: general.map((name) => ({ name, access: "primary" })) };
  assert.deepEqual(randomSkillRoll({ row: lineman, player, category: "General", skillGroups: data.skillGroups, rng }),
    { ok: false, reason: "DICE_NO_SKILL" });
  assert.deepEqual(rng.asked, []);
});

test("a die stuck on a held skill stops after maxAttempts instead of looping", () => {
  const player = { extraSkills: [{ name: "Block", access: "primary" }] };
  assert.throws(() => randomSkillRoll({ row: lineman, player, category: "General", skillGroups: data.skillGroups,
    rng: () => 1, maxAttempts: 5 }), /5 attempts/);
});

test("the purposes are the ones migration 012 allows", () => {
  const sql = readFileSync(new URL("../server/db/migrations/012_dice_rolls.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(purpose IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...DICE_PURPOSES]);
});

test("an advancement keeps how its result was rolled; anything else is dropped", () => {
  assert.deepEqual(normalizePlayerAdvancements([
    { type: "random", grants: { skill: "Fend" }, roll: { id: "r1", via: "site", extra: 1 } },
    { type: "stat", grants: { stat: "ma" }, roll: { via: "table" } },
    { type: "primary", grants: { skill: "Block" }, roll: { via: "site" } },
    { type: "secondary", roll: "table" },
    { type: "stat" },
  ]), [
    { type: "random", grants: { skill: "Fend" }, roll: { id: "r1", via: "site" } },
    { type: "stat", grants: { stat: "ma" }, roll: { via: "table" } },
    { type: "primary", grants: { skill: "Block" } },
    { type: "secondary" },
    { type: "stat" },
  ]);
});

test("a skill's (+N) is not part of which skill it is", () => {
  assert.deepEqual(["Mighty Blow (+1)", "Mighty Blow (2)", "Mighty Blow (-1)", "Mighty Blow", "Loner (4+)", "Block"].map(canonicalSkillName),
    ["Mighty Blow", "Mighty Blow", "Mighty Blow", "Mighty Blow", "Loner (4+)", "Block"]);
  assert.deepEqual([...heldSkillKeys(ratOgre, { extraSkills: [{ name: "Block", access: "primary" }] })].filter((name) => name.startsWith("Mighty") || name === "Block"),
    ["Mighty Blow", "Block"]);
  assert.ok(ratOgre.skills.includes("Mighty Blow (+1)"), "the Rat Ogre keeps the name the content gives it");
});

test("a Rat Ogre already has Mighty Blow, so it is rerolled instead of rolled again", () => {
  const mightyBlow = strength.indexOf("Mighty Blow") + 1;
  const roll = randomSkillRoll({ row: ratOgre, player: {}, category: "Strength", skillGroups: data.skillGroups, rng: scripted(mightyBlow, 1) });
  assert.deepEqual(roll.result.attempts, [{ roll: mightyBlow, skill: "Mighty Blow", duplicate: true }, { roll: 1, skill: strength[0], duplicate: false }]);
  assert.equal(roll.result.skill, strength[0]);
});

test("a Rat Ogre with every Strength skill but Mighty Blow has nothing left to roll", () => {
  const rng = scripted();
  const player = { extraSkills: strength.filter((name) => name !== "Mighty Blow").map((name) => ({ name, access: "primary" })) };
  assert.deepEqual(randomSkillRoll({ row: ratOgre, player, category: "Strength", skillGroups: data.skillGroups, rng }), { ok: false, reason: "DICE_NO_SKILL" });
  assert.deepEqual(rng.asked, []);
});
