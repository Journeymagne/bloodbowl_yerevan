import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../src/data/reference.mjs";
import { sppCounterDefinitions } from "../src/domain/league-rules.mjs";
import { sameValues } from "../src/domain/post-match/events.mjs";
import { classifyTreasuryChange } from "../src/domain/roster/ledger.mjs";
import { normalizeRosterPlayer } from "../src/domain/roster/players.mjs";
import { normalizeDraft, rosterForStorage } from "../src/domain/roster/schema.mjs";
import { TRANSFER_REFUSALS, hirePlayers, hireQuote, removeLeaguePlayer, transferEdits } from "../src/domain/roster/transfers.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { blockingViolations, checkRoster, loadTeamReference } from "../server/domain/roster.mjs";

await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const race = (slug) => data.teams.find((team) => team.slug === slug);
// Human: 0 Human Lineman 50k (0-16), 1 Thrower 80k (0-2), 2 Catcher 75k (0-2), 3 Blitzer 80k (0-2), 4 Halfling Hopeful 30k (0-3), 5 Ogre 140k (0-1).
const human = race("teams/human");
// Tzeentch (Architect of Fate): 0 Blue Horror 30k (0-16), 1 Pink Horror 75k (0-3).
const tzeentch = race("teams/tzeentch");

/** A roster as GET returns it: what the server stores of what was sent (`checkRoster`), over the wire. */
const stored = (slug, roster) => JSON.parse(JSON.stringify(checkRoster(slug, roster).roster));

/** Human Linemen `p<from>`…`p<to>`, each wearing the number of his id. */
const linemen = (from, to) => Array.from({ length: to - from + 1 }, (_, n) => ({ id: `p${from + n}`, rowIndex: 0, number: String(from + n) }));

/**
 * Seven Humans as the server stores them, `p1`…`p7` wearing 1–7: three Linemen (the third misses the next match), a
 * Blitzer, a Catcher, a Thrower and an Ogre, with 120k in the treasury; `players` join them after.
 */
function roster({ players = [], treasury = 120 } = {}) {
  const seven = [[0], [0], [0, { skipNextGame: true }], [3], [2], [1], [5]]
    .map(([rowIndex, over = {}], n) => ({ id: `p${n + 1}`, rowIndex, number: String(n + 1), ...over }));
  return stored("teams/human", { teamSlug: "teams/human", teamName: "Iron Rooks", treasury, players: [...seven, ...players] });
}

/** The fields of a `HireRow`. */
const pick = ({ rowIndex, position, kind, price, have, max, inCart, refusal }) => ({ rowIndex, position, kind, price, have, max, inCart, refusal });
const NO_SPP = Object.fromEntries(sppCounterDefinitions.map(([key]) => [key, 0]));
const FULL = { code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 14 } };
const OGRE_MAX = { code: "POSITION_MAX", params: { position: "Ogre", max: 1 } };

test("a cart: what it costs, what the treasury keeps, the places left, the numbers the new players get", () => {
  const quote = hireQuote(human, roster(), { 0: 2, 4: 1 });
  assert.deepEqual([quote.players, quote.max, quote.treasury, quote.count, quote.total, quote.left, quote.free], [7, 14, 120, 3, 130, -10, 4]);
  assert.deepEqual(quote.numbers, [8, 9, 10]);
  assert.deepEqual(pick(quote.rows[0]), { rowIndex: 0, position: "Human Lineman", kind: "lineman", price: 50, have: 3, max: 16, inCart: 2, refusal: null });
  assert.deepEqual(quote.rows.map(({ position, kind, price, have, max, inCart }) => [position, kind, price, have, max, inCart]), [
    ["Human Lineman", "lineman", 50, 3, 16, 2], ["Thrower", "thrower", 80, 1, 2, 0], ["Catcher", "catcher", 75, 1, 2, 0],
    ["Blitzer", "blitzer", 80, 1, 2, 0], ["Halfling Hopeful", "lineman", 30, 0, 3, 1], ["Ogre", "big", 140, 1, 1, 0],
  ], "every line of the race's table, in its order");
  assert.deepEqual(quote.refusal, { code: "TREASURY_INVALID", params: {} });
});

