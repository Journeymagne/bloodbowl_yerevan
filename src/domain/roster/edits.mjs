/**
 * What a coach may change of a player on the roster (stage 07d): his number, his name and the captaincy; by hand,
 * what the 2.x editor let a coach put right — the Niggling Injuries, a lasting injury marked by mistake, a
 * characteristic, the extended contracts, the favoured skills and a skill no advancement gave; and the bonus skill a
 * god's favour brings with an advancement — each checked and applied the way the server stores it. What the roster
 * says of an edit a match took from the coach is counted here too (`playerEdits`).
 *
 * A player is found by his id as text (`storedPlayerId`), the way an address names him. One who is not on the
 * roster is refused `PLAYER_NOT_FOUND`, which the screen words as the server's refusal of the same is,
 * `validation.PLAYER_NOT_FOUND`; every other refusal is one of `EDIT_REFUSALS` or `FIX_REFUSALS`.
 */
import { FAVOURED_ROLLS } from "../post-match/rules.mjs";
import { absenceOf, applyInjuryEffects, markChanged } from "./absence.mjs";
import { LAST_SHIRT_NUMBER } from "./build.mjs";
import { favouredSkillCost } from "./costs.mjs";
import {
  canonicalSkillName, favouredSkillNames, heldSkillKeys, normalizePlayerAdvancements, normalizePlayerExtraSkills,
  normalizePlayerFavouredSkills, setRosterCaptain, storedPlayerId,
} from "./players.mjs";
import { STAT_LIMITS, TARGET_STATS, tieFavoured, untieFavoured } from "./progression.mjs";
import { favouredSkillsForChoice, ruleLookupKey, teamFavouredOptions } from "./team-rules.mjs";
import { PLAYER_STATS, categoriesForAccess, countToNumber, rowsForTeam } from "./values.mjs";

/** Every code an edit of a player's number or name is refused with; the screen words each as `teamPlayer.refusal.<code>`. */
export const EDIT_REFUSALS = Object.freeze(["NAME_EMPTY", "NUMBER_RANGE", "NUMBER_TAKEN"]);

/** @typedef {{number: string, name: string, captain: boolean}} PlayerEdit a field left out keeps what the player has */

/** Every code a manual fix is refused with; the screen words each as `teamPlayer.refusal.<code>`. */
export const FIX_REFUSALS = Object.freeze([
  "STAT_NONE", "STAT_LIMIT", "STAT_FLOOR", "NIGGLING_RANGE", "CONTRACTS_RANGE",
  "FAVOURED_SKILL_UNKNOWN", "FAVOURED_SKILL_HELD", "FAVOURED_SKILL_NOT_HIS", "SKILL_NOT_EXTRA",
]);

/** As many Niggling Injuries as a fix may leave a player with. */
export const MAX_NIGGLING = 9;
/** As many extended contracts as a fix may leave a player with. */
export const MAX_CONTRACTS = 20;
/** How far a characteristic may be put right either way, what injuries took apart: the 2.x editor's ±10 (gone in stage 12). */
export const MAX_STAT_CORRECTION = 10;

/**
 * @typedef {{niggling: number, lasting: Record<string, number>, stats: Record<string, number>, contracts: number,
 *   favoured: {add: string[], remove: string[]}, dropSkills: string[]}} PlayerFix
 *   a manual fix (decision 25): `niggling` and `contracts` what the counts become, `lasting` how many points of a
 *   lasting injury come off each characteristic, `stats` the correction each characteristic's `statMods` takes,
 *   `favoured` the favoured skills to add and to take off, `dropSkills` the skills no advancement gave to take off.
 *   A field left out leaves that part of the player as it is.
 */

/** The worst a fix may leave a characteristic at: MA 1, ST 1, AG 6+, PA 6+, AR 3+. */
const STAT_FLOORS = Object.freeze({ ma: 1, st: 1, ag: 6, pa: 6, ar: 3 });
/** No position: what `normalizePlayer…Skills` reads to keep every skill of a player, for comparing players apart from their rows. */
const NO_ROW = Object.freeze({});

const statMod = (mods, stat) => Number(mods?.[stat] || 0);
const skillName = (skill) => String((typeof skill === "string" ? skill : skill?.name) ?? "").trim();
const inRange = (value, max) => Number.isInteger(value) && value >= 0 && value <= max;
/** A count of points to take off: whole, never below zero. */
const wholeCount = (value) => Math.max(0, Math.trunc(Number(value) || 0));
const notFound = () => ({ code: "PLAYER_NOT_FOUND", params: {} });

