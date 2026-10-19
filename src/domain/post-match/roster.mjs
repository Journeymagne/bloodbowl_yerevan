import { createPlayer, normalizeAbsence } from '../roster/schema.mjs';
import { applyInjuryEffects } from '../roster/absence.mjs';
import { normalizeSppCounters, syncRosterCountsFromPlayers } from '../roster/players.mjs';
import { playerCurrentCost } from '../roster/costs.mjs';
import { applyAdvancement, canTakeAdvancement, checkAdvancementGrant, statIncreaseRefusal } from '../roster/progression.mjs';
import { rowsForTeam, rosterMax, costToNumber } from '../roster/values.mjs';
import { teamHasSpecialRule, availableMedicalStaffDefinitions, hasBribery, favouredSkillsForChoice } from '../roster/team-rules.mjs';
import { builderStaffCosts, builderStaffMaximums, combinedRerollsMaximum } from '../league-rules.mjs';
import { isLineman } from '../match/roster.mjs';
import { effectiveInjury, postError, FAVOURED_ROLLS, postDie, postCount } from './rules.mjs';
import { earnedCounters } from './statistics.mjs';
import { postIncome, nextDedicatedFans, postFinance } from './finance.mjs';
import { isMoneyAmount, sumMoney } from '../money.mjs';
import { playerSaleValue } from '../roster/transfers.mjs';

function applyInjury(player, injury, pairingId) {
  player.skipNextGame = Boolean(player.temporarilyRetired);
  if (['miss', 'niggling', 'lasting'].includes(injury.code)) player.skipNextGame = true;
  // The absence explains skipNextGame: this match's injury if there is one, the
  // earlier reason for a player still retired, none for one who is back.
  player.absence = ['miss', 'niggling', 'lasting'].includes(injury.code)
    ? normalizeAbsence({ code: injury.code, stat: injury.code === 'lasting' ? injury.stat : undefined, pairingId })
    : normalizeAbsence(player.absence, player.skipNextGame);
  applyInjuryEffects(player, injury);
  if (injury.code === 'lasting' && injury.retire) player.temporarilyRetired = true;
}

function applyFavoured(side, player, choice) {
  if (!side.baseRoster.favouredChoice) return;
  const roll = postDie(choice.favouredRoll, 8), alignment = side.baseRoster.favouredChoice;
  if (roll !== FAVOURED_ROLLS[alignment]) return;
  const skill = choice.favouredSkill, row = rowsForTeam(side.reference)[player.rowIndex];
  if (!skill) return;
  const held = [...row.skills, ...player.extraSkills.map(item => item.name), ...player.favouredSkills.map(item => item.name)];
  if (!favouredSkillsForChoice(alignment).includes(skill) || held.includes(skill)) throw postError('POST_FAVOURED');
  player.favouredSkills.push({ name: skill, access: 'favoured' });
}

export function postPlayers(state, name, data) {
  const side = state[name], originals = side.baseRoster.players;
  const temporary = side.snapshot.players.filter(player => ['journeyman', 'rookie'].includes(player.kind));
  const players = [...structuredClone(originals), ...temporary.map(item => ({ ...createPlayer(item.row, item.rowIndex),
    id: item.id, name: item.name, number: item.number, kind: item.kind }))];
  for (const player of players) {
    const earned = earnedCounters(state, name, player.id), prior = normalizeSppCounters(player.spp);
    player.spp = Object.fromEntries(Object.keys(prior).map(key => [key, prior[key] + earned[key]]));
    const injury = effectiveInjury(side, player.id);
    applyInjury(player, injury, state.gameId);
    for (const choice of side.advancements[player.id] || []) {
      if (injury.code === 'dead') throw postError('POST_PLAYER');
      const row = rowsForTeam(side.reference)[player.rowIndex];
      if (choice.grant?.stat) validateStatIncrease(row, player, choice.grant.stat);
      const result = applyPostAdvancement(side.reference, row, player, choice, data.skillGroups);
      if (!result.applied) throw postError('POST_ADVANCEMENT', result.params);
      applyFavoured(side, player, choice);
    }
  }
  return players;
}

