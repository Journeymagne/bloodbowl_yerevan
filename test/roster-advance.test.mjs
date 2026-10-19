import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../src/data/reference.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { rollFitsAdvancement, rollRefusal, siteRollReferences, skillFaces, tableAdvancementFor } from "../src/domain/roster/dice.mjs";
import {
  ADVANCE_REFUSALS, ADVANCEMENT_TYPES, MAX_STAT_GAIN, STAT_LIMITS, advancementCategories, advancementOffers, categorySkills,
  statChoices, statIncreaseRefusal, takeAdvancement, undoLastAdvancement,
} from "../src/domain/roster/progression.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { PLAYER_STATS, rowsForTeam } from "../src/domain/roster/values.mjs";
import { checkRoster, loadTeamReference } from "../server/domain/roster.mjs";

await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const race = (slug) => data.teams.find((team) => team.slug === slug);
const { skillGroups } = data;
const column = (category) => skillGroups.find((group) => group.category === category).skills;
// Human: 0 Human Lineman (G / A S D), 2 Catcher (MA 8, ST 3, AG 3+, PA 5+, AR 8+, Catch and Dodge; A G / P S D), 5 Ogre (AR 10+).
const human = race("teams/human");
const rows = rowsForTeam(human);
// Amazon: 3 Jaguar Warrior Blocker (Evasive, Defensive; G S / A). Elven Union: 0 Elf Lineman (AG 2+). Chaos Chosen: 4 Minotaur (PA "-").
const amazon = race("teams/amazon");
const jaguar = rowsForTeam(amazon)[3];
const elfLineman = rowsForTeam(race("teams/elven-union"))[0];
const minotaur = rowsForTeam(race("teams/chaos-chosen"))[4];

/** A player of the row as the roster carries him; `spp` counts what he did, `over` anything else. */
const player = (rowIndex, spp = {}, over = {}) => ({
  id: `p${rowIndex}`, rowIndex, spp, advancements: [], extraSkills: [], statMods: {}, injuryStatMods: {}, ...over,
});
const catcher = (spp, advancements = [], over = {}) => player(2, spp, { advancements, ...over });
const ofType = (count, type = "random") => Array.from({ length: count }, () => ({ type }));
const fiveAdvancements = ofType(5);
const sixAdvancements = ofType(6);
const RICH = { touchdowns: 10 };
const SITE = { id: "r1", via: "site" };
const TABLE = { via: "table" };

test("the advancement table as content has it: each type's cost by the rank, and what each adds to his value", () => {
  assert.deepEqual(ADVANCEMENT_TYPES, ["random", "primary", "secondary", "stat"]);
  const fresh = advancementOffers(human, rows[2], catcher({ touchdowns: 10 }), skillGroups);
  assert.deepEqual(fresh.offers.map(({ type, cost, value }) => [type, cost, value]), [["random", 3, 20], ["primary", 6, 20], ["secondary", 10, 40], ["stat", 14, null]]);
  assert.deepEqual([fresh.level, fresh.maxed, fresh.available], [0, false, 30]);
  assert.ok(fresh.offers.every(({ refusal }) => refusal === null));
  const fifth = advancementOffers(human, rows[2], catcher({ touchdowns: 60 }, fiveAdvancements), skillGroups);
  assert.deepEqual(fifth.offers.map(({ cost }) => cost), [15, 30, 34, 38]);
  assert.deepEqual([fifth.level, fifth.maxed, fifth.available], [5, false, 180 - (3 + 4 + 6 + 8 + 10)]);
  const maxed = advancementOffers(human, rows[2], catcher({ touchdowns: 99 }, sixAdvancements), skillGroups);
  assert.ok(maxed.maxed && maxed.offers.every(({ refusal }) => refusal.code === "ADVANCEMENT_MAX_LEVEL"));
  assert.deepEqual(maxed.offers[0].refusal.params, {});
});

