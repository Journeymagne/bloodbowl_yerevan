/**
 * The dice the site rolls for a player: the server's die, and one roll a step.
 *
 * A coach never sends a result, only asks for a roll (migration 012). The die is `serverDie`, and
 * what it shows is kept whole — every attempt, the skills that were rolled again too — as a
 * `dice_rolls` row until an advancement takes it. The rules of the dice are the pure ones in
 * `src/domain/roster/dice.mjs`; this module hands them the die and keeps the answer.
 *
 * A step is a player and a purpose. While the player has an unused roll for the purpose, asking
 * again hands back the earliest of them, whatever category is asked this time: a roll cannot be
 * thrown again until it suits. That one unused roll per player and purpose is held by the team row
 * lock every writer of this table takes first (`teamForUser(…, { lock: true })` inside a
 * transaction, `writeSavedTeam`'s FOR UPDATE), and by nothing else — there is no index for it, on
 * purpose. An undone advancement frees its roll while the next one may already wait, which a unique
 * index over the unused rolls would refuse. A random skill the player has come to hold since it was
 * rolled is the one roll nobody can take: it is spent instead of handed back.
 *
 * A roll is used by the advancement that names it (`roll: { id, via: "site" }`), and by one only:
 * a save of the roster settles that (`settleRosterRolls`).
 */
import crypto from "node:crypto";

import { randomSkillRoll, rollFitsAdvancement, siteRollReferences, statRoll } from "../../src/domain/roster/dice.mjs";
import { canonicalSkillName, heldSkillKeys, normalizeDraftPlayers } from "../../src/domain/roster/players.mjs";
import { rowsForTeam } from "../../src/domain/roster/values.mjs";
import { matchReference } from "../domain/match-reference.mjs";
import { teamBySlug } from "../domain/roster.mjs";
import { httpError } from "../http/errors.mjs";
import { isUuid } from "./team-access.mjs";

const WAITING_ROLLS = `
  SELECT * FROM dice_rolls
   WHERE saved_team_id = $1 AND player_id = $2 AND purpose = $3 AND used_at IS NULL
   ORDER BY created_at, id`;

const INSERT_ROLL = `
  INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, rolled_by)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *`;

const ROLLS_OF_TEAM = "SELECT id, player_id, purpose, result, used_at FROM dice_rolls WHERE id = ANY($1::uuid[]) AND saved_team_id = $2";
const USE_ROLLS = "UPDATE dice_rolls SET used_at = now() WHERE id = ANY($1::uuid[]) AND saved_team_id = $2";
const FREE_ROLLS = "UPDATE dice_rolls SET used_at = NULL WHERE saved_team_id = $1 AND id = ANY($2::uuid[])";

/** A die of `sides` faces: an integer from 1 to `sides`, from the system's own randomness. */
export const serverDie = (sides) => crypto.randomInt(1, sides + 1);

/** A `dice_rolls` row as a client reads it. The team and who rolled it stay on the server. */
export function publicRoll(row) {
  return {
    id: row.id,
    playerId: row.player_id,
    purpose: row.purpose,
    params: row.params,
    result: row.result,
    usedAt: row.used_at,
    createdAt: row.created_at,
  };
}

/**
 * The roll of a player's step: the one already waiting, or a new one rolled and kept.
 *
 * Call it inside the transaction that holds the team's row, with the row `teamForUser(client, …,
 * { lock: true })` returned: the roster is read from that row, and the check for a roll already waiting
 * and the write of a new one are not safe against another request without the lock. A request that is
 * refused writes nothing (the transaction takes back a stale roll it spent), and a roll that was waiting
 * is handed back as it is, with no write at all.
 *
 * @param {{query: Function}} client the client of the transaction
 * @param {object} step
 * @param {object} step.teamRow the locked saved_teams row
 * @param {string} step.playerId a player of the team's roster
 * @param {string} step.purpose one of `DICE_PURPOSES`, checked by the caller
 * @param {string} [step.category] the Skill Table category of a random skill; a characteristic does not read it
 * @param {string} step.userId who is asking: the roll is kept as theirs
 * @param {(sides: number) => number} [step.rng] the die; the server's own unless a test hands in another
 * @returns {Promise<object>} the dice_rolls row
 * @throws 404 PLAYER_NOT_FOUND; 422 DICE_CATEGORY or DICE_NO_SKILL when a random skill cannot be rolled
 */
export async function rollForPlayer(client, { teamRow, playerId, purpose, category, userId, rng = serverDie }) {
  const team = teamBySlug(teamRow.base_team_slug); // null for a race the site no longer knows: it has no players to find
  const player = team && normalizeDraftPlayers(team, teamRow.roster ?? {}).find((item) => item.id === playerId);
  if (!player) throw httpError(404, "PLAYER_NOT_FOUND");
  const position = rowsForTeam(team)[player.rowIndex];
  const waiting = await waitingRoll(client, { teamId: teamRow.id, player, position, purpose });
  if (waiting) return waiting;
  const rolled = purpose === "stat"
    ? statRoll(rng)
    : randomSkillRoll({ row: position, player, category, skillGroups: (await matchReference()).skillGroups, rng });
  if (!rolled.ok) throw httpError(422, rolled.reason);
  const { rows: [row] } = await client.query(INSERT_ROLL,
    [teamRow.id, player.id, purpose, JSON.stringify(rolled.params), JSON.stringify(rolled.result), userId]);
  return row;
}

