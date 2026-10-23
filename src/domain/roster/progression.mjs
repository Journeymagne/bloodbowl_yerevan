/**
 * Star Player Points and advancements.
 *
 * SPP values depend on the team's special rules: Brawlin' Brutes score
 * touchdowns for less and casualties for more, Passing Virtuosos also earn from
 * catches.
 *
 * Taking an advancement as a coach does on the roster (stage 07d): what each
 * type costs him now on the roster's own SPP, the categories it draws from, the
 * characteristic's limits, and the choice applied the way the server stores it
 * — with the roll it names, which the server holds the save to
 * (`settleRosterRolls`). The post-match asks the same limits
 * (`statIncreaseRefusal`).
 */
import { advancementRanks, advancementStatCosts, skillCosts } from "../league-rules.mjs";
import { teamHasSpecialRule } from "./team-rules.mjs";
import { canonicalSkillName, heldSkillKeys, normalizePlayerAdvancements, normalizeSppCounters, selectedRosterPlayers } from "./players.mjs";
import { categoriesForAccess, statValueForDisplayByStat } from "./values.mjs";
import { eliteComboCost, playerCurrentCost } from "./costs.mjs";
import { statsForRoll } from "./dice.mjs";

export function sppCounterWeights(team) {
  const hasBrawlinBrutes = teamHasSpecialRule(team, "Brawlin' Brutes");
  const hasPassingVirtuosos = teamHasSpecialRule(team, "Passing Virtuosos");
  const touchdownValue = hasBrawlinBrutes || hasPassingVirtuosos ? 2 : 3;
  const casualtyValue = hasBrawlinBrutes ? 3 : 2;
  return { touchdowns: touchdownValue, casualties: casualtyValue, knockouts: 1,
    completions: 1, catches: hasPassingVirtuosos ? 1 : 0, interceptions: 2, throws: 1, landings: 1, bonus: 1, mvps: 5 };
}

export function playerSppTotal(team, player) {
  const spp = normalizeSppCounters(player.spp);
  return Object.entries(sppCounterWeights(team)).reduce((total, [key, value]) => total + spp[key] * value, 0);
}

export function playerAdvancementLevel(player) {
  return normalizePlayerAdvancements(player.advancements).length;
}

/**
 * What an advancement of `type` costs, in SPP, as the player's `index`-th (0 for his first): the league's table by rank
 * (Experienced to Legend), and 0 off it — past the last rank, or for a type the table does not price. The one lookup of
 * that table (stage 13): what a player spent, what the next costs, what an undo gives back, what the roster shows.
 * @param {number} index @param {string} type @returns {number}
 */
export function advancementCostAt(index, type) {
  return advancementRanks[index]?.costs?.[type] ?? 0;
}

export function playerAdvancementSpent(player) {
  return normalizePlayerAdvancements(player.advancements)
    .reduce((sum, advancement, index) => sum + advancementCostAt(index, advancement.type), 0);
}

export function playerAvailableSpp(team, player) {
  return playerSppTotal(team, player) - playerAdvancementSpent(player);
}