test("one more of a position refused at its maximum, and at fourteen on the roster — everyone on it, those who miss the next match too; money refuses no position", () => {
  const quote = hireQuote(human, roster(), {});
  assert.deepEqual(quote.rows.map((row) => row.refusal), [null, null, null, null, null, OGRE_MAX], "the Ogre is on the roster already");
  assert.deepEqual(hireQuote(human, roster(), { 3: 1 }).rows[3].refusal, { code: "POSITION_MAX", params: { position: "Blitzer", max: 2 } },
    "the one in the cart counts with the one on the roster");

  const thirteen = roster({ players: linemen(8, 13) });
  assert.deepEqual([thirteen.players.length, thirteen.players.filter((player) => player.skipNextGame).length], [13, 1]);
  const crowded = hireQuote(human, thirteen, { 0: 1 });
  assert.deepEqual(crowded.rows.map((row) => row.refusal), [FULL, FULL, FULL, FULL, FULL, OGRE_MAX],
    "twelve play the next match, but the thirteenth is on the roster too; a position's maximum is said first");
  assert.equal(crowded.free, 0);

  const broke = hireQuote(human, roster({ treasury: 0 }), { 0: 1 });
  assert.equal(broke.rows[0].refusal, null, "money stops the purchase, not the +");
  assert.equal(broke.left, -50);
});

test("a cart over the treasury, a position or the roster is refused as a whole", () => {
  assert.deepEqual(hireQuote(human, roster(), { 3: 2 }).refusal, { code: "POSITION_MAX", params: { position: "Blitzer", max: 2 } },
    "a position over its maximum is said before the 160k the treasury does not hold");
  const thirteen = roster({ players: linemen(8, 13) });
  assert.deepEqual(hireQuote(human, thirteen, { 0: 2 }).refusal, { code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 15 } });
  assert.equal(hireQuote(human, thirteen, { 0: 1 }).refusal, null, "fourteen is the limit, not past it");
  assert.equal(hireQuote(human, roster(), { 0: 1 }).refusal, null);
  for (const cart of [{ 9: 1 }, { 0: 0 }, { 0: -1 }, {}]) {
    const quote = hireQuote(human, roster(), cart);
    assert.deepEqual([quote.count, quote.total, quote.left, quote.free, quote.numbers, quote.refusal], [0, 0, 120, 7, [], null], JSON.stringify(cart));
    assert.deepEqual(quote.rows.map((row) => row.inCart), [0, 0, 0, 0, 0, 0], JSON.stringify(cart));
  }
});

test("a hire: the players as the server stores them, the purchase recorded, the treasury spent, the counts kept", () => {
  const draft = roster();
  const { numbers } = hireQuote(human, draft, { 0: 2 });
  const { hired } = hirePlayers(human, draft, { 0: 2 });
  assert.deepEqual(hired.map(({ rowIndex, number, name, purchased, purchaseRefund }) => ({ rowIndex, number, name, purchased, purchaseRefund })), [
    { rowIndex: 0, number: "8", name: "Human Lineman 4", purchased: true, purchaseRefund: 50 },
    { rowIndex: 0, number: "9", name: "Human Lineman 5", purchased: true, purchaseRefund: 50 },
  ]);
  assert.deepEqual(hired.map((player) => Number(player.number)), numbers, "the numbers the quote promised");
  for (const player of hired) {
    assert.deepEqual(player.spp, NO_SPP);
    assert.deepEqual(player, normalizeRosterPlayer(player, rowsForTeam(human)));
  }
  assert.notEqual(hired[0].id, hired[1].id);
  assert.deepEqual(draft.players.slice(7), hired, "after the roster, in the cart's order");
  assert.equal(draft.treasury, 20);
  assert.equal(draft.roster[0], 5);
});

test("an empty cart changes nothing; a refused one throws before it changes anything", () => {
  const draft = roster(), copy = structuredClone(draft);
  assert.deepEqual(hirePlayers(human, draft, {}), { hired: [] });
  assert.deepEqual(hirePlayers(human, draft, { 9: 1, 0: 0 }), { hired: [] });
  assert.deepEqual(draft, copy);
  assert.throws(() => hirePlayers(human, draft, { 0: 3 }), /TREASURY_INVALID/, "150k from 120k");
  assert.throws(() => hirePlayers(human, draft, { 5: 1 }), /POSITION_MAX/);
  assert.deepEqual(draft, copy);
});