/** The player of the roster the id names, by his id as text (`storedPlayerId`), or null. */
function playerOf(draft, playerId) {
  if (playerId === null || playerId === undefined || !Array.isArray(draft?.players)) return null;
  return draft.players.find((player) => storedPlayerId(player) === String(playerId)) ?? null;
}

/** `mods` with `step` added to `stat`, a copy; a characteristic left at zero loses its key. */
function withMod(mods, stat, step) {
  const next = { ...(mods ?? {}) };
  next[stat] = statMod(next, stat) + step;
  if (!next[stat]) delete next[stat];
  return next;
}

/**
 * Why a player cannot be given this number and name, or null: a name that is nothing once the blanks at its ends
 * are gone, then a number that is not a whole number from 1 to 99, then a number another player of the roster
 * wears — those who miss the next match too.
 *
 * @param {{number?: string, name?: string}} edit
 * @returns {null | {code: string, params: object}} a code of `EDIT_REFUSALS`
 */
export function editRefusal(draft, playerId, { number, name } = {}) {
  if (!String(name ?? "").trim()) return { code: "NAME_EMPTY", params: {} };
  const text = String(number ?? "").trim(), value = Number(text);
  if (!/^\d+$/.test(text) || value < 1 || value > LAST_SHIRT_NUMBER) return { code: "NUMBER_RANGE", params: { max: LAST_SHIRT_NUMBER } };
  const wearer = (Array.isArray(draft?.players) ? draft.players : [])
    .find((player) => player && storedPlayerId(player) !== String(playerId) && Number(player.number) === value);
  return wearer ? { code: "NUMBER_TAKEN", params: { number: value, name: String(wearer.name ?? "") } } : null;
}

/** A player's number, name and captaincy, and so the roster's, as values to compare; what his edit is seeded from (final review M1). */
export const identityOf = (player) => JSON.stringify([String(player?.number ?? ""), String(player?.name ?? ""), Boolean(player?.isCaptain ?? player?.captain)]);

/**
 * Give a player of the roster a number, a name and the captaincy, in place, as the server stores them: the number as
 * the text of its value, the name without the blanks at its ends. The armband on moves to him from whoever had it;
 * off, on the captain, leaves the team without one. The captaincy goes by the player's own id as the roster holds it
 * — a 2.x roster's `5`, never the address's `"5"`, which `setRosterCaptain` would match to nobody (K14).
 *
 * @param {PlayerEdit} edit
 * @returns {{applied: true, changed: boolean} | {applied: false, code: string, params: object}}
 */
export function editPlayer(draft, playerId, edit = {}) {
  const player = playerOf(draft, playerId);
  if (!player) return { applied: false, ...notFound() };
  const number = edit.number ?? player.number, name = edit.name ?? player.name;
  const refusal = editRefusal(draft, playerId, { number, name });
  if (refusal) return { applied: false, ...refusal };
  const before = draft.players.map(identityOf).join();
  player.number = String(Number(String(number).trim()));
  player.name = String(name).trim();
  if (edit.captain === true) setRosterCaptain(draft, player.id, true);
  else if (edit.captain === false && Boolean(player.isCaptain ?? player.captain)) setRosterCaptain(draft, player.id, false);
  return { applied: true, changed: draft.players.map(identityOf).join() !== before };
}

/**
 * A player's injuries as a fix shows them: his Niggling Injuries (a 2.x flag without a count is one, as
 * `normalizeRosterPlayer` reads it) and, in the order of the characteristics, each lasting injury's points.
 *
 * @returns {{niggling: number, lasting: {stat: string, count: number}[]}}
 */
export function playerInjuries(player) {
  const niggling = countToNumber(player?.nigglingInjuries ?? (player?.niglingInjury ? 1 : 0));
  const lasting = PLAYER_STATS.filter((stat) => statMod(player?.injuryStatMods, stat) < 0)
    .map((stat) => ({ stat, count: -statMod(player.injuryStatMods, stat) }));
  return { niggling, lasting };
}

/**
 * Take lasting injuries off a player, in place: each characteristic gets back as many points as `lasting` names and
 * the injury took, never more, in its total and in the injury's own tally; a key left at zero goes. A Niggling
 * Injury is a count, which `applyFix` sets.
 *
 * @param {{lasting?: Record<string, number>}} heal
 */
export function healInjuries(player, { lasting = {} } = {}) {
  for (const { stat, count } of playerInjuries(player).lasting) {
    const healed = Math.min(wholeCount(lasting?.[stat]), count);
    if (healed <= 0) continue;
    player.statMods = withMod(player.statMods, stat, healed);
    player.injuryStatMods = withMod(player.injuryStatMods, stat, healed);
  }
}

