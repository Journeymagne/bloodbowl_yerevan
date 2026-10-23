/**
 * The league's dice: the D8 for a characteristic improvement and the D16 for a
 * random skill.
 *
 * The D8 table is the one in content/Gata/General Information/Player
 * Advancement.md ("Characteristic Improvements"); its AV is `ar` in code. A
 * random skill is a *primary* skill — the advancement table calls it
 * "Randomly Select a Primary Skill" — taken from the category's column of the
 * Skill Table (content/Gata/Skills and Traits/Skill Table.md) in the Skill
 * Table's order. The content names no die; the die is a D16 per the league
 * (owner, 2026-10-16), the length of the longest column (General), so a column
 * shorter than 16 has faces with no skill on them. A face beyond the column is
 * rolled again, and so is a skill the player already has (`heldSkillKeys`:
 * base, bought, Favoured, and the captain's Pro, whatever their (+N)). Every
 * attempt is kept as `{ roll, skill, duplicate }` — `skill` is null for a blank
 * face beyond the column — so the record shows the whole roll, not just where
 * it ended. A random skill is two dice (the owner, 2026-10-20): the second
 * rerolls a blank face, a skill the player holds and the first die's skill
 * (`twin`), so both are skills he lacks and different, and the coach takes one;
 * a column with one such skill throws one die. Every attempt of both is kept; a
 * roll kept before (one die, `result.skill`) reads as one (`rolledDice`).
 *
 * Pure: the die is passed in. `rng(sides)` answers an integer from 1 to `sides`;
 * the server hands in `serverDie` (server/api/dice-rolls.mjs). An answer outside
 * the die's faces is a `RangeError`, never a result.
 *
 * A roll that can be made comes back as `{ ok: true, params, result }`, the two
 * halves of a `dice_rolls` row. `params` names the die the same way in both rolls,
 * as `sides` (8 for a characteristic, 16 for a skill, which adds its category and
 * candidates); `result` is everything that came up.
 *
 * An advancement that was rolled on the site names its roll (`roll: { id, via:
 * "site" }`): `siteRollReferences` lists those of a roster, and
 * `rollFitsAdvancement` says whether a roll is one the advancement could have
 * taken. The server holds a save to both (`settleRosterRolls`).
 *
 * What a coach sees of a roll: its sixteen faces, what its dice came up, and
 * why a waiting roll cannot be taken as it is.
 */
import { CAPTAINS_SKILL, canonicalSkillName, heldSkillKeys, normalizePlayerAdvancements } from "./players.mjs";
import { PLAYER_STATS, categoriesForAccess } from "./values.mjs";

/** In the order of the `dice_rolls.purpose` CHECK (migration 012). */
export const DICE_PURPOSES = Object.freeze(["random_skill", "stat"]);

const STAT_DIE = 8;
/** The die of a random skill: 16 faces, as long as the longest Skill Table column. */
export const SKILL_DIE = 16;

function span(from, to, stats) {
  return Object.freeze({ from, to, stats: Object.freeze([...stats]) });
}

/** What each face of the D8 improves; face 8 is any one characteristic. */
export const STAT_ROLL_TABLE = Object.freeze([
  span(1, 1, ["ar"]),
  span(2, 2, ["ar", "pa"]),
  span(3, 4, ["ar", "ma", "pa"]),
  span(5, 5, ["ma", "pa"]),
  span(6, 6, ["ag", "ma"]),
  span(7, 7, ["ag", "st"]),
  span(8, 8, PLAYER_STATS),
]);

/** The characteristics a face of the D8 may improve; none for anything that is not a face. */
export function statsForRoll(roll) {
  const row = Number.isInteger(roll) ? STAT_ROLL_TABLE.find((entry) => roll >= entry.from && roll <= entry.to) : undefined;
  return row ? [...row.stats] : [];
}

/** One D8 for a characteristic improvement. */
export function statRoll(rng) {
  const roll = face(rng, STAT_DIE);
  return { ok: true, params: { sides: STAT_DIE }, result: { roll, stats: statsForRoll(roll) } };
}

/**
 * One die of a random skill: every attempt it took, and the skill it ended on. `skill` of an attempt is null for a blank
 * face beyond the column; `twin` marks the second die landing on the first die's skill (not the player's: `duplicate`
 * is false).
 *
 * @typedef {{attempts: {roll: number, skill: string|null, duplicate: boolean, twin?: true}[], skill: string}} RolledDie
 */

/**
 * Roll a random primary skill of `category` for a player: two dice, the second rerolling the first one's skill too, or
 * one when the column has a single skill he lacks.
 *
 * @param {object} args
 * @param {object} args.row the player's position row
 * @param {object} args.player
 * @param {string} args.category a primary category of the row
 * @param {Array<{category: string, skills: string[]}>} args.skillGroups the Skill Table
 * @param {(sides: number) => number} args.rng asked for a `SKILL_DIE` on every attempt of both dice
 * @param {number} [args.maxAttempts] per die: a die stuck on blanks and held skills throws instead of looping. 1000, not
 *   100: a 9-skill column with 8 held leaves one face in 16, and a fair die would miss 100 times running 0.16 % of the time
 * @returns {{ok: true, params: {category: string, candidates: string[], sides: number}, result: {dice: RolledDie[]}}
 *   | {ok: false, reason: string}}
 */
