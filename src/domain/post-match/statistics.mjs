import { normalizeSppCounters } from '../roster/players.mjs';
import { sppCounterWeights } from '../roster/progression.mjs';
import { POST_STATS, postCount, postError, postDie, mvpCount, effectiveInjury } from './rules.mjs';

export function normalizeMatchStats(stats = {}) {
  const result = Object.fromEntries(POST_STATS.map(key => [key, postCount(stats[key])]));
  if (result.crowdCasualties + result.foulCasualties > result.casualties) throw postError('POST_STATISTICS');
  return result;
}

export function hasPrayer(side, roll) {
  return (side.snapshot.effects?.prayers || []).some(prayer => Number(prayer.roll) === roll);
}

export function fanFactorBonus(side) {
  return Object.values(side.statistics).reduce((sum, stats) => sum + (hasPrayer(side, 10) ? stats.completions : 0)
    + (hasPrayer(side, 12) ? stats.crowdCasualties : 0), 0);
}

export function earnedCounters(state, name, id) {
  const side = state[name], stats = side.statistics[id] || normalizeMatchStats();
  const player = side.snapshot.players.find(item => item.id === id);
  const result = normalizeSppCounters(stats);
  result.mvps = side.mvps.filter(value => value === id).length;
  if (state.result?.mode === 'technical') return { ...normalizeSppCounters(), mvps: result.mvps };
  result.bonus += (hasPrayer(side, 10) ? stats.completions : 0) + (hasPrayer(side, 11) ? stats.catches : 0)
    + (hasPrayer(side, 12) ? stats.crowdCasualties : 0) + (hasPrayer(side, 13) ? stats.foulCasualties : 0);
  if (player?.kind === 'star' || (state.result?.mode === 'conceded' && state.result.winner !== name)) return normalizeSppCounters();
  return result;
}

export function earnedSpp(state, name, id) {
  const weights = sppCounterWeights(state[name].reference);
  return Object.entries(earnedCounters(state, name, id)).reduce((sum, [key, count]) => sum + count * (weights[key] || 0), 0);
}

export function validateStatistics(state, name) {
  const side = state[name];
  for (const key of ['touchdowns', 'casualties']) {
    if (key === 'touchdowns' && state.result.mode.startsWith('conceded') && state.result.winner !== name) continue;
    const total = Object.values(side.statistics).reduce((sum, stats) => sum + stats[key], 0);
    const required = state.result.mode === 'technical' ? 0 : state.result[name][key];
    if (total !== required) throw postError('POST_STATISTICS', { counter: key });
  }
  if (side.mvps.length !== mvpCount(state, name)) throw postError('POST_MVP');
  for (const id of side.mvps) {
    const player = side.snapshot.players.find(item => item.id === id);
    if (!player || player.kind === 'star' || effectiveInjury(side, id).code === 'dead') throw postError('POST_MVP');
  }
  if (state.result.mode === 'conceded' && state.result.winner !== name) {
    side.baseRoster.players.filter(player => player.advancements.length >= 3).forEach(player => postDie(side.departures[player.id], 6));
  }
}
