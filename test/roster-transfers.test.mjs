import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlayer, normalizeDraft, rosterForStorage } from '../src/domain/roster/schema.mjs';
import { ensureDraftPlayers } from '../src/domain/roster/players.mjs';
import { playerPurchaseRefund, playerRemoval, playerSaleValue, removeFallenPlayer, removeLeaguePlayer, returnFallenPlayer, sealPlayerPurchases } from '../src/domain/roster/transfers.mjs';

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

test("a player is found by his id as stored: a 2.x roster's 5 is \"5\"", () => {
  const { team, draft, player } = fixture(); player.id = 5;
  assert.deepEqual(removeLeaguePlayer(team, draft, '5', 'sell'), { applied: true, amount: 25 });
  assert.equal(draft.players.includes(player), false);
  assert.equal(draft.treasury, 125);
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

test("a fallen player leaves the roster as he was, and comes back without taking the captaincy from anyone", () => {
  const roster = { treasury: 10, players: [{ id: "a", rowIndex: 0, isCaptain: true, spp: { touchdowns: 2 } }, { id: "b", rowIndex: 0 }] };
  const { roster: without, player } = removeFallenPlayer(roster, "a");
  assert.deepEqual(without.players.map((item) => item.id), ["b"]);
  assert.deepEqual(player, roster.players[0]);
  assert.equal(removeFallenPlayer(roster, "ghost"), null);
  assert.equal(roster.players.length, 2, "the input is left alone");
  assert.equal(returnFallenPlayer(without, player).players.at(-1).isCaptain, true);
  const led = { ...without, players: [{ ...without.players[0], isCaptain: true }] };
  const back = returnFallenPlayer(led, player);
  assert.deepEqual(back.players.map((item) => [item.id, Boolean(item.isCaptain)]), [["b", true], ["a", false]]);
  assert.deepEqual(back.players.at(-1).spp, { touchdowns: 2 });
});

test("a fallen player takes nothing else from the roster than himself and his place in the position counts, and shares nothing with the input", () => {
  const roster = { treasury: 10, coachesSafe: 5, roster: { 0: 2, 1: 1 }, players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 2 } }, { id: "b", rowIndex: 1 }, { id: "c", rowIndex: 0 }] };
  const before = structuredClone(roster);
  const { roster: without, player } = removeFallenPlayer(roster, "b");
  assert.deepEqual(without, { treasury: 10, coachesSafe: 5, roster: { 0: 2 }, players: [roster.players[0], roster.players[2]] });
  assert.deepEqual(roster, before, "the input is left alone, its counts included");
  player.name = "changed";
  without.players[0].spp.touchdowns = 9;
  assert.deepEqual(roster, before, "nothing the copies hold is the input's");
});

test("a roster with no players array has nobody to lose, and a player who is not on it is not lost", () => {
  for (const roster of [{}, { players: null }, { players: "a" }, null, undefined]) assert.equal(removeFallenPlayer(roster, "a"), null);
  assert.equal(removeFallenPlayer({ players: [{ id: "a", rowIndex: 0 }] }, "A"), null, "ids are compared as they are");
  assert.equal(removeFallenPlayer({ players: [{ id: "a", rowIndex: 0 }] }, undefined), null);
});

test("a returning player goes last, the counts are those of the roster that results, and neither the roster nor the player is touched", () => {
  const roster = { treasury: 10, roster: { 0: 1 }, players: [{ id: "b", rowIndex: 0 }] };
  const player = { id: "a", rowIndex: 1, isCaptain: true, spp: { touchdowns: 2 } };
  const [rosterBefore, playerBefore] = [structuredClone(roster), structuredClone(player)];
  const back = returnFallenPlayer(roster, player);
  assert.deepEqual(back, { treasury: 10, roster: { 0: 1, 1: 1 }, players: [{ id: "b", rowIndex: 0 }, player] });
  back.players.at(-1).spp.touchdowns = 9;
  back.players[0].name = "changed";
  assert.deepEqual([roster, player], [rosterBefore, playerBefore], "what the copy holds is not the input's, and a captaincy handed back is not taken out of the record");
  const led = returnFallenPlayer({ players: [{ id: "b", rowIndex: 0, isCaptain: true }] }, player);
  assert.deepEqual([led.players.at(-1).isCaptain, player.isCaptain], [false, true], "the record keeps what it was");
  assert.deepEqual(returnFallenPlayer({}, player), { players: [player], roster: { 1: 1 } });
  assert.deepEqual(returnFallenPlayer({ players: [{ id: "b", rowIndex: 0 }] }, { id: "n", rowIndex: 0 }).players.at(-1), { id: "n", rowIndex: 0 }, "a player who was no captain gets no flag");
});

test("a player who is already on the roster does not come back a second time", () => {
  const roster = { players: [{ id: "a", rowIndex: 0 }, { id: "b", rowIndex: 0 }] };
  const back = returnFallenPlayer(roster, { id: "a", rowIndex: 0, name: "as he died" });
  assert.deepEqual(back.players, roster.players);
  assert.deepEqual(back.roster, { 0: 2 });
});
