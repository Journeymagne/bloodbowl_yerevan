import test from 'node:test';
import assert from 'node:assert/strict';
import { installFakeApi } from './helpers/fake-api.mjs';

// The client takes `fetch` when it loads (helpers/fake-api.mjs): the fake one first, then the module.
const api = installFakeApi();
const { rememberSessionToken } = await import('../src/core/api-client.mjs');
const { setDictionaries } = await import('../src/core/i18n.mjs');
const { askPostRoll, savePostMatch } = await import('../src/data/post-match-client.mjs');

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

test('the retry compares what the coach saw by value: keys jsonb reordered, or a key that held undefined, are not a change', async () => {
  const original = draft(), latest = draft(), calls = [];
  original.postMatch.home.note = undefined;
  latest.postMatch.revision = 2;
  latest.postMatch.home = { statistics: {}, stage: 2 };
  latest.postMatch.result = { accepted: { away: true, home: true } };
  const saved = await savePostMatch(async (path, options) => { calls.push(options); if (calls.length === 1) throw conflict(); return latest; },
    original, 'home', { type: 'statistics' });
  assert.equal(saved, latest);
  assert.equal(calls.length, 3);
});

// Stage 09b, Task 10: the post-match's own dice (POST /api/games/:id/post-match/rolls), asked as the roster asks its
// (roster/rolls.mjs `askRoll`): one ask in the air per player, the answer the roll, a lost answer lost.
setDictionaries({ en: { 'auth.otherTab': 'Someone signed in or out in another tab, so nothing was saved here.',
  'error.PLAYER_NOT_FOUND': 'This player is no longer on the team.', 'error.POST_ACTION': 'This step is closed.' } });
const ROLLS_URL = 'POST /api/games/g1/post-match/rolls';
const ROLL = { id: '8f6c1d1e-0000-4000-8000-000000000001', playerId: 'h1', purpose: 'random_skill', params: { category: 'General', sides: 16 },
  result: { dice: [{ attempts: [{ roll: 4, skill: 'Frenzy', duplicate: false }], skill: 'Frenzy' }, { attempts: [{ roll: 8, skill: 'Strip Ball', duplicate: false }], skill: 'Strip Ball' }] },
  usedAt: null, createdAt: '2026-10-21T10:00:00Z' };
const D8 = { ...ROLL, id: '8f6c1d1e-0000-4000-8000-000000000002', purpose: 'stat', params: { sides: 8 }, result: { roll: 3, stats: ['ar', 'ma', 'pa'] } };
const OPEN = () => '';
const rollAsks = () => api.calls.filter(({ key }) => key === ROLLS_URL);
const tick = () => new Promise((resolve) => setImmediate(resolve));
function signIn() {
  api.reset();
  api.items.set('gata-league-auth-token', 'tok');
  rememberSessionToken('tok');
}

test('a post-match roll is asked once at a time, a lost answer is lost, a waiting roll of the other kind is said by its purpose', async () => {
  signIn();
  api.reply(ROLLS_URL, 200, { roll: ROLL });
  assert.deepEqual(await askPostRoll('g1', 'home', 'h1', { purpose: 'random_skill', category: 'General', closed: OPEN }), { roll: ROLL });
  api.reply(ROLLS_URL, 200, { roll: D8 });
  assert.deepEqual(await askPostRoll('g1', 'away', 'a1', { purpose: 'stat', category: 'General', closed: OPEN }), { roll: D8 });
  assert.deepEqual(rollAsks().map(({ body }) => body), [{ side: 'home', playerId: 'h1', purpose: 'random_skill', category: 'General' },
    { side: 'away', playerId: 'a1', purpose: 'stat' }], 'a D8 has no category');
  // One ask in the air per player: a second press while it is out sends nothing; another player's is his own.
  const gate = api.hold(ROLLS_URL);
  const first = askPostRoll('g1', 'home', 'h1', { purpose: 'random_skill', category: 'General', closed: OPEN });
  assert.deepEqual(await askPostRoll('g1', 'home', 'h1', { purpose: 'random_skill', category: 'General', closed: OPEN }), { ignored: true });
  const other = askPostRoll('g1', 'home', 'h2', { purpose: 'stat', closed: OPEN });
  await tick();
  assert.equal(rollAsks().length, 4, "h1's once, and h2's of his own");
  gate.release({ status: 200, body: { roll: ROLL } });
  assert.deepEqual(await first, { roll: ROLL });
  assert.deepEqual(await other, { roll: ROLL });
  api.reply(ROLLS_URL, 200, { roll: D8 });
  assert.deepEqual(await askPostRoll('g1', 'home', 'h1', { purpose: 'stat', closed: OPEN }), { roll: D8 }, 'answered, the press is open again');
  // A lost answer — the network, a proxy's page, a 5xx, a 2xx without a roll — is lost: asking again hands the roll back.
  api.fail(ROLLS_URL);
  const ask = () => askPostRoll('g1', 'home', 'h1', { purpose: 'random_skill', category: 'General', closed: OPEN });
  assert.deepEqual(await ask(), { lost: true });
  api.reply(ROLLS_URL, 502, '<html>Bad gateway</html>');
  assert.deepEqual(await ask(), { lost: true });
  api.reply(ROLLS_URL, 200, { roll: { ...ROLL, purpose: 'block' } });
  assert.deepEqual(await ask(), { lost: true });
  // A roll of the other kind waiting: said by its purpose.
  api.reply(ROLLS_URL, 409, { error: { code: 'DICE_ROLL_WAITING', params: { purpose: 'stat' }, message: 'x' } });
  assert.deepEqual(await ask(), { waiting: 'stat' });
  // Any other refusal in the server's words, with its code.
  api.reply(ROLLS_URL, 404, { error: { code: 'PLAYER_NOT_FOUND', params: {}, message: 'x' } });
  assert.deepEqual(await ask(), { refusal: 'This player is no longer on the team.', code: 'PLAYER_NOT_FOUND' });
  api.reply(ROLLS_URL, 409, { error: { code: 'POST_ACTION', params: {}, message: 'x' } });
  assert.deepEqual(await ask(), { refusal: 'This step is closed.', code: 'POST_ACTION' });
  // Why the screen is closed at the press is asked first (K15); another tab's coach is told; neither sends.
  const before = rollAsks().length;
  assert.deepEqual(await askPostRoll('g1', 'home', 'h1', { purpose: 'stat', closed: () => 'Wait until your edits are saved' }), { refusal: 'Wait until your edits are saved' });
  api.items.set('gata-league-auth-token', 'someone-else');
  assert.match((await ask()).refusal, /another tab/);
  assert.equal(rollAsks().length, before);
  assert.throws(() => askPostRoll('g1', 'home', 'h1', { purpose: 'stat' }), TypeError, 'an ask not told why the screen is closed');
});
