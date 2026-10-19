/**
 * A player's dice on the site (stage 07d): the roll of an advancement's step, asked of the server (`POST …/rolls`), which
 * keeps it until an advancement takes it and answers the same ask with the same roll — so a lost answer is asked again,
 * and nothing is ever rolled twice; and the team's rolls read for the attempts behind an advancement (`GET …/rolls`).
 * Not a step of the save queue: a roll moves no revision.
 *
 * One ask is in the air for a player at a time: a second press while it is out sends nothing, so the screen never holds
 * two answers to one roll. Like each step of the queue, an ask first hears why the screen sends nothing just now (a
 * match, K15) and whether the session is still this page's coach's.
 */
import { refusalText } from "../../../core/api.mjs";
import { apiRequest, sessionTokenHolds } from "../../../core/api-client.mjs";
import { t } from "../../../core/i18n.mjs";
import { refusalWithRules, unanswered } from "../../../data/teams.mjs";
import { DICE_PURPOSES } from "../../../domain/roster/dice.mjs";

/** The players whose roll is asked and not yet answered, by team and player. */
const asking = new Set();
const askKey = (teamId, playerId) => JSON.stringify([String(teamId), String(playerId)]);

/** A roll as the server answers with it (`publicRoll`): its id, one of the purposes, and what came up. */
const isRoll = (roll) => typeof roll?.id === "string" && roll.id !== "" && DICE_PURPOSES.includes(roll.purpose)
  && Boolean(roll.result) && typeof roll.result === "object";

/** Whether a roll of the player is asked and not yet answered. */
export function rollAsking(teamId, playerId) {
  return asking.has(askKey(teamId, playerId));
}

/**
 * Ask the server for the roll of a player's step: a random skill of a category (`random_skill`) or a characteristic's
 * D8 (`stat`, which reads no category). The answer is the roll, new or the one that waits — a random skill the player
 * holds since comes back `stale`. An answer that did not come (the network, a timeout, a proxy's page, a 5xx, a 2xx
 * without the roll) is `lost`: the roll may be made, and asking again hands it back. A roll of the other purpose that
 * waits is said by its purpose (409 `DICE_ROLL_WAITING`); any other refusal in the server's words, with the rules a
 * roster breaks and who to fix (K21), and its code.
 *
 * @param {string} teamId @param {string} playerId his id in the roster
 * @param {{purpose: string, category?: string, closed?: () => string}} ask `closed`: why the screen sends nothing just
 *   now, asked at the press
 * @returns {Promise<{roll: object} | {waiting: string} | {refusal: string, code?: string} | {lost: true} | {ignored: true}>}
 *   `ignored` for a press while the player's ask is out
 */
export async function askRoll(teamId, playerId, { purpose, category, closed } = {}) {
  const key = askKey(teamId, playerId);
  if (asking.has(key)) return { ignored: true };
  const reason = closed?.() ?? "";
  if (reason) return { refusal: reason };
  if (!sessionTokenHolds()) return { refusal: t("auth.otherTab") };
  asking.add(key);
  try {
    const path = `/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(playerId)}/rolls`;
    const body = purpose === "random_skill" ? { purpose, category } : { purpose };
    const answer = await apiRequest(path, { method: "POST", body: JSON.stringify(body) });
    return isRoll(answer?.roll) ? { roll: answer.roll } : { lost: true };
  } catch (error) {
    if (unanswered(error)) return { lost: true };
    const waiting = error?.code === "DICE_ROLL_WAITING" ? error.params?.purpose : null;
    if (DICE_PURPOSES.includes(waiting)) return { waiting };
    return { refusal: refusalWithRules(error), ...(error?.code ? { code: error.code } : {}) };
  } finally {
    asking.delete(key);
  }
}

/**
 * The team's rolls as the server keeps them, used and waiting, in the order they were rolled (`GET …/rolls`) — with
 * `playerId`, only that player's: the team's include the rolls of players who have left the roster. A body without
 * the list is no answer.
 *
 * @param {string} teamId @param {string} [playerId] his id in the roster
 * @returns {Promise<{rolls: object[]} | {error: string}>}
 */
export async function readRolls(teamId, playerId) {
  try {
    const { rolls } = (await apiRequest(`/api/teams/${encodeURIComponent(teamId)}/rolls`)) ?? {};
    if (!Array.isArray(rolls)) return { error: t("request.noAnswer") };
    return { rolls: playerId === undefined ? rolls : rolls.filter((roll) => String(roll?.playerId) === String(playerId)) };
  } catch (error) {
    return { error: refusalText(error) };
  }
}