/** The cart hired on a copy of `before`, sent as the queue sends it, and what the server stores of it and journals. */
function sentAndSaved(team, slug, before, cart) {
  const draft = structuredClone(before);
  const { hired } = hirePlayers(team, draft, cart);
  const sent = rosterForStorage(draft);
  const { roster: saved, violations } = checkRoster(slug, JSON.parse(JSON.stringify(sent)));
  return { hired, sent, saved, violations, ledger: classifyTreasuryChange(team, before, saved) };
}

// T2-1: positions with starting skills, a big guy's traits and another race are where the shape could drift.
test("a hire as the server stores it is the hire as sent: a lost answer's 409 is known as this very hire", () => {
  const ogreless = stored("teams/human", { teamSlug: "teams/human", treasury: 150, players: linemen(1, 7) });
  const blues = Array.from({ length: 8 }, (_, n) => ({ id: `b${n + 1}`, rowIndex: 0, number: String(n + 1) }));
  const horrors = stored("teams/tzeentch", { teamSlug: "teams/tzeentch", treasury: 80, players: blues });
  const cases = [
    ["two Human Linemen", human, "teams/human", roster(), { 0: 2 }, [-50, -50]],
    ["a Thrower, Pass and Sure Hands", human, "teams/human", roster(), { 1: 1 }, [-80]],
    ["an Ogre, a big guy's traits", human, "teams/human", ogreless, { 5: 1 }, [-140]],
    ["a Tzeentch Pink Horror", tzeentch, "teams/tzeentch", horrors, { 1: 1 }, [-75]],
  ];
  for (const [what, team, slug, before, cart, deltas] of cases) {
    const { hired, sent, saved, violations, ledger } = sentAndSaved(team, slug, before, cart);
    assert.equal(hired.length, deltas.length, what);
    assert.deepEqual(blockingViolations(violations), [], what);
    const conflict = JSON.parse(JSON.stringify(saved)); // the team a 409 carries
    assert.equal(sameValues(normalizeDraft(conflict), normalizeDraft(sent)), true, `${what}: what landedTeam in save.mjs compares`);
    assert.deepEqual(ledger, deltas.map((delta) => ({ kind: "hire", delta })), what);
  }
});

// T2-2: one cart over several lines, on a roster whose numbers have gaps.
test("a cart of several positions: hired in the race's order, on the numbers the quote promised, each named after the ones the roster has, journaled one line each", () => {
  const before = stored("teams/human", { teamSlug: "teams/human", teamName: "Iron Rooks", treasury: 250,
    players: roster().players.map((player, n) => ({ ...player, number: String([1, 2, 4, 5, 7, 9, 10][n]) })) });
  const cart = { 4: 1, 1: 1, 0: 2 };
  const quote = hireQuote(human, before, cart);
  assert.deepEqual([quote.count, quote.total, quote.left, quote.refusal, quote.numbers], [4, 210, 40, null, [3, 6, 8, 11]], "the gaps first");
  const { hired, sent, saved, violations, ledger } = sentAndSaved(human, "teams/human", before, cart);
  assert.deepEqual(hired.map(({ rowIndex, number, name, purchaseRefund }) => [rowIndex, number, name, purchaseRefund]), [
    [0, "3", "Human Lineman 4", 50], [0, "6", "Human Lineman 5", 50], [1, "8", "Thrower 2", 80], [4, "11", "Halfling Hopeful 1", 30],
  ], "Lineman, Thrower, Halfling Hopeful: the table's order, not the cart's; three Linemen and a Thrower are on the roster already");
  assert.deepEqual(hired.map((player) => Number(player.number)), quote.numbers);
  assert.deepEqual(sent.players.slice(7).map((player) => player.id), hired.map((player) => player.id), "after the roster");
  assert.deepEqual([sent.treasury, sent.roster[0], sent.roster[1], sent.roster[4]], [40, 5, 2, 1]);
  assert.deepEqual(blockingViolations(violations), []);
  assert.equal(sameValues(normalizeDraft(JSON.parse(JSON.stringify(saved))), normalizeDraft(sent)), true, "the server stores the cart as sent");
  assert.deepEqual(ledger, [-50, -50, -80, -30].map((delta) => ({ kind: "hire", delta })), "one hire line per player, at his price");
});

