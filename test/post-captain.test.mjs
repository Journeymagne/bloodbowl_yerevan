import test from 'node:test';
import assert from 'node:assert/strict';
import { HOME, RECORDS, agreed, begin, data, hurt, modelOf, reach } from './helpers/post-cases.mjs';
import { mount } from './helpers/ui.mjs';
import { applyPostAction, validatePostSide } from '../src/domain/post-match/state.mjs';
import { projectPostRoster } from '../src/domain/post-match/roster.mjs';
import { nextDraft, nextStep } from '../src/screens/matches/post-money.mjs';

function nextState({ injury, gamesPlayed = 4, roster = HOME } = {}) {
  const events = { home: [...RECORDS.home.map(event => event.playerId === 'h1' ? { ...event, playerId: 'h5' } : event),
    ...hurt('h1', injury ?? { code: 'none' })], away: RECORDS.away };
  return reach(agreed(begin({ events, gamesPlayed, home: { roster } }), { events }), { home: 5, away: 3 }, { events, home: { mvps: ['h3'] } });
}

const captainIds = projection => projection.roster.players.filter(player => player.isCaptain).map(player => player.id);

for (const [label, options] of [
  ['healthy', {}],
  ['missing the next game', { injury: { code: 'miss' } }],
  ['temporarily retired', { roster: HOME.map(player => ({ ...player, temporarilyRetired: player.id === 'h1', skipNextGame: player.id === 'h1' })) }],
  ['protected from death as a rookie', { injury: { code: 'dead' }, gamesPlayed: 2 }],
]) {
  test(`a ${label} captain survives another nomination and an empty next action`, () => {
    const state = nextState(options), before = structuredClone(state);
    for (const captain of ['h3', '', undefined]) {
      const next = applyPostAction(state, 'home', { type: 'next', captain }, data);
      assert.equal(next.home.stage, 6);
      assert.equal(next.home.captain, 'h1');
      assert.deepEqual(captainIds(validatePostSide(next, 'home', data)), ['h1']);
    }
    assert.deepEqual(state, before);
    const model = modelOf(state, 'next');
    assert.deepEqual(nextDraft(model), { captain: 'h1' });
    assert.equal(mount(nextStep(model, nextDraft(model)).contentHtml).querySelector('[data-after-captain]'), null);
  });
}

test('an unfinished old checklist cannot replace its living captain on final confirmation', () => {
  const state = nextState();
  state.home.stage = 6;
  state.home.captain = 'h3';
  assert.deepEqual(captainIds(projectPostRoster(state, 'home', data)), ['h1']);
  assert.match(JSON.stringify(modelOf(state, 'review').steps), /W. Brandt/);
  const confirmed = applyPostAction(state, 'home', { type: 'confirm' }, data);
  assert.equal(confirmed.home.confirmed, true);
  assert.deepEqual(captainIds(validatePostSide(confirmed, 'home', data)), ['h1']);
});

for (const [label, options] of [
  ['death', { injury: { code: 'dead' } }],
  ['no initial captain', { roster: HOME.map(player => ({ ...player, isCaptain: false })) }],
]) {
  test(`${label}: an explicit nomination is required and survives settlement`, () => {
    const state = nextState(options), model = modelOf(state, 'next'), draft = nextDraft(model);
    assert.deepEqual(draft, { captain: '' });
    const step = nextStep(model, draft), choices = mount(step.contentHtml).querySelector('[data-after-captain]');
    assert.ok(choices);
    assert.equal(step.footer.disabled, true);
    if (label === 'death') assert.equal(choices.querySelector('[data-captain="h1"]'), null);
    assert.throws(() => applyPostAction(state, 'home', { type: 'next' }, data), { code: 'POST_CAPTAIN' });
    if (label === 'death') assert.throws(() => applyPostAction(state, 'home', { type: 'next', captain: 'h1' }, data), { code: 'POST_PLAYER' });
    const next = applyPostAction(state, 'home', { type: 'next', captain: 'h3' }, data);
    assert.deepEqual(captainIds(validatePostSide(next, 'home', data)), ['h3']);
    assert.equal(nextStep(model, { captain: 'h3' }).footer.disabled, false);
    assert.deepEqual(nextDraft(modelOf(next, 'next')), { captain: 'h3' });
  });
}
