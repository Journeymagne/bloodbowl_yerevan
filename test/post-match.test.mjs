import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostMatch, applyPostAction, validatePostSide, upgradePostMatch } from '../src/domain/post-match/state.mjs';
import { postIncome, postWinnings, mistakeKind, postFinance, nextDedicatedFans } from '../src/domain/post-match/finance.mjs';
import { projectPostRoster, fallenPlayers } from '../src/domain/post-match/roster.mjs';
import { postMatchLedgerEntries, ledgerRows } from '../src/domain/roster/ledger.mjs';
import { createMatchSide, calculateMatchCtv } from '../src/domain/match/roster.mjs';
import { earnedSpp, normalizeMatchStats } from '../src/domain/post-match/statistics.mjs';
import { careerCounters, eventsDiff, followEvents, sameValues, sideFollowsEvents } from '../src/domain/post-match/events.mjs';
import { playerAvailableSpp } from '../src/domain/roster/progression.mjs';
import { favouredSkillCost, playerCurrentCost } from '../src/domain/roster/costs.mjs';
import { normalizeRosterPlayer } from '../src/domain/roster/players.mjs';
import { matchRoute, postMatchUrl } from '../src/core/routes.mjs';

function fixture(specialRules = 'Old World Classic', events = {}, official = null) {
  const row = { qty: '0-16', position: 'Human Lineman', tags: ['Lineman'], price: '50K', skills: [], primary: ['G'], secondary: ['A'], ma: '6', st: '3', ag: '3+', pa: '4+', ar: '9+' };
  const reference = { slug: 'teams/human', title: 'Human', team: { roster: [row], meta: { specialRules, rerolls: '60K', apothecaryAccess: ['apothecary'] } } };
  const data = { teams: [reference], skillGroups: [{ category: 'General', skills: ['Block', 'Wrestle', 'Pro'] }, { category: 'Agility', skills: ['Dodge'] }] };
  const sources = Object.fromEntries(['home', 'away'].map(name => [name, { user: { id: name, login: name }, gamesPlayed: 4, events: events[name] ?? [],
    team: { id: name, name, revision: 2, baseTeamSlug: reference.slug, roster: { treasury: 150, dedicatedFans: 2, coachesSafe: 10,
      players: Array.from({ length: 7 }, (_, i) => ({ id: name + '-' + i, rowIndex: 0, number: String(i + 1), name: 'Player ' + (i + 1) })) } } }]));
  const snapshots = Object.fromEntries(['home', 'away'].map(name => [name, { ...createMatchSide(sources[name], data), fanFactor: 4, effects: {} }]));
  return { data, state: createPostMatch('game', sources, snapshots, data, official), row };
}

function agreed(f, score = { home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, mode = 'played') {
  f.state = applyPostAction(f.state, 'home', { type: 'result', ...score, mode, winner: mode === 'played' ? '' : 'home' }, f.data);
  f.state = applyPostAction(f.state, 'away', { type: 'agree-result' }, f.data);
  return f;
}

function fanSteps(f) {
  for (const name of ['home', 'away']) f.state = applyPostAction(f.state, name, { type: 'fans', roll: 3, technicalRoll: 2 }, f.data);
  return f;
}

function savePlayers(f, name, extra = {}) {
  const statistics = structuredClone(f.state[name].statistics);
  if (f.state.result.mode !== 'technical') Object.assign(statistics[name + '-0'], f.state.result[name]);
  f.state = applyPostAction(f.state, name, { type: 'statistics', statistics, mvps: f.state.result.mode === 'technical' ? name === 'home' ? [name + '-0', name + '-1'] : [] : [name + '-0'], ...extra }, f.data);
  return f;
}

test('post-match routes preserve id and requested step', () => {
  assert.equal(postMatchUrl('a', 'players'), '#/games/a/post-match/players');
  assert.deepEqual(matchRoute('games/a/post-match/review'), { name: 'postMatch', params: { gameId: 'a', step: 'review' } });
});

test('saving the shared score opens both personal checklists without an opponent approval', () => {
  const f = fixture();
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'fans', roll: 3 }, f.data), { code: 'POST_RESULT' });
  const next = applyPostAction(f.state, 'home', { type: 'result', home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, f.data);
  assert.equal(f.state.result, null);
  assert.deepEqual([next.home.stage, next.away.stage], [1, 1]);
  assert.deepEqual(next.result.accepted, { home: true, away: false });
  for (const name of ['home', 'away']) {
    assert.equal(applyPostAction(next, name, { type: 'fans', roll: 3 }, f.data)[name].stage, 2);
  }
});

test('income uses match fan factors, stalling, painting and prayer-generated fans', () => {
  const f = agreed(fixture());
  assert.equal(postWinnings(f.state, 'home'), 50);
  f.state.home.painted = true;
  assert.equal(postWinnings(f.state, 'home'), 65);
  f.state.home.stalling = true;
  assert.equal(postWinnings(f.state, 'home'), 55);
  f.state.home.snapshot.effects.prayers = [{ roll: 10 }, { roll: 12 }];
  f.state.home.statistics['home-0'] = normalizeMatchStats({ completions: 2, casualties: 1, crowdCasualties: 1 });
  assert.equal(postWinnings(f.state, 'away'), 65);
});

test('a painted team with two touchdowns and two combined fans earns 55k', () => {
  const f = agreed(fixture(), { home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 2, casualties: 0 } });
  f.state.home.snapshot.fanFactor = 1; f.state.away.snapshot.fanFactor = 1;
  assert.equal(postWinnings(f.state, 'away'), 40);
  f.state.away.painted = true;
  assert.equal(postWinnings(f.state, 'away'), 55);
  assert.equal(postWinnings(f.state, 'home'), 30);
  assert.equal(projectPostRoster(f.state, 'away', f.data).roster.treasury, 205);
});

