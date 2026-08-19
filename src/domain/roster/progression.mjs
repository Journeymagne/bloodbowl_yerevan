/**
 * Star Player Points and advancements.
 *
 * SPP values depend on the team's special rules: Brawlin' Brutes score
 * touchdowns for less and casualties for more, Passing Virtuosos also earn from
 * catches. Nothing here stops a player from overspending SPP — see the
 * canTakeAdvancement() item in task 3 of the refactor plan.
 */
import { advancementRanks } from "../league-rules.mjs";
import { teamHasSpecialRule } from "./team-rules.mjs";
import { normalizePlayerAdvancements, normalizeSppCounters, selectedRosterPlayers } from "./players.mjs";

export function playerSppTotal(team, player) {
  const spp = normalizeSppCounters(player.spp);
  const hasBrawlinBrutes = teamHasSpecialRule(team, "Brawlin' Brutes");
  const hasPassingVirtuosos = teamHasSpecialRule(team, "Passing Virtuosos");
  const touchdownValue = hasBrawlinBrutes || hasPassingVirtuosos ? 2 : 3;
  const casualtyValue = hasBrawlinBrutes ? 3 : 2;
  return (spp.touchdowns * touchdownValue)
    + (spp.casualties * casualtyValue)
    + spp.knockouts
    + spp.completions
    + (hasPassingVirtuosos ? spp.catches : 0)
    + (spp.interceptions * 2)
    + (spp.mvps * 5);
}

export function playerAdvancementLevel(player) {
  return normalizePlayerAdvancements(player.advancements).length;
}

export function playerAdvancementSpent(player) {
  return normalizePlayerAdvancements(player.advancements)
    .reduce((sum, advancement, index) => sum + (advancementRanks[index]?.costs?.[advancement.type] ?? 0), 0);
}

export function playerAvailableSpp(team, player) {
  return playerSppTotal(team, player) - playerAdvancementSpent(player);
}

export function playerLevelRank(player) {
  const level = playerAdvancementLevel(player);
  return level > 0 ? advancementRanks[level - 1]?.rank ?? "Legend" : "Rookie";
}

export function nextAdvancementCost(player, type) {
  const rank = advancementRanks[playerAdvancementLevel(player)];
  return rank?.costs?.[type] ?? 0;
}

export function rosterTotalSpp(team, draft) {
  return selectedRosterPlayers(team, draft).reduce((sum, player) => sum + playerSppTotal(team, player), 0);
}
