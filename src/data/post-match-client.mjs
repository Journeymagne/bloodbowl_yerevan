import { sameValues } from '../domain/post-match/events.mjs';

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