function applyPostAdvancement(team, row, player, choice, groups) {
  if (choice.type !== 'stat' || !choice.grant?.skill) return applyAdvancement(team, row, player, choice.type, choice.grant, groups);
  if (!canTakeAdvancement(team, player, 'stat').allowed) return { applied: false };
  const access = ['primary', 'secondary'].find(type => checkAdvancementGrant(row, player, type, choice.grant, groups).allowed);
  if (!access) return { applied: false };
  const result = applyAdvancement(team, row, player, access, choice.grant, groups);
  if (result.applied) player.advancements.at(-1).type = 'stat';
  return result;
}

function validateStatIncrease(row, player, stat) {
  if (statIncreaseRefusal(row, player, stat)) throw postError('POST_STAT_LIMIT');
}

export function postStaffOptions(reference) {
  return ['teamRerolls', 'assistantCoaches', 'cheerleaders', ...availableMedicalStaffDefinitions(reference).map(item => item.key),
    ...(hasBribery(reference) ? ['bribes'] : [])];
}

function addPosition(roster, side, operation) {
  const row = rowsForTeam(side.reference)[operation.rowIndex];
  if (!row || roster.players.length >= 14 || roster.players.filter(item => item.rowIndex === operation.rowIndex).length >= rosterMax(row.qty)) throw postError('POST_POSITION');
  const used = new Set(roster.players.map(item => String(item.number)));
  let number = 1;
  while (used.has(String(number))) number++;
  const player = createPlayer(row, operation.rowIndex, 0, { number, purchased: operation.type === 'hire' });
  player.id = operation.id;
  roster.players.push(player);
  if (operation.type === 'hire') roster.treasury = sumMoney(roster.treasury, -costToNumber(row.price || row.cost));
}

function rosterOperation(roster, side, players, operation) {
  if (['hire', 'raise'].includes(operation.type)) { addPosition(roster, side, operation); return; }
  if (operation.type === 'keep') {
    const player = players.find(item => item.id === operation.playerId && item.kind);
    if (!player || effectiveInjury(side, player.id).code === 'dead') throw postError('POST_PLAYER');
    const row = rowsForTeam(side.reference)[player.rowIndex];
    if (roster.players.length >= 14 || roster.players.some(item => item.id === operation.id)
      || roster.players.filter(item => item.rowIndex === player.rowIndex).length >= rosterMax(row.qty)) throw postError('POST_POSITION');
    roster.treasury = sumMoney(roster.treasury, -playerCurrentCost(row, player));
    roster.players.push({ ...player, id: operation.id, kind: undefined, purchased: true });
    return;
  }
  if (operation.type === 'sell') {
    const player = roster.players.find(item => item.id === operation.playerId);
    if (!player || roster.players.length <= 7) throw postError('POST_SELL');
    const price = playerSaleValue(side.reference, player);
    roster.treasury = sumMoney(roster.treasury, price);
    roster.players = roster.players.filter(item => item !== player);
    return;
  }
  if (operation.type === 'staff') applyStaff(roster, side, operation);
  else throw postError('POST_ACTION');
}

function applyStaff(roster, side, operation) {
  const key = operation.key, delta = operation.delta;
  if (!postStaffOptions(side.reference).includes(key) || ![-1, 1].includes(delta)) throw postError('POST_ACTION');
  if (key === 'teamRerolls' && delta === -1) throw postError('POST_ACTION');
  const next = Number(roster[key]) + delta;
  const rerolls = next + Number(roster.startingRerolls || 0);
  if (next < 0 || next > builderStaffMaximums[key] || (key === 'teamRerolls' && rerolls > combinedRerollsMaximum)) throw postError('POST_POSITION');
  roster[key] = next;
  if (delta > 0) { roster.treasury = sumMoney(roster.treasury, -builderStaffCosts[key]); roster.purchasedStaff[key] = Number(roster.purchasedStaff[key] || 0) + 1; }
  else roster.purchasedStaff[key] = Math.min(roster.purchasedStaff[key], next);
}