test('Dedicated Fans uses win/loss thresholds and caps; draw does not roll', () => {
  const f = agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
  f.state.home.fansRoll = 2; f.state.away.fansRoll = 1;
  assert.equal(nextDedicatedFans(f.state, 'home'), 3); assert.equal(nextDedicatedFans(f.state, 'away'), 1);
  f.state.home.baseRoster.dedicatedFans = 7; f.state.home.fansRoll = 6;
  assert.equal(nextDedicatedFans(f.state, 'home'), 7);
});

test('MVP is chosen manually, grants five SPP and has no automated die', () => {
  const f = savePlayers(fanSteps(agreed(fixture())), 'home');
  assert.equal(earnedSpp(f.state, 'home', 'home-0'), 5);
  assert.equal(earnedSpp(f.state, 'home', 'home-1'), 0);
  assert.equal(f.state.home.mvpRoll, undefined);
});

test('zero Dedicated Fans stays zero until a win roll and increases by only one', () => {
  const f = fixture(); f.state.home.baseRoster.dedicatedFans = 0;
  assert.equal(nextDedicatedFans(f.state, 'home'), 0);
  agreed(f, { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
  assert.equal(nextDedicatedFans(f.state, 'home'), 0);
  assert.equal(projectPostRoster(f.state, 'home', f.data).roster.dedicatedFans, 0);
  for (const roll of [1, 2, 3, 4, 5, 6]) {
    const next = applyPostAction(f.state, 'home', { type: 'fans', roll }, f.data);
    assert.equal(projectPostRoster(next, 'home', f.data).roster.dedicatedFans, 1);
    assert.equal(f.state.home.baseRoster.dedicatedFans, 0);
  }
});

test('draws and losses never increase a zero-fan roster', () => {
  const draw = agreed(fixture()); draw.state.home.baseRoster.dedicatedFans = 0;
  assert.equal(nextDedicatedFans(draw.state, 'home'), 0);
  for (const mode of ['played', 'conceded']) {
    const f = agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, mode);
    f.state.away.baseRoster.dedicatedFans = 0;
    assert.equal(nextDedicatedFans(f.state, 'away'), 0);
    f.state.away.fansRoll = 1;
    assert.equal(nextDedicatedFans(f.state, 'away'), 0);
  }
});

test('high SPP can pass the player step without spending any of it', () => {
  const f = fanSteps(agreed(fixture()));
  f.state.home.baseRoster.players[0].spp.bonus = 50;
  savePlayers(f, 'home');
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  const result = projectPostRoster(f.state, 'home', f.data);
  assert.equal(result.players[0].advancements.length, 0);
  assert.equal(playerAvailableSpp(f.state.home.reference, result.players[0]), 55);
});

test('optional advancement spends the correct cost and grants its skill', () => {
  const f = fanSteps(agreed(fixture())); f.state.home.baseRoster.players[0].spp.bonus = 10; savePlayers(f, 'home');
  f.state = applyPostAction(f.state, 'home', { type: 'advance', playerId: 'home-0', advancementType: 'primary', grant: { skill: 'Block' } }, f.data);
  const player = projectPostRoster(f.state, 'home', f.data).players[0];
  assert.equal(playerAvailableSpp(f.state.home.reference, player), 9);
  assert.deepEqual(player.extraSkills, [{ name: 'Block', access: 'primary' }]);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'advance', playerId: 'home-0', advancementType: 'primary', grant: { skill: 'Block' } }, f.data), { code: 'POST_ADVANCEMENT' });
});

test('stat-roll fallback pays the stat cost rather than the selected skill cost', () => {
  const f = fanSteps(agreed(fixture())); f.state.home.baseRoster.players[0].spp.bonus = 20; savePlayers(f, 'home');
  f.state = applyPostAction(f.state, 'home', { type: 'advance', playerId: 'home-0', advancementType: 'stat', grant: { skill: 'Dodge' } }, f.data);
  const player = projectPostRoster(f.state, 'home', f.data).players[0];
  assert.equal(playerAvailableSpp(f.state.home.reference, player), 11);
  assert.equal(player.advancements[0].type, 'stat');
});

test('statistics must reconcile TD and CAS and nested foul/crowd counts', () => {
  const f = savePlayers(fanSteps(agreed(fixture())), 'home');
  f.state.home.statistics['home-0'].touchdowns = 1;
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data), { code: 'POST_STATISTICS' });
  assert.throws(() => normalizeMatchStats({ casualties: 1, foulCasualties: 2 }), { code: 'POST_STATISTICS' });
});

test('prayers add earned SPP without retroactively increasing career awards', () => {
  const f = fanSteps(agreed(fixture()));
  f.state.home.baseRoster.players[0].spp.completions = 5;
  f.state.home.snapshot.effects.prayers = [{ roll: 10 }];
  const statistics = structuredClone(f.state.home.statistics); statistics['home-0'].completions = 2;
  savePlayers(f, 'home', { statistics });
  const player = projectPostRoster(f.state, 'home', f.data).players[0];
  assert.equal(player.spp.completions, 7); assert.equal(player.spp.bonus, 2);
  assert.equal(earnedSpp(f.state, 'home', 'home-0'), 9);
});

test('rookie protection converts deaths to Badly Hurt; old MNG recovers', () => {
  const f = agreed(fixture()); f.state.home.gamesPlayed = 2;
  f.state.home.injuries['home-0'] = { code: 'dead' }; f.state.home.baseRoster.players[1].skipNextGame = true;
  const roster = projectPostRoster(f.state, 'home', f.data).roster;
  assert.equal(roster.players.length, 7); assert.equal(roster.players[1].skipNextGame, false);
});