test("a sale and a cancelled purchase as the server reads them: one line of their kind, at the screen's amount, no remainder", () => {
  const withHal = roster({ players: [{ id: "hal", rowIndex: 2, number: "8", name: "Hal", extraSkills: ["Block"] }] });
  const sold = structuredClone(withHal);
  assert.deepEqual(removeLeaguePlayer(human, sold, "hal", "sell"), { applied: true, amount: 47.5 }, "half of 75k and Block's 20k");
  assert.equal(sold.treasury, 167.5);
  assert.deepEqual(classifyTreasuryChange(human, withHal, checkRoster("teams/human", sold).roster), [{ kind: "sale", delta: 47.5 }]);

  const withNew = roster({ players: [{ id: "n8", rowIndex: 0, number: "8", purchased: true, purchaseRefund: 50 }] });
  const cancelled = structuredClone(withNew);
  assert.deepEqual(removeLeaguePlayer(human, cancelled, "n8", "cancel-purchase"), { applied: true, amount: 50 });
  assert.deepEqual(classifyTreasuryChange(human, withNew, checkRoster("teams/human", cancelled).roster), [{ kind: "cancel_purchase", delta: 50 }]);

  const blues = Array.from({ length: 7 }, (_, n) => ({ id: `b${n + 1}`, rowIndex: 0, number: String(n + 1) }));
  const horrors = stored("teams/tzeentch", { teamSlug: "teams/tzeentch", treasury: 50,
    players: [...blues, { id: "pink", rowIndex: 1, number: "8", nigglingInjuries: 1 }] });
  assert.equal(horrors.players.length, 8, "more than seven, so the sale is allowed");
  const soldPink = structuredClone(horrors);
  assert.deepEqual(removeLeaguePlayer(tzeentch, soldPink, "pink", "sell"), { applied: true, amount: 85 }, "Architect of Fate: 75k and 10k for the injury");
  assert.deepEqual(classifyTreasuryChange(tzeentch, horrors, checkRoster("teams/tzeentch", soldPink).roster), [{ kind: "sale", delta: 85 }]);
});

test("the players two rosters differ by, hired or let go", () => {
  const of = (...ids) => ({ players: ids.map((id) => (id === null ? { rowIndex: 0 } : { id, rowIndex: 0 })) });
  assert.equal(transferEdits(of("p1", "p2", "p3"), of("p1", "p3", "n1", "n2")), 3);
  assert.equal(transferEdits(of("p1", null), of("p1", null, null)), 0, "a player without an id is nobody either can name");
  assert.equal(transferEdits(of(5), of("5")), 0, "a 2.x roster's 5 is \"5\"");
  assert.equal(transferEdits(of("p1"), of("p1")), 0);
  assert.equal(transferEdits(null, {}), 0);
});

test("every refusal a hire or a sale can meet is worded in both dictionaries", () => {
  const seven = roster();
  const met = [
    hireQuote(human, seven, { 5: 1 }).refusal.code,
    hireQuote(human, roster({ players: linemen(8, 13) }), { 0: 2 }).refusal.code,
    hireQuote(human, seven, { 0: 3 }).refusal.code,
    removeLeaguePlayer(human, seven, "ghost", "sell").reason,
    removeLeaguePlayer(human, seven, "p1", "cancel-purchase").reason,
    removeLeaguePlayer(human, seven, "p1", "sell").reason,
  ];
  assert.deepEqual(met, [...TRANSFER_REFUSALS], "the codes are the ones the domain gives");
  assert.equal(Object.isFrozen(TRANSFER_REFUSALS), true);
  for (const locale of ["en", "ru"]) {
    const words = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const code of TRANSFER_REFUSALS) {
      const key = `validation.${code}`;
      assert.ok(typeof words[key] === "string" && words[key].trim(), `${locale}: ${key}`);
    }
  }
});