/**
 * The earliest unused roll of a step that can still be taken, if there is one. A random skill the player
 * has come to hold since it was rolled — taken at the table meanwhile, or added by hand — would be a skill
 * he has twice, and the step would be stuck on it: every such roll of the step is spent (`used_at`) instead,
 * and the next one, or a new roll, answers. Held is `heldSkillKeys`, by canonical name, as the die itself
 * reads it. A characteristic roll is never stale: whatever the player has gained since, a skill can still
 * be taken in place of the characteristic (`rollFitsAdvancement`).
 */
async function waitingRoll(client, { teamId, player, position, purpose }) {
  const { rows } = await client.query(WAITING_ROLLS, [teamId, player.id, purpose]);
  const held = purpose === "random_skill" ? heldSkillKeys(position, player) : new Set();
  const stale = rows.filter((roll) => typeof roll.result?.skill === "string" && held.has(canonicalSkillName(roll.result.skill)));
  if (stale.length) await client.query(USE_ROLLS, [stale.map((roll) => roll.id), teamId]);
  return rows.find((roll) => !stale.includes(roll));
}

/**
 * Hold a save of the roster to the site rolls it refers to. The set of used rolls is the set of site rolls
 * the blob refers to — a new reference must be this team's unused roll for this player and this kind of
 * advancement, and a reference that went (an undone advancement) frees its roll so the next ask hands the
 * same one back instead of a fresh die.
 *
 * A reference is an advancement and the roll it names; the advancement is known by its player, its type and
 * what it grants, not by its place in the list, which undoing an earlier advancement shifts. A reference the
 * save keeps was settled when it was made and is not looked at again. A new one names a roll by the id the
 * server gave it (anything else is refused before a query), of this team and this player, that fits the
 * advancement (`rollFitsAdvancement`) — else 422 DICE_ROLL_MISMATCH with the player — and that is unused:
 * a roll used already, one another advancement held before this save, and one two advancements claim are
 * each 409 DICE_ROLL_USED. Nothing is written until every new reference has passed; the rest is the
 * caller's transaction, which takes these writes back with a save that fails after them.
 *
 * Call it inside the transaction that holds the team's row (`writeSavedTeam`): that lock is what keeps a
 * roll from being handed out or used twice meanwhile. A save that adds no reference and drops none asks
 * nothing of the database.
 *
 * @param {{query: Function}} client the client of the transaction
 * @param {{teamId: string, before: object, after: object}} save the team, its roster as stored and as saved
 * @returns {Promise<{used: string[], freed: string[]}>} the rolls this save used and the rolls it freed
 * @throws 422 DICE_ROLL_MISMATCH `{ playerId }`; 409 DICE_ROLL_USED
 */
export async function settleRosterRolls(client, { teamId, before, after }) {
  const was = siteRollReferences(before), now = siteRollReferences(after);
  const added = now.filter((reference) => !was.some((old) => sameReference(old, reference)));
  const notARoll = added.find((reference) => !isUuid(reference.id));
  if (notARoll) throw httpError(422, "DICE_ROLL_MISMATCH", { playerId: notARoll.playerId });
  const claimed = new Set(now.map((reference) => reference.id)), held = new Set(was.map((reference) => reference.id));
  if (claimed.size < now.length || added.some((reference) => held.has(reference.id))) throw httpError(409, "DICE_ROLL_USED");
  const used = added.map((reference) => reference.id);
  if (used.length) await useRolls(client, teamId, added);
  const freed = [...held].filter((id) => isUuid(id) && !claimed.has(id));
  if (freed.length) await client.query(FREE_ROLLS, [teamId, freed]);
  return { used, freed };
}

/** The rows of new references checked against them, every one, and only then marked used. */
async function useRolls(client, teamId, references) {
  const ids = references.map((reference) => reference.id);
  const { rows } = await client.query(ROLLS_OF_TEAM, [ids, teamId]);
  const byId = new Map(rows.map((row) => [row.id, row])); // as Postgres writes a uuid: an id in capitals is no roll's
  for (const reference of references) {
    const row = byId.get(reference.id);
    if (!row || row.player_id !== reference.playerId || !rollFitsAdvancement(row, reference)) {
      throw httpError(422, "DICE_ROLL_MISMATCH", { playerId: reference.playerId });
    }
    if (row.used_at !== null) throw httpError(409, "DICE_ROLL_USED");
  }
  await client.query(USE_ROLLS, [ids, teamId]);
}

/** The same advancement naming the same roll: one player, one type, one grant, one id. */
function sameReference(left, right) {
  return left.id === right.id && left.playerId === right.playerId && left.type === right.type
    && left.grants?.skill === right.grants?.skill && left.grants?.stat === right.grants?.stat;
}