// No screen reads this or rosterTotalSpp since the 2.x roster editor went (stage 12): they stay because the pinned
// roster-cases baseline describes every case with them (test/helpers/roster-cases.mjs).
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
  const level = playerAdvancementLevel(player);
  const rank = advancementRanks[level];

  if (!rank) {
    return { allowed: false, cost: 0, available, reason: ADVANCEMENT_BLOCKED.MAX_LEVEL, params: {} };
  }

  const cost = advancementCostAt(level, type);
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

  const held = heldSkillKeys(row, player);
  const categories = categoriesForAccess(access === "primary" ? row.primary ?? [] : row.secondary ?? []);
  const options = [];
  for (const group of skillGroups) {
    if (!categories.includes(group.category)) continue;
    for (const name of group.skills ?? []) {
      if (!held.has(canonicalSkillName(name))) options.push({ skill: name, access, category: group.category });
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
 * Undo the advancement at `index`, taking back whatever it granted, and the
 * god's skill its D8 brought (`favoured`, `tieFavoured`) with it — one god's
 * skill per advancement (content «Team Management», «Favoured of…»), so an
 * advancement taken again rolls its own D8 for a player without it.
 *
 * An advancement saved before grants existed has nothing to take back, so only
 * the SPP is returned — the skill or stat it may have paid for is
 * indistinguishable from a freely added one and stays put. So does a god's
 * skill no advancement names (2.x's, or one added by hand).
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
  const favoured = tiedFavoured(player, advancement);
  if (favoured) player.favouredSkills = (player.favouredSkills ?? []).filter((skill) => favouredName(skill) !== favoured);

  player.advancements = advancements.filter((_, position) => position !== index);
  return { removed: true, grants: advancement.grants ?? null, ...(favoured ? { favoured } : {}) };
}

const favouredName = (skill) => (typeof skill === "string" ? skill : skill?.name);

/**
 * Untie, in place, every advancement of the player tied to one of `names` (`favoured`): a god's skill taken off by hand,
 * or added by hand, is no advancement's to take back. An advancement tied to none of them is left as it is.
 * @param {object} player @param {Set<string>} names
 */
export function untieFavoured(player, names) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  if (!advancements.some(({ favoured }) => names.has(favoured))) return;
  player.advancements = advancements.map(({ favoured, ...advancement }) => (favoured && !names.has(favoured) ? { ...advancement, favoured } : advancement));
}

/**
 * The god's skill tied to `advancement` (`favoured`) while the player still holds it as a favoured skill, else "": one
 * taken off by hand or by a change of god since is no longer the advancement's to take back, nor to say.
 */
export function tiedFavoured(player, advancement) {
  const name = advancement?.favoured;
  return name && (player?.favouredSkills ?? []).some((skill) => favouredName(skill) === name) ? name : "";
}

/**
 * Tie the god's skill `skill`, which the D8 of a roster «Favoured of…» brought with his last advancement, to that
 * advancement (`favoured`), in place: its undo takes the skill back (`removeAdvancement`). The roster's sheet and the
 * post-match's finish tie it the same.
 */
export function tieFavoured(player, skill) {
  const advancements = normalizePlayerAdvancements(player.advancements);
  if (!advancements.length || !skill) return;
  player.advancements = [...advancements.slice(0, -1), { ...advancements.at(-1), favoured: skill }];
}

// ---------------------------------------------------------------------------
// An advancement as the coach takes it on the roster (stage 07d)
// ---------------------------------------------------------------------------

/** The advancement types, in the order the prototype offers them. */
export const ADVANCEMENT_TYPES = Object.freeze(["random", "primary", "secondary", "stat"]);

/** How far a characteristic may go: MA 9, ST 8, AR 11+, AG and PA 1+. */
export const STAT_LIMITS = Object.freeze({ ma: 9, st: 8, ag: 1, pa: 1, ar: 11 });

/** How many +1s advancements may put on one characteristic; a lasting injury's −1 is not one of them. */
export const MAX_STAT_GAIN = 2;

/** The characteristics written as a target, where better is lower. */
export const TARGET_STATS = Object.freeze(["ag", "pa"]);

/** The types whose result is rolled, and so may name the roll. */
const ROLLED_TYPES = Object.freeze(["random", "stat"]);

/** Every code an advancement on the roster is refused with; the screen words each as `teamAdvance.refusal.<code>`. */
export const ADVANCE_REFUSALS = Object.freeze([
  "ADVANCEMENT_MAX_LEVEL", "ADVANCEMENT_NOT_ENOUGH_SPP", "NO_SKILL_LEFT", "GRANT_NOT_AVAILABLE", "GRANT_WRONG_KIND",
  "STAT_NONE", "STAT_LIMIT", "STAT_GAINS", "ROLL_STALE", "ROLL_REROLLED",
]);

/**
 * Why a characteristic cannot take one more +1, or null when it can. The order of the checks is the
 * post-match's (`validateStatIncrease`, which asks this): a characteristic the position has not (no digit
 * in it, the Minotaur's PA), then +2 already gained by advancements, then the value after the step past
 * its limit.
 *
 * @returns {null | {code: "STAT_NONE"|"STAT_GAINS"|"STAT_LIMIT", params: {stat: string, limit?: number, max?: number}}}
 */
export function statIncreaseRefusal(row, player, stat) {
  const mod = Number(player.statMods?.[stat] || 0), base = parseInt(row[stat], 10), target = TARGET_STATS.includes(stat);
  const value = target ? base - mod - 1 : base + mod + 1;
  if (!Number.isFinite(value)) return { code: "STAT_NONE", params: { stat } };
  if (mod - Number(player.injuryStatMods?.[stat] || 0) >= MAX_STAT_GAIN) return { code: "STAT_GAINS", params: { stat, max: MAX_STAT_GAIN } };
  const limit = STAT_LIMITS[stat];
  return (target ? value < limit : value > limit) ? { code: "STAT_LIMIT", params: { stat, limit } } : null;
}

/**
 * @typedef {{type: string, cost: number, value: number|null,
 *   categories: {category: string, access: "primary"|"secondary"}[],
 *   refusal: {code: string, params: object}|null}} AdvancementOffer
 *   `cost` is its price in SPP at his next rank (`canTakeAdvancement`), 0 past the last rank, where it is refused
 *   (`MAX_LEVEL`) and there is no next rank to price it at. `value` is what the advancement adds to his value, in
 *   thousands: a skill's by its access (`skillCosts`); a characteristic's depends on which one the D8 lets him improve,
 *   so it is null here (`statChoices` says it per face). `categories` are what it draws from (`advancementCategories`);
 *   `refusal` why it cannot be taken now, or null.
 */

/**
 * The advancements a player may take now, on his own SPP as the roster holds them: one offer per type, in
 * `ADVANCEMENT_TYPES` order, each at its price for his next rank, refused at the last rank, when he cannot
 * pay, or — for a skill — when no category of the type has a skill left he has not.
 *
 * @returns {{level: number, maxed: boolean, available: number, offers: AdvancementOffer[]}}
 */
export function advancementOffers(team, row, player, skillGroups = []) {
  const level = playerAdvancementLevel(player);
  const offers = ADVANCEMENT_TYPES.map((type) => {
    const affordable = canTakeAdvancement(team, player, type), categories = advancementCategories(row, type);
    // A skill he lacks in the type's categories: the grant's own options, without the elite combinations a list draws.
    const skillLeft = type === "stat" || advancementGrantOptions(row, player, type, skillGroups).options.length > 0;
    const refusal = !affordable.allowed ? { code: affordable.reason, params: affordable.params }
      : skillLeft ? null : { code: "NO_SKILL_LEFT", params: {} };
    const value = type === "stat" ? null : skillCosts[GRANT_ACCESS_BY_TYPE[type]];
    return { type, cost: affordable.cost, value, categories, refusal };
  });
  return { level, maxed: !advancementRanks[level], available: playerAvailableSpp(team, player), offers };
}

/**
 * The Skill Table categories an advancement of `type` draws from, with the access each is taken at: a
 * random or a chosen primary skill from the primary access, a secondary from the secondary. A
 * characteristic draws from none — unless a skill is taken `instead`, from both, the primary first.
 *
 * @returns {{category: string, access: "primary"|"secondary"}[]}
 */
export function advancementCategories(row, type, { instead = false } = {}) {
  const of = (access) => categoriesForAccess(row[access] ?? []).map((category) => ({ category, access }));
  if (type === "stat") return instead ? [...of("primary"), ...of("secondary")] : [];
  const access = GRANT_ACCESS_BY_TYPE[type];
  return access ? of(access) : [];
}

/**
 * A category's column of the Skill Table, in its order: whether the player holds each skill already
 * (`heldSkillKeys`, by canonical name), and whether taking it by an advancement would bring an elite
 * combination together (`eliteComboCost` would rise; it reads names canonically too, so Claws for a Rat Ogre
 * with «Mighty Blow (+1)» is marked, ruling E-1). A skill he holds cannot be taken, so it brings none.
 *
 * @returns {{name: string, held: boolean, elite: boolean}[]}
 */
export function categorySkills(row, player, category, skillGroups = []) {
  const held = heldSkillKeys(row, player), surcharge = eliteComboCost(row, player);
  return (skillGroups.find((group) => group.category === category)?.skills ?? []).map((name) => {
    const holds = held.has(canonicalSkillName(name));
    const taken = { ...player, extraSkills: [...(player.extraSkills ?? []), { name, access: "primary" }] };
    return { name, held: holds, elite: !holds && eliteComboCost(row, taken) > surcharge };
  });
}

/**
 * What a face of the D8 offers, in the table's order: each characteristic as it is written now and after
 * the +1, what the +1 adds to his value, and why it cannot be taken (`statIncreaseRefusal`).
 *
 * @returns {{stat: string, before: string, after: string, value: number, refusal: object|null}[]}
 */
export function statChoices(row, player, face) {
  return statsForRoll(face).map((stat) => {
    const mod = Number(player.statMods?.[stat]) || 0;
    const written = (step) => String(statValueForDisplayByStat(stat, row[stat] ?? "", mod + step));
    return { stat, before: written(0), after: written(1), value: advancementStatCosts[stat], refusal: statIncreaseRefusal(row, player, stat) };
  });
}

/**
 * @typedef {{type: string, grant: {skill: string}|{stat: string},
 *   roll?: {id: string, via: "site"}|{via: "table"}}} AdvancementChoice
 */

/**
 * Take an advancement the coach chose: its SPP, what it grants and the roll it names, in the shape the
 * server stores (`normalizeRosterPlayer`), so a save sent again after a lost answer reads as the same
 * roster. Mutates `player` only when it is applied.
 *
 * A characteristic advancement may grant a skill in its place, as the post-match lets it (`postPlayers`
 * takes each of its advancements here): at its own price, the skill at the first access that has it,
 * recorded as a characteristic. Only a random skill and a characteristic are rolled, so only they may
 * name a roll, and only as `{ id, via: "site" }` or `{ via: "table" }`. A refusal is always one of
 * `ADVANCE_REFUSALS`: a choice no screen makes — an unknown type, no grant, a characteristic there is
 * none of — is `GRANT_WRONG_KIND`.
 *
 * @param {AdvancementChoice} choice
 * @returns {{applied: true, cost: number, value: number} | {applied: false, code: string, params: object}}
 *   `cost` the SPP spent, `value` what it added to his value with any elite combination, in thousands
 */
export function takeAdvancement(team, row, player, choice, skillGroups = []) {
  const { type, grant } = choice ?? {}, roll = choiceRoll(choice?.roll);
  if (!ADVANCEMENT_TYPES.includes(type) || roll === null || (roll && !ROLLED_TYPES.includes(type))) {
    return advanceRefusal(GRANT_BLOCKED.WRONG_KIND, { type: String(type ?? "") });
  }
  const affordable = canTakeAdvancement(team, player, type);
  if (!affordable.allowed) return advanceRefusal(affordable.reason, affordable.params);
  const step = type === "stat" ? statStep(row, player, grant, skillGroups) : { type };
  if (step.refusal) return advanceRefusal(step.refusal.code, step.refusal.params);
  const before = playerCurrentCost(row, player);
  const result = applyAdvancement(team, row, player, step.type, grant, skillGroups);
  if (!result.applied) return advanceRefusal(result.reason, result.params);
  const taken = player.advancements.at(-1);
  player.advancements = [...player.advancements.slice(0, -1), { type, grants: taken.grants, ...(roll ? { roll } : {}) }];
  return { applied: true, cost: affordable.cost, value: playerCurrentCost(row, player) - before };
}

/**
 * The type a characteristic advancement is applied as: a skill in its place at the first access that has
 * it, else the characteristic, once it is one the player can raise.
 */
function statStep(row, player, grant, skillGroups) {
  if (grant?.skill && !grant.stat) {
    const access = ["primary", "secondary"].find((kind) => checkAdvancementGrant(row, player, kind, grant, skillGroups).allowed);
    return access ? { type: access } : { refusal: { code: GRANT_BLOCKED.NOT_AVAILABLE, params: { skill: grant.skill, access: "" } } };
  }
  const legal = checkAdvancementGrant(row, player, "stat", grant, skillGroups);
  if (!legal.allowed) return { refusal: { code: legal.reason, params: legal.params } };
  const limit = statIncreaseRefusal(row, player, grant.stat);
  return limit ? { refusal: limit } : { type: "stat" };
}

/**
 * A choice's roll as the advancement keeps it (`normalizeAdvancementRoll`): undefined for none, null for one that is
 * neither kind. The post-match keeps its choices' rolls so too (src/domain/post-match/state.mjs).
 */
export function choiceRoll(roll) {
  if (roll === undefined || roll === null) return undefined;
  if (roll?.via === "table") return { via: "table" };
  const id = typeof roll?.id === "string" ? roll.id.trim() : "";
  return roll?.via === "site" && id ? { id, via: "site" } : null;
}

/** A refusal in `ADVANCE_REFUSALS`: a domain code the screen has no words for is a choice of the wrong kind. */
function advanceRefusal(code, params) {
  return { applied: false, code: ADVANCE_REFUSALS.includes(code) ? code : GRANT_BLOCKED.WRONG_KIND, params: params ?? {} };
}

/**
 * Undo the player's last advancement (`removeAdvancement`): what it granted goes — the god's skill its D8 brought
 * too, said as `favoured` — and what it cost at its rank comes back to his SPP. Its roll is said, so the caller knows
 * the server frees it with the save.
 *
 * @returns {{removed: false} | {removed: true, index: number, type: string, grants: object|null, roll: object|null, favoured?: string, cost: number}}
 */
export function undoLastAdvancement(player) {
  const advancements = normalizePlayerAdvancements(player.advancements), index = advancements.length - 1;
  if (index < 0) return { removed: false };
  const { type, grants = null, roll = null } = advancements[index], { favoured } = removeAdvancement(player, index);
  return { removed: true, index, type, grants, roll, ...(favoured ? { favoured } : {}), cost: advancementCostAt(index, type) };
}
