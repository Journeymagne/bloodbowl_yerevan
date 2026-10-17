import { playerCurrentCost } from './costs.mjs';
import { teamHasSpecialRule } from './team-rules.mjs';
import { rowsForTeam } from './values.mjs';
import { storedPlayerId, syncRosterCountsFromPlayers } from './players.mjs';
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

/**
 * A player leaves the roster for good, as he stood: the roster without him, with the position counts of
 * who is left, and him as the blob held him — the record the fallen are kept as. Both are copies; the
 * input is not touched. Null when nobody on the roster has that id (`storedPlayerId`: a stored `5` is the
 * path's `"5"`, and a hole in the list is nobody).
 */
export function removeFallenPlayer(roster, playerId) {
  const copy = structuredClone(roster ?? {});
  const players = Array.isArray(copy.players) ? copy.players : [];
  const player = players.find(item => storedPlayerId(item) === String(playerId));
  if (!player) return null;
  copy.players = players.filter(item => item !== player);
  syncRosterCountsFromPlayers(copy);
  return { roster: copy, player };
}

/** Whether a stored player holds the captaincy, as the roster reads it (`normalizeRosterPlayer`): `isCaptain`, else the older `captain`. */
const holdsCaptaincy = (player) => Boolean(player?.isCaptain ?? player?.captain);

/**
 * A fallen player back on the roster, last. He keeps the captaincy he had only while nobody else holds
 * it, so a team never has two — read on both sides as the roster reads it, the older `captain` flag
 * included. One who is on the roster already (a save put him back) is not added twice. A copy: neither
 * the roster nor the record is touched.
 */
export function returnFallenPlayer(roster, player) {
  const copy = structuredClone(roster ?? {});
  const players = Array.isArray(copy.players) ? copy.players : [];
  const id = storedPlayerId(player);
  if (id === null || !players.some(item => storedPlayerId(item) === id)) {
    const returning = structuredClone(player);
    if (holdsCaptaincy(returning) && players.some(holdsCaptaincy)) returning.isCaptain = false;
    players.push(returning);
  }
  copy.players = players;
  syncRosterCountsFromPlayers(copy);
  return copy;
}