export function randomSkillRoll({ row, player, category, skillGroups = [], rng, maxAttempts = 1000 }) {
  if (!categoriesForAccess(row.primary ?? []).includes(category)) return { ok: false, reason: "DICE_CATEGORY" };
  const candidates = [...(skillGroups.find((group) => group.category === category)?.skills ?? [])];
  const held = heldSkillKeys(row, player);
  const free = new Set(candidates.map(canonicalSkillName).filter((skill) => !held.has(skill)));
  if (!free.size) return { ok: false, reason: "DICE_NO_SKILL" };
  const first = rollDie(rng, candidates, held, null, maxAttempts);
  const dice = free.size > 1 ? [first, rollDie(rng, candidates, held, canonicalSkillName(first.skill), maxAttempts)] : [first];
  return { ok: true, params: { category, candidates, sides: SKILL_DIE }, result: { dice } };
}

/** One die over the column, thrown until it lands on a skill the player lacks and that is not `twinOf` (canonical). */
function rollDie(rng, candidates, held, twinOf, maxAttempts) {
  const attempts = [];
  while (attempts.length < maxAttempts) {
    const roll = face(rng, SKILL_DIE), skill = candidates[roll - 1] ?? null;
    const duplicate = skill !== null && held.has(canonicalSkillName(skill));
    const twin = skill !== null && !duplicate && canonicalSkillName(skill) === twinOf;
    attempts.push(twin ? { roll, skill, duplicate, twin } : { roll, skill, duplicate });
    if (skill !== null && !duplicate && !twin) return { attempts, skill };
  }
  throw new Error(`no free skill after ${maxAttempts} attempts`);
}

/** The dice a random skill's result keeps: `result.dice`, or the result itself for a roll kept with one die (stage 03). */
const diceOf = (result) => (Array.isArray(result?.dice) ? result.dice : [result]);

/**
 * What a random skill's dice came up, in their order: each die's face — where it ended, the roll of its last attempt,
 * null with none kept — and its skill. A roll kept before there were two dice (`result.skill`, `result.attempts`) is one
 * die; a die with no skill is none; a characteristic, or anything that is no random skill, has no dice.
 *
 * @param {{purpose: string, result: object}|null|undefined} roll a `dice_rolls` row, or its public form
 * @returns {{face: number|null, skill: string}[]}
 */
export function rolledDice(roll) {
  if (roll?.purpose !== "random_skill") return [];
  return diceOf(roll.result).filter((die) => typeof die?.skill === "string").map((die) => {
    const last = Array.isArray(die.attempts) ? die.attempts.at(-1) : undefined;
    return { face: Number.isInteger(last?.roll) ? last.roll : null, skill: die.skill };
  });
}

/**
 * The site rolls a roster's advancements refer to: one `{ id, playerId, type, grants }` for each
 * advancement that says it was rolled on the site, `grants` null when it does not say what it granted.
 * A table roll, or a site roll with no id, refers to no roll.
 *
 * A roster is read as it is stored, raw or normalised: the advancements go through
 * `normalizePlayerAdvancements`, as every reader of them does, so a raw blob and its normalised copy
 * name the same rolls, and a player who is not an object has none.
 */
export function siteRollReferences(roster) {
  const players = Array.isArray(roster?.players) ? roster.players : [];
  return players.flatMap((player) => (player && typeof player === "object" ? normalizePlayerAdvancements(player.advancements) : [])
    .filter((advancement) => advancement.roll?.via === "site")
    .map(({ type, grants = null, roll }) => ({ id: roll.id, playerId: String(player.id ?? ""), type, grants })));
}

/**
 * Whether a roll is one the advancement could have taken. A random skill takes a random-skill roll one of
 * whose dice came up the skill it grants (`rolledDice`: the coach takes either), by canonical name (the
 * Skill Table's `Mighty Blow` is the Rat Ogre's `Mighty Blow (+1)`). A characteristic takes a D8 whose face
 * may improve the characteristic it grants, or any skill taken in its place, as the post-match lets a
 * characteristic advancement do. An advancement that does not say what it granted, or of any other type,
 * takes no roll.
 *
 * @param {{purpose: string, result: object}} roll a `dice_rolls` row, or its public form
 * @param {{type: string, grants?: {skill?: string, stat?: string}|null}} advancement
 */
export function rollFitsAdvancement({ purpose, result }, { type, grants }) {
  if (type === "random") {
    return typeof grants?.skill === "string"
      && rolledDice({ purpose, result }).some((die) => canonicalSkillName(die.skill) === canonicalSkillName(grants.skill));
  }
  if (type === "stat") {
    return purpose === "stat" && (Boolean(grants?.skill) || (Array.isArray(result?.stats) && result.stats.includes(grants?.stat)));
  }
  return false;
}

