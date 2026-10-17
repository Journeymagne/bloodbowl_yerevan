/**
 * The dice the site rolls for a player: the server's die, and one roll at a time.
 *
 * A coach never sends a result, only asks for a roll (migration 012). The die is `serverDie`, and
 * what it shows is kept whole — every attempt, the skills that were rolled again too — as a
 * `dice_rolls` row until an advancement takes it. The rules of the dice are the pure ones in
 * `src/domain/roster/dice.mjs`; this module hands them the die and keeps the answer.
 *
 * A step is a player and a purpose. Declare, then roll, as at the table: while a roll waits for a
 * player, asking again for its purpose hands back the earliest such roll, whatever category is asked
 * this time, and asking for the other purpose is refused — a coach never holds a D8 and a D16 for one
 * player before choosing which advancement to take. A random skill the player has come to hold since it
 * was rolled is still the step's roll: it is handed back marked `stale`, never spent for a fresh die.
 * All of that is held by the team row lock every writer of this table takes first (`teamForUser(…,
 * { lock: true })` inside a transaction, `writeSavedTeam`'s FOR UPDATE), and by nothing else — there is
 * no index for it, on purpose: an undone advancement frees its roll while the next one may already wait,
 * which a unique index over the unused rolls would refuse.
 *
 * A roll is used by the advancement that names it (`roll: { id, via: "site" }`), by one only, in the
 * order its step handed rolls out, and given back in the reverse order: a save of the roster settles that
 * (`settleRosterRolls`). A team is created with no rolls, so a roster it is created with names none
 * (`refuseSiteRolls`).
 */
import crypto from "node:crypto";

import { randomSkillRoll, rerollsHeldBy, rollFitsAdvancement, siteRollReferences, statRoll } from "../../src/domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys, normalizeDraftPlayers } from "../../src/domain/roster/players.mjs";
import { rowsForTeam } from "../../src/domain/roster/values.mjs";
import { matchReference } from "../domain/match-reference.mjs";
import { teamBySlug } from "../domain/roster.mjs";
import { httpError } from "../http/errors.mjs";
import { isUuid } from "./team-access.mjs";

const WAITING_ROLLS = `
  SELECT * FROM dice_rolls
   WHERE saved_team_id = $1 AND player_id = $2 AND used_at IS NULL
   ORDER BY created_at, id`;

const INSERT_ROLL = `
  INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, rolled_by)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *`;

/** Every roll of the players whose rolls a save names ($2: the rolls it references and the rolls it drops), in their order. */
const ROLLS_OF_PLAYERS = `
  SELECT id, player_id, purpose, result, used_at FROM dice_rolls
   WHERE saved_team_id = $1
     AND player_id IN (SELECT player_id FROM dice_rolls WHERE saved_team_id = $1 AND id = ANY($2::uuid[]))
   ORDER BY created_at, id`;
const USE_ROLLS = "UPDATE dice_rolls SET used_at = now() WHERE id = ANY($1::uuid[]) AND saved_team_id = $2";
const FREE_ROLLS = "UPDATE dice_rolls SET used_at = NULL WHERE saved_team_id = $1 AND id = ANY($2::uuid[])";

/** A die of `sides` faces: an integer from 1 to `sides`, from the system's own randomness. */
export const serverDie = (sides) => crypto.randomInt(1, sides + 1);

/**
 * A `dice_rolls` row as a client reads it. The team and who rolled it stay on the server. `stale` is there
 * only when `rollForPlayer` marked the row so — worked out on each ask, never stored.
 */
export function publicRoll(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    purpose: row.purpose,
    params: row.params,
    result: row.result,
    usedAt: row.used_at,
    createdAt: row.created_at,
    ...(row.stale ? { stale: true } : {}),
  };
}

