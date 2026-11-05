import test from 'node:test';
import assert from 'node:assert/strict';
import { fireEvent } from './helpers/fake-dom.mjs';
import { withoutTimers } from './helpers/without-timers.mjs';
import { EVENTS, LIVE_GAME, api, coach, gamesAre, injuryButton, injuryRow, injurySheet, optionFor,
  posts, recordButton, renderTeamRoster, settle, view } from './helpers/roster-screen.mjs';

const READ = 'GET /api/teams/t1/getting-even?pairing=g2';
const WRITE = 'POST /api/teams/t1/getting-even';
const attacker = { side: 'away', playerId: 'orc', number: '3', name: 'Visitor', teamName: 'Visitors', keywords: ['Orc'] };
const injury = { code: 'miss' };
const decision = { id: 'decision', playerId: 'p1', injuryEventId: null, injury, roll: 5, source: 'table', attacker, keyword: 'Orc' };
const context = (over = {}) => ({ own: 'home', gamesPlayed: 3, players: [attacker], injuries: {}, decisions: [], ...over });

test('a live injury records its Getting Even decision, and the awarded Hatred appears in the roster', async () => {
  await withoutTimers(async () => {
    coach(); gamesAre([LIVE_GAME]);
    api.reply(READ, 200, context());
    await renderTeamRoster('t1');
    fireEvent(injuryButton(), 'click');
    await settle();
    fireEvent(optionFor('miss'), 'click');
    const source = injurySheet().querySelector('[data-even-attacker]');
    source.value = 'away:orc'; fireEvent(source, 'change');
    api.reply(WRITE, 200, { decision });
    fireEvent(injurySheet().querySelector('[data-even-action="manual"]'), 'click');
    fireEvent(injurySheet().querySelector('[data-even-face="5"]'), 'click');
    await settle();
    assert.match(injurySheet().querySelector('.g-even__result').textContent, /Hatred \(Orc\)/);
    const roll = api.calls.find(call => call.key === WRITE).body;
    assert.deepEqual([roll.action, roll.roll, roll.attacker, roll.injury], ['table', 5, { side: 'away', playerId: 'orc' }, injury]);
    api.reply(EVENTS, 201, { event: injuryRow(injury, { gettingEven: { ...decision, injuryEventId: 'e1' } }) });
    fireEvent(recordButton(), 'click');
    await settle();
    assert.equal(posts().length, 1);
    assert.equal(posts()[0].body.gettingEvenId, decision.id);
    assert.equal(injurySheet(), null);
    assert.match(view.textContent, /Hatred \(Orc\)/);
    api.assertAnswered();
  });
});

test('resolving a standing injury saves its decision without adding a second injury event', async () => {
  await withoutTimers(async () => {
    const event = injuryRow(injury);
    coach({ events: [event] }); gamesAre([LIVE_GAME]);
    api.reply(READ, 200, context({ injuries: { p1: event }, decisions: [{ ...decision, injuryEventId: event.id }] }));
    api.reply(WRITE, 200, { decision: { ...decision, injuryEventId: event.id } });
    await renderTeamRoster('t1');
    fireEvent(injuryButton(), 'click');
    await settle();
    assert.equal(injurySheet().querySelector('[data-even-action="roll"]'), null, 'the stored D6 cannot be rolled again');
    fireEvent(recordButton(), 'click');
    await settle();
    assert.equal(posts().length, 0);
    assert.equal(api.calls.find(call => call.key === WRITE).body.eventId, event.id);
    assert.equal(injurySheet(), null);
    api.assertAnswered();
  });
});
