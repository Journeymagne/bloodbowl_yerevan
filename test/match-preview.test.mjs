import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { expandCollections } from "../src/data/reference.mjs";
import { createPreparation } from "../src/domain/match/preparation.mjs";
import { matchBudget } from "../src/domain/match/budget.mjs";
import { calculateMatchCtv } from "../src/domain/match/roster.mjs";
import { tierAllowance } from "../src/domain/match/rules.mjs";
import { matchPreview, matchRecords, BEFORE_GETS } from "../src/domain/match/preview.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));

/** Players of one race: `[rowIndex, …]`, numbered from 1. */
const players = (prefix, rows) => rows.map((rowIndex, index) => ({ id: `${prefix}-${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix} ${index + 1}` }));
const humans = players("hu", [0, 0, 0, 0, 0, 0, 0]); // 7 Human Linemen: 350k
const dwarves = players("dw", [0, 0, 0, 0, 0, 0, 0]); // 7 Dwarf Blocker Linemen: 490k
const humansWithOgre = players("ho", [0, 0, 0, 0, 0, 0, 5]); // 6 Human Linemen and an Ogre: 440k
const gnomes = players("gn", [0, 0, 0, 0, 0, 0, 0]); // 7 Gnome Linemen: 350k, tier 2

function source(id, slug, roster, extra = {}) {
  return { user: { id: `u-${id}`, login: `coach-${id}` },
    team: { id, name: `Team ${id}`, baseTeamSlug: slug, revision: 1, roster: { players: roster, treasury: 70, ...extra } } };
}

test("the preview is the preparation's own budget: petty cash, tier bonus, treasury rule — the same numbers matchBudget gives the step", () => {
  const sources = { own: source("h", "teams/human", humans), other: source("d", "teams/dwarf", dwarves) };
  const preview = matchPreview(sources, data);
  const prep = createPreparation({ home: sources.own, away: sources.other }, data);
  const budget = matchBudget(prep, "home", data);
  assert.equal(preview.own.ctv, calculateMatchCtv(prep.home).total);
  assert.equal(preview.other.ctv, calculateMatchCtv(prep.away).total);
  assert.deepEqual([preview.petty, preview.bonus.own, preview.treasury.amount], [budget.pettyCash, budget.bonus, budget.treasuryLimit]);
  assert.equal(preview.bonus.other, matchBudget(prep, "away", data).bonus);
  assert.deepEqual([preview.own.name, preview.other.name], ["Team h", "Team d"]);
  assert.deepEqual([preview.own.available, preview.own.total], [7, 7]);
});

test("the side with the lower CTV gets the difference; the higher buys first with the whole treasury", () => {
  const cheaper = source("a", "teams/human", humans), dearer = source("b", "teams/human", humansWithOgre, { treasury: 120 });
  const ours = matchPreview({ own: cheaper, other: dearer }, data);
  assert.equal(ours.gets, "own");
  assert.equal(ours.difference, 90);
  assert.equal(ours.petty, 90);
  assert.deepEqual(ours.treasury, { rule: "top", amount: 50 });
  const theirs = matchPreview({ own: { ...dearer, team: { ...dearer.team, roster: { ...dearer.team.roster, treasury: 70 } } }, other: cheaper }, data);
  assert.equal(theirs.gets, "other");
  assert.equal(theirs.difference, 90);
  assert.equal(theirs.petty, 0);
  assert.deepEqual(theirs.treasury, { rule: "all", amount: 70 });
});