test("a type he cannot pay for says how much is missing; a type with no skill left in its categories says so", () => {
  const offers = advancementOffers(human, rows[2], catcher({ touchdowns: 1, casualties: 1 }), skillGroups).offers;
  assert.equal(offers[0].refusal, null, "3 of his 5");
  assert.deepEqual(offers[2].refusal, { code: "ADVANCEMENT_NOT_ENOUGH_SPP", params: { cost: 10, available: 5, missing: 5, rank: "Experienced" } });
  const everyGeneral = player(0, RICH, { extraSkills: column("General").map((name) => ({ name, access: "primary" })) });
  const lineman = advancementOffers(human, rows[0], everyGeneral, skillGroups).offers;
  assert.deepEqual(lineman.map(({ type, refusal }) => [type, refusal?.code ?? null]),
    [["random", "NO_SKILL_LEFT"], ["primary", "NO_SKILL_LEFT"], ["secondary", null], ["stat", null]]);
  assert.deepEqual(lineman[0].refusal.params, {});
});

test("categories: random and primary from the primary access, secondary from the secondary, a skill in place of a characteristic from both", () => {
  const primary = [{ category: "Agility", access: "primary" }, { category: "General", access: "primary" }];
  const secondary = ["Passing", "Strength", "Devious"].map((category) => ({ category, access: "secondary" }));
  assert.deepEqual(advancementCategories(rows[2], "random"), primary);
  assert.deepEqual(advancementCategories(rows[2], "primary"), primary);
  assert.deepEqual(advancementCategories(rows[2], "secondary"), secondary);
  assert.deepEqual(advancementCategories(rows[2], "stat", { instead: true }), [...primary, ...secondary]);
  assert.deepEqual(advancementCategories(rows[2], "stat"), []);
  const offers = advancementOffers(human, rows[2], catcher(RICH), skillGroups).offers;
  assert.deepEqual(offers.map(({ categories }) => categories), [primary, primary, secondary, []]);
});

test("a category's skills in the Skill Table's order, the held ones marked, and the one that brings an elite combination together", () => {
  const agility = categorySkills(rows[2], catcher(RICH), "Agility", skillGroups);
  assert.deepEqual(agility.map(({ name }) => name), column("Agility"));
  assert.deepEqual(agility.slice(0, 4), [
    { name: "Catch", held: true, elite: false }, { name: "Diving Catch", held: false, elite: false },
    { name: "Diving Tackle", held: false, elite: false }, { name: "Dodge", held: true, elite: false },
  ]);
  const blocker = player(3, RICH);
  const general = categorySkills(jaguar, blocker, "General", skillGroups), strength = categorySkills(jaguar, blocker, "Strength", skillGroups);
  assert.deepEqual(general.filter(({ elite }) => elite).map(({ name }) => name), ["Wrestle"], "with Evasive");
  assert.deepEqual(strength.filter(({ elite }) => elite).map(({ name }) => name), ["Guard"], "with Defensive");
  assert.deepEqual(general.find(({ name }) => name === "Block"), { name: "Block", held: false, elite: false });
  const advanced = categorySkills(rows[2], catcher(RICH, [], { extraSkills: [{ name: "Frenzy", access: "primary" }] }), "General", skillGroups);
  assert.equal(advanced.find(({ name }) => name === "Frenzy").held, true, "a skill taken by an advancement is held");
  assert.deepEqual(categorySkills(rows[2], catcher(RICH), "Nowhere", skillGroups), []);
});