export function projectPostRoster(state, name, data, final = false) {
  if (state.status === 'completed' && state[name].settlement) return structuredClone(state[name].settlement);
  const side = state[name], roster = structuredClone(side.baseRoster), players = postPlayers(state, name, data);
  if (!isMoneyAmount(roster.treasury)) throw postError('POST_BUDGET');
  roster.players = players.filter(player => !player.kind && effectiveInjury(side, player.id).code !== 'dead'
    && !(state.result?.mode === 'conceded' && state.result.winner !== name && side.departures[player.id] && side.departures[player.id] < 4));
  const income = postIncome(state, name), transactions = [];
  roster.treasury = sumMoney(roster.treasury, income.total);
  roster.dedicatedFans = nextDedicatedFans(state, name);
  const kept = new Set();
  for (const operation of side.operations) {
    if (operation.type === 'keep' && kept.has(operation.playerId)) throw postError('POST_PLAYER');
    kept.add(operation.playerId);
    if (operation.type === 'raise') validateRaise(state, name, side, operation);
    const before = roster.treasury;
    rosterOperation(roster, side, players, operation);
    if (!isMoneyAmount(roster.treasury)) throw postError('POST_BUDGET');
    transactions.push({ ...operation, amount: sumMoney(roster.treasury, -before) });
  }
  if (side.captain) {
    if (!roster.players.some(player => player.id === side.captain && !player.temporarilyRetired)) throw postError('POST_PLAYER');
    roster.players.forEach(player => { player.isCaptain = player.id === side.captain; });
  }
  const finance = postFinance(state, name, roster, final);
  roster.treasury = finance.after; roster.coachesSafe = finance.safe;
  syncRosterCountsFromPlayers(roster);
  const totals = transactions.reduce((total, item) => ({
    sales: sumMoney(total.sales, Math.max(0, item.amount)),
    purchases: sumMoney(total.purchases, Math.max(0, -item.amount)) }), { sales: 0, purchases: 0 });
  const accounting = { opening: side.baseRoster.treasury, winnings: income.total,
    ...totals,
    deposit: finance.deposit, loss: finance.loss, closing: roster.treasury,
    safeOpening: side.baseRoster.coachesSafe, safeClosing: roster.coachesSafe, transactions };
  return { roster, players, finance, income, accounting, winnings: income.total };
}

/**
 * The players this post-match leaves dead: a roster player whose injury stands as
 * dead once rookie protection is applied (a team with fewer than three games
 * played gets Badly Hurt instead, see `effectiveInjury`). They are copies, as the
 * roster held them before the match: the journeyman and the stars are not on it,
 * so none of them is ever counted. Migration 015 carries over the earlier deaths
 * by the same rule: the player from before the match, the injury as it stood.
 */
export function fallenPlayers(side) {
  return side.baseRoster.players
    .filter(player => effectiveInjury(side, player.id).code === 'dead')
    .map(player => structuredClone(player));
}

function validateRaise(state, name, side, operation) {
  const opponent = state[name === 'home' ? 'away' : 'home'];
  const dead = opponent.snapshot.players.filter(player => player.kind !== 'star' && effectiveInjury(opponent, player.id).code === 'dead').length;
  const count = side.operations.filter(item => item.type === 'raise').length;
  if (!teamHasSpecialRule(side.reference, 'Masters of Undeath') || count > dead
    || !isLineman(rowsForTeam(side.reference)[operation.rowIndex])) throw postError('POST_RAISE');
  postCount(operation.rowIndex);
}