/**
 * The roll of a player's step: the one already waiting, or a new one rolled and kept.
 *
 * Call it inside the transaction that holds the team's row, with the row `teamForUser(client, …,
 * { lock: true })` returned: the roster is read from that row, and the check for a roll already waiting
 * and the write of a new one are not safe against another request without the lock. A request that is
 * refused writes nothing, and a roll that was waiting is handed back as it is, with no write at all.
 *
 * One roll waits for a player at a time: while a roll of the other purpose waits, stale or not, asking is
 * refused with that roll's purpose. A waiting random skill the player has come to hold since it was
 * rolled — taken at the table meanwhile, or added by hand (`heldSkillKeys`, by canonical name, as the die
 * reads it) — comes back marked `stale: true`. It is not spent for a fresh die, which would be a reroll
 * for nothing; the step goes on once the duplicate is gone, or once this roll takes the place of the table
 * advancement. A second advancement for the same skill can take it as well: that only wastes the
 * advancement, and is let be. A characteristic roll is never stale: a skill can always be taken in place
 * of the characteristic.
 *
 * @param {{query: Function}} client the client of the transaction
 * @param {object} step
 * @param {object} step.teamRow the locked saved_teams row
 * @param {string} step.playerId a player of the team's roster
 * @param {string} step.purpose one of `DICE_PURPOSES`, checked by the caller
 * @param {string} [step.category] the Skill Table category of a random skill; a characteristic does not read it
 * @param {string} step.userId who is asking: the roll is kept as theirs
 * @param {(sides: number) => number} [step.rng] the die; the server's own unless a test hands in another
 * @returns {Promise<object>} the dice_rolls row, with `stale: true` on a stale one
 * @throws 404 PLAYER_NOT_FOUND; 409 DICE_ROLL_WAITING `{ purpose }` while a roll of the other purpose waits;
 *   422 DICE_CATEGORY or DICE_NO_SKILL when a random skill cannot be rolled
 */
export async function rollForPlayer(client, { teamRow, playerId, purpose, category, userId, rng = serverDie }) {
  const team = teamBySlug(teamRow.base_team_slug); // null for a race the site no longer knows: it has no players to find
  const player = team && normalizeDraftPlayers(team, teamRow.roster ?? {}).find((item) => item.id === playerId);
  if (!player) throw httpError(404, "PLAYER_NOT_FOUND");
  const position = rowsForTeam(team)[player.rowIndex];
  const { rows: waiting } = await client.query(WAITING_ROLLS, [teamRow.id, player.id]);
  const same = waiting.find((roll) => roll.purpose === purpose);
  if (same) return heldSince(same, position, player) ? { ...same, stale: true } : same;
  if (waiting.length) throw httpError(409, "DICE_ROLL_WAITING", { purpose: waiting[0].purpose });
  const rolled = purpose === "stat"
    ? statRoll(rng)
    : randomSkillRoll({ row: position, player, category, skillGroups: (await matchReference()).skillGroups, rng });
  if (!rolled.ok) throw httpError(422, rolled.reason);
  const { rows: [row] } = await client.query(INSERT_ROLL,
    [teamRow.id, player.id, purpose, JSON.stringify(rolled.params), JSON.stringify(rolled.result), userId]);
  return row;
}

/** Whether a random-skill roll ended on a skill the player holds now. */
function heldSince(roll, position, player) {
  return roll.purpose === "random_skill" && typeof roll.result?.skill === "string"
    && heldSkillKeys(position, player).has(canonicalSkillName(roll.result.skill));
}

/**
 * Hold a save of the roster to the site rolls it refers to. The set of used rolls is the set of site rolls
 * the blob refers to — a new reference must be this team's unused roll for this player and this kind of
 * advancement, and a reference that went (an undone advancement) frees its roll so the next ask hands the
 * same one back instead of a fresh die.
 *
 * A reference is an advancement and the roll it names; the advancement is known by its player and its
 * type, not by its place in the list, which undoing an earlier advancement shifts. A reference the save
 * keeps as it was was settled when it was made and is not looked at again. One whose grant alone changed
 * is the same advancement corrected: its roll must fit the new grant. A new one names a roll by the id the
 * server gave it (anything else is refused before a query), of this team and this player, that fits the
 * advancement (`rollFitsAdvancement`), and whose rerolls the saved roster explains (`rerollsHeldBy`: the
 * die cannot be steered by holding a skill only while it is asked) — else 422 DICE_ROLL_MISMATCH with the
 * player — and that is unused. Rolls are used in the order an ask hands them out and given back last in,
 * first out: after the save, each step it touches must have exactly its earliest rolls used, so a coach
 * who has seen the next roll cannot move an advancement onto it, in one save or over several. A roll used
 * already or out of turn, one another player or kind of advancement held before this save, and one two
 * advancements claim are each 409 DICE_ROLL_USED. Nothing is written until every reference has passed;
 * the rest is the caller's transaction, which takes these writes back with a save that fails after them.
 *
 * Call it inside the transaction that holds the team's row (`writeSavedTeam`): that lock is what keeps a
 * roll from being handed out or used twice meanwhile. A save that adds no reference, changes none and
 * drops none asks nothing of the database.
 *
 * @param {{query: Function}} client the client of the transaction
 * @param {{teamId: string, race?: object|null, before: object, after: object}} save the team; its race (the
 *   team page `teamBySlug` gives), whose positions say what a player holds; its roster as stored and as saved
 * @returns {Promise<{used: string[], freed: string[]}>} the rolls this save used and the rolls it freed
 * @throws 422 DICE_ROLL_MISMATCH `{ playerId }`; 409 DICE_ROLL_USED
 */
