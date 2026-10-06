import { playerCurrentCost } from './costs.mjs';
import { teamHasSpecialRule } from './team-rules.mjs';
import { rowsForTeam } from './values.mjs';
import { syncRosterCountsFromPlayers } from './players.mjs';
import { isMoneyAmount, sumMoney } from '../money.mjs';

/** Sales use current value; Architect of Fate also pays for lasting injuries. */
export function playerSaleValue(team, player) {
  const row = rowsForTeam(team)[player.rowIndex];
  const value = playerCurrentCost(row, player);
  if (!teamHasSpecialRule(team, 'Architect of Fate')) return value / 2;
  const injuries = Number(player.nigglingInjuries ?? (player.niglingInjury ? 1 : 0))
    + Object.values(player.injuryStatMods || {}).reduce((sum, mod) => sum + Math.abs(mod), 0);
  return sumMoney(value, injuries * 10);
}

/** A lifetime `purchased` flag alone is never proof of a cancellable purchase. */
export function playerPurchaseRefund(player) {
  return player.purchased && player.purchaseRefund != null && isMoneyAmount(player.purchaseRefund)
    ? Number(player.purchaseRefund) : null;
}

export function playerRemoval(team, draft, player) {
  const refund = playerPurchaseRefund(player), cancellation = refund !== null;
  return { type: cancellation ? 'cancel-purchase' : 'sell', amount: cancellation ? refund : playerSaleValue(team, player),
    blocked: !cancellation && draft.players.length <= 7 };
}

export function removeLeaguePlayer(team, draft, playerId, type) {
  const player = draft.players.find(item => item.id === playerId);
  if (!player) return { applied: false, reason: 'PLAYER_NOT_FOUND' };
  const refund = playerPurchaseRefund(player);
  if (type === 'cancel-purchase' && refund === null) return { applied: false, reason: 'PLAYER_PURCHASE_CLOSED' };
  if (type === 'sell' && draft.players.length <= 7) return { applied: false, reason: 'PLAYER_SALE_MIN' };
  if (!['sell', 'cancel-purchase'].includes(type)) return { applied: false, reason: 'PLAYER_NOT_FOUND' };
  const amount = type === 'cancel-purchase' ? refund : playerSaleValue(team, player);
  draft.treasury = sumMoney(draft.treasury, amount);
  draft.players = draft.players.filter(item => item !== player);
  syncRosterCountsFromPlayers(draft);
  return { applied: true, amount };
}

/** Starting a match or confirming its post-match roster seals editor purchases. */
export function sealPlayerPurchases(players) {
  return players.map(player => { const sealed = { ...player }; delete sealed.purchaseRefund; return sealed; });
}