test('deaths permit a short roster; new injuries persist and do not reduce TV', () => {
  const f = agreed(fixture());
  f.state.home.injuries['home-0'] = { code: 'dead' };
  f.state.home.baseRoster.players[1].statMods.ma = 1;
  f.state.home.injuries['home-1'] = { code: 'lasting', stat: 'ma', retire: true };
  const result = projectPostRoster(f.state, 'home', f.data);
  assert.equal(result.roster.players.length, 6);
  const player = result.roster.players[0];
  assert.equal(player.skipNextGame, true); assert.equal(player.temporarilyRetired, true);
  assert.equal(playerCurrentCost(f.row, player), 80);
  assert.equal(normalizeRosterPlayer(player, [f.row]).injuryStatMods.ma, -1);
});

test('hire a journeyman keeps earned MVP/SPP with no temporary Loner', () => {
  const f = fanSteps(agreed(fixture()));
  f.state.home.snapshot.players.push({ id: 'journeyman-8', rowIndex: 0, row: f.row, name: 'Temp', number: '8', kind: 'journeyman' });
  f.state.home.statistics['journeyman-8'] = normalizeMatchStats(); savePlayers(f, 'home', { mvps: ['journeyman-8'] });
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  f.state = applyPostAction(f.state, 'home', { type: 'roster', operation: 'keep', playerId: 'journeyman-8' }, f.data);
  const player = projectPostRoster(f.state, 'home', f.data).roster.players.at(-1);
  assert.equal(player.spp.mvps, 1); assert.equal(player.kind, undefined); assert.deepEqual(player.extraSkills, []);
  assert.notEqual(player.id, 'journeyman-8');
});

test('50k winnings pay for a permanent medical hire which adds 50k to CTV', () => {
  for (const [key, rule] of [['mortuaryAssistant', 'Masters of Undeath'], ['plagueDoctor', 'Favoured of Nurgle']]) {
    const f = fixture(rule); f.state.home.baseRoster.treasury = 0;
    savePlayers(fanSteps(agreed(f)), 'home');
    f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
    const before = projectPostRoster(f.state, 'home', f.data).roster;
    assert.equal(before.treasury, 50);
    const next = applyPostAction(f.state, 'home', { type: 'roster', operation: 'staff', key, delta: 1 }, f.data);
    const roster = projectPostRoster(next, 'home', f.data).roster;
    assert.equal(roster[key], 1); assert.equal(roster.treasury, 0);
    const side = createMatchSide({ user: f.state.home.user, team: { ...f.state.home.team, roster } }, f.data);
    assert.equal(calculateMatchCtv(side).medical, 50);
    assert.equal(f.state.home.operations.length, 0);
  }
});

test('cannot overspend, overfill positions, sell below seven or remove rerolls', () => {
  const f = fanSteps(agreed(fixture())); savePlayers(f, 'home'); f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'roster', operation: 'sell', playerId: 'home-0' }, f.data), { code: 'POST_SELL' });
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'roster', operation: 'staff', key: 'teamRerolls', delta: -1 }, f.data), { code: 'POST_ACTION' });
  f.state.home.baseRoster.treasury = 0;
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'roster', operation: 'staff', key: 'teamRerolls', delta: 1 }, f.data), { code: 'POST_BUDGET' });
});

test('expensive mistakes cover all outcomes with required extra dice', () => {
  const f = agreed(fixture());
  assert.equal(mistakeKind(99, null), 'none'); assert.equal(mistakeKind(100, 1), 'minor');
  assert.equal(mistakeKind(300, 1), 'major'); assert.equal(mistakeKind(600, 1), 'catastrophe');
  f.state.home.mistake = { roll: 1 }; assert.throws(() => postFinance(f.state, 'home', { treasury: 100 }, true), { code: 'POST_DICE' });
  f.state.home.mistake = { roll: 1, first: 2 }; assert.equal(postFinance(f.state, 'home', { treasury: 100 }, true).after, 80);
  assert.equal(postFinance(f.state, 'home', { treasury: 315 }, true).after, 155);
  f.state.home.mistake = { roll: 1, first: 2, second: 3 }; assert.equal(postFinance(f.state, 'home', { treasury: 600 }, true).after, 50);
});

test('safe deposit only spends up to fifty of winnings and affects risk band', () => {
  const f = agreed(fixture()); f.state.home.deposit = 50;
  assert.equal(postFinance(f.state, 'home', { treasury: 140 }, true).kind, 'none');
  assert.equal(postFinance(f.state, 'home', { treasury: 140 }, true).safe, 60);
  f.state.home.deposit = 51; assert.throws(() => projectPostRoster(f.state, 'home', f.data), { code: 'POST_VALUE' });
});

test('one coach completes every post-match step before the opponent fills theirs', () => {
  const f = savePlayers(fanSteps(agreed(fixture())), 'home');
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  f.state = applyPostAction(f.state, 'home', { type: 'lock-roster' }, f.data);
  for (const action of [{ type: 'finance', deposit: 0, mistake: { roll: 6 } }, { type: 'next', captain: 'home-0' }, { type: 'confirm' }]) {
    f.state = applyPostAction(f.state, 'home', action, f.data);
  }
  assert.equal(f.state.home.confirmed, true);
  assert.equal(f.state.away.stage, 2);
  assert.equal(f.state.away.confirmed, false);
  assert.equal(f.state.status, 'draft');
  validatePostSide(f.state, 'home', f.data);
});

test('legacy scores waiting for approval resume once and completed matches stay sealed', () => {
  const f = agreed(fixture());
  f.state.result.accepted.away = false;
  f.state.home.stage = 0; f.state.away.stage = 0;
  const next = upgradePostMatch(f.state);
  assert.deepEqual([next.home.stage, next.away.stage, next.revision], [1, 1, f.state.revision + 1]);
  assert.equal(f.state.home.stage, 0);
  assert.equal(upgradePostMatch(next), next);
  f.state.status = 'completed';
  assert.equal(upgradePostMatch(f.state), f.state);
});

