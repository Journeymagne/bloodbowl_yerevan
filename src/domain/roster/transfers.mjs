/**
 * Players joining and leaving a roster in play: sales, cancelled purchases, the fallen, and hires.
 *
 * Hiring on a roster in play (stage 07c): the cart as the league's rules read it — a position's maximum,
 * fourteen on the roster, the treasury — and the players it buys made the way the server stores them, so that
 * a save whose answer was lost is known by the 409 that holds it, and the server journals each as a hire at
 * the price recorded.
 */
import { rosterSizeLimits } from '../league-rules.mjs';
import { nextFreeNumber } from './build.mjs';
import { playerCurrentCost } from './costs.mjs';
import { teamHasSpecialRule } from './team-rules.mjs';
import { costToNumber, countToNumber, rosterMax, rowCost, rowsForTeam } from './values.mjs';
import { normalizeRosterPlayer, positionKind, rowCountInPlayers, storedPlayerId, syncRosterCountsFromPlayers } from './players.mjs';
import { createPlayer } from './schema.mjs';
import { isMoneyAmount, sumMoney } from '../money.mjs';

/** The codes a hire or a sale is refused with; the screen words each with `t("validation.<code>", params)`. */
export const TRANSFER_REFUSALS = Object.freeze(['POSITION_MAX', 'ROSTER_MAX_PLAYERS', 'TREASURY_INVALID', 'PLAYER_NOT_FOUND',
  'PLAYER_PURCHASE_CLOSED', 'PLAYER_SALE_MIN']);

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

/** A player is found by his id as stored (`storedPlayerId`): a 2.x roster's `5` is the `"5"` a screen names him by. */
export function removeLeaguePlayer(team, draft, playerId, type) {
  const player = draft.players.find(item => storedPlayerId(item) === String(playerId));
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

/**
 * @typedef {Record<string, number>} HireCart how many of each line of the race's table the cart holds, by the line's index
 * @typedef {{code: string, params: object}} TransferRefusal
 * @typedef {{rowIndex: number, position: string, kind: string, price: number, have: number, max: number, inCart: number,
 *   refusal: TransferRefusal|null}} HireRow a line of the race's table: `have` of the position on the roster, `inCart` in
 *   the cart, and why one more of it may not go in the cart — its maximum, else fourteen on the roster; money is no refusal
 * @typedef {{players: number, max: number, treasury: number, count: number, total: number, left: number, free: number,
 *   numbers: number[], refusal: TransferRefusal|null, rows: HireRow[]}} HireQuote
 */

/** How many of a line the cart holds: a whole number, and none for anything not above zero. */
const cartCount = (cart, rowIndex) => Math.max(0, Math.trunc(countToNumber(cart?.[rowIndex])));

/** The shirt numbers `count` new players get after `players`, each the lowest nobody wears yet (`nextFreeNumber`). */
function newNumbers(players, count) {
  const numbers = [];
  while (numbers.length < count) numbers.push(nextFreeNumber([...players, ...numbers.map(number => ({ number }))]));
  return numbers;
}

/**
 * What a cart buys on this roster, by the league's rules. Everyone on the roster counts toward the fourteen,
 * those who miss the next match too. `count` and `total` (thousands) are the cart's; `left` is the treasury after
 * it, below zero when it does not pay; `free` the places left beside it; `numbers` what the new players wear, in
 * the order of the race's table. `refusal` is the cart's as a whole: a position over its maximum, then more than
 * fourteen, then a treasury it overspends. Lines the race does not have, and counts not above zero, are no cart.
 *
 * @param {object} team the race
 * @param {object} draft the roster the cart is bought on
 * @param {HireCart} cart
 * @returns {HireQuote}
 */
export function hireQuote(team, draft, cart) {
  const players = draft.players.length, max = rosterSizeLimits.max, treasury = countToNumber(draft.treasury);
  const lines = rowsForTeam(team).map((row, rowIndex) => ({ rowIndex, position: row.position, kind: positionKind(row),
    price: costToNumber(rowCost(row)), have: rowCountInPlayers(draft, rowIndex), max: rosterMax(row.qty), inCart: cartCount(cart, rowIndex) }));
  const count = lines.reduce((sum, line) => sum + line.inCart, 0);
  const total = sumMoney(...lines.map(line => line.price * line.inCart)), left = sumMoney(treasury, -total);
  const positionMax = line => ({ code: 'POSITION_MAX', params: { position: line.position, max: line.max } });
  const full = { code: 'ROSTER_MAX_PLAYERS', params: { max, count: players + count } };
  const rows = lines.map(line => ({ ...line,
    refusal: line.have + line.inCart >= line.max ? positionMax(line) : players + count >= max ? full : null }));
  const over = lines.find(line => line.have + line.inCart > line.max);
  const refusal = over ? positionMax(over) : players + count > max ? full : left < 0 ? { code: 'TREASURY_INVALID', params: {} } : null;
  return { players, max, treasury, count, total, left, free: Math.max(0, max - players - count),
    numbers: newNumbers(draft.players, count), refusal, rows };
}

/**
 * Buy a cart on the draft: each new player as the server stores him (`normalizeRosterPlayer`, as `checkRoster` does),
 * bought at his position's price (`purchaseRefund`, which the server journals as the hire), on the next free number;
 * the treasury pays the total and the position counts follow. An empty cart changes nothing.
 *
 * @param {object} team the race
 * @param {object} draft the roster, changed in place
 * @param {HireCart} cart
 * @returns {{hired: object[]}} the new players, in the order they were added
 * @throws {Error} on a cart `hireQuote` refuses, before anything is changed: the caller asks it first
 */
export function hirePlayers(team, draft, cart) {
  const quote = hireQuote(team, draft, cart);
  if (!quote.count) return { hired: [] };
  if (quote.refusal) throw new Error(`A refused cart is not hired (${quote.refusal.code}): ask hireQuote first`);
  const rows = rowsForTeam(team), hired = [];
  for (const { rowIndex, price, inCart } of quote.rows) {
    for (let bought = 0; bought < inCart; bought += 1) {
      const player = normalizeRosterPlayer(createPlayer(rows[rowIndex], rowIndex, rowCountInPlayers(draft, rowIndex),
        { number: nextFreeNumber(draft.players), purchased: true, purchaseRefund: price }), rows, draft.players.length);
      draft.players.push(player);
      hired.push(player);
    }
  }
  draft.treasury = sumMoney(countToNumber(draft.treasury), -quote.total);
  syncRosterCountsFromPlayers(draft);
  return { hired };
}

/**
 * How many players two rosters differ by, hired or let go: those on only one of them, by their id as stored
 * (`storedPlayerId`). A player without an id is nobody either roster can name, and is not counted.
 */
export function transferEdits(before, after) {
  const ids = roster => new Set((Array.isArray(roster?.players) ? roster.players : []).map(player => storedPlayerId(player)).filter(id => id !== null));
  const was = ids(before), now = ids(after);
  return [...was].filter(id => !now.has(id)).length + [...now].filter(id => !was.has(id)).length;
}
