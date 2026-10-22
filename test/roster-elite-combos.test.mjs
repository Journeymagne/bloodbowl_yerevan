import test from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { eliteComboCost, playerAdjustmentCost } from "../src/domain/roster/costs.mjs";
import { eliteSkillCombos } from "../src/domain/league-rules.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const data = expandCollections(JSON.parse(await fs.readFile(path.join(rootDir, "public", "data.json"), "utf8")));
const SURCHARGE = 15;

function positionOf(teamTitle, position) {
  const team = data.teams.find((item) => item.title === teamTitle);
  return rowsForTeam(team).find((row) => row.position === position);
}

function skills(...names) {
  return { extraSkills: names.map((name) => ({ name, access: "primary" })), statMods: {} };
}

// ---------------------------------------------------------------------------
// The rule, as the league owner stated it on 2026-08-21:
//
//   The surcharge is for an elite combination that came together through
//   advancement. It does not matter whether both skills were advanced or one
//   was there from the start — what matters is that a player who already has
//   the combination at creation does not get +15k for it.
// ---------------------------------------------------------------------------

test("a combination the position starts with costs nothing extra", () => {
  // Real cases in the current data, not invented ones.
  const gnome = positionOf("Gnome", "Gnome Lineman");
  assert.ok(["Wrestle", "Evasive"].every((skill) => gnome.skills.includes(skill)));
  assert.equal(eliteComboCost(gnome, skills()), 0);

  const bloodspawn = positionOf("Khorne", "Bloodspawn");
  assert.ok(["Claws", "Mighty Blow"].every((skill) => bloodspawn.skills.includes(skill)));
  assert.equal(eliteComboCost(bloodspawn, skills()), 0);
});

test("a combination completed by advancement costs the surcharge", () => {
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  assert.equal(eliteComboCost(linewoman, skills("Claws", "Mighty Blow")), SURCHARGE);
});

test("it does not matter that only one half was advanced", () => {
  // The Amazon linewoman starts with Evasive; adding Wrestle completes
  // Wrestle + Evasive, and the combination did come together by advancement.
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  assert.ok(linewoman.skills.includes("Evasive"));
  assert.equal(eliteComboCost(linewoman, skills("Wrestle")), SURCHARGE);
});

test("half a combination is not a combination", () => {
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  assert.equal(eliteComboCost(linewoman, skills("Claws")), 0);
});

test("a starting combination stays free even when another is advanced into", () => {
  // The gnome already has Wrestle + Evasive for nothing, then advances into
  // Claws + Mighty Blow. Exactly one surcharge is owed.
  const gnome = positionOf("Gnome", "Gnome Lineman");
  assert.equal(eliteComboCost(gnome, skills("Claws", "Mighty Blow")), SURCHARGE);
});

test("every combination in the rules behaves the same way", () => {
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  for (const combo of eliteSkillCombos) {
    const owned = combo.filter((skill) => !linewoman.skills.includes(skill));
    assert.equal(eliteComboCost(linewoman, skills(...owned)), SURCHARGE, combo.join(" + "));
  }
});

test("the surcharge reaches the player's value through playerAdjustmentCost", () => {
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  const withCombo = playerAdjustmentCost(linewoman, skills("Claws", "Mighty Blow"));
  const withoutCombo = playerAdjustmentCost(linewoman, skills("Claws"));
  const secondSkillCost = 20; // both are primary-access for this position
  assert.equal(withCombo - withoutCombo, secondSkillCost + SURCHARGE);
});

test("playerAdjustmentCost works on a raw draft player, not just a view", () => {
  // It used to read player.row and threw on anything that only carried
  // rowIndex, which is what the draft actually stores.
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  const rawDraftPlayer = { rowIndex: 0, extraSkills: [], statMods: { ma: 1 }, spp: {}, advancements: [] };
  assert.equal(playerAdjustmentCost(linewoman, rawDraftPlayer), 30);
});

// Stage 13, ruling E-1 (house rules decide): the content lists «Claws + Mighty Blow», and a position's «Mighty Blow (+1)»
// is the Mighty Blow of that pair — its own page says so, and the reference's skill panel names the pair for it. The
// Skaven Rat Ogre starts with Mighty Blow (+1) and may take Claws (secondary M): the pair comes together by advancement.
test("a skill with its figure is the skill of its pair: Rat Ogre's Mighty Blow (+1) and Claws pay the surcharge, and the advancement says so", async () => {
  const { categorySkills } = await import("../src/domain/roster/progression.mjs");
  const ratOgre = positionOf("Skaven", "Rat Ogre");
  assert.ok(ratOgre.skills.includes("Mighty Blow (+1)") && !ratOgre.skills.includes("Mighty Blow"), "the data names it with its figure");
  assert.equal(eliteComboCost(ratOgre, skills()), 0, "half a pair from the start is no pair");
  assert.equal(eliteComboCost(ratOgre, skills("Claws")), SURCHARGE, "Claws advanced completes Claws + Mighty Blow");
  assert.equal(playerAdjustmentCost(ratOgre, skills("Claws")) - playerAdjustmentCost(ratOgre, skills()), 20 + SURCHARGE, "the player's value takes the +15k");
  // The advancement's Skill Table marks Claws as the skill that brings the pair together, as it does a plain Mighty Blow's.
  const mutation = categorySkills(ratOgre, skills(), "Mutation", data.skillGroups);
  assert.equal(mutation.find((skill) => skill.name === "Claws")?.elite, true);
  assert.ok(mutation.filter((skill) => skill.name !== "Claws").every((skill) => !skill.elite), "nothing else of Mutation completes a pair");
  // The other way round: a Claws position advancing a Mighty Blow named with its figure.
  const linewoman = positionOf("Amazon", "Eagle Warrior Linewoman");
  assert.equal(eliteComboCost(linewoman, skills("Claws", "Mighty Blow (+1)")), SURCHARGE);
});