test('late prayer statistics reopen finished finance; unrelated statistics keep it complete', () => {
  const f = savePlayers(fanSteps(agreed(fixture())), 'home');
  f.state.away.snapshot.effects.prayers = [{ roll: 10 }];
  for (const action of [{ type: 'lock-players' }, { type: 'lock-roster' }, { type: 'finance', deposit: 20, mistake: { roll: 6 } },
    { type: 'next', captain: 'home-0' }, { type: 'confirm' }]) f.state = applyPostAction(f.state, 'home', action, f.data);
  savePlayers(f, 'away');
  assert.equal(f.state.home.confirmed, true);
  const before = structuredClone(f.state);
  const statistics = structuredClone(f.state.away.statistics);
  statistics['away-0'].completions = 2;
  f.state = applyPostAction(f.state, 'away', { type: 'statistics', statistics, mvps: ['away-0'] }, f.data);
  assert.deepEqual([f.state.home.stage, f.state.home.confirmed, f.state.home.deposit, f.state.home.mistake], [4, false, 0, {}]);
  assert.equal(postWinnings(f.state, 'home'), postWinnings(before, 'home') + 10);
  before.away.followsEvents = true;
  const tapped = followEvents(before, { away: [{ playerId: 'away-0', counter: 'completions', delta: 1 }] });
  assert.equal(tapped.home.stage, 4);
  assert.equal(tapped.home.confirmed, false);
});

for (const chooseMvp of [false, true]) test(`full sequence can finish without advancements, MVP chosen: ${chooseMvp}`, () => {
  const f = fanSteps(agreed(fixture()));
  for (const name of ['home', 'away']) { savePlayers(f, name, { mvps: chooseMvp ? [name + '-0'] : [] }); f.state = applyPostAction(f.state, name, { type: 'lock-players' }, f.data); }
  for (const name of ['home', 'away']) {
    for (const action of [{ type: 'lock-roster' }, { type: 'finance', deposit: 0, mistake: { roll: 6 } }, { type: 'next', captain: name + '-0' }, { type: 'confirm' }]) f.state = applyPostAction(f.state, name, action, f.data);
    assert.equal(validatePostSide(f.state, name, f.data).roster.players[0].spp.mvps, Number(chooseMvp));
    assert.equal(earnedSpp(f.state, name, name + '-0'), chooseMvp ? 5 : 0);
  }
  assert.equal(f.state.status, 'ready');
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'roster', operation: 'hire', rowIndex: 0 }, f.data), { code: 'POST_CLOSED' });
  f.state = applyPostAction(f.state, 'home', { type: 'reopen' }, f.data);
  assert.equal(f.state.status, 'draft'); assert.equal(f.state.away.stage, 4); assert.equal(f.state.away.confirmed, false);
});

test('technical win awards two manual MVPs and D3+2 winnings', () => {
  const f = fanSteps(agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, 'technical'));
  savePlayers(f, 'home'); savePlayers(f, 'away');
  assert.equal(postWinnings(f.state, 'home'), 40); assert.equal(postWinnings(f.state, 'away'), 0);
  assert.equal(earnedSpp(f.state, 'home', 'home-0'), 5);
  assert.equal(earnedSpp(f.state, 'home', 'home-1'), 5);
});

test('technical winners can skip either MVP; chosen recipients must still be eligible and within the limit', () => {
  for (const mvps of [[], ['home-0']]) {
    const f = fanSteps(agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, 'technical'));
    savePlayers(f, 'home', { mvps });
    const locked = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
    assert.equal(locked.home.stage, 3);
    assert.equal(earnedSpp(locked, 'home', 'home-0'), mvps.length * 5);
    assert.equal(earnedSpp(locked, 'home', 'home-1'), 0);
    for (const invalid of [['home-0', 'home-1', 'home-2'], ['missing']]) {
      const bad = structuredClone(f.state); bad.home.mvps = invalid;
      assert.throws(() => applyPostAction(bad, 'home', { type: 'lock-players' }, f.data), { code: 'POST_MVP' });
    }
    const dead = structuredClone(f.state); dead.home.mvps = ['home-0']; dead.home.injuries['home-0'] = { code: 'dead' };
    assert.throws(() => applyPostAction(dead, 'home', { type: 'lock-players' }, f.data), { code: 'POST_MVP' });
  }
});

test('technical results normalize the unplayed match score and CAS', () => {
  const f = agreed(fixture(), { home: { touchdowns: 8, casualties: 9 }, away: { touchdowns: 7, casualties: 8 } }, 'technical');
  assert.deepEqual(f.state.result.home, { touchdowns: 2, casualties: 0 });
  assert.deepEqual(f.state.result.away, { touchdowns: 0, casualties: 0 });
});