/** @returns {PlayerFix} the fix that leaves the player as he is: his counts as they stand, nothing else. */
export function fixFormOf(player) {
  return { niggling: playerInjuries(player).niggling, lasting: {}, stats: {}, contracts: countToNumber(player?.extendedContracts),
    favoured: { add: [], remove: [] }, dropSkills: [] };
}

/** A fix whole: a field left out keeps what the player has (`fixFormOf`). */
function wholeFix(player, fix) {
  const form = fixFormOf(player), list = (value) => (Array.isArray(value) ? value : []);
  const record = (value) => (value && typeof value === "object" && !Array.isArray(value) ? value : {});
  return {
    niggling: fix?.niggling ?? form.niggling, lasting: record(fix?.lasting), stats: record(fix?.stats),
    contracts: fix?.contracts ?? form.contracts, favoured: { add: list(fix?.favoured?.add), remove: list(fix?.favoured?.remove) },
    dropSkills: list(fix?.dropSkills),
  };
}

/**
 * The names of the skills a player holds that no advancement gave (`grants.skill`), in the order the roster keeps
 * them: what the 2.x editor let a coach add by hand, and an advancement's saved before grants existed.
 *
 * @returns {string[]}
 */
export function legacySkills(row, player) {
  const given = new Set(normalizePlayerAdvancements(player.advancements).map(({ grants }) => grants?.skill).filter(Boolean));
  return normalizePlayerExtraSkills(row, player.extraSkills ?? []).map(({ name }) => name).filter((name) => !given.has(name));
}

/**
 * Why a characteristic cannot be put right by `step`, or null. `healed` is what the fix's lasting injury gives it
 * back first. A step up may not take the value after both past the rule's limit (`STAT_LIMITS`), a step down not
 * below the floor: a value 2.x left outside them can always be brought back toward them. Either way the correction,
 * what injuries took apart, stays within the 2.x editor's whole steps of ±10.
 */
function statRefusal(row, player, stat, step, healed) {
  const base = parseInt(row[stat], 10), target = TARGET_STATS.includes(stat);
  if (!PLAYER_STATS.includes(stat) || !Number.isFinite(base)) return { code: "STAT_NONE", params: { stat } };
  const mod = statMod(player.statMods, stat) + healed + Number(step), value = target ? base - mod : base + mod;
  if (step > 0 && (target ? value < STAT_LIMITS[stat] : value > STAT_LIMITS[stat])) return { code: "STAT_LIMIT", params: { stat } };
  const correction = statMod(player.statMods, stat) - statMod(player.injuryStatMods, stat) + Number(step);
  const floored = step < 0 && (target ? value > STAT_FLOORS[stat] : value < STAT_FLOORS[stat]);
  return !Number.isInteger(step) || Math.abs(correction) > MAX_STAT_CORRECTION || floored ? { code: "STAT_FLOOR", params: { stat } } : null;
}

/** The alignment the roster chose (`favouredChoice`), as its race names it, when the race knows it; else null. */
function favouredAlignment(team, draft) {
  const key = ruleLookupKey(draft?.favouredChoice ?? "");
  return key ? teamFavouredOptions(team).find((name) => ruleLookupKey(name) === key) ?? null : null;
}

/** Why `skill` is no favoured skill to give a player who holds `held` (canonical names), or null. */
function favouredAddRefusal(team, draft, held, skill) {
  const alignment = favouredAlignment(team, draft);
  if (!alignment || !favouredSkillsForChoice(alignment).includes(skill)) return { code: "FAVOURED_SKILL_UNKNOWN", params: { skill: String(skill) } };
  return held.has(canonicalSkillName(skill)) ? { code: "FAVOURED_SKILL_HELD", params: { skill } } : null;
}

/** The favoured skills to add — each on the roster's list and not his yet, one by one — and to take off, only his. */
function favouredRefusal(team, draft, row, player, { add, remove }) {
  const held = heldSkillKeys(row, player);
  for (const skill of add) {
    const refusal = favouredAddRefusal(team, draft, held, skill);
    if (refusal) return refusal;
    held.add(canonicalSkillName(skill));
  }
  const own = favouredSkillNames(row, player), foreign = remove.findIndex((skill) => !own.has(skill));
  return foreign < 0 ? null : { code: "FAVOURED_SKILL_NOT_HIS", params: { skill: String(remove[foreign]) } };
}

