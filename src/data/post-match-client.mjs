import { apiRequest, sessionTokenHolds } from '../core/api-client.mjs';
import { t } from '../core/i18n.mjs';
import { refusalWithRules, unanswered } from './teams.mjs';
import { sameValues } from '../domain/post-match/events.mjs';
import { DICE_PURPOSES } from '../domain/roster/dice.mjs';

/**
 * Retry independent opponent edits without replacing changes to this coach's draft. What the coach saw
 * (the side and the shared result) is compared by value: jsonb hands an object back with its keys
 * reordered and without the keys that held undefined, which is no change.
 */
export async function savePostMatch(request, payload, name, action, finish = false) {
  const path = '/api/games/' + encodeURIComponent(payload.postMatch.gameId);
  const write = current => request(path + (finish ? '/finish' : '/post-match'), {
    method: finish ? 'POST' : 'PATCH',
    body: JSON.stringify({ revision: current.postMatch.revision, side: name, action }),
  });
  try { return await write(payload); }
  catch (error) {
    if (error.code !== 'POST_REVISION') throw error;
    const latest = await request(path + '/post-match');
    if (!sameValues(latest.postMatch[name], payload.postMatch[name])
      || !sameValues(latest.postMatch.result, payload.postMatch.result)) throw error;
    return write(latest);
  }
}

/** The players of a post-match whose roll is asked and not yet answered, by game, side and player. */
const asking = new Set();
const askKey = (gameId, side, playerId) => JSON.stringify([String(gameId), String(side), String(playerId)]);

/** A roll as the server answers with it (`publicRoll`): its id, one of the purposes, and what came up. */
const isRoll = roll => typeof roll?.id === 'string' && roll.id !== '' && DICE_PURPOSES.includes(roll.purpose)
  && Boolean(roll.result) && typeof roll.result === 'object';

/**
 * Ask the server for the roll of a post-match's advancement (stage 09b, Task 10: `POST /api/games/:id/post-match/rolls`,
 * the side's coach on the Players step, by the roster the post-match holds), as the roster asks its own (`askRoll`,
 * screens/team/roster/rolls.mjs): a random skill of a category (`random_skill`) or a characteristic's D8 (`stat`, which
 * reads no category). The answer is the roll, new or the one that waits; one that did not come (the network, a timeout,
 * a proxy's page, a 5xx, a 2xx without the roll) is `lost` — asking again hands it back. A roll of the other purpose
 * that waits is said by its purpose (409 `DICE_ROLL_WAITING`); any other refusal in the server's words, with its code.
 * One ask is in the air for a player at a time: a second press while it is out sends nothing (`ignored`). Like the
 * roster's, it first hears why the screen sends nothing just now (`closed`, required) and whether the session is still
 * this page's coach's.
 *
 * @param {string} gameId @param {"home"|"away"} side @param {string} playerId his id in the side's roster
 * @param {{purpose: string, category?: string, closed: () => string}} ask
 * @returns {Promise<{roll: object} | {waiting: string} | {refusal: string, code?: string} | {lost: true} | {ignored: true}>}
 */
export function askPostRoll(gameId, side, playerId, ask) {
  if (typeof ask?.closed !== 'function') throw new TypeError('A roll asks why the screen is closed: closed (K15)');
  return sendPostAsk(gameId, side, playerId, ask);
}

async function sendPostAsk(gameId, side, playerId, { purpose, category, closed }) {
  const key = askKey(gameId, side, playerId);
  if (asking.has(key)) return { ignored: true };
  const reason = closed() ?? '';
  if (reason) return { refusal: reason };
  if (!sessionTokenHolds()) return { refusal: t('auth.otherTab') };
  asking.add(key);
  try {
    const body = { side, playerId, purpose, ...(purpose === 'random_skill' ? { category } : {}) };
    const answer = await apiRequest('/api/games/' + encodeURIComponent(gameId) + '/post-match/rolls', { method: 'POST', body: JSON.stringify(body) });
    return isRoll(answer?.roll) ? { roll: answer.roll } : { lost: true };
  } catch (error) {
    if (unanswered(error)) return { lost: true };
    const waiting = error?.code === 'DICE_ROLL_WAITING' ? error.params?.purpose : null;
    if (DICE_PURPOSES.includes(waiting)) return { waiting };
    return { refusal: refusalWithRules(error), ...(error?.code ? { code: error.code } : {}) };
  } finally {
    asking.delete(key);
  }
}