test('Favoured bonus uses manual D8, costs no extra SPP, adds a skill\'s price to the value and may be declined', () => {
  const f = fanSteps(agreed(fixture('Favoured of Nurgle')));
  f.state.home.baseRoster.favouredChoice = 'Nurgle'; f.state.home.baseRoster.players[0].spp.bonus = 20;
  savePlayers(f, 'home');
  const action = { type: 'advance', playerId: 'home-0', advancementType: 'primary', grant: { skill: 'Block' }, favouredRoll: 7, favouredSkill: 'Tentacles' };
  const next = applyPostAction(f.state, 'home', action, f.data), player = projectPostRoster(next, 'home', f.data).players[0];
  assert.equal(player.advancements.length, 1); assert.deepEqual(player.favouredSkills, [{ name: 'Tentacles', access: 'favoured' }]);
  assert.equal(playerAvailableSpp(next.home.reference, player), 19);
  // 50k, Block +20k, and the god's Tentacles a skill's price for him (the owner, 2026-10-22): +40k, as his position (a
  // Human Lineman's G primary) has no Mutation among its primary categories.
  assert.equal(favouredSkillCost(f.row), 40);
  assert.equal(playerCurrentCost(f.row, player), 110);
  const declined = applyPostAction(f.state, 'home', { ...action, favouredSkill: '' }, f.data);
  assert.deepEqual(projectPostRoster(declined, 'home', f.data).players[0].favouredSkills, []);
  assert.throws(() => applyPostAction(f.state, 'home', { ...action, favouredSkill: 'Dodge' }, f.data), { code: 'POST_FAVOURED' });
});

test('Masters of Undeath can raise one free Lineman per final opposition death', () => {
  const f = fanSteps(agreed(fixture('Masters of Undeath'))); savePlayers(f, 'home');
  f.state.away.injuries['away-1'] = { code: 'dead' };
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  const next = applyPostAction(f.state, 'home', { type: 'roster', operation: 'raise', rowIndex: 0 }, f.data);
  assert.equal(projectPostRoster(next, 'home', f.data).roster.players.length, 8);
  assert.equal(projectPostRoster(next, 'home', f.data).roster.treasury, 200);
  assert.throws(() => applyPostAction(next, 'home', { type: 'roster', operation: 'raise', rowIndex: 0 }, f.data), { code: 'POST_RAISE' });
  f.state.away.gamesPlayed = 1;
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'roster', operation: 'raise', rowIndex: 0 }, f.data), { code: 'POST_RAISE' });
});

test('full concession removes new SPP, income and departing veterans without erasing career SPP', () => {
  const f = fanSteps(agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, 'conceded'));
  f.state.away.baseRoster.players[1].spp.bonus = 40;
  f.state.away.baseRoster.players[0].advancements = [{ type: 'primary' }, { type: 'primary' }, { type: 'primary' }];
  savePlayers(f, 'away', { mvps: [] });
  assert.throws(() => applyPostAction(f.state, 'away', { type: 'lock-players' }, f.data), { code: 'POST_DICE' });
  savePlayers(f, 'away', { mvps: [], departures: { 'away-0': 2 } });
  f.state = applyPostAction(f.state, 'away', { type: 'lock-players' }, f.data);
  const roster = projectPostRoster(f.state, 'away', f.data).roster;
  assert.equal(roster.players.length, 6); assert.equal(roster.players[0].spp.bonus, 40);
  assert.equal(earnedSpp(f.state, 'away', 'away-1'), 0); assert.equal(postWinnings(f.state, 'away'), 0);
  assert.equal(roster.dedicatedFans, 1); assert.equal(postWinnings(f.state, 'home'), 100);
  savePlayers(f, 'home', { mvps: ['home-0', 'home-1'] });
  assert.equal(earnedSpp(f.state, 'home', 'home-0'), 11);
});

test('stat advancements enforce two increases per characteristic and maximum values', () => {
  const f = fanSteps(agreed(fixture())); f.state.home.baseRoster.players[0].spp.bonus = 40; savePlayers(f, 'home');
  const action = { type: 'advance', playerId: 'home-0', advancementType: 'stat', grant: { stat: 'ma' } };
  f.state.home.baseRoster.players[0].statMods.ma = 2;
  assert.throws(() => applyPostAction(f.state, 'home', action, f.data), { code: 'POST_STAT_LIMIT' });
  f.state.home.baseRoster.players[0].statMods.ma = 0; f.state.home.reference.team.roster[0].ma = '9';
  assert.throws(() => applyPostAction(f.state, 'home', action, f.data), { code: 'POST_STAT_LIMIT' });
});

test('income breakdown preserves odd attendance, painting and concession rules', () => {
  const f = agreed(fixture(), { home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } });
  f.state.home.snapshot.fanFactor = 2; f.state.away.snapshot.fanFactor = 3; f.state.home.painted = true;
  assert.deepEqual(postIncome(f.state, 'home'), { attendance: 5, attendanceIncome: 25,
    touchdownsIncome: 20, nonStallingIncome: 10, paintingIncome: 15, technicalIncome: 0, total: 70 });
  f.state.result.mode = 'conceded'; f.state.result.winner = 'home';
  assert.equal(postIncome(f.state, 'home').total, 85);
  assert.equal(postIncome(f.state, 'home').nonStallingIncome, 0);
  assert.equal(postIncome(f.state, 'away').total, 0);
});

test('half-price sales, purchases and deposits reconcile to the exact final balance', () => {
  const f = agreed(fixture()); f.state.home.reference.team.roster[0].price = '15K';
  f.state.home.baseRoster.players.push({ ...structuredClone(f.state.home.baseRoster.players[0]), id: 'extra', number: '8' });
  f.state.home.operations = [{ type: 'sell', playerId: 'extra' }, { type: 'hire', rowIndex: 0, id: 'hired' },
    { type: 'staff', key: 'assistantCoaches', delta: 1 }];
  f.state.home.deposit = 20; f.state.home.mistake = { roll: 6 };
  const preview = projectPostRoster(f.state, 'home', f.data, true), account = preview.accounting;
  assert.equal(account.sales, 7.5); assert.equal(account.purchases, 25);
  assert.equal(preview.roster.treasury, 162.5); assert.equal(preview.roster.coachesSafe, 30);
  assert.equal(account.opening + account.winnings + account.sales - account.purchases - account.deposit - account.loss, account.closing);
  assert.equal(account.safeOpening + account.deposit, account.safeClosing);
  assert.deepEqual(account.transactions.map(item => item.amount), [7.5, -15, -10]);
  assert.equal(f.state.home.baseRoster.treasury, 150);
  f.state.home.operations.pop();
  assert.equal(projectPostRoster(f.state, 'home', f.data, true).roster.treasury, 172.5);
});

