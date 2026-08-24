/**
 * What a roster costs: player prices with their surcharges, staff, and the
 * treasury bookkeeping behind buying and refunding staff.
 *
 * Two economies meet here (design spec section 5.2): the builder spends a
 * fixed starting budget, a saved roster spends its treasury. They are the same
 * money at different times — whatever the builder leaves unspent becomes the
 * new team's treasury when it is saved, so `remaining` is what the coach
 * carries forward, not a number that stops mattering at creation.
 *
 * calculateRosterCosts() serves both, so `remaining` is computed for an
 * in-season team too. Nothing displays it there: once the team exists the
 * treasury is the live figure and the starting budget is history.
 */
import {
  advancementStatCosts,
  builderStaffCosts,
  builderStaffMaximums,
  eliteComboCost as eliteComboSurcharge,
  eliteSkillCombos,
  extendedContractCost,
  medicalStaffDefinitions,
  skillCosts,
  startingBudget,
} from "../league-rules.mjs";
import { clamp, costToNumber, countToNumber, rowCost } from "./values.mjs";
import { availableMedicalStaffDefinitions, hasBribery } from "./team-rules.mjs";
import { normalizePlayerExtraSkills, selectedRosterPlayers } from "./players.mjs";

export function statModCost(stat, mod = 0) {
  return (advancementStatCosts[stat] ?? 0) * Math.max(0, mod);
}

export function skillModCost(skill) {
  if (skill?.access === "favoured") return skillCosts.favoured;
  return skill?.access === "secondary" ? skillCosts.secondary : skillCosts.primary;
}

/**
 * The +15k an elite combination is worth once it comes together.
 *
 * The rule, confirmed by the league owner on 2026-08-21: the surcharge is for
 * a combination that was *assembled* through advancement. Whether both halves
 * were advanced or one was there from the start does not matter — what matters
 * is that a position which already has the pair at creation never pays for it.
 * Gnome linemen (Wrestle + Evasive) and the Khorne Bloodspawn (Claws + Mighty
 * Blow) are the live examples.
 *
 * Hence `some`, not `every`: one advanced half is enough to say the pair was
 * assembled, and none means it was always there. Locked in by
 * test/roster-elite-combos.test.mjs.
 */
export function eliteComboCost(row, player) {
  const baseSkills = new Set(row.skills ?? []);
  const advancedSkills = new Set(normalizePlayerExtraSkills(row, player.extraSkills ?? []).map((skill) => skill.name));
  const allSkills = new Set([...baseSkills, ...advancedSkills]);

  return eliteSkillCombos.reduce((sum, combo) => {
    const hasCombo = combo.every((skill) => allSkills.has(skill));
    const comboAdvanced = combo.some((skill) => advancedSkills.has(skill));
    return hasCombo && comboAdvanced ? sum + eliteComboSurcharge : sum;
  }, 0);
}

/**
 * What a player is worth above their position's list price: bought skills,
 * raised characteristics, extended contracts and any elite combination.
 *
 * `row` is a parameter rather than `player.row` so this works on a raw draft
 * player, which only carries `rowIndex`. It used to read `player.row` while
 * `playerCurrentCost` right below took `row` as an argument, so the pair only
 * worked on the copy `rosterPlayerView` hands out and threw on anything else.
 */
export function playerAdjustmentCost(row, player) {
  const skillCost = normalizePlayerExtraSkills(row, player.extraSkills ?? []).reduce((sum, skill) => sum + skillModCost(skill), 0);
  const statCost = Object.entries(player.statMods ?? {}).reduce((sum, [stat, mod]) => sum + statModCost(stat, Number(mod) || 0), 0);
  const contractCost = countToNumber(player.extendedContracts) * extendedContractCost;
  return skillCost + statCost + contractCost + eliteComboCost(row, player);
}

export function playerCurrentCost(row, player, includeAdjustments = true) {
  return costToNumber(rowCost(row)) + (includeAdjustments ? playerAdjustmentCost(row, player) : 0);
}

export function syncMedicalStaffForTeam(team, draft) {
  if (!hasBribery(team)) {
    draft.bribes = 0;
    if (draft.purchasedStaff) draft.purchasedStaff.bribes = 0;
  } else {
    draft.bribes = clamp(countToNumber(draft.bribes), 0, builderStaffMaximums.bribes);
  }

  const availableKeys = new Set(availableMedicalStaffDefinitions(team).map((staff) => staff.key));
  medicalStaffDefinitions.forEach((staff) => {
    if (!availableKeys.has(staff.key)) {
      draft[staff.key] = 0;
      if (draft.purchasedStaff) draft.purchasedStaff[staff.key] = 0;
      return;
    }
    draft[staff.key] = clamp(countToNumber(draft[staff.key]), 0, builderStaffMaximums[staff.key] ?? 1);
  });
}

export function staffItemCost(draft, key) {
  return countToNumber(draft[key]) * (builderStaffCosts[key] ?? 0);
}

export function spendTreasury(draft, amount) {
  const cost = countToNumber(amount);
  if (!cost) return;
  draft.treasury = countToNumber(draft.treasury) - cost;
}

export function refundTreasury(draft, amount) {
  const value = countToNumber(amount);
  if (!value) return;
  draft.treasury = countToNumber(draft.treasury) + value;
}

export function markStaffPurchased(draft, key, delta) {
  draft.purchasedStaff ??= {};
  draft.purchasedStaff[key] = Math.max(0, countToNumber(draft.purchasedStaff[key]) + delta);
}

export function applyPaidStaffChange(draft, key, previous, next) {
  if (key === "dedicatedFans") return;
  const difference = next - previous;
  const unitCost = builderStaffCosts[key] ?? 0;
  if (!difference || !unitCost) return;

  if (difference > 0) {
    spendTreasury(draft, unitCost * difference);
    markStaffPurchased(draft, key, difference);
    return;
  }

  const refundable = Math.min(Math.abs(difference), countToNumber(draft.purchasedStaff?.[key]));
  if (refundable > 0) {
    refundTreasury(draft, unitCost * refundable);
    markStaffPurchased(draft, key, -refundable);
  }
}

/**
 * A player sitting out the next game counts for neither the squad size nor the
 * team's value. Confirmed intentional by the league owner on 2026-08-21 —
 * question 2 of the design spec's section 13, which had it flagged as a
 * probable bug.
 */
export function calculateRosterCosts(team, draft, options = {}) {
  const includeDedicatedFans = Boolean(options.includeDedicatedFans);
  const players = selectedRosterPlayers(team, draft);
  const playersCount = players.filter((player) => !player.skipNextGame).length;
  const playersCost = players.reduce((sum, player) => {
    if (player.skipNextGame) return sum;
    return sum + playerCurrentCost(player.row, player, true);
  }, 0);
  const staffCost = staffItemCost(draft, "startingRerolls")
    + staffItemCost(draft, "teamRerolls")
    + (hasBribery(team) ? staffItemCost(draft, "bribes") : 0)
    + (includeDedicatedFans ? staffItemCost(draft, "dedicatedFans") : 0)
    + staffItemCost(draft, "assistantCoaches")
    + staffItemCost(draft, "cheerleaders")
    + medicalStaffDefinitions.reduce((sum, staff) => sum + staffItemCost(draft, staff.key), 0);
  const total = playersCost + staffCost;
  return {
    playersCount,
    totalPlayersCount: players.length,
    playersCost,
    staffCost,
    rerollCost: staffCost,
    total,
    remaining: startingBudget - total,
  };
}
