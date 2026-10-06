import { matchError } from '../match/rules.mjs';

export const POST_STEPS = ['result', 'fans', 'players', 'roster', 'finance', 'next', 'review'];
export const POST_STATS = ['touchdowns', 'casualties', 'knockouts', 'completions', 'catches', 'interceptions', 'throws', 'landings', 'bonus', 'crowdCasualties', 'foulCasualties'];
export const INJURIES = ['none', 'badly-hurt', 'miss', 'niggling', 'lasting', 'dead'];
export const RESULT_MODES = ['played', 'technical', 'conceded', 'conceded-safe'];
export const FAVOURED_ROLLS = { Undivided: 1, Hashut: 4, Slaanesh: 6, Nurgle: 7, Khorne: 8, Tzeentch: 6 };
export const postError = (code, params = {}) => matchError(code, params);

export function postCount(value, maximum = 99) {
  const number = Number(value ?? 0);
  if (!Number.isSafeInteger(number) || number < 0 || number > maximum) throw postError('POST_VALUE');
  return number;
}

export function postDie(value, maximum) {
  const number = postCount(value, maximum);
  if (!number) throw postError('POST_DICE', { maximum });
  return number;
}

export function resultAgreed(state) {
  return Boolean(state.result && state.result.accepted.home && state.result.accepted.away);
}

export function postOutcome(state, name) {
  if (!state.result) return 'draw';
  if (state.result.winner) return state.result.winner === name ? 'win' : 'loss';
  const ours = state.result[name].touchdowns, theirs = state.result[name === 'home' ? 'away' : 'home'].touchdowns;
  return ours === theirs ? 'draw' : ours > theirs ? 'win' : 'loss';
}

export function mvpCount(state, name) {
  if (!state.result) return 1;
  const winner = state.result.winner;
  return ['technical', 'conceded'].includes(state.result.mode) ? winner === name ? 2 : 0 : 1;
}

export function effectiveInjury(side, id) {
  const injury = side.injuries[id] || { code: 'none' };
  return side.gamesPlayed < 3 && injury.code !== 'none' ? { code: 'badly-hurt' } : injury;
}
