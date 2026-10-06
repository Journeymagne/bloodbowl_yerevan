/** Retry independent opponent edits without replacing changes to this coach's draft. */
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
    if (JSON.stringify(latest.postMatch[name]) !== JSON.stringify(payload.postMatch[name])
      || JSON.stringify(latest.postMatch.result) !== JSON.stringify(payload.postMatch.result)) throw error;
    return write(latest);
  }
}
