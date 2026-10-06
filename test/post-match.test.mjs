import test from 'node:test';
import assert from 'node:assert/strict';
import { createPostMatch, applyPostAction, validatePostSide } from '../src/domain/post-match/state.mjs';
import { postIncome, postWinnings, mistakeKind, postFinance, nextDedicatedFans } from '../src/domain/post-match/finance.mjs';
import { projectPostRoster } from '../src/domain/post-match/roster.mjs';
import { createMatchSide, calculateMatchCtv } from '../src/domain/match/roster.mjs';
import { earnedSpp, normalizeMatchStats } from '../src/domain/post-match/statistics.mjs';
import { playerAvailableSpp } from '../src/domain/roster/progression.mjs';
import { playerCurrentCost } from '../src/domain/roster/costs.mjs';
import { normalizeRosterPlayer } from '../src/domain/roster/players.mjs';
import { matchRoute, postMatchUrl } from '../src/core/routes.mjs';

function fixture(specialRules = 'Old World Classic') {
  const row = { qty: '0-16', position: 'Human Lineman', tags: ['Lineman'], price: '50K', skills: [], primary: ['G'], secondary: ['A'], ma: '6', st: '3', ag: '3+', pa: '4+', ar: '9+' };
  const reference = { slug: 'teams/human', title: 'Human', team: { roster: [row], meta: { specialRules, rerolls: '60K', apothecaryAccess: ['apothecary'] } } };
  const data = { teams: [reference], skillGroups: [{ category: 'General', skills: ['Block', 'Wrestle', 'Pro'] }, { category: 'Agility', skills: ['Dodge'] }] };
  const sources = Object.fromEntries(['home', 'away'].map(name => [name, { user: { id: name, login: name }, gamesPlayed: 4,
    team: { id: name, name, revision: 2, baseTeamSlug: reference.slug, roster: { treasury: 150, dedicatedFans: 2, coachesSafe: 10,
      players: Array.from({ length: 7 }, (_, i) => ({ id: name + '-' + i, rowIndex: 0, number: String(i + 1), name: 'Player ' + (i + 1) })) } } }]));
  const snapshots = Object.fromEntries(['home', 'away'].map(name => [name, { ...createMatchSide(sources[name], data), fanFactor: 4, effects: {} }]));
  return { data, state: createPostMatch('game', sources, snapshots, data), row };
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

test('requires both coaches to agree and leaves its input state immutable', () => {
  const f = fixture();
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'fans', roll: 3 }, f.data), { code: 'POST_RESULT' });
  const next = applyPostAction(f.state, 'home', { type: 'result', home: { touchdowns: 0, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } }, f.data);
  assert.equal(f.state.result, null); assert.equal(next.home.stage, 0);
  assert.throws(() => applyPostAction(next, 'home', { type: 'fans', roll: 3 }, f.data), { code: 'POST_RESULT' });
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

test('treasury risks wait until opponent statistics are locked', () => {
  const f = savePlayers(fanSteps(agreed(fixture())), 'home');
  f.state = applyPostAction(f.state, 'home', { type: 'lock-players' }, f.data);
  f.state = applyPostAction(f.state, 'home', { type: 'lock-roster' }, f.data);
  assert.throws(() => applyPostAction(f.state, 'home', { type: 'finance', deposit: 0, mistake: { roll: 6 } }, f.data), { code: 'POST_WAIT_STATISTICS' });
});

test('full sequence can finish without advancements and seals both confirmations', () => {
  const f = fanSteps(agreed(fixture()));
  for (const name of ['home', 'away']) { savePlayers(f, name); f.state = applyPostAction(f.state, name, { type: 'lock-players' }, f.data); }
  for (const name of ['home', 'away']) {
    for (const action of [{ type: 'lock-roster' }, { type: 'finance', deposit: 0, mistake: { roll: 6 } }, { type: 'next', captain: name + '-0' }, { type: 'confirm' }]) f.state = applyPostAction(f.state, name, action, f.data);
    assert.equal(validatePostSide(f.state, name, f.data).roster.players[0].spp.mvps, 1);
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

test('technical results normalize the unplayed match score and CAS', () => {
  const f = agreed(fixture(), { home: { touchdowns: 8, casualties: 9 }, away: { touchdowns: 7, casualties: 8 } }, 'technical');
  assert.deepEqual(f.state.result.home, { touchdowns: 2, casualties: 0 });
  assert.deepEqual(f.state.result.away, { touchdowns: 0, casualties: 0 });
});

test('Favoured bonus uses manual D8, costs no extra SPP or value and may be declined', () => {
  const f = fanSteps(agreed(fixture('Favoured of Nurgle')));
  f.state.home.baseRoster.favouredChoice = 'Nurgle'; f.state.home.baseRoster.players[0].spp.bonus = 20;
  savePlayers(f, 'home');
  const action = { type: 'advance', playerId: 'home-0', advancementType: 'primary', grant: { skill: 'Block' }, favouredRoll: 7, favouredSkill: 'Tentacles' };
  const next = applyPostAction(f.state, 'home', action, f.data), player = projectPostRoster(next, 'home', f.data).players[0];
  assert.equal(player.advancements.length, 1); assert.deepEqual(player.favouredSkills, [{ name: 'Tentacles', access: 'favoured' }]);
  assert.equal(playerAvailableSpp(next.home.reference, player), 19); assert.equal(playerCurrentCost(f.row, player), 70);
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