test('incomplete expensive-mistake dice retain purchases and deposit in previews', () => {
  for (const treasury of [150, 650]) {
    const f = agreed(fixture()); f.state.home.baseRoster.treasury = treasury;
    f.state.home.operations = [{ type: 'staff', key: 'assistantCoaches', delta: 1 }];
    f.state.home.deposit = 20; f.state.home.mistake = { roll: 1 };
    const first = projectPostRoster(f.state, 'home', f.data);
    assert.equal(first.finance.pending, true);
    assert.equal(first.roster.treasury, treasury + 20); assert.equal(first.roster.coachesSafe, 30);
    assert.equal(first.roster.assistantCoaches, 1);
    assert.throws(() => projectPostRoster(f.state, 'home', f.data, true), { code: 'POST_DICE' });
    f.state.home.mistake.first = 2;
    if (treasury === 650) {
      assert.equal(projectPostRoster(f.state, 'home', f.data).finance.pending, true);
      f.state.home.mistake.second = 3;
    }
    const complete = projectPostRoster(f.state, 'home', f.data, true);
    assert.equal(complete.finance.pending, false);
    assert.equal(complete.roster.treasury, treasury === 150 ? 150 : 50);
  }
});

test('completed settlement remains historical and cannot be mutated through a preview', () => {
  const f = agreed(fixture()); f.state.home.mistake = { roll: 6 };
  const settled = projectPostRoster(f.state, 'home', f.data, true);
  f.state.home.settlement = structuredClone(settled); f.state.status = 'completed';
  f.state.home.painted = true; f.state.home.snapshot.fanFactor = 99;
  f.state.home.operations.push({ type: 'hire', rowIndex: 0, id: 'later' });
  assert.deepEqual(postIncome(f.state, 'home'), settled.income);
  assert.deepEqual(projectPostRoster(f.state, 'home', f.data), settled);
  projectPostRoster(f.state, 'home', f.data).roster.treasury = 999;
  assert.equal(projectPostRoster(f.state, 'home', f.data).roster.treasury, 200);
});

test('the ledger lines of a post-match add up to its treasury change', () => {
  const f = agreed(fixture()); f.state.home.reference.team.roster[0].price = '15K';
  f.state.home.baseRoster.players.push({ ...structuredClone(f.state.home.baseRoster.players[0]), id: 'extra', number: '8' });
  f.state.home.operations = [{ type: 'sell', playerId: 'extra' }, { type: 'hire', rowIndex: 0, id: 'hired' },
    { type: 'staff', key: 'assistantCoaches', delta: 1 }];
  f.state.home.deposit = 20; f.state.home.mistake = { roll: 6 };
  const { accounting } = projectPostRoster(f.state, 'home', f.data, true);
  const entries = postMatchLedgerEntries(accounting);
  assert.deepEqual(entries.map(entry => entry.kind), ['match_income', 'sale', 'hire', 'staff', 'safe']);
  assert.equal(ledgerRows(accounting.opening, entries).at(-1).balanceAfter, accounting.closing);
});

test('an expensive mistake is its own ledger line', () => {
  const f = agreed(fixture()); f.state.home.baseRoster.treasury = 650;
  f.state.home.operations = [{ type: 'staff', key: 'assistantCoaches', delta: 1 }];
  f.state.home.deposit = 20; f.state.home.mistake = { roll: 1, first: 2, second: 3 };
  const { accounting } = projectPostRoster(f.state, 'home', f.data, true);
  const entries = postMatchLedgerEntries(accounting);
  assert.deepEqual(entries.map(entry => entry.kind), ['match_income', 'staff', 'safe', 'mistake']);
  assert.equal(ledgerRows(accounting.opening, entries).at(-1).balanceAfter, 50);
});

test('post-match explains every new absence with its injury and the match; a player back from one has none', () => {
  const f = agreed(fixture());
  f.state.home.injuries['home-0'] = { code: 'miss' };
  f.state.home.injuries['home-1'] = { code: 'niggling' };
  f.state.home.injuries['home-2'] = { code: 'lasting', stat: 'ag' };
  Object.assign(f.state.home.baseRoster.players[3], { skipNextGame: true, absence: { code: 'miss', pairingId: 'earlier' } });
  const players = projectPostRoster(f.state, 'home', f.data).roster.players;
  assert.deepEqual(players.slice(0, 4).map(player => player.absence), [{ code: 'miss', pairingId: 'game' },
    { code: 'niggling', pairingId: 'game' }, { code: 'lasting', stat: 'ag', pairingId: 'game' }, null]);
  assert.equal(players[3].skipNextGame, false);
});

test('rookie protection leaves no absence; a temporarily retired player keeps the earlier one', () => {
  const f = agreed(fixture()); f.state.home.gamesPlayed = 2;
  f.state.home.injuries['home-0'] = { code: 'miss' };
  Object.assign(f.state.home.baseRoster.players[1], { temporarilyRetired: true, skipNextGame: true,
    absence: { code: 'lasting', stat: 'st', pairingId: 'earlier' } });
  const players = projectPostRoster(f.state, 'home', f.data).roster.players;
  assert.equal(players[0].absence, null); assert.equal(players[0].skipNextGame, false);
  assert.deepEqual(players[1].absence, { code: 'lasting', stat: 'st', pairingId: 'earlier' });
});