test("the characteristics' limits: MA 9, ST 8, AR 11+, AG and PA 1+, and no more than +2 on one; a lasting injury's −1 is not one of the two", () => {
  assert.deepEqual(STAT_LIMITS, { ma: 9, st: 8, ag: 1, pa: 1, ar: 11 });
  assert.equal(MAX_STAT_GAIN, 2);
  assert.ok(Object.isFrozen(STAT_LIMITS) && Object.isFrozen(ADVANCE_REFUSALS) && Object.isFrozen(ADVANCEMENT_TYPES));
  const mods = (statMods, injuryStatMods = {}) => catcher(RICH, [], { statMods, injuryStatMods });
  assert.equal(statIncreaseRefusal(rows[2], mods({}), "ma"), null);
  assert.deepEqual(statIncreaseRefusal(rows[2], mods({ ma: 1 }), "ma"), { code: "STAT_LIMIT", params: { stat: "ma", limit: 9 } });
  assert.equal(statIncreaseRefusal(rows[2], mods({ st: 1 }), "st"), null);
  assert.deepEqual(statIncreaseRefusal(rows[2], mods({ st: 2 }), "st"), { code: "STAT_GAINS", params: { stat: "st", max: 2 } });
  assert.deepEqual(statIncreaseRefusal(elfLineman, player(0, RICH, { statMods: { ag: 1 } }), "ag"), { code: "STAT_LIMIT", params: { stat: "ag", limit: 1 } });
  assert.equal(statIncreaseRefusal(elfLineman, player(0, RICH), "ag"), null);
  assert.deepEqual(statIncreaseRefusal(rows[5], player(5, RICH, { statMods: { ar: 1 } }), "ar"), { code: "STAT_LIMIT", params: { stat: "ar", limit: 11 } });
  assert.deepEqual(statIncreaseRefusal(minotaur, player(4, RICH), "pa"), { code: "STAT_NONE", params: { stat: "pa" } });
  assert.equal(statIncreaseRefusal(rows[2], mods({ ma: -1 }, { ma: -1 }), "ma"), null, "injured, nothing gained");
  assert.equal(statIncreaseRefusal(rows[2], mods({ ma: 0 }, { ma: -1 }), "ma"), null, "one gained over the injury");
  assert.deepEqual(statIncreaseRefusal(rows[2], mods({ ma: 1 }, { ma: -1 }), "ma"), { code: "STAT_GAINS", params: { stat: "ma", max: 2 } });
  assert.equal(statIncreaseRefusal(rows[2], player(2, RICH, { statMods: undefined }), "ma"), null, "a player with no modifiers yet");
});

test("a D8 face offers what the table says, each with before and after and its value, refused where the limits say", () => {
  assert.deepEqual(statChoices(rows[2], catcher(RICH), 3), [
    { stat: "ar", before: "8+", after: "9+", value: 10, refusal: null },
    { stat: "ma", before: "8", after: "9", value: 30, refusal: null },
    { stat: "pa", before: "5+", after: "4+", value: 20, refusal: null },
  ]);
  const fast = statChoices(rows[2], catcher(RICH, [], { statMods: { ma: 1 } }), 3).find(({ stat }) => stat === "ma");
  assert.deepEqual(fast, { stat: "ma", before: "9", after: "10", value: 30, refusal: { code: "STAT_LIMIT", params: { stat: "ma", limit: 9 } } });
  const bull = statChoices(minotaur, player(4, RICH), 2);
  assert.deepEqual(bull.map(({ stat, refusal }) => [stat, refusal?.code ?? null]), [["ar", null], ["pa", "STAT_NONE"]]);
  assert.deepEqual(statChoices(rows[2], catcher(RICH), 8).map(({ stat }) => stat), PLAYER_STATS, "face 8: any one");
  assert.deepEqual(statChoices(rows[2], catcher(RICH), 9), []);
});

