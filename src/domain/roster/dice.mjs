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
 * it ended.
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
 * @param {number} [args.maxAttempts] a die stuck on blanks and held skills throws instead of looping. 1000, not 100: a
 *   9-skill column with 8 held leaves one face in 16, and a fair die would miss 100 times running 0.16 % of the time
 * @returns {{ok: true,
 *   params: {category: string, candidates: string[], sides: number},
 *   result: {attempts: Array<{roll: number, skill: string | null, duplicate: boolean}>, skill: string}}
 *   | {ok: false, reason: string}}
 *   `skill` of an attempt is null for a blank face beyond the column; `result.skill` is the free skill the roll ended on
 */
export function randomSkillRoll({ row, player, category, skillGroups = [], rng, maxAttempts = 1000 }) {
  if (!categoriesForAccess(row.primary ?? []).includes(category)) return { ok: false, reason: "DICE_CATEGORY" };
  const candidates = [...(skillGroups.find((group) => group.category === category)?.skills ?? [])];
  const held = heldSkillKeys(row, player);
  if (!candidates.some((skill) => !held.has(canonicalSkillName(skill)))) return { ok: false, reason: "DICE_NO_SKILL" };
  const attempts = [];
  while (attempts.length < maxAttempts) {
    const roll = face(rng, SKILL_DIE), skill = candidates[roll - 1] ?? null;
    const duplicate = skill !== null && held.has(canonicalSkillName(skill));
    attempts.push({ roll, skill, duplicate });
    if (skill !== null && !duplicate) return { ok: true, params: { category, candidates, sides: SKILL_DIE }, result: { attempts, skill } };
  }
  throw new Error(`no free skill after ${maxAttempts} attempts`);
}

/** One throw of a die with `sides` faces, refusing an answer the die cannot show. */
function face(rng, sides) {
  const value = rng(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new RangeError(`a D${sides} cannot show ${value}`);
  return value;
}
