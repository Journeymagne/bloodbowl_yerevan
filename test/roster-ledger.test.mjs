import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { classifyTreasuryChange, ledgerRows, postMatchLedgerEntries } from "../src/domain/roster/ledger.mjs";
import { createPlayer, normalizeDraft } from "../src/domain/roster/schema.mjs";
import { ensureDraftPlayers } from "../src/domain/roster/players.mjs";
import { applyPaidStaffChange, spendTreasury } from "../src/domain/roster/costs.mjs";
import { playerSaleValue, removeLeaguePlayer } from "../src/domain/roster/transfers.mjs";
import { costToNumber, rowCost, rowsForTeam } from "../src/domain/roster/values.mjs";
import { builderStaffCosts } from "../src/domain/league-rules.mjs";
import { sumMoney } from "../src/domain/money.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const cases = JSON.parse(readFileSync(new URL("./fixtures/roster-cases.json", import.meta.url), "utf8"));
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.json", import.meta.url), "utf8")));
const teams = new Map(data.teams.map((team) => [team.slug, team]));

/** A fixture as stored, read the way the server reads it, and a copy to edit. */
function stored(item) {
  const team = teams.get(item.team), draft = normalizeDraft(item.draft);
  ensureDraftPlayers(team, draft);
  return { team, before: draft, after: structuredClone(draft) };
}

/** What the league editor does on a hire (components/roster-editor/hire-panel.mjs). */
function hire(team, draft) {
  const row = rowsForTeam(team)[0], cost = costToNumber(rowCost(row));
  const player = createPlayer(row, 0, draft.players.length, { purchased: true, purchaseRefund: cost });
  draft.players.push(player);
  spendTreasury(draft, cost);
  return { player, cost };
}

test("a hire on every fixture is one hire line for the position's price", () => {
  for (const item of cases) {
    const { team, before, after } = stored(item);
    const { cost } = hire(team, after);
    assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "hire", delta: -cost }], item.team);
  }
});

test("a sale on every fixture is one sale line for the sale value", () => {
  for (const item of cases) {
    const { team, before, after } = stored(item);
    const [sold] = after.players.splice(0, 1);
    const value = playerSaleValue(team, sold);
    after.treasury = sumMoney(after.treasury, value);
    assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "sale", delta: value }], item.team);
  }
});

test("cancelling a purchase on every fixture refunds the price as cancel_purchase", () => {
  for (const item of cases) {
    const { team, after: bought } = stored(item);
    const { player, cost } = hire(team, bought);
    const cancelled = structuredClone(bought);
    assert.equal(removeLeaguePlayer(team, cancelled, player.id, "cancel-purchase").applied, true);
    assert.deepEqual(classifyTreasuryChange(team, bought, cancelled), [{ kind: "cancel_purchase", delta: cost }], item.team);
  }
});

test("staff bought or refunded through the editor is staff or staff_refund at the list price", () => {
  for (const item of cases) {
    const { team, before, after } = stored(item);
    after.assistantCoaches = before.assistantCoaches + 1;
    applyPaidStaffChange(after, "assistantCoaches", before.assistantCoaches, after.assistantCoaches);
    assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "staff", delta: -builderStaffCosts.assistantCoaches }], item.team);
  }
  const withRerolls = cases.map(stored).filter(({ before }) => before.purchasedStaff.teamRerolls > 0);
  assert.ok(withRerolls.length > 0, "a fixture with a bought Team reroll");
  for (const { team, before, after } of withRerolls) {
    after.teamRerolls = before.teamRerolls - 1;
    applyPaidStaffChange(after, "teamRerolls", before.teamRerolls, after.teamRerolls);
    assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "staff_refund", delta: builderStaffCosts.teamRerolls }]);
  }
});

test("what the operations do not explain is manual, without a reason — or admin on the admin's route", () => {
  for (const item of cases) {
    const { team, before, after } = stored(item);
    after.treasury = sumMoney(after.treasury, 25);
    assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "manual", delta: 25 }]);
    assert.deepEqual(classifyTreasuryChange(team, before, after, { admin: true }), [{ kind: "admin", delta: 25 }]);
  }
});

test("operations come first, in roster order, and the remainder last", () => {
  const { team, before, after } = stored(cases[0]);
  const { cost } = hire(team, after);
  after.treasury = sumMoney(after.treasury, cost - 5); // the coach gave most of it back by hand
  assert.deepEqual(classifyTreasuryChange(team, before, after), [{ kind: "hire", delta: -cost }, { kind: "manual", delta: cost - 5 }]);
});

test("with no race to price players against — the race changed — the whole change is one remainder", () => {
  const { before, after } = stored(cases[0]);
  after.players = [];
  after.treasury = sumMoney(after.treasury, -10);
  assert.deepEqual(classifyTreasuryChange(null, before, after), [{ kind: "manual", delta: -10 }]);
});

test("nothing changed is nothing to journal", () => {
  const { team, before, after } = stored(cases[0]);
  assert.deepEqual(classifyTreasuryChange(team, before, after), []);
});

test("money keeps its gold: a 37.5k sale and a 0.1k to 0.3k edit are exact", () => {
  const human = teams.get("teams/human");
  const catcher = { id: "c", rowIndex: 2, name: "Catcher" }; // Catcher, 75k
  assert.deepEqual(classifyTreasuryChange(human, { treasury: 0.1, players: [catcher] }, { treasury: 37.6, players: [] }),
    [{ kind: "sale", delta: 37.5 }]);
  assert.deepEqual(classifyTreasuryChange(human, { treasury: 0.1, players: [] }, { treasury: 0.3, players: [] }),
    [{ kind: "manual", delta: 0.2 }]);
});

test("ledger rows carry the running balance", () => {
  assert.deepEqual(ledgerRows(150, [{ kind: "hire", delta: -50 }, { kind: "sale", delta: 37.5 }]),
    [{ kind: "hire", delta: -50, balanceAfter: 100 }, { kind: "sale", delta: 37.5, balanceAfter: 137.5 }]);
});

test("a post-match is income, its roster operations, the safe and the mistake, without empty lines", () => {
  const accounting = { opening: 150, winnings: 50, deposit: 20, loss: 30, closing: 92.5, transactions: [
    { type: "sell", amount: 7.5 }, { type: "hire", amount: -15 }, { type: "keep", amount: -40 }, { type: "raise", amount: 0 },
    { type: "staff", amount: -10 }, { type: "staff", amount: 0 }] };
  assert.deepEqual(postMatchLedgerEntries(accounting), [
    { kind: "match_income", delta: 50 }, { kind: "sale", delta: 7.5 }, { kind: "hire", delta: -15 }, { kind: "hire", delta: -40 },
    { kind: "staff", delta: -10 }, { kind: "safe", delta: -20 }, { kind: "mistake", delta: -30 }]);
  assert.deepEqual(postMatchLedgerEntries({ winnings: 0, deposit: 0, loss: 0, transactions: [] }), []);
});

test("a post-match operation the ledger has no line for is an error, not a guess", () => {
  const accounting = { winnings: 0, deposit: 0, loss: 0, transactions: [{ type: "bribe", amount: -10 }] };
  assert.throws(() => postMatchLedgerEntries(accounting), /No ledger line for the post-match operation "bribe"/);
});
