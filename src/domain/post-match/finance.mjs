import { postOutcome, postDie, postCount, postError } from './rules.mjs';
import { fanFactorBonus } from './statistics.mjs';
import { isMoneyAmount, sumMoney } from '../money.mjs';

export const PAINTING_BONUS = 15;

export function postIncome(state, name) {
  if (state.status === 'completed' && state[name].settlement?.income) return structuredClone(state[name].settlement.income);
  const income = { attendance: 0, attendanceIncome: 0, touchdownsIncome: 0, nonStallingIncome: 0, paintingIncome: 0, technicalIncome: 0, total: 0 };
  if (!state.result) return income;
  const side = state[name], result = state.result, outcome = postOutcome(state, name);
  if (result.mode === 'technical') {
    income.technicalIncome = outcome === 'win' && side.technicalRoll ? (side.technicalRoll + 2) * 10 : 0;
  } else if (!(result.mode === 'conceded' && outcome === 'loss')) {
    income.attendance = ['home', 'away'].reduce((sum, key) => sum + Number(state[key].snapshot.fanFactor || 0) + fanFactorBonus(state[key]), 0);
    income.attendanceIncome = income.attendance * (result.mode === 'conceded' ? 10 : 5);
    income.touchdownsIncome = result[name].touchdowns * 10;
    income.nonStallingIncome = result.mode !== 'conceded' && !side.stalling ? 10 : 0;
    income.paintingIncome = side.painted ? PAINTING_BONUS : 0;
  }
  income.total = sumMoney(income.attendanceIncome, income.touchdownsIncome, income.nonStallingIncome, income.paintingIncome, income.technicalIncome);
  return income;
}

export function postWinnings(state, name) {
  return postIncome(state, name).total;
}

export function nextDedicatedFans(state, name) {
  const side = state[name], fans = Number(side.baseRoster.dedicatedFans ?? 0), outcome = postOutcome(state, name);
  const roll = Number(side.fansRoll || 0), minimum = Math.min(1, fans);
  if (state.result?.mode === 'conceded' && outcome === 'loss') return Math.max(minimum, fans - roll);
  return outcome === 'win' && roll > 0 && roll >= fans ? Math.min(7, fans + 1)
    : outcome === 'loss' && roll > 0 && roll < fans ? Math.max(minimum, fans - 1) : fans;
}

export function validateFans(state, name) {
  if (postOutcome(state, name) !== 'draw') postDie(state[name].fansRoll, state.result.mode === 'conceded' && state.result.winner !== name ? 3 : 6);
  if (state.result.mode === 'technical' && state.result.winner === name) postDie(state[name].technicalRoll, 3);
}

export function mistakeKind(treasury, roll) {
  if (treasury < 100) return 'none';
  const column = Math.min(5, Math.floor(treasury / 100) - 1);
  return [
    ['minor', 'none', 'none', 'none', 'none', 'none'],
    ['minor', 'minor', 'none', 'none', 'none', 'none'],
    ['major', 'minor', 'minor', 'none', 'none', 'none'],
    ['major', 'major', 'minor', 'minor', 'none', 'none'],
    ['catastrophe', 'major', 'major', 'minor', 'minor', 'none'],
    ['catastrophe', 'catastrophe', 'major', 'major', 'minor', 'minor'],
  ][column][postDie(roll, 6) - 1];
}

export function postFinance(state, name, roster, requireRoll = false) {
  const side = state[name], deposit = postCount(side.deposit, 50);
  if (!isMoneyAmount(roster.treasury) || !isMoneyAmount(side.baseRoster.coachesSafe || 0)) throw postError('POST_BUDGET');
  if (deposit > postWinnings(state, name) || deposit > roster.treasury) throw postError('POST_BUDGET');
  const before = sumMoney(roster.treasury, -deposit);
  const mistake = side.mistake || {}, kind = before >= 100 && !mistake.roll && !requireRoll ? 'pending' : mistakeKind(before, mistake.roll);
  const needsExtra = kind === 'minor' || kind === 'catastrophe';
  const pending = kind === 'pending' || (needsExtra && (!mistake.first || (kind === 'catastrophe' && !mistake.second)));
  let after = before;
  if (pending && requireRoll) throw postError('POST_DICE', { maximum: kind === 'minor' ? 3 : 6 });
  if (kind === 'minor' && !pending) after = sumMoney(before, -postDie(mistake.first, 3) * 10);
  if (kind === 'major') after = Math.floor(before / 10) * 5;
  if (kind === 'catastrophe' && !pending) after = (postDie(mistake.first, 6) + postDie(mistake.second, 6)) * 10;
  return { before, after, deposit, loss: sumMoney(before, -after), kind, pending,
    safe: sumMoney(side.baseRoster.coachesSafe || 0, deposit) };
}
