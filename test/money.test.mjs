import test from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { isMoneyAmount, sumMoney } from '../src/domain/money.mjs';
import { loadTeamReference, checkRoster } from '../server/domain/roster.mjs';

test('money preserves individual gold and refuses invalid or unsafe balances', () => {
  for (const value of [0, 7.5, '150.5', 0.001]) assert.equal(isMoneyAmount(value), true);
  for (const value of [-1, Infinity, NaN, 'invalid', 0.0005, Number.MAX_SAFE_INTEGER]) assert.equal(isMoneyAmount(value), false);
  assert.equal(sumMoney(0.1, 0.2, -0.1), 0.2);
  assert.equal(sumMoney(150.5, -10, 7.5, -20), 128);
});

test('server rejects invalid raw balances before normalisation can hide them', async () => {
  await loadTeamReference(fileURLToPath(new URL('..', import.meta.url)));
  for (const [key, code] of [['treasury', 'TREASURY_INVALID'], ['coachesSafe', 'SAFE_INVALID']]) {
    for (const value of [-10, 'invalid', 0.0005]) {
      const checked = checkRoster('teams/amazon', { [key]: value, players: [] });
      assert.ok(checked.violations.some(item => item.code === code), `${key}: ${value}`);
    }
  }
  assert.equal(checkRoster('teams/amazon', { treasury: 157.5, coachesSafe: 10.001, players: [] })
    .violations.some(item => ['TREASURY_INVALID', 'SAFE_INVALID'].includes(item.code)), false);
});
