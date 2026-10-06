import test from 'node:test';
import assert from 'node:assert/strict';
import { savePostMatch } from '../src/data/post-match-client.mjs';

const draft = () => ({ postMatch: { gameId: 'game', revision: 1, result: { accepted: { home: true, away: true } },
  home: { stage: 2, statistics: {} }, away: { stage: 2, statistics: {} } } });
const conflict = () => Object.assign(new Error('Changed'), { code: 'POST_REVISION' });

test('opponent-only revision conflicts retry the same form against the latest revision', async () => {
  const original = draft(), latest = draft(), calls = [], action = { type: 'statistics', mvps: ['player'] };
  latest.postMatch.revision = 2; latest.postMatch.away.stage = 3;
  const saved = await savePostMatch(async (path, options) => {
    calls.push({ path, options });
    if (calls.length === 1) throw conflict();
    return latest;
  }, original, 'home', action);
  assert.equal(saved, latest); assert.equal(calls.length, 3);
  assert.equal(calls[1].options, undefined);
  assert.deepEqual(JSON.parse(calls[2].options.body), { revision: 2, side: 'home', action });
  assert.equal(original.postMatch.revision, 1);
});

test('own draft or shared result changes are never silently overwritten', async () => {
  for (const changed of ['home', 'result']) {
    const latest = draft(); latest.postMatch[changed] = { changed: true };
    let writes = 0;
    await assert.rejects(savePostMatch(async (path, options) => {
      if (options) { writes++; throw conflict(); }
      return latest;
    }, draft(), 'home', { type: 'statistics' }), { code: 'POST_REVISION' });
    assert.equal(writes, 1);
  }
});

test('conflicts retry once; validation or network failures do not retry', async () => {
  for (const code of ['POST_REVISION', 'POST_STATISTICS', 'POST_TEAM_CHANGED', null]) {
    let writes = 0;
    await assert.rejects(savePostMatch(async (path, options) => {
      if (!options) return draft();
      writes++; throw Object.assign(new Error('Failed'), { code });
    }, draft(), 'home', { type: 'statistics' }));
    assert.equal(writes, code === 'POST_REVISION' ? 2 : 1);
  }
});