/**
 * The skills a random-skill roll threw again as already held, by canonical name, attempt by attempt of each die in
 * turn, that the roster it is used on must answer for — the second die landing on the first one's skill (`twin`) is
 * no skill of the player's, and not one of them. The die rerolls what the player holds when it is asked, and a roster can
 * say a player holds anything: a skill held only while the die was asked would steer it. So a roll is taken only
 * by a roster that holds all of these (`rerollsHeldBy`), and while it is used no save may drop one of them
 * (`settleRosterRolls`). The one left out is the captaincy's Pro on a roll made while the player was captain
 * (`params.captain: true`, which the server keeps with the roll): the captain cannot roll Pro, and the captaincy
 * moves from match to match by the rules. A roll that does not say so — one made before rolls kept the
 * captaincy, too — is held to its Pro like any other skill. A characteristic roll throws nothing again.
 *
 * @param {{purpose: string, params?: object, result: object}} roll a `dice_rolls` row, or its public form
 * @returns {string[]}
 */
export function skillsRerolledAgainst({ purpose, params, result }) {
  const attempts = purpose === "random_skill" ? diceOf(result).flatMap((die) => (Array.isArray(die?.attempts) ? die.attempts : [])) : [];
  return attempts.filter((attempt) => attempt?.duplicate).map((attempt) => canonicalSkillName(attempt.skill))
    .filter((skill) => !(skill === CAPTAINS_SKILL && params?.captain === true));
}

/**
 * Whether a roll's rerolls are explained by the roster it is used on: every skill it was rerolled against
 * (`skillsRerolledAgainst`) is in `held` — `heldSkillKeys` of the player the roll is taken for, as that save
 * leaves him.
 *
 * @param {{purpose: string, result: object}} roll a `dice_rolls` row, or its public form
 * @param {Set<string>} held canonical skill names
 */
export function rerollsHeldBy(roll, held) {
  return skillsRerolledAgainst(roll).every((skill) => held.has(skill));
}

/** The faces of a random skill's die over a category's column, in its order: `SKILL_DIE` of them, a face beyond the column blank. */
export function skillFaces(candidates = []) {
  return Array.from({ length: SKILL_DIE }, (_, at) => ({ face: at + 1, skill: candidates[at] ?? null }));
}

/**
 * Why a waiting roll cannot be taken by the player as he is, or null when it can. A random skill whose every
 * die's skill he holds already — the server marks it `stale`, or he has come to hold them since — is
 * `ROLL_STALE`, naming the dice's skills; while one die's skill is still his to take, the roll is good (the
 * screen closes the other). One rerolled against a skill he holds no more is `ROLL_REROLLED`, naming those
 * skills (`rerollsHeldBy`: the server refuses the save that takes it). A roll with no dice (`rolledDice`) is
 * nothing to say — the server refuses the save that names it, and calls it stale no more than this does — and a
 * characteristic roll is always good: a skill can take its place.
 *
 * @param {{purpose: string, params?: object, result: object, stale?: boolean}} roll a roll as GET …/rolls sends it
 * @returns {null | {code: "ROLL_STALE", params: {skills: string}} | {code: "ROLL_REROLLED", params: {skills: string}}}
 */
export function rollRefusal(roll, row, player) {
  const dice = rolledDice(roll);
  if (!dice.length) return null;
  const held = heldSkillKeys(row, player);
  if (roll.stale || dice.every((die) => held.has(canonicalSkillName(die.skill)))) {
    return { code: "ROLL_STALE", params: { skills: dice.map((die) => die.skill).join(", ") } };
  }
  if (rerollsHeldBy(roll, held)) return null;
  return { code: "ROLL_REROLLED", params: { skills: [...new Set(skillsRerolledAgainst(roll).filter((name) => !held.has(name)))].join(", ") } };
}

/**
 * The player's random advancement taken at the table for the skill one of a site roll's dice came up
 * (`rolledDice`), by canonical name, which the roll may take the place of; -1 when there is none. Only one
 * after which no advancement of his names a site roll: the server uses a player's rolls in the order it
 * handed them out and gives them back last first (`settleRosterRolls`), so a roll bound before a site
 * advancement would be used out of turn.
 *
 * @param {{purpose: string, result: object}} roll a waiting random-skill roll
 * @returns {number} the index in the player's advancements
 */
export function tableAdvancementFor(roll, player) {
  const skills = new Set(rolledDice(roll).map((die) => canonicalSkillName(die.skill)));
  if (!skills.size) return -1;
  const advancements = normalizePlayerAdvancements(player?.advancements);
  const lastSite = advancements.findLastIndex((advancement) => advancement.roll?.via === "site");
  return advancements.findIndex((advancement, index) => index > lastSite && advancement.type === "random"
    && advancement.roll?.via === "table" && typeof advancement.grants?.skill === "string"
    && skills.has(canonicalSkillName(advancement.grants.skill)));
}

/** One throw of a die with `sides` faces, refusing an answer the die cannot show. */
function face(rng, sides) {
  const value = rng(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new RangeError(`a D${sides} cannot show ${value}`);
  return value;
}