export async function settleRosterRolls(client, { teamId, race = null, before, after }) {
  const was = siteRollReferences(before), now = siteRollReferences(after);
  const changed = now.filter((reference) => !was.some((old) => sameAdvancement(old, reference) && sameGrant(old, reference)));
  const notARoll = changed.find((reference) => !isUuid(reference.id));
  if (notARoll) throw httpError(422, "DICE_ROLL_MISMATCH", { playerId: notARoll.playerId });
  const claimed = new Set(now.map((reference) => reference.id)), held = new Set(was.map((reference) => reference.id));
  const added = changed.filter((reference) => !held.has(reference.id));
  const regranted = changed.filter((reference) => was.some((old) => sameAdvancement(old, reference)));
  if (claimed.size < now.length || added.length + regranted.length < changed.length) throw httpError(409, "DICE_ROLL_USED");
  const freed = [...held].filter((id) => isUuid(id) && !claimed.has(id));
  if (changed.length || freed.length) await checkRolls(client, teamId, { added, regranted, freed, holds: heldSkillsIn(after, race) });
  const used = added.map((reference) => reference.id);
  if (used.length) await client.query(USE_ROLLS, [used, teamId]);
  if (freed.length) await client.query(FREE_ROLLS, [teamId, freed]);
  return { used, freed };
}

/**
 * The rolls a save names, checked against their rows: each new or corrected reference against its own row
 * (422), a new one for being unused (409), and then every step the save touches — a roll referenced anew,
 * corrected or dropped — for its used rolls being exactly its earliest, by `created_at, id` (409).
 */
async function checkRolls(client, teamId, { added, regranted, freed, holds }) {
  const references = [...added, ...regranted];
  const { rows } = await client.query(ROLLS_OF_PLAYERS, [teamId, [...references.map((reference) => reference.id), ...freed]]);
  const byId = new Map(rows.map((row) => [row.id, row])); // as Postgres writes a uuid: an id in capitals is no roll's
  for (const reference of references) {
    const row = byId.get(reference.id);
    if (!row || row.player_id !== reference.playerId || !rollFitsAdvancement(row, reference) || !rerollsHeldBy(row, holds(reference.playerId))) {
      throw httpError(422, "DICE_ROLL_MISMATCH", { playerId: reference.playerId });
    }
  }
  const taken = new Set(added.map((reference) => reference.id)), given = new Set(freed.map((id) => id.toLowerCase()));
  if ([...taken].some((id) => byId.get(id).used_at !== null)) throw httpError(409, "DICE_ROLL_USED");
  const usedAfter = (row) => taken.has(row.id) || (row.used_at !== null && !given.has(row.id));
  const touched = [...references.map((reference) => reference.id), ...given].map((id) => byId.get(id)).filter(Boolean);
  for (const row of touched) {
    const step = rows.filter((other) => other.player_id === row.player_id && other.purpose === row.purpose);
    if (step.some((other, at) => at > 0 && usedAfter(other) && !usedAfter(step[at - 1]))) throw httpError(409, "DICE_ROLL_USED");
  }
}

/** `heldSkillKeys` of a player as the save leaves him, by id: what a random skill's rerolls are held to. */
function heldSkillsIn(after, race) {
  const positions = race ? rowsForTeam(race) : [];
  return (playerId) => {
    const player = (Array.isArray(after?.players) ? after.players : []).find((item) => item?.id === playerId);
    const position = player ? positions[player.rowIndex] : undefined;
    return position ? heldSkillKeys(position, player) : new Set();
  };
}

/** The same roll named by the same advancement: one id, one player, one type of advancement. */
function sameAdvancement(left, right) {
  return left.id === right.id && left.playerId === right.playerId && left.type === right.type;
}

/** The same thing granted: one skill, or one characteristic. */
function sameGrant(left, right) {
  return left.grants?.skill === right.grants?.skill && left.grants?.stat === right.grants?.stat;
}

/**
 * Refuse a roster a team is being created with when it names a site roll. A new team has no rolls, so the
 * reference can only be made up, and once stored every later save would keep it as settled: 422
 * DICE_ROLL_MISMATCH with the player, the answer a save gives a roll the team does not have. Every path
 * that creates a team from a client's body calls this before its INSERT.
 */
export function refuseSiteRolls(roster) {
  const [named] = siteRollReferences(roster);
  if (named) throw httpError(422, "DICE_ROLL_MISMATCH", { playerId: named.playerId });
}