test('the fallen are roster players whose injury stands as dead, as the roster held them before the match', () => {
  const f = agreed(fixture());
  f.state.home.injuries['home-0'] = { code: 'dead' };
  f.state.home.injuries['home-1'] = { code: 'lasting', stat: 'ma' };
  f.state.home.snapshot.players.push({ id: 'journeyman-8', rowIndex: 0, row: f.row, name: 'Temp', number: '8', kind: 'journeyman' });
  f.state.home.injuries['journeyman-8'] = { code: 'dead' };
  assert.deepEqual(fallenPlayers(f.state.home), [f.state.home.baseRoster.players[0]]);
  assert.notEqual(fallenPlayers(f.state.home)[0], f.state.home.baseRoster.players[0]);
  f.state.home.gamesPlayed = 2;
  assert.deepEqual(fallenPlayers(f.state.home), []);
});

const tap = (playerId, counter, delta = 1, injury = null) => ({ playerId, counter, delta, injury, settledAt: null });
const oneNil = { home: { touchdowns: 1, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } };

test('the post-match starts from the match events: statistics and injuries', () => {
  const f = fixture('Old World Classic', { home: [tap('home-0', 'touchdowns'), tap('home-1', 'injury', 1, { code: 'miss' })] });
  assert.equal(f.state.home.statistics['home-0'].touchdowns, 1);
  assert.deepEqual(f.state.home.injuries, { 'home-1': { code: 'miss', retire: false } });
  assert.equal(f.state.home.followsEvents, true);
  assert.equal(f.state.away.statistics['away-0'].touchdowns, 0);
});

test('until its Players step is saved a side follows the events; a change bumps the revision and drops chosen advancements', () => {
  const f = fanSteps(agreed(fixture()));
  f.state.home.advancements = { 'home-0': [{ type: 'primary', grant: { skill: 'Block' } }] };
  const events = { home: [tap('home-0', 'completions')], away: [] };
  const followed = followEvents(f.state, events);
  assert.equal(followed.home.statistics['home-0'].completions, 1);
  assert.deepEqual(followed.home.advancements, {});
  assert.equal(followed.revision, f.state.revision + 1);
  assert.equal(followEvents(followed, events), followed);
  assert.equal(f.state.home.statistics['home-0'].completions, 0, 'the input state is left alone');
});

test('a saved Players step, a side past it and a side begun before 3.0 do not follow the events', () => {
  const events = { home: [tap('home-0', 'completions')], away: [tap('away-0', 'completions')] };
  const f = fanSteps(agreed(fixture()));
  savePlayers(f, 'home');
  assert.equal(f.state.home.followsEvents, false);
  delete f.state.away.followsEvents; // 2.x wrote no such flag
  assert.equal(followEvents(f.state, events), f.state);
  const g = fanSteps(agreed(fixture()));
  g.state.home.stage = 3;
  assert.equal(followEvents(g.state, events).home.statistics['home-0'].completions, 0);
  assert.deepEqual([f.state.home, f.state.away, g.state.home, g.state.away].map(sideFollowsEvents), [false, false, false, true],
    'the sides a tap may still reach are the ones followEvents reads');
});

test('a new result rebuilds both sides, and following the events seeds them again', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const f = fixture('Old World Classic', events);
  const proposed = applyPostAction(f.state, 'home', { type: 'result', ...oneNil }, f.data);
  assert.equal(proposed.home.statistics['home-0'].touchdowns, 0, 'the domain alone has no events');
  assert.equal(followEvents(proposed, events).home.statistics['home-0'].touchdowns, 1);
});

test('the score is still checked against the agreed result: two tapped touchdowns do not pass a 1-0', () => {
  const events = { home: [tap('home-0', 'touchdowns'), tap('home-1', 'touchdowns')], away: [] };
  const f = fanSteps(agreed(fixture('Old World Classic', events), oneNil));
  f.state = followEvents(f.state, events);
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: f.state.home.statistics, mvps: ['home-0'] }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data), { code: 'POST_STATISTICS', params: { counter: 'touchdowns' } });
});

test('a match the admin closed as a technical win before the post-match: the tapped touchdowns must go, and the difference takes them back', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const official = { mode: 'technical', official: true, winner: 'home', accepted: { home: true, away: true },
    home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } };
  const f = fanSteps(fixture('Old World Classic', events, official));
  const mvps = ['home-0', 'home-1'];
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: f.state.home.statistics, mvps }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data), { code: 'POST_STATISTICS' });
  const cleared = structuredClone(f.state.home.statistics); cleared['home-0'].touchdowns = 0;
  f.state = applyPostAction(f.state, 'home', { type: 'statistics', statistics: cleared, mvps }, f.data);
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  assert.deepEqual(eventsDiff(f.state.home, events.home), [{ playerId: 'home-0', counter: 'touchdowns', delta: -1 }]);
});

test('a tapped touchdown reaches the blob once: career shows it before the finish and after, never twice', () => {
  const events = { home: [tap('home-0', 'touchdowns')], away: [] };
  const f = fanSteps(agreed(fixture('Old World Classic', events), oneNil));
  f.state = followEvents(f.state, events);
  assert.equal(careerCounters(f.state.home.baseRoster.players[0], events.home).touchdowns, 1);
  savePlayers(f, 'home');
  const after = projectPostRoster(f.state, 'home', f.data).roster.players.find(player => player.id === 'home-0');
  const settled = [...events.home, ...eventsDiff(f.state.home, events.home)].map(event => ({ ...event, settledAt: '2026-10-16T18:00:00Z' }));
  assert.equal(after.spp.touchdowns, 1);
  assert.equal(careerCounters(after, settled).touchdowns, 1);
});

