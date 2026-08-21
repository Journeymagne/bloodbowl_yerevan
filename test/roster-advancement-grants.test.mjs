import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  GRANT_BLOCKED,
  advancementGrantOptions,
  applyAdvancement,
  checkAdvancementGrant,
  playerAvailableSpp,
  playerLevelRank,
  removeAdvancement,
} from "../src/domain/roster/progression.mjs";
import { normalizePlayerAdvancements } from "../src/domain/roster/players.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { playerCurrentCost } from "../src/domain/roster/costs.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = JSON.parse(await fs.readFile(path.join(rootDir, "public", "data.json"), "utf8"));
const team = data.teams.find((item) => item.slug === "teams/amazon") ?? data.teams[0];
const skillGroups = data.skillGroups ?? [];
const row = rowsForTeam(team)[0];

/** A player with enough SPP to buy anything on the table. */
function richPlayer(extra = {}) {
  return {
    rowIndex: 0,
    statMods: {},
    extraSkills: [],
    favouredSkills: [],
    spp: { mvps: 20 },
    advancements: [],
    ...extra,
  };
}

// ---------------------------------------------------------------------------
// What a type may grant
// ---------------------------------------------------------------------------

test("random and primary draw from the same pool, and it is the primary one", () => {
  const player = richPlayer();
  const random = advancementGrantOptions(row, player, "random", skillGroups);
  const primary = advancementGrantOptions(row, player, "primary", skillGroups);
  // The advancement table calls random "Randomly Select a Primary Skill".
  assert.deepEqual(random, primary);
  assert.equal(random.kind, "skill");
  assert.ok(random.options.length > 0);
  assert.ok(random.options.every((option) => option.access === "primary"));
});

test("secondary draws from the secondary pool, and the two do not overlap", () => {
  const player = richPlayer();
  const primary = advancementGrantOptions(row, player, "primary", skillGroups);
  const secondary = advancementGrantOptions(row, player, "secondary", skillGroups);
  assert.ok(secondary.options.length > 0);
  assert.ok(secondary.options.every((option) => option.access === "secondary"));
  const primaryNames = new Set(primary.options.map((option) => option.skill));
  assert.ok(secondary.options.every((option) => !primaryNames.has(option.skill)));
});

test("a skill the player already has is not offered again", () => {
  const player = richPlayer();
  const first = advancementGrantOptions(row, player, "primary", skillGroups).options[0].skill;
  const withSkill = richPlayer({ extraSkills: [{ name: first, access: "primary" }] });
  const after = advancementGrantOptions(row, withSkill, "primary", skillGroups).options.map((o) => o.skill);
  assert.ok(!after.includes(first));
});

test("stat advancements offer the five characteristics with their values", () => {
  const { kind, options } = advancementGrantOptions(row, richPlayer(), "stat", skillGroups);
  assert.equal(kind, "stat");
  assert.deepEqual(options.map((o) => o.stat).sort(), ["ag", "ar", "ma", "pa", "st"]);
  assert.equal(options.find((o) => o.stat === "st").value, 50);
});

// ---------------------------------------------------------------------------
// Validating a chosen grant
// ---------------------------------------------------------------------------

test("a secondary skill cannot be taken as a primary advancement", () => {
  const player = richPlayer();
  const secondarySkill = advancementGrantOptions(row, player, "secondary", skillGroups).options[0].skill;
  const verdict = checkAdvancementGrant(row, player, "primary", { skill: secondarySkill }, skillGroups);
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.reason, GRANT_BLOCKED.NOT_AVAILABLE);
});

test("the kinds cannot be crossed", () => {
  const player = richPlayer();
  const skill = advancementGrantOptions(row, player, "primary", skillGroups).options[0].skill;
  assert.equal(checkAdvancementGrant(row, player, "stat", { skill }, skillGroups).reason, GRANT_BLOCKED.WRONG_KIND);
  assert.equal(checkAdvancementGrant(row, player, "primary", { stat: "ma" }, skillGroups).reason, GRANT_BLOCKED.WRONG_KIND);
});

test("an advancement with no grant is refused", () => {
  const verdict = checkAdvancementGrant(row, richPlayer(), "primary", null, skillGroups);
  assert.equal(verdict.reason, GRANT_BLOCKED.MISSING);
});

test("an invented stat is refused", () => {
  const verdict = checkAdvancementGrant(row, richPlayer(), "stat", { stat: "luck" }, skillGroups);
  assert.equal(verdict.reason, GRANT_BLOCKED.UNKNOWN_STAT);
});

