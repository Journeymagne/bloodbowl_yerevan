/**
 * Star Player Points and advancements.
 *
 * SPP values depend on the team's special rules: Brawlin' Brutes score
 * touchdowns for less and casualties for more, Passing Virtuosos also earn from
 * catches.
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


export function rosterTotalSpp(team, draft) {
  return selectedRosterPlayers(team, draft).reduce((sum, player) => sum + playerSppTotal(team, player), 0);
}

export const ADVANCEMENT_BLOCKED = Object.freeze({
  MAX_LEVEL: "ADVANCEMENT_MAX_LEVEL",
  UNKNOWN_TYPE: "ADVANCEMENT_UNKNOWN_TYPE",
  NOT_ENOUGH_SPP: "ADVANCEMENT_NOT_ENOUGH_SPP",
});

/**
 * May this player take an advancement of `type` right now?
 *
 * Until this existed the interface only checked that the cost was non-zero, so
 * a player could keep taking advancements until their available SPP went
 * negative.
 *
 * @returns {{allowed: boolean, cost: number, available: number, reason?: string, params?: object}}
 */
export function canTakeAdvancement(team, player, type) {
  const available = playerAvailableSpp(team, player);
  const rank = advancementRanks[playerAdvancementLevel(player)];

  if (!rank) {
    return { allowed: false, cost: 0, available, reason: ADVANCEMENT_BLOCKED.MAX_LEVEL, params: {} };
  }

  const cost = rank.costs?.[type];
  if (!cost) {
    return { allowed: false, cost: 0, available, reason: ADVANCEMENT_BLOCKED.UNKNOWN_TYPE, params: { type } };
  }

  if (cost > available) {
    return {
      allowed: false,
      cost,
      available,
      reason: ADVANCEMENT_BLOCKED.NOT_ENOUGH_SPP,
      params: { cost, available, rank: rank.rank, missing: cost - available },
    };
  }

  return { allowed: true, cost, available };
}
