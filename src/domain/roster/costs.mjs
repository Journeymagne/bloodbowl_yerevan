/**
 * What a roster costs: player prices with their surcharges, staff, and the
 * treasury bookkeeping behind buying and refunding staff.
 *
 * Note the two different economies the app runs today (design spec section 5.2):
 * the builder enforces a hard budget while a saved roster spends from the
 * treasury. calculateRosterCosts() serves both, which is why `remaining` is
 * computed against the starting budget even for an in-season team.
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

export function playerAdjustmentCost(player) {
  const skillCost = normalizePlayerExtraSkills(player.row, player.extraSkills ?? []).reduce((sum, skill) => sum + skillModCost(skill), 0);
  const statCost = Object.entries(player.statMods ?? {}).reduce((sum, [stat, mod]) => sum + statModCost(stat, Number(mod) || 0), 0);
  const contractCost = countToNumber(player.extendedContracts) * extendedContractCost;
  return skillCost + statCost + contractCost + eliteComboCost(player.row, player);
}

export function playerCurrentCost(row, player, includeAdjustments = true) {
  return costToNumber(rowCost(row)) + (includeAdjustments ? playerAdjustmentCost(player) : 0);
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