// ---------------------------------------------------------------------------
// Taking one: the link the audit found missing
// ---------------------------------------------------------------------------

test("taking a skill advancement spends SPP, raises the rank and hands over the skill", () => {
  const player = richPlayer();
  const skill = advancementGrantOptions(row, player, "primary", skillGroups).options[0].skill;
  const sppBefore = playerAvailableSpp(team, player);
  const costBefore = playerCurrentCost(row, player, true);

  const result = applyAdvancement(team, row, player, "primary", { skill }, skillGroups);

  assert.equal(result.applied, true);
  assert.equal(playerLevelRank(player), "Experienced");
  assert.equal(playerAvailableSpp(team, player), sppBefore - result.cost);
  assert.ok(player.extraSkills.some((entry) => entry.name === skill), "the skill actually arrived");
  assert.ok(playerCurrentCost(row, player, true) > costBefore, "and the player is worth more for it");
  assert.deepEqual(normalizePlayerAdvancements(player.advancements), [{ type: "primary", grants: { skill } }]);
});

test("taking a stat advancement raises that characteristic by one", () => {
  const player = richPlayer();
  const result = applyAdvancement(team, row, player, "stat", { stat: "ma" }, skillGroups);
  assert.equal(result.applied, true);
  assert.equal(player.statMods.ma, 1);
  assert.deepEqual(normalizePlayerAdvancements(player.advancements), [{ type: "stat", grants: { stat: "ma" } }]);
});

test("an advancement the player cannot afford grants nothing", () => {
  const player = richPlayer({ spp: {} });
  const skill = advancementGrantOptions(row, player, "primary", skillGroups).options[0].skill;
  const result = applyAdvancement(team, row, player, "primary", { skill }, skillGroups);
  assert.equal(result.applied, false);
  assert.equal(player.extraSkills.length, 0, "no free skill for an unaffordable advancement");
  assert.equal(player.advancements.length, 0);
});

test("an illegal grant costs nothing either", () => {
  const player = richPlayer();
  const result = applyAdvancement(team, row, player, "primary", { skill: "Not A Skill" }, skillGroups);
  assert.equal(result.applied, false);
  assert.equal(player.extraSkills.length, 0);
  assert.equal(player.advancements.length, 0);
});

// ---------------------------------------------------------------------------
// Taking one back
// ---------------------------------------------------------------------------

test("removing an advancement takes back what it granted", () => {
  const player = richPlayer();
  const skill = advancementGrantOptions(row, player, "primary", skillGroups).options[0].skill;
  applyAdvancement(team, row, player, "primary", { skill }, skillGroups);
  applyAdvancement(team, row, player, "stat", { stat: "ag" }, skillGroups);

  removeAdvancement(player, 1);
  assert.equal(player.statMods.ag, undefined, "the characteristic goes back down");
  assert.ok(player.extraSkills.some((entry) => entry.name === skill), "the other grant is untouched");

  removeAdvancement(player, 0);
  assert.equal(player.extraSkills.length, 0);
  assert.equal(player.advancements.length, 0);
  assert.equal(playerLevelRank(player), "Rookie");
});

test("an advancement saved before grants existed only returns its SPP", () => {
  // Every advancement stored before this link was added is a bare { type }.
  // Whatever skill it may have paid for cannot be told apart from a freely
  // added one, so it stays put.
  const player = richPlayer({
    advancements: [{ type: "primary" }],
    extraSkills: [{ name: "Block", access: "primary" }],
  });
  const result = removeAdvancement(player, 0);
  assert.equal(result.removed, true);
  assert.equal(result.grants, null);
  assert.deepEqual(player.extraSkills, [{ name: "Block", access: "primary" }]);
  assert.equal(player.advancements.length, 0);
});

test("normalisation keeps a grant and drops a malformed one", () => {
  const kept = normalizePlayerAdvancements([
    { type: "primary", grants: { skill: "Block" } },
    { type: "stat", grants: { stat: "MA" } },
    { type: "primary", grants: { skill: "Block", stat: "ma" } },
    { type: "stat", grants: { stat: "luck" } },
    { type: "random" },
  ]);
  assert.deepEqual(kept, [
    { type: "primary", grants: { skill: "Block" } },
    { type: "stat", grants: { stat: "ma" } },
    { type: "primary" },
    { type: "stat" },
    { type: "random" },
  ]);
});