/**
 * Why a manual fix of a player cannot be made, or null, checked in this order: each characteristic put right
 * (`STAT_NONE`, `STAT_LIMIT`, `STAT_FLOOR`; a step of 0 is none), the Niggling Injuries and the contracts, whole
 * counts in their range, the favoured skills to add and to take off, the skills to take off. A field left out is
 * the player as he is.
 *
 * @param {object} team the race's page
 * @param {PlayerFix} fix
 * @returns {null | {code: string, params: object}} a code of `FIX_REFUSALS`, or `PLAYER_NOT_FOUND`
 */
export function fixRefusal(team, draft, playerId, fix) {
  const player = playerOf(draft, playerId), row = player ? rowsForTeam(team)[Number(player.rowIndex)] : null;
  if (!row) return notFound();
  const whole = wholeFix(player, fix), injured = new Map(playerInjuries(player).lasting.map(({ stat, count }) => [stat, count]));
  for (const [stat, step] of Object.entries(whole.stats)) {
    const healed = Math.min(wholeCount(whole.lasting[stat]), injured.get(stat) ?? 0);
    const refusal = step === 0 ? null : statRefusal(row, player, stat, step, healed);
    if (refusal) return refusal;
  }
  if (!inRange(whole.niggling, MAX_NIGGLING)) return { code: "NIGGLING_RANGE", params: { max: MAX_NIGGLING } };
  if (!inRange(whole.contracts, MAX_CONTRACTS)) return { code: "CONTRACTS_RANGE", params: { max: MAX_CONTRACTS } };
  const favoured = favouredRefusal(team, draft, row, player, whole.favoured);
  if (favoured) return favoured;
  const legacy = legacySkills(row, player), kept = whole.dropSkills.findIndex((skill) => !legacy.includes(skill));
  return kept < 0 ? null : { code: "SKILL_NOT_EXTRA", params: { skill: String(whole.dropSkills[kept]) } };
}

/** What an edit, a fix or an advancement can change of a player, apart from his injuries, as values to compare. */
function editedValues(player) {
  return JSON.stringify([
    String(player.number ?? ""), String(player.name ?? ""), Boolean(player.isCaptain ?? player.captain),
    normalizePlayerAdvancements(player.advancements),
    normalizePlayerFavouredSkills(NO_ROW, player.favouredSkills ?? []),
    normalizePlayerExtraSkills(NO_ROW, player.extraSkills ?? []),
    countToNumber(player.extendedContracts),
    PLAYER_STATS.map((stat) => statMod(player.statMods, stat) - statMod(player.injuryStatMods, stat)),
  ]);
}
const injuryValues = (player) => JSON.stringify(playerInjuries(player));

/**
 * The player before, with what the draft's own mark did to him: when he sits out differently now (`markChanged`) for
 * a Niggling or a lasting injury, that injury applied once (`applyInjuryEffects`), a copy. A mark's injury is the
 * mark's (`markEdits` counts it); any other change to his injuries beside it is an edit.
 */
function markedAs(prior, player) {
  const absence = markChanged(prior, player) ? absenceOf(player) : null;
  if (!absence || !["niggling", "lasting"].includes(absence.code)) return prior;
  const expected = structuredClone(prior);
  applyInjuryEffects(expected, { code: absence.code, stat: absence.stat });
  return expected;
}

/**
 * Make a manual fix of a player, in place, once `fixRefusal` has none, as the server stores it: the Niggling
 * Injuries as a count (and the 2.x flag with it), the lasting injuries taken off (`healInjuries`), each
 * characteristic's correction on `statMods` alone (a key left at zero goes; `injuryStatMods` is the injuries'), the
 * contracts, the favoured skills added (`addFavouredSkill`) and taken off — either untied from an advancement whose D8
 * brought it (`untieFavoured`) — and the skills no advancement gave taken off.
 *
 * @param {PlayerFix} fix
 * @returns {{applied: true, changed: boolean} | {applied: false, code: string, params: object}}
 */
export function applyFix(team, draft, playerId, fix) {
  const refusal = fixRefusal(team, draft, playerId, fix);
  if (refusal) return { applied: false, ...refusal };
  const player = playerOf(draft, playerId), row = rowsForTeam(team)[Number(player.rowIndex)], whole = wholeFix(player, fix);
  const before = editedValues(player) + injuryValues(player);
  player.nigglingInjuries = whole.niggling;
  player.niglingInjury = whole.niggling > 0;
  healInjuries(player, { lasting: whole.lasting });
  for (const [stat, step] of Object.entries(whole.stats)) if (step !== 0) player.statMods = withMod(player.statMods, stat, step);
  player.extendedContracts = whole.contracts;
  for (const skill of whole.favoured.add) addFavouredSkill(team, draft, row, player, skill);
  const { add, remove } = whole.favoured, drop = whole.dropSkills;
  if (remove.length) player.favouredSkills = (player.favouredSkills ?? []).filter((skill) => !remove.includes(skillName(skill)));
  // A god's skill put on or taken off by hand is no advancement's to take back with its undo (Task 10 review).
  if (add.length || remove.length) untieFavoured(player, new Set([...add, ...remove]));
  if (drop.length) player.extraSkills = (player.extraSkills ?? []).filter((skill) => !drop.includes(skillName(skill)));
  return { applied: true, changed: editedValues(player) + injuryValues(player) !== before };
}