// What Postgres jsonb does to an object read back from `match_post_games.state`: the same values under reordered keys.
const reversedKeys = value => {
  if (!value || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(reversedKeys);
  return Object.fromEntries(Object.entries(value).reverse().map(([key, item]) => [key, reversedKeys(item)]));
};

test('following the events does not see a change in a state whose keys came back reordered (jsonb)', () => {
  const events = { home: [tap('home-0', 'touchdowns'), tap('home-0', 'completions'), tap('home-1', 'injury', 1, { code: 'lasting', stat: 'ma' })],
    away: [tap('away-2', 'injury', 1, { code: 'miss' })] };
  const f = fanSteps(agreed(fixture()));
  f.state = followEvents(f.state, events);
  const stored = structuredClone(f.state);
  for (const name of ['home', 'away']) {
    stored[name].statistics = reversedKeys(stored[name].statistics);
    stored[name].injuries = reversedKeys(stored[name].injuries);
  }
  assert.notDeepEqual(Object.keys(stored.home.statistics['home-0']), Object.keys(f.state.home.statistics['home-0']), 'the keys are reordered');
  assert.notDeepEqual(Object.keys(stored.home.injuries['home-1']), Object.keys(f.state.home.injuries['home-1']), 'the keys are reordered');
  assert.equal(followEvents(stored, events), stored, 'same values, no new revision');
  const more = followEvents(stored, { ...events, away: [tap('away-0', 'catches')] });
  assert.equal(more.revision, stored.revision + 1, 'a real change is still seen under reordered keys');
  assert.equal(more.away.statistics['away-0'].catches, 1);
  assert.deepEqual(more.away.injuries, {});
});

test('an injury alone is a change; a side with no events listed reads as having none; a completed post-match is left alone', () => {
  const f = fanSteps(agreed(fixture()));
  const hurt = followEvents(f.state, { home: [tap('home-1', 'injury', 1, { code: 'dead' })] });
  assert.deepEqual(hurt.home.injuries, { 'home-1': { code: 'dead', retire: false } });
  assert.equal(hurt.revision, f.state.revision + 1);
  assert.equal(followEvents(hurt, { home: [tap('home-1', 'injury', 1, { code: 'dead' })], away: [] }), hurt);
  const undone = followEvents(hurt, {});
  assert.deepEqual(undone.home.injuries, {});
  assert.equal(undone.revision, hurt.revision + 1);
  hurt.status = 'completed';
  assert.equal(followEvents(hurt, {}), hurt);
});

test('sameValues: equal whatever the order of the keys, a key holding undefined is a key not there, and any other difference is one', () => {
  assert.equal(sameValues({ a: 1, b: { c: [1, 2], d: 'x' } }, { b: { d: 'x', c: [1, 2] }, a: 1 }), true);
  assert.equal(sameValues({ code: 'miss', stat: undefined, retire: false }, { retire: false, code: 'miss' }), true, 'JSON drops undefined, so does the compare');
  assert.equal(sameValues([{ a: 1 }, 'x'], [{ a: 1 }, 'x']), true);
  for (const [left, right] of [[{ a: 1 }, { a: 2 }], [{ a: 1 }, { a: 1, b: 0 }], [{ a: 1, b: 0 }, { a: 1 }], [[1, 2], [2, 1]], [[1], [1, 2]],
    [[], {}], [{ a: 1 }, null], [null, { a: 1 }], [{ a: undefined, b: 1 }, { a: 1, b: undefined }], [{ a: '1' }, { a: 1 }]]) {
    assert.equal(sameValues(left, right), false, JSON.stringify([left, right]));
  }
});

// A side at the Players step with one chosen advancement; `stored` is what the database gives back (jsonb: undefined keys gone, keys reordered).
function playersStepWithAdvancement() {
  const f = fanSteps(agreed(fixture()));
  f.state.home.baseRoster.players[0].spp.bonus = 10;
  const injuries = { 'home-1': { code: 'miss' } };
  savePlayers(f, 'home', { injuries });
  f.state = applyPostAction(f.state, 'home', { type: 'advance', playerId: 'home-0', advancementType: 'primary', grant: { skill: 'Block' } }, f.data);
  assert.equal(f.state.home.advancements['home-0'].length, 1);
  const side = f.state.home, stored = structuredClone(f.state);
  stored.home.statistics = reversedKeys(JSON.parse(JSON.stringify(side.statistics)));
  stored.home.mvps = reversedKeys(JSON.parse(JSON.stringify(side.mvps)));
  stored.home.injuries = reversedKeys(JSON.parse(JSON.stringify(side.injuries)));
  const save = (state, changes = {}) => applyPostAction(state, 'home', { type: 'statistics', statistics: structuredClone(side.statistics), mvps: ['home-0'], injuries, ...changes }, f.data);
  return { f, stored, save };
}

test('saving the Players step again with nothing changed keeps the advancements, whatever order the database returned the keys in', () => {
  const { f, stored, save } = playersStepWithAdvancement();
  assert.notDeepEqual(Object.keys(stored.home.statistics['home-0']), Object.keys(f.state.home.statistics['home-0']), 'the keys are reordered');
  assert.deepEqual(save(f.state).home.advancements, f.state.home.advancements, 'in memory');
  assert.deepEqual(save(stored).home.advancements, f.state.home.advancements, 'as stored');
});

test('saving the Players step again with a real change still drops the advancements', () => {
  const { stored, save } = playersStepWithAdvancement();
  const statistics = { 'home-2': { completions: 1 } };
  const changed = {
    counter: { statistics: Object.fromEntries(Object.keys(stored.home.statistics).map(id => [id, { ...normalizeMatchStats(), ...statistics[id] }])) },
    injury: { injuries: { 'home-1': { code: 'miss' }, 'home-3': { code: 'niggling' } } },
    mvp: { mvps: ['home-1'] },
  };
  for (const [what, changes] of Object.entries(changed)) assert.deepEqual(save(stored, changes).home.advancements, {}, what);
});
