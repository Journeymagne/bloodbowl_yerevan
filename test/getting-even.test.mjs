import test from 'node:test';
import assert from 'node:assert/strict';
import { applyGettingEven, currentInjuryEvents, gettingEvenEligible, gettingEvenStatus, hatredKeywords } from '../src/domain/getting-even.mjs';
import { followGettingEven } from '../src/domain/post-match/events.mjs';
import { normalizeRosterPlayer, skillsForPlayer } from '../src/domain/roster/players.mjs';
import { playerCurrentCost } from '../src/domain/roster/costs.mjs';

const injury = { code: 'niggling' };
const decision = { id: 'decision', injuryEventId: 'injury', playerId: 'p', injury, roll: 5, source: 'site', keyword: 'Orc',
  attacker: { side: 'away', playerId: 'orc', name: 'Black Orc', teamName: 'Visitors', keywords: ['Orc'] } };
const event = { id: 'injury', playerId: 'p', counter: 'injury', delta: 1, injury, gettingEven: decision };
const row = { position: 'Lineman', price: '50K', skills: ['Block'], primary: ['G'], secondary: ['A'] };

test('Getting Even follows the effective casualty, including rookie protection and final treatment', () => {
  for (const code of ['miss', 'niggling', 'lasting']) {
    assert.equal(gettingEvenEligible({ code }, 3), true);
    assert.equal(gettingEvenEligible({ code }, 2), false);
  }
  for (const code of ['none', 'badly-hurt', 'dead']) assert.equal(gettingEvenEligible({ code }, 5), false);
  assert.equal(gettingEvenEligible(null, 5), false);
});

test('targets are the causing player’s keywords, excluding roles even on a mixed team', () => {
  assert.deepEqual(hatredKeywords({ row: { tags: ['Troll', 'Big Guy'] } }), ['Troll']);
  assert.deepEqual(hatredKeywords({ keywords: ['Skeleton', 'Undead', 'Lineman', 'Undead'] }), ['Skeleton', 'Undead']);
  assert.deepEqual(hatredKeywords({ keywords: [' Big Guy ', 'Blitzer', 'Blocker', 'Catcher', 'Lineman', 'Runner', 'Special', 'Thrower'] }), []);
  assert.deepEqual(hatredKeywords({ name: 'Black Orc' }), [], 'a missing keyword is never guessed from a name');
});

test('successful rolls require an eligible selection; absent data is not a failed roll', () => {
  assert.equal(gettingEvenStatus(null), 'pending');
  assert.equal(gettingEvenStatus({ ...decision, roll: 3 }), 'failed');
  assert.equal(gettingEvenStatus({ ...decision, roll: 4 }), 'earned');
  assert.equal(gettingEvenStatus({ ...decision, keyword: null }), 'pending');
  assert.equal(gettingEvenStatus({ ...decision, keyword: 'Blocker' }), 'pending');
  assert.equal(gettingEvenStatus({ ...decision, keyword: 'Goblin' }), 'pending');
});

test('an injury undo cancels that event, revealing any older injury and its own decision', () => {
  const earlier = { ...event, id: 'earlier', injury: { code: 'miss' }, gettingEven: null };
  const removed = { ...event, id: 'undo', delta: -1, gettingEven: undefined };
  assert.equal(currentInjuryEvents([earlier, event]).p.id, event.id);
  assert.equal(currentInjuryEvents([earlier, event, removed]).p.id, earlier.id);
  assert.deepEqual(currentInjuryEvents([event, removed]), {});
});

test('Hatred survives normalization without costing SPP, value or advancement slots, and duplicates display once', () => {
  const player = normalizeRosterPlayer({ id: 'p', rowIndex: 0, spp: { touchdowns: 2 } }, [row]);
  const before = structuredClone(player), cost = playerCurrentCost(row, player);
  const side = { gamesPlayed: 3, injuries: { p: injury }, gettingEven: { p: decision } };
  applyGettingEven(player, side, 'game');
  applyGettingEven(player, side, 'game');
  applyGettingEven(player, { ...side, gettingEven: { p: { ...decision, id: 'another-source' } } }, 'another-game');
  const saved = normalizeRosterPlayer(player, [row]);
  assert.equal(saved.acquiredHatreds.length, 2, 'two sources remain auditable');
  assert.equal(skillsForPlayer(row, saved).filter(skill => skill.name === 'Hatred (Orc)').length, 1);
  assert.deepEqual(saved.spp, before.spp);
  assert.deepEqual(saved.advancements, before.advancements);
  assert.equal(playerCurrentCost(row, saved), cost);
  assert.equal(saved.acquiredHatreds[0].injuryEventId, 'injury');
});

test('changing the final injury does not apply its former award or remove an earlier acquired trait', () => {
  const player = normalizeRosterPlayer({ id: 'p', rowIndex: 0, acquiredHatreds: [{ ...decision, id: 'old' }] }, [row]);
  applyGettingEven(player, { gamesPlayed: 4, injuries: { p: { code: 'badly-hurt' } }, gettingEven: { p: decision } }, 'game');
  assert.deepEqual(player.acquiredHatreds.map(item => item.id), ['old']);
});

test('late decisions preserve checklist stages and unchanged JSONB reads preserve confirmation and revision', () => {
  const state = { revision: 12, status: 'ready', home: { stage: 6, confirmed: true, injuries: { p: injury } },
    away: { stage: 6, confirmed: true, injuries: {} } };
  const next = followGettingEven(state, { home: [event], away: [] });
  assert.equal(next.home.stage, 6);
  assert.equal(next.home.confirmed, false);
  assert.equal(next.away.confirmed, true);
  next.home.confirmed = true; next.status = 'ready';
  const reorder = value => Array.isArray(value) ? value.map(reorder) : value && typeof value === 'object'
    ? Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reorder(item)])) : value;
  const stored = reorder(next);
  assert.equal(followGettingEven(stored, { home: [event], away: [] }), stored);
  assert.equal(stored.revision, 13);
  assert.equal(stored.home.confirmed, true);
});
