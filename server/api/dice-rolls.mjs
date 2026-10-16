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
 * transaction), and by nothing else — there is no index for it, on purpose. An undone advancement
 * frees its roll while the next one may already wait, which a unique index over the unused rolls
 * would refuse.
 */
import crypto from "node:crypto";

import { randomSkillRoll, statRoll } from "../../src/domain/roster/dice.mjs";
import { normalizeDraftPlayers } from "../../src/domain/roster/players.mjs";
import { rowsForTeam } from "../../src/domain/roster/values.mjs";
import { matchReference } from "../domain/match-reference.mjs";
import { teamBySlug } from "../domain/roster.mjs";
import { httpError } from "../http/errors.mjs";

const WAITING_ROLL = `
  SELECT * FROM dice_rolls
   WHERE saved_team_id = $1 AND player_id = $2 AND purpose = $3 AND used_at IS NULL
   ORDER BY created_at, id
   LIMIT 1`;

const INSERT_ROLL = `
  INSERT INTO dice_rolls (saved_team_id, player_id, purpose, params, result, rolled_by)
  VALUES ($1, $2, $3, $4, $5, $6)
  RETURNING *`;

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
 * refused writes nothing, and a roll that was waiting is handed back as it is, with no write at all.
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
  const { rows: [waiting] } = await client.query(WAITING_ROLL, [teamRow.id, player.id, purpose]);
  if (waiting) return waiting;
  const rolled = purpose === "stat"
    ? statRoll(rng)
    : randomSkillRoll({ row: rowsForTeam(team)[player.rowIndex], player, category, skillGroups: (await matchReference()).skillGroups, rng });
  if (!rolled.ok) throw httpError(422, rolled.reason);
  const { rows: [row] } = await client.query(INSERT_ROLL,
    [teamRow.id, player.id, purpose, JSON.stringify(rolled.params), JSON.stringify(rolled.result), userId]);
  return row;
}