test("a skill advancement: the skill, its access, its type and its SPP; a chosen skill carries no roll, a random one its roll", () => {
  const rolled = catcher(RICH);
  assert.deepEqual(takeAdvancement(human, rows[2], rolled, { type: "random", grant: { skill: "Frenzy" }, roll: SITE }, skillGroups),
    { applied: true, cost: 3, value: 20 });
  assert.deepEqual(rolled.advancements, [{ type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" } }]);
  assert.deepEqual(rolled.extraSkills, [{ name: "Frenzy", access: "primary" }]);

  const atTable = catcher(RICH);
  assert.equal(takeAdvancement(human, rows[2], atTable, { type: "random", grant: { skill: "Block" }, roll: { via: "table", id: "x" } }, skillGroups).applied, true);
  assert.deepEqual(atTable.advancements, [{ type: "random", grants: { skill: "Block" }, roll: { via: "table" } }]);

  const chosen = catcher(RICH);
  assert.deepEqual(takeAdvancement(human, rows[2], chosen, { type: "secondary", grant: { skill: "Pass" } }, skillGroups), { applied: true, cost: 10, value: 40 });
  assert.deepEqual(chosen.advancements, [{ type: "secondary", grants: { skill: "Pass" } }]);
  assert.deepEqual(chosen.extraSkills, [{ name: "Pass", access: "secondary" }]);
  assert.deepEqual(takeAdvancement(human, rows[2], chosen, { type: "primary", grant: { skill: "Sure Hands" } }, skillGroups),
    { applied: true, cost: 8, value: 20 }, "the second advancement at the Veteran's price");

  const asked = catcher(RICH), before = structuredClone(asked);
  for (const type of ["primary", "secondary"]) {
    const refused = takeAdvancement(human, rows[2], asked, { type, grant: { skill: "Block" }, roll: TABLE }, skillGroups);
    assert.deepEqual([refused.applied, refused.code], [false, "GRANT_WRONG_KIND"]);
  }
  assert.deepEqual(asked, before);
});

test("a skill in place of a characteristic: the characteristic's SPP, the skill's value by its access, recorded as a characteristic advancement", () => {
  const blocker = catcher(RICH);
  assert.deepEqual(takeAdvancement(human, rows[2], blocker, { type: "stat", grant: { skill: "Block" }, roll: { id: "r2", via: "site" } }, skillGroups),
    { applied: true, cost: 14, value: 20 });
  assert.deepEqual(blocker.advancements, [{ type: "stat", grants: { skill: "Block" }, roll: { id: "r2", via: "site" } }]);
  assert.deepEqual(blocker.extraSkills, [{ name: "Block", access: "primary" }]);
  const passer = catcher(RICH);
  assert.deepEqual(takeAdvancement(human, rows[2], passer, { type: "stat", grant: { skill: "Pass" } }, skillGroups), { applied: true, cost: 14, value: 40 });
  assert.equal(passer.advancements[0].type, "stat");
  assert.deepEqual(passer.extraSkills, [{ name: "Pass", access: "secondary" }]);

  const faster = catcher(RICH);
  assert.deepEqual(takeAdvancement(human, rows[2], faster, { type: "stat", grant: { stat: "ma" }, roll: TABLE }, skillGroups), { applied: true, cost: 14, value: 30 });
  assert.deepEqual([faster.statMods, faster.advancements], [{ ma: 1 }, [{ type: "stat", grants: { stat: "ma" }, roll: { via: "table" } }]]);
  const healed = catcher(RICH, [], { statMods: { ma: -1 }, injuryStatMods: { ma: -1 } });
  assert.equal(takeAdvancement(human, rows[2], healed, { type: "stat", grant: { stat: "ma" } }, skillGroups).value, 30, "a raise over an injury is paid for");
});

test("an elite combination brought together by an advancement adds 15k", () => {
  const blocker = player(3, RICH);
  assert.deepEqual(takeAdvancement(amazon, jaguar, blocker, { type: "primary", grant: { skill: "Guard" } }, skillGroups), { applied: true, cost: 6, value: 35 });
  assert.deepEqual(takeAdvancement(amazon, jaguar, player(3, RICH), { type: "primary", grant: { skill: "Block" } }, skillGroups).value, 20);
});

test("refused before anything changes: SPP short, a skill he has, a category he has not, a characteristic at its limit", () => {
  const cases = [
    [catcher({ touchdowns: 1 }), { type: "secondary", grant: { skill: "Pass" } }, "ADVANCEMENT_NOT_ENOUGH_SPP"],
    [catcher({ touchdowns: 99 }, sixAdvancements), { type: "random", grant: { skill: "Frenzy" } }, "ADVANCEMENT_MAX_LEVEL"],
    [catcher(RICH), { type: "random", grant: { skill: "Catch" } }, "GRANT_NOT_AVAILABLE"],
    [catcher(RICH), { type: "primary", grant: { skill: "Pass" } }, "GRANT_NOT_AVAILABLE"],
    [catcher(RICH), { type: "stat", grant: { skill: "Claws" } }, "GRANT_NOT_AVAILABLE"],
    [catcher(RICH, [], { statMods: { ma: 1 } }), { type: "stat", grant: { stat: "ma" } }, "STAT_LIMIT"],
    [catcher(RICH, [], { statMods: { st: 2 } }), { type: "stat", grant: { stat: "st" } }, "STAT_GAINS"],
    [player(4, RICH), { type: "stat", grant: { stat: "pa" } }, "STAT_NONE", minotaur],
    [catcher(RICH), { type: "legend", grant: { skill: "Frenzy" } }, "GRANT_WRONG_KIND"],
    [catcher(RICH), { type: "random" }, "GRANT_WRONG_KIND"],
    [catcher(RICH), { type: "stat", grant: { stat: "xx" } }, "GRANT_WRONG_KIND"],
    [catcher(RICH), { type: "stat", grant: { stat: "ma", skill: "Block" } }, "GRANT_WRONG_KIND"],
    [catcher(RICH), { type: "random", grant: { skill: "Frenzy" }, roll: { via: "site" } }, "GRANT_WRONG_KIND"],
    [catcher(RICH), { type: "random", grant: { skill: "Frenzy" }, roll: { id: "r1", via: "dice" } }, "GRANT_WRONG_KIND"],
  ];
  for (const [subject, choice, code, row = rows[2]] of cases) {
    const before = structuredClone(subject), refused = takeAdvancement(human, row, subject, choice, skillGroups);
    assert.deepEqual([refused.applied, refused.code], [false, code], JSON.stringify(choice));
    assert.ok(refused.params && typeof refused.params === "object");
    assert.deepEqual(subject, before, `${code} changed nothing`);
  }
  assert.deepEqual(takeAdvancement(human, rows[2], catcher({ touchdowns: 1 }), { type: "secondary", grant: { skill: "Pass" } }, skillGroups),
    { applied: false, code: "ADVANCEMENT_NOT_ENOUGH_SPP", params: { cost: 10, available: 3, missing: 7, rank: "Experienced" } });
});

test("every code a choice is refused with is one the screen has words for (K9)", () => {
  const subjects = [catcher(RICH), catcher({ touchdowns: 1 }), catcher({ touchdowns: 99 }, sixAdvancements), catcher(RICH, [], { statMods: { ma: 1, st: 2 } })];
  const grants = [undefined, null, {}, "Block", { skill: "Block" }, { skill: "Catch" }, { skill: "Pass" }, { skill: "Claws" }, { skill: "Nope" },
    { stat: "xx" }, { stat: "ma", skill: "Block" }, ...PLAYER_STATS.map((stat) => ({ stat }))];
  const rolls = [undefined, null, SITE, TABLE, { via: "site" }, { id: "r1", via: "dice" }, "r1"];
  const codes = new Set();
  for (const type of [...ADVANCEMENT_TYPES, "legend", undefined]) {
    for (const grant of grants) {
      for (const roll of rolls) {
        for (const subject of subjects) {
          const copy = structuredClone(subject), result = takeAdvancement(human, rows[2], copy, { type, grant, roll }, skillGroups);
          if (result.applied) continue;
          codes.add(result.code);
          assert.deepEqual(copy, subject);
        }
      }
    }
  }
  assert.deepEqual(takeAdvancement(human, rows[2], catcher(RICH), null, skillGroups).code, "GRANT_WRONG_KIND");
  assert.deepEqual([...codes].filter((code) => !ADVANCE_REFUSALS.includes(code)), []);
  assert.deepEqual([...codes].sort(), ["ADVANCEMENT_MAX_LEVEL", "ADVANCEMENT_NOT_ENOUGH_SPP", "GRANT_NOT_AVAILABLE", "GRANT_WRONG_KIND", "STAT_GAINS", "STAT_LIMIT"],
    "the sweep meets every refusal a Catcher can; STAT_NONE is the Minotaur's, above");
});

test("the last advancement undone: what it granted goes, its SPP and its roll come back", () => {
  const rolled = catcher(RICH), available = advancementOffers(human, rows[2], rolled, skillGroups).available;
  takeAdvancement(human, rows[2], rolled, { type: "random", grant: { skill: "Frenzy" }, roll: SITE }, skillGroups);
  assert.deepEqual(undoLastAdvancement(rolled), { removed: true, index: 0, type: "random", grants: { skill: "Frenzy" }, roll: { id: "r1", via: "site" }, cost: 3 });
  assert.deepEqual([rolled.advancements, rolled.extraSkills], [[], []]);
  assert.equal(advancementOffers(human, rows[2], rolled, skillGroups).available, available);

  const faster = catcher(RICH);
  takeAdvancement(human, rows[2], faster, { type: "stat", grant: { stat: "ma" } }, skillGroups);
  assert.deepEqual(undoLastAdvancement(faster), { removed: true, index: 0, type: "stat", grants: { stat: "ma" }, roll: null, cost: 14 });
  assert.ok(!Object.hasOwn(faster.statMods, "ma"));

  const blocker = catcher(RICH);
  takeAdvancement(human, rows[2], blocker, { type: "primary", grant: { skill: "Sure Hands" } }, skillGroups);
  takeAdvancement(human, rows[2], blocker, { type: "stat", grant: { skill: "Block" } }, skillGroups);
  assert.deepEqual(undoLastAdvancement(blocker), { removed: true, index: 1, type: "stat", grants: { skill: "Block" }, roll: null, cost: 16 });
  assert.deepEqual(blocker.extraSkills, [{ name: "Sure Hands", access: "primary" }]);
  assert.deepEqual(undoLastAdvancement(catcher(RICH)), { removed: false });
});

test("a roll's table: sixteen faces, a column shorter than that blank on the rest", () => {
  const agility = skillFaces(column("Agility"));
  assert.deepEqual(agility.map(({ face }) => face), Array.from({ length: 16 }, (_, at) => at + 1));
  assert.deepEqual(agility[0], { face: 1, skill: "Catch" });
  assert.deepEqual(agility.slice(14), [{ face: 15, skill: null }, { face: 16, skill: null }]);
  assert.ok(skillFaces(column("General")).every(({ skill }) => skill !== null));
});

test("a site roll he can no longer take: a skill he has since, rerolls against a skill he has no more; the table advancement that gave the skill is found", () => {
  const frenzy = { purpose: "random_skill", result: { skill: "Frenzy", attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }] } };
  const holder = catcher(RICH, [], { extraSkills: [{ name: "Frenzy", access: "primary" }] });
  assert.deepEqual(rollRefusal(frenzy, rows[2], holder), { code: "ROLL_STALE", params: { skill: "Frenzy" } });
  assert.deepEqual(rollRefusal({ ...frenzy, stale: true }, rows[2], catcher(RICH)), { code: "ROLL_STALE", params: { skill: "Frenzy" } });
  assert.equal(rollRefusal(frenzy, rows[2], catcher(RICH)), null);
  const rerolled = { purpose: "random_skill", result: { skill: "Frenzy", attempts: [
    { roll: 1, skill: "Block", duplicate: true }, { roll: 16, skill: "Thick Skull", duplicate: false }, { roll: 1, skill: "Block", duplicate: true },
    { roll: 4, skill: "Frenzy", duplicate: false },
  ] } };
  assert.deepEqual(rollRefusal(rerolled, rows[2], catcher(RICH)), { code: "ROLL_REROLLED", params: { skills: "Block" } });
  assert.equal(rollRefusal(rerolled, rows[2], catcher(RICH, [], { extraSkills: [{ name: "Block", access: "primary" }] })), null);
  assert.equal(rollRefusal({ purpose: "stat", result: { roll: 3, stats: ["ar", "ma", "pa"] } }, rows[2], holder), null, "a D8 is never stale");

  const random = (skill, roll) => ({ type: "random", grants: { skill }, roll });
  assert.equal(tableAdvancementFor(frenzy, catcher(RICH, [{ type: "primary", grants: { skill: "Block" } }, random("Frenzy", TABLE)])), 1);
  assert.equal(tableAdvancementFor(frenzy, catcher(RICH, [random("Frenzy", SITE)])), -1, "taken with a site roll");
  assert.equal(tableAdvancementFor(frenzy, catcher(RICH, [{ type: "primary", grants: { skill: "Frenzy" } }])), -1, "chosen");
  assert.equal(tableAdvancementFor(frenzy, catcher(RICH, [random("Block", { id: "r0", via: "site" }), random("Frenzy", TABLE)])), 1,
    "after the last site advancement (K8)");
  assert.equal(tableAdvancementFor(frenzy, catcher(RICH, [random("Frenzy", TABLE), random("Block", { id: "r0", via: "site" })])), -1,
    "a site advancement after it: its roll would be used out of turn (K8)");
  assert.equal(tableAdvancementFor({ purpose: "stat", result: { roll: 3, stats: ["ma"] } }, catcher(RICH, [random("Frenzy", TABLE)])), -1);
  assert.equal(tableAdvancementFor({ purpose: "random_skill", result: { skill: "Mighty Blow" } }, player(5, RICH, { advancements: [random("Mighty Blow (+1)", TABLE)] })), 0,
    "by canonical name");
});

/** Seven Humans as the server stores them; the Catcher `p5` has 30 SPP. */
function storedRoster() {
  const players = [[0], [0], [0], [3], [2, { spp: RICH }], [1], [5]].map(([rowIndex, over = {}], n) => ({ id: `p${n + 1}`, rowIndex, number: String(n + 1), ...over }));
  return JSON.parse(JSON.stringify(checkRoster("teams/human", { teamSlug: "teams/human", teamName: "Iron Rooks", treasury: 120, players }).roster));
}

test("an advanced player as the server stores him is the player as sent, his roll named as the server reads it (Review Focus 1)", () => {
  const asStored = (draft) => sameValues(normalizeDraft(checkRoster("teams/human", draft).roster).players, normalizeDraft(rosterForStorage(draft)).players);
  const choices = [
    [{ type: "random", grant: { skill: "Frenzy" }, roll: SITE }, { purpose: "random_skill", result: { skill: "Frenzy" } }],
    [{ type: "primary", grant: { skill: "Block" } }, null],
    [{ type: "secondary", grant: { skill: "Pass" } }, null],
    [{ type: "stat", grant: { stat: "ma" }, roll: SITE }, { purpose: "stat", result: { roll: 3, stats: ["ar", "ma", "pa"] } }],
    [{ type: "stat", grant: { skill: "Block" }, roll: SITE }, { purpose: "stat", result: { roll: 1, stats: ["ar"] } }],
    [{ type: "random", grant: { skill: "Frenzy" }, roll: TABLE }, null],
  ];
  for (const [choice, roll] of choices) {
    const draft = storedRoster(), catcherOf = (roster) => roster.players.find(({ id }) => id === "p5");
    assert.equal(takeAdvancement(human, rows[2], catcherOf(draft), choice, skillGroups).applied, true, JSON.stringify(choice));
    assert.ok(asStored(draft), `${JSON.stringify(choice)} is stored as it was sent`);
    const stored = checkRoster("teams/human", draft).roster, references = siteRollReferences(stored);
    if (roll) {
      assert.deepEqual(references, [{ id: "r1", playerId: "p5", type: choice.type, grants: choice.grant }]);
      assert.equal(rollFitsAdvancement(roll, references[0]), true);
    } else {
      assert.deepEqual(references, []);
    }
    const again = JSON.parse(JSON.stringify(stored));
    assert.equal(undoLastAdvancement(catcherOf(again)).removed, true);
    assert.ok(asStored(again), `${JSON.stringify(choice)} undone is stored as it was sent`);
    assert.deepEqual(siteRollReferences(checkRoster("teams/human", again).roster), []);
    assert.ok(sameValues(catcherOf(again), catcherOf(storedRoster())), "undone, he is the player he was");
  }
});