/**
 * How many players a roster save changes by an edit, a fix or an advancement: the same id (as text,
 * `storedPlayerId`) in both, and a different number, name, captaincy, advancements, favoured skills, other skills,
 * contracts, correction of a characteristic (`statMods` without `injuryStatMods`) or injuries (the Niggling
 * Injuries, `injuryStatMods`). The injury a mark of his brought is the mark's, which `markEdits` counts, so his
 * injuries are compared with those before plus that one (`markedAs`): a heal or a count put right beside a mark is
 * still an edit. A mark, its clearing and a mark again on one player may read as an edit too — said rather than
 * lost (R8). A player who came or went is not counted; a roster without `players` has none.
 */
export function playerEdits(before, after) {
  const was = new Map();
  for (const player of before?.players ?? []) if (storedPlayerId(player) !== null) was.set(storedPlayerId(player), player);
  let count = 0;
  for (const player of after?.players ?? []) {
    const prior = was.get(storedPlayerId(player));
    if (prior && (editedValues(prior) !== editedValues(player) || injuryValues(markedAs(prior, player)) !== injuryValues(player))) count += 1;
  }
  return count;
}

/**
 * The bonus skill the roster's favour may bring a player with an advancement: the alignment the roster chose when
 * its race knows it (none otherwise), the D8 result that brings it, whether it is rolled for — a position without
 * Mutation among its primary categories gets one at random, the others choose —, what the skill adds to his value
 * (`cost`, thousands: `favouredSkillCost`) and the alignment's skills, each marked when the player holds it already
 * (`heldSkillKeys`).
 *
 * @returns {null | {alignment: string, trigger: number, random: boolean, cost: number, skills: {name: string, held: boolean}[]}}
 */
export function favouredBonus(team, draft, row, player) {
  const alignment = favouredAlignment(team, draft);
  if (!alignment) return null;
  const held = heldSkillKeys(row, player);
  return {
    alignment, trigger: FAVOURED_ROLLS[alignment], random: !categoriesForAccess(row.primary ?? []).includes("Mutation"), cost: favouredSkillCost(row),
    skills: favouredSkillsForChoice(alignment).map((name) => ({ name, held: held.has(canonicalSkillName(name)) })),
  };
}

/**
 * Whether the god's D8 is rolled with an advancement (the owner, 2026-10-21; content «Team Management», «Favoured
 * of…»: «Every time a player receives an advancement, roll a d8»): with every one of a roster «Favoured of…»
 * (`favouredBonus`), unless the player holds every skill the god offers — the D8 could bring him nothing. The roster's
 * sheet and the post-match ask it the same.
 * @param {ReturnType<typeof favouredBonus>} bonus @returns {boolean}
 */
export const favouredRollAsked = (bonus) => Boolean(bonus?.skills.some(({ held }) => !held));

/**
 * Give a player a favoured skill, in place, as the server stores it (`{name, access: "favoured"}`): one of the
 * roster's alignment that he does not hold. Mutates `player` only when it is applied.
 *
 * @returns {{applied: true} | {applied: false, code: "FAVOURED_SKILL_UNKNOWN"|"FAVOURED_SKILL_HELD", params: {skill: string}}}
 */
export function addFavouredSkill(team, draft, row, player, skill) {
  const refusal = favouredAddRefusal(team, draft, heldSkillKeys(row, player), skill);
  if (refusal) return { applied: false, ...refusal };
  player.favouredSkills = [...(player.favouredSkills ?? []), { name: skill, access: "favoured" }];
  return { applied: true };
}

/**
 * The god's skill the D8 brought with the advancement the player has just taken (`addFavouredSkill`), tied to that
 * advancement (`tieFavoured`) so that its undo takes the skill back with it. Nothing is tied when it is refused.
 * @returns {ReturnType<typeof addFavouredSkill>}
 */
export function addAdvancementFavoured(team, draft, row, player, skill) {
  const added = addFavouredSkill(team, draft, row, player, skill);
  if (added.applied) tieFavoured(player, skill);
  return added;
}
