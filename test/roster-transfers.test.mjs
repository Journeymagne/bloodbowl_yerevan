import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, normalizeDraft, rosterForStorage } from '../src/domain/roster/schema.mjs';
import { ensureDraftPlayers } from '../src/domain/roster/players.mjs';
import { playerPurchaseRefund, playerRemoval, playerSaleValue, removeLeaguePlayer, sealPlayerPurchases } from '../src/domain/roster/transfers.mjs';

function fixture(rule = 'Old World Classic', price = '50K') {
  const row = { qty: '0-16', position: 'Lineman', price, skills: [], primary: ['G'], secondary: ['A'] };
  const team = { slug: 'teams/human', team: { roster: [row], meta: { specialRules: rule } } };
  const draft = normalizeDraft({ treasury: 100, players: Array.from({ length: 8 }, (_, n) => ({
    ...createPlayer(row, 0, n, { purchased: true }), id: `player-${n}`, number: String(n + 1) })) });
  return { team, draft, player: draft.players[0], row };
}

test('previously purchased and starting players sell for half current value, not a lifetime refund', () => {
  for (const purchased of [true, false]) {
    const { team, draft, player } = fixture(); player.purchased = purchased;
    player.extraSkills = [{ name: 'Block', access: 'primary' }];
    assert.equal(playerPurchaseRefund(player), null);
    assert.deepEqual(playerRemoval(team, draft, player), { type: 'sell', amount: 35, blocked: false });
    assert.deepEqual(removeLeaguePlayer(team, draft, player.id, 'sell'), { applied: true, amount: 35 });
    assert.equal(draft.treasury, 135); assert.equal(draft.players.length, 7); assert.equal(draft.roster[0], 7);
  }
});

test('a new editor purchase refunds the recorded payment, never its changed price or advances', () => {
  const { team, draft, player, row } = fixture(); player.purchaseRefund = 50;
  player.extraSkills = [{ name: 'Block', access: 'primary' }]; row.price = '60K';
  assert.deepEqual(playerRemoval(team, draft, player), { type: 'cancel-purchase', amount: 50, blocked: false });
  assert.deepEqual(removeLeaguePlayer(team, draft, player.id, 'cancel-purchase'), { applied: true, amount: 50 });
  assert.equal(draft.treasury, 150);
  assert.equal(removeLeaguePlayer(team, draft, player.id, 'cancel-purchase').applied, false);
  assert.equal(draft.treasury, 150);
});

test('legacy or sealed purchases cannot claim a full refund', () => {
  const { team, draft, player } = fixture();
  assert.equal(removeLeaguePlayer(team, draft, player.id, 'cancel-purchase').reason, 'PLAYER_PURCHASE_CLOSED');
  player.purchaseRefund = 50;
  draft.players = sealPlayerPurchases(draft.players);
  assert.equal(player.purchaseRefund, 50, 'Sealing does not mutate the draft used for the match snapshot');
  assert.equal(playerPurchaseRefund(draft.players[0]), null);
  assert.equal(removeLeaguePlayer(team, draft, player.id, 'cancel-purchase').reason, 'PLAYER_PURCHASE_CLOSED');
  assert.equal(draft.treasury, 100);
});

test('ordinary sales cannot leave fewer than seven, while undo restores a short original roster', () => {
  const { team, draft, player } = fixture(); draft.players.pop();
  assert.equal(playerRemoval(team, draft, player).blocked, true);
  assert.equal(removeLeaguePlayer(team, draft, player.id, 'sell').reason, 'PLAYER_SALE_MIN');
  assert.equal(draft.treasury, 100);
  player.purchaseRefund = 50;
  assert.equal(removeLeaguePlayer(team, draft, player.id, 'cancel-purchase').applied, true);
  assert.equal(draft.players.length, 6); assert.equal(draft.treasury, 150);
});

test('Architect of Fate pays full current value plus each lasting injury', () => {
  const { team, player } = fixture('Architect of Fate');
  player.extraSkills = [{ name: 'Block', access: 'primary' }];
  player.nigglingInjuries = 2; player.statMods = { ma: -1 }; player.injuryStatMods = { ma: -1 };
  assert.equal(playerSaleValue(team, player), 100);
});

test('15k players sell for exactly 7.5k', () => {
  const { team, draft, player } = fixture('Old World Classic', '15K');
  removeLeaguePlayer(team, draft, player.id, 'sell');
  assert.equal(draft.treasury, 107.5);
});

test('new purchase receipts survive save/reload while old player shapes stay unchanged', () => {
  const { team, row } = fixture();
  const bought = createPlayer(row, 0, 0, { purchased: true, purchaseRefund: 50 });
  const draft = normalizeDraft({ players: [bought], treasury: 100 });
  ensureDraftPlayers(team, draft);
  const reload = normalizeDraft(JSON.parse(JSON.stringify(rosterForStorage(draft))));
  ensureDraftPlayers(team, reload);
  assert.equal(playerPurchaseRefund(reload.players[0]), 50);
  assert.equal(Object.hasOwn(createPlayer(row, 0, 0, { purchased: true }), 'purchaseRefund'), false);
  for (const invalid of [-1, 'invalid', 0.0005]) {
    draft.players = [{ ...bought, purchaseRefund: invalid }]; ensureDraftPlayers(team, draft);
    assert.equal(playerPurchaseRefund(draft.players[0]), null);
  }
});
