/**
 * The league's dice: the D8 for a characteristic improvement and the roll for a
 * random skill.
 *
 * The D8 table is the one in content/Gata/General Information/Player
 * Advancement.md ("Characteristic Improvements"); its AV is `ar` in code. A
 * random skill is a *primary* skill — the advancement table calls it
 * "Randomly Select a Primary Skill" — drawn from the category's column of the
 * Skill Table (content/Gata/Skills and Traits/Skill Table.md): face 1…N, where
 * N is the length of that column, taken in the Skill Table's order. A skill the
 * player already has (`heldSkillKeys`: base, bought, Favoured, and the
 * captain's Pro, whatever their (+N)) is rolled again, and every attempt is
 * kept so the record shows the whole roll, not just where it ended.
 *
 * Pure: the die is passed in. `rng(sides)` answers an integer from 1 to `sides`;
 * the server (stage 03) hands in `(sides) => crypto.randomInt(1, sides + 1)`.
 * An answer outside the die's faces is a `RangeError`, never a result.
 */
import { canonicalSkillName, heldSkillKeys } from "./players.mjs";
import { PLAYER_STATS, categoriesForAccess } from "./values.mjs";

/** In the order of the `dice_rolls.purpose` CHECK (migration 012). */
export const DICE_PURPOSES = Object.freeze(["random_skill", "stat"]);

const STAT_DIE = 8;

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
  return { ok: true, params: { die: STAT_DIE }, result: { roll, stats: statsForRoll(roll) } };
}

/**
 * Roll a random primary skill of `category` for a player.
 *
 * @param {object} args
 * @param {object} args.row the player's position row
 * @param {object} args.player
 * @param {string} args.category a primary category of the row
 * @param {Array<{category: string, skills: string[]}>} args.skillGroups the Skill Table
 * @param {(sides: number) => number} args.rng
 * @param {number} [args.maxAttempts] a die stuck on held skills throws instead of looping
 * @returns {{ok: true, params: object, result: {attempts: object[], skill: string}} | {ok: false, reason: string}}
 */
export function randomSkillRoll({ row, player, category, skillGroups = [], rng, maxAttempts = 100 }) {
  if (!categoriesForAccess(row.primary ?? []).includes(category)) return { ok: false, reason: "DICE_CATEGORY" };
  const candidates = [...(skillGroups.find((group) => group.category === category)?.skills ?? [])];
  const held = heldSkillKeys(row, player);
  if (!candidates.some((skill) => !held.has(canonicalSkillName(skill)))) return { ok: false, reason: "DICE_NO_SKILL" };
  const attempts = [];
  while (attempts.length < maxAttempts) {
    const roll = face(rng, candidates.length), skill = candidates[roll - 1], duplicate = held.has(canonicalSkillName(skill));
    attempts.push({ roll, skill, duplicate });
    if (!duplicate) return { ok: true, params: { category, candidates }, result: { attempts, skill } };
  }
  throw new Error(`no free skill after ${maxAttempts} attempts`);
}

/** One throw of a die with `sides` faces, refusing an answer the die cannot show. */
function face(rng, sides) {
  const value = rng(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new RangeError(`a D${sides} cannot show ${value}`);
  return value;
}
