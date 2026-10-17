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
 */
import { canonicalSkillName, heldSkillKeys, normalizePlayerAdvancements } from "./players.mjs";
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
 * Whether a roll is one the advancement could have taken. A random skill takes a random-skill roll that
 * ended on the skill it grants, by canonical name (the Skill Table's `Mighty Blow` is the Rat Ogre's
 * `Mighty Blow (+1)`). A characteristic takes a D8 whose face may improve the characteristic it grants,
 * or any skill taken in its place, as the post-match lets a characteristic advancement do. An advancement
 * that does not say what it granted, or of any other type, takes no roll.
 *
 * @param {{purpose: string, result: object}} roll a `dice_rolls` row, or its public form
 * @param {{type: string, grants?: {skill?: string, stat?: string}|null}} advancement
 */
export function rollFitsAdvancement({ purpose, result }, { type, grants }) {
  if (type === "random") {
    return purpose === "random_skill" && typeof grants?.skill === "string" && typeof result?.skill === "string"
      && canonicalSkillName(grants.skill) === canonicalSkillName(result.skill);
  }
  if (type === "stat") {
    return purpose === "stat" && (Boolean(grants?.skill) || (Array.isArray(result?.stats) && result.stats.includes(grants?.stat)));
  }
  return false;
}

/** One throw of a die with `sides` faces, refusing an answer the die cannot show. */
function face(rng, sides) {
  const value = rng(sides);
  if (!Number.isInteger(value) || value < 1 || value > sides) throw new RangeError(`a D${sides} cannot show ${value}`);
  return value;
}
