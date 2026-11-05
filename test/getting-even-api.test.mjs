import test from 'node:test';
import assert from 'node:assert/strict';
import { accessPostMatch } from '../server/season/post-match.mjs';
import { callApi, sessionFor, withApiDatabase } from './helpers/api-db.mjs';
import { G, act, coaches, homeScores, startedFriendly, teams, toPlayersStep } from './helpers/match-db.mjs';
import { scratchSkip } from './helpers/scratch-db.mjs';

const db = { skip: scratchSkip };
const route = `/api/teams/${teams.home}/getting-even`;
const injury = { code: 'niggling' };
const ask = (token, extra = {}) => callApi('POST', route, { token, body: { pairingId: G, playerId: 'home-1', injury, action: 'roll', ...extra } });
async function mature(client) {
  await startedFriendly(client);
  await toPlayersStep();
  await client.query("UPDATE match_post_games SET state=jsonb_set(state,'{home,gamesPlayed}','3') WHERE pairing_id=$1", [G]);
  return sessionFor(client, coaches.home.id);
}

test('a draft roll is reused, bound to its injury, and still reused after reopening', db, () => withApiDatabase(async ({ client }) => {
  const token = await mature(client);
  const first = await ask(token), again = await ask(token);
  assert.equal(first.status, 200, JSON.stringify(first.body));
  assert.deepEqual(again.body.decision, first.body.decision);
  const event = await callApi('POST', `/api/teams/${teams.home}/events`, { token,
    body: { pairingId: G, playerId: 'home-1', counter: 'injury', delta: 1, injury, gettingEvenId: first.body.decision.id } });
  assert.equal(event.status, 201, JSON.stringify(event.body));
  const reopened = await ask(token, { eventId: event.body.event.id });
  assert.equal(reopened.body.decision.roll, first.body.decision.roll);
  assert.equal(reopened.body.decision.id, first.body.decision.id);
  const table = await ask(token, { eventId: event.body.event.id, action: 'table', roll: 6 });
  assert.equal(table.body.decision.source, 'site', 'a recorded site roll cannot be overwritten with a table roll');
}));

test('a 4+ tabletop result resolves from snapshot keywords and undo removes the projected acquisition', db, () => withApiDatabase(async ({ client }) => {
  const token = await mature(client);
  await client.query("UPDATE match_roster_snapshots SET snapshot=jsonb_set(snapshot,'{players,0,keywords}','[\"Skeleton\",\"Undead\",\"Lineman\"]') WHERE pairing_id=$1 AND side='away'", [G]);
  const attacker = { side: 'away', playerId: 'away-0' };
  const unresolved = await ask(token, { action: 'table', roll: 5, attacker });
  assert.equal(unresolved.body.decision.keyword, null);
  const refused = await ask(token, { action: 'save', attacker, keyword: 'Lineman' });
  assert.equal(refused.status, 422);
  const chosen = await ask(token, { action: 'save', attacker, keyword: 'Undead' });
  const tap = { pairingId: G, playerId: 'home-1', counter: 'injury', delta: 1, injury };
  const recorded = await callApi('POST', `/api/teams/${teams.home}/events`, { token, body: { ...tap, gettingEvenId: chosen.body.decision.id } });
  assert.equal(recorded.status, 201);
  const state = (await accessPostMatch(G, coaches.home)).postMatch;
  assert.equal(state.home.gettingEven['home-1'].keyword, 'Undead');
  await callApi('POST', `/api/teams/${teams.home}/events`, { token, body: { ...tap, delta: -1 } });
  assert.deepEqual((await accessPostMatch(G, coaches.home)).postMatch.home.gettingEven, {});
  assert.equal((await ask(token, { eventId: recorded.body.event.id })).status, 409, 'a removed injury cannot be resolved');
}));

test('the opponent, absent players and rookie-protected casualties cannot get an award', db, () => withApiDatabase(async ({ client }) => {
  await startedFriendly(client);
  const home = await sessionFor(client, coaches.home.id), away = await sessionFor(client, coaches.away.id);
  assert.equal((await ask(away)).status, 404);
  assert.equal((await ask(home)).status, 422, 'the team has not played three games yet');
  assert.equal((await ask(home, { playerId: 'away-0' })).status, 422);
  assert.equal((await ask(home, { injury: { code: 'dead' } })).status, 422);
  assert.equal((await client.query('SELECT count(*)::int AS n FROM match_getting_even')).rows[0].n, 0);
}));

test('a late resolution is applied once at settlement and survives the next roster read', db, () => withApiDatabase(async ({ client }) => {
  const token = await mature(client);
  const recorded = await callApi('POST', `/api/teams/${teams.home}/events`, { token,
    body: { pairingId: G, playerId: 'home-1', counter: 'injury', delta: 1, injury } });
  let state = (await accessPostMatch(G, coaches.home)).postMatch;
  for (const name of ['home', 'away']) state = await act(name, state, { type: 'statistics',
    statistics: homeScores(name, state[name]), injuries: state[name].injuries, mvps: [`${name}-6`] });
  for (const type of ['lock-players', 'lock-roster']) for (const name of ['home', 'away']) state = await act(name, state, { type });
  const resolved = await ask(token, { eventId: recorded.body.event.id, action: 'table', roll: 4,
    attacker: { side: 'away', playerId: 'away-0' } });
  assert.equal(resolved.status, 200, JSON.stringify(resolved.body));
  assert.equal(resolved.body.decision.keyword, 'Human');
  state = (await accessPostMatch(G, coaches.home)).postMatch;
  assert.equal(state.home.stage, 4, 'resolving the check does not send the checklist backwards');
  for (const name of ['home', 'away']) state = await act(name, state, { type: 'finance', deposit: 0, mistake: { roll: 6 } });
  for (const name of ['home', 'away']) state = await act(name, state, { type: 'next', captain: `${name}-0` });
  for (const name of ['home', 'away']) state = await act(name, state, { type: 'confirm' });
  state = await act('home', state, undefined, true);
  await act('home', state, undefined, true);
  const roster = (await client.query('SELECT roster FROM saved_teams WHERE id=$1', [teams.home])).rows[0].roster;
  const player = roster.players.find(item => item.id === 'home-1');
  assert.equal(player.acquiredHatreds.length, 1);
  assert.equal(player.acquiredHatreds[0].keyword, 'Human');
  assert.equal(player.acquiredHatreds[0].injuryEventId, recorded.body.event.id);
  assert.equal(player.advancements.length, 0);
  assert.equal((await ask(token, { eventId: recorded.body.event.id })).status, 409, 'finished matches cannot gain or reroll a trait');
}));