test("equal CTVs give no petty cash and no treasury, and a tier bonus still counts", () => {
  const even = matchPreview({ own: source("a", "teams/human", humans), other: source("b", "teams/human", humans) }, data);
  assert.equal(even.gets, "even");
  assert.equal(even.difference, 0);
  assert.equal(even.petty, 0);
  assert.deepEqual(even.treasury, { rule: "none", amount: 0 });
  assert.deepEqual(even.bonus, { own: 0, other: 0 });
  const gnome = data.teams.find((team) => team.slug === "teams/gnome"), human = data.teams.find((team) => team.slug === "teams/human");
  const ours = matchPreview({ own: source("g", "teams/gnome", gnomes), other: source("h", "teams/human", humans) }, data);
  assert.equal(ours.own.ctv, ours.other.ctv);
  assert.equal(ours.gets, "even");
  assert.deepEqual(ours.treasury, { rule: "none", amount: 0 });
  assert.deepEqual(ours.bonus, { own: tierAllowance(gnome, human), other: 0 });
  assert.equal(ours.bonus.own, 200);
  const theirs = matchPreview({ own: source("h", "teams/human", humans), other: source("g", "teams/gnome", gnomes) }, data);
  assert.deepEqual(theirs.bonus, { own: 0, other: 200 }, "the opponent's tier bonus is said too");
});

test("a player who sits the match out is not in the CTV and is listed with why; a season's retirement too", () => {
  const roster = structuredClone(humansWithOgre);
  Object.assign(roster[2], { name: "J. Corr", number: "9", skipNextGame: true, absence: { code: "miss" } });
  Object.assign(roster[6], { name: "Big Mo", temporarilyRetired: true });
  const whole = matchPreview({ own: source("a", "teams/human", humansWithOgre), other: source("b", "teams/dwarf", dwarves) }, data);
  const preview = matchPreview({ own: source("a", "teams/human", roster), other: source("b", "teams/dwarf", dwarves) }, data);
  assert.equal(preview.own.total, 7);
  assert.equal(preview.own.available, preview.own.total - 2);
  assert.equal(preview.own.ctv, whole.own.ctv - 50 - 140);
  assert.deepEqual(preview.own.missing, [
    { id: "ho-3", number: "9", name: "J. Corr", position: "Human Lineman", retired: false, absence: { code: "miss" } },
    { id: "ho-7", number: "7", name: "Big Mo", position: "Ogre", retired: true, absence: null },
  ]);
  assert.deepEqual(preview.other.missing, []);
});

test("a race the reference does not know, or a treasury the rules cannot read: no preview", () => {
  const other = source("d", "teams/dwarf", dwarves);
  assert.equal(matchPreview({ own: source("x", "teams/nope", humans), other }, data), null);
  assert.equal(matchPreview({ own: other, other: source("x", "teams/nope", humans) }, data), null);
  assert.equal(matchPreview({ own: source("h", "teams/human", humans, { treasury: -5 }), other }, data), null);
  assert.equal(matchPreview({ own: other, other: source("h", "teams/human", humans, { treasury: 0.0004 }) }, data), null);
});

test("the reference not read whole yet: no preview; any other fault is not swallowed", () => {
  const sources = { own: source("h", "teams/human", humans), other: source("d", "teams/dwarf", dwarves) };
  assert.equal(matchPreview(sources, undefined), null);
  assert.equal(matchPreview(sources, { teams: data.teams }), null);
  assert.equal(matchPreview(sources, { teams: data.teams, starPlayers: data.starPlayers }), null);
  assert.throws(() => matchPreview({ own: sources.own, other: { user: sources.other.user } }, data), TypeError);
});

test("who gets the petty cash is one of three", () => {
  assert.deepEqual(BEFORE_GETS, ["own", "other", "even"]);
  assert.ok(Object.isFrozen(BEFORE_GETS));
});

test("a match's records: its own rows not settled, counted as rows, summed with their signs", () => {
  const row = (pairingId, counter, delta, settledAt = null) => ({ pairingId, playerId: "p1", counter, delta, settledAt });
  const events = [
    row("g1", "touchdowns", 1), row("g1", "touchdowns", 1), row("g1", "touchdowns", -1), row("g1", "casualties", 1),
    row("g1", "touchdowns", 1, "2026-10-01T10:00:00Z"), row("g2", "casualties", 1), row(null, "touchdowns", 1),
  ];
  assert.deepEqual(matchRecords(events, "g1"), { count: 4, touchdowns: 1, casualties: 1 });
  assert.deepEqual(matchRecords([], "g1"), { count: 0, touchdowns: 0, casualties: 0 });
  assert.deepEqual(matchRecords(undefined, "g1"), { count: 0, touchdowns: 0, casualties: 0 });
});
