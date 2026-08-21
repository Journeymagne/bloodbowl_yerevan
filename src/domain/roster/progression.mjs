/**
 * Star Player Points and advancements.
 *
 * SPP values depend on the team's special rules: Brawlin' Brutes score
 * touchdowns for less and casualties for more, Passing Virtuosos also earn from
 * catches.
 */
import { advancementRanks, advancementStatCosts } from "../league-rules.mjs";
import { teamHasSpecialRule } from "./team-rules.mjs";
import { normalizePlayerAdvancements, normalizeSppCounters, selectedRosterPlayers, skillNamesForPlayer } from "./players.mjs";
import { categoriesForAccess } from "./values.mjs";

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

// ---------------------------------------------------------------------------
// Linking an advancement to what it grants
// ---------------------------------------------------------------------------

/**
 * Which skill access an advancement type draws from.
 *
 * Straight from the league's own advancement table in
 * content/Gata/General Information/Player Advancement.md: "Randomly Select a
 * Primary Skill", "Choose a Primary Skill", "Choose a Secondary Skill",
 * "Characteristic Improvement". Random is a primary skill too — it is cheaper
 * because it is rolled, not chosen.
 */
const GRANT_ACCESS_BY_TYPE = Object.freeze({
  random: "primary",
  primary: "primary",
  secondary: "secondary",
});

export const GRANT_BLOCKED = Object.freeze({
  MISSING: "GRANT_MISSING",
  WRONG_KIND: "GRANT_WRONG_KIND",
  NOT_AVAILABLE: "GRANT_NOT_AVAILABLE",
  UNKNOWN_STAT: "GRANT_UNKNOWN_STAT",
});

/**
 * What an advancement of this type may grant to this player right now.
 *
 * Pure: the skill catalogue comes in as an argument rather than off global
 * state, so the domain layer stays testable in Node.
 *
 * @param {object} row the player's position row
 * @param {object} player
 * @param {string} type random | primary | secondary | stat
 * @param {Array<{category: string, skills: string[]}>} skillGroups
 * @returns {{kind: "skill"|"stat", options: object[]}}
 */
export function advancementGrantOptions(row, player, type, skillGroups = []) {
  if (type === "stat") {
    return {
      kind: "stat",
      options: Object.entries(advancementStatCosts).map(([stat, value]) => ({ stat, value })),
    };
  }

  const access = GRANT_ACCESS_BY_TYPE[type];
  if (!access) return { kind: "skill", options: [] };

  const held = new Set(skillNamesForPlayer(row, player));
  const categories = categoriesForAccess(access === "primary" ? row.primary ?? [] : row.secondary ?? []);
  const options = [];
  for (const group of skillGroups) {
    if (!categories.includes(group.category)) continue;
    for (const name of group.skills ?? []) {
      if (!held.has(name)) options.push({ skill: name, access, category: group.category });
    }
  }
  return { kind: "skill", options: options.sort((a, b) => a.skill.localeCompare(b.skill, "en")) };
}

/**
 * Is this grant a legal thing for an advancement of `type` to hand out?
 *
 * Separate from canTakeAdvancement so the interface can validate a choice the
 * moment it is made, without re-checking SPP.
 */
export function checkAdvancementGrant(row, player, type, grant, skillGroups = []) {
  if (!grant || typeof grant !== "object") {
    return { allowed: false, reason: GRANT_BLOCKED.MISSING, params: { type } };
  }

  const { kind, options } = advancementGrantOptions(row, player, type, skillGroups);

  if (kind === "stat") {
    if (!grant.stat || grant.skill) {
      return { allowed: false, reason: GRANT_BLOCKED.WRONG_KIND, params: { type, expected: "stat" } };
    }
    if (!Object.hasOwn(advancementStatCosts, grant.stat)) {
      return { allowed: false, reason: GRANT_BLOCKED.UNKNOWN_STAT, params: { stat: grant.stat } };
    }
    return { allowed: true };
  }

  if (!grant.skill || grant.stat) {
    return { allowed: false, reason: GRANT_BLOCKED.WRONG_KIND, params: { type, expected: "skill" } };
  }
  const match = options.find((option) => option.skill === grant.skill);
  if (!match) {
    return {
      allowed: false,
      reason: GRANT_BLOCKED.NOT_AVAILABLE,
      params: { skill: grant.skill, access: GRANT_ACCESS_BY_TYPE[type] ?? "" },
    };
  }
  return { allowed: true, access: match.access };
}

/**
 * Take an advancement and apply what it grants, in one step.
 *
 * This is the link the audit's section 5.6 found missing: spending SPP used to
 * raise a rank and hand out nothing, while skills and stats were added
 * separately and for free. Mutates `player` and returns what happened.
 *
 * `row` is passed in rather than read off the player: callers mutate the raw
 * draft player, which carries only `rowIndex`, while `rosterPlayerView` hands
 * out a copy with `row` attached that would not persist.
 *
 * @returns {{applied: boolean, reason?: string, params?: object, cost?: number}}
 */
export function applyAdvancement(team, row, player, type, grant, skillGroups = []) {
  const affordable = canTakeAdvancement(team, player, type);
  if (!affordable.allowed) return { applied: false, reason: affordable.reason, params: affordable.params };

  const legal = checkAdvancementGrant(row, player, type, grant, skillGroups);
  if (!legal.allowed) return { applied: false, reason: legal.reason, params: legal.params };

  if (grant.stat) {
    player.statMods = { ...(player.statMods ?? {}) };
    player.statMods[grant.stat] = (Number(player.statMods[grant.stat]) || 0) + 1;
    player.advancements = [...normalizePlayerAdvancements(player.advancements), { type, grants: { stat: grant.stat } }];
    return { applied: true, cost: affordable.cost };
  }

  player.extraSkills = [...(player.extraSkills ?? []), { name: grant.skill, access: legal.access }];
  player.advancements = [...normalizePlayerAdvancements(player.advancements), { type, grants: { skill: grant.skill } }];
  return { applied: true, cost: affordable.cost };
}

/**
 * Undo the advancement at `index`, taking back whatever it granted.
 *
 * An advancement saved before grants existed has nothing to take back, so only
 * the SPP is returned — the skill or stat it may have paid for is
 * indistinguishable from a freely added one and stays put.
 */
export function removeAdvancement(player, index) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  const advancement = advancements[index];
  if (!advancement) return { removed: false };

  if (advancement.grants?.stat) {
    const stat = advancement.grants.stat;
    const next = { ...(player.statMods ?? {}) };
    next[stat] = (Number(next[stat]) || 0) - 1;
    if (!next[stat]) delete next[stat];
    player.statMods = next;
  } else if (advancement.grants?.skill) {
    player.extraSkills = (player.extraSkills ?? []).filter((skill) => skill?.name !== advancement.grants.skill);
  }

  player.advancements = advancements.filter((_, position) => position !== index);
  return { removed: true, grants: advancement.grants ?? null };
}
