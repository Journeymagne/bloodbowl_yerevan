import test from "node:test";
import assert from "node:assert/strict";

import { normalizeSppCounters } from "../src/domain/roster/players.mjs";
import { transitionRoster } from "../scripts/rehearsal/transitions-api.mjs";
import {
  assertLocalSite, assertTransitionsRecord, eventMismatches, moneyMismatches, parseTransitionsArgs, seasonTable, seededRows,
  sppAfterMatch, sppMismatches,
} from "../scripts/rehearsal/transitions-checks.mjs";
import { compareSnapshots, renderReport } from "../scripts/rehearsal/snapshot.mjs";

const ZERO = normalizeSppCounters();
const AT = "2026-10-21T10:00:00.000Z";

// A record as --seed writes it: two coaches, the 2.1.0 table, the five states and the rows it made.
function record() {
  return {
    version: 1, stamp: "0f1e2d3c-0000-4000-8000-000000000000", seededAt: AT, seedBase: "http://localhost:3004", complete: true,
    coaches: { home: { login: "transitions-home-0f1e2d3c", password: "pw-home", id: "u1" }, away: { login: "transitions-away-0f1e2d3c", password: "pw-away", id: "u2" } },
    season: { id: "s1", standings: [] },
    cases: {
      preparation: { gameId: "g1", step: 2 },
      started: { gameId: "g2", teamIds: { home: "h2", away: "a2" } },
      postPlayers: { gameId: "g3", teamIds: { home: "h3", away: "a3" }, before: { h3: { players: [] }, a3: { players: [] } },
        statistics: { home: {}, away: {} }, mvps: { home: ["h3-3"], away: ["a3-1"] } },
      proposed: { gameId: "g4", score: { homeTouchdowns: 2, awayTouchdowns: 0, homeCasualties: 1, awayCasualties: 0 } },
      challenge: { challengeId: "c5", teamId: "a5" },
    },
    seeded: { pairingIds: ["g1", "g2", "g3", "g4"], challengeIds: ["c1", "c2", "c3", "c4", "c5"], teamIds: ["h1", "a1", "h5", "a5"] },
  };
}

test("the site must be local: http on localhost, 127.0.0.1 or ::1", () => {
  for (const url of ["https://bloodbowlyerevan.example", "http://10.0.0.2:3004", "https://localhost:3004", "http://localhost.example.com:3004", "x", ""]) {
    assert.throws(() => assertLocalSite(url), /only against a local site/, url);
  }
  assert.equal(assertLocalSite("http://localhost:3004"), "http://localhost:3004");
  assert.equal(assertLocalSite("http://127.0.0.1:3077/"), "http://127.0.0.1:3077");
  assert.equal(assertLocalSite("http://[::1]:3004"), "http://[::1]:3004");
});

test("exactly one of --seed and --finish, each with its site", () => {
  assert.throws(() => parseTransitionsArgs(["--seed"]), /--seed needs the address of the site/);
  assert.throws(() => parseTransitionsArgs(["--seed", "x", "--finish", "y"]), /exactly one of --seed <url> and --finish <url>/);
  assert.throws(() => parseTransitionsArgs([]), /exactly one of --seed <url> and --finish <url>/);
  assert.throws(() => parseTransitionsArgs(["--finish", "http://10.0.0.2:3077"]), /only against a local site/);
  assert.throws(() => parseTransitionsArgs(["--finish", "http://localhost:3077", "--fast"]), /--fast/);
  assert.deepEqual(parseTransitionsArgs(["--finish", "http://127.0.0.1:3077"]), { mode: "finish", base: "http://127.0.0.1:3077" });
  assert.deepEqual(parseTransitionsArgs(["--seed", "http://localhost:3004"]), { mode: "seed", base: "http://localhost:3004" });
});

test("a record names all five states, or it is not one", () => {
  assert.equal(assertTransitionsRecord(record()).cases.preparation.step, 2);
  const without = record();
  delete without.cases.challenge;
  assert.throws(() => assertTransitionsRecord(without), /challenge/);
  assert.throws(() => assertTransitionsRecord({ ...record(), version: 2 }), /version 2/);
  assert.throws(() => assertTransitionsRecord(null), /not a record of rehearsal:transitions/);
  const noPassword = record();
  delete noPassword.coaches.away.password;
  assert.throws(() => assertTransitionsRecord(noPassword), /coaches\.away/);
  const noBefore = record();
  delete noBefore.cases.postPlayers.before;
  assert.throws(() => assertTransitionsRecord(noBefore), /postPlayers/);
  for (const complete of [false, undefined]) {
    assert.throws(() => assertTransitionsRecord({ ...record(), complete }), /the seed did not finish.*run rehearsal:restore again/s, String(complete));
  }
});

test("SPP after the match is SPP before plus the match's statistics and MVPs, once", () => {
  const before = [{ id: "a", spp: { touchdowns: 2 } }, { id: "b" }];
  const side = { statistics: { a: { touchdowns: 1, crowdCasualties: 0 }, b: { completions: 0 }, jm: { touchdowns: 1 } }, mvps: ["a", "a", "jm"] };
  const expected = sppAfterMatch(before, side);
  assert.deepEqual(expected.get("a"), { ...ZERO, touchdowns: 3, mvps: 2 });
  assert.deepEqual(expected.get("b"), ZERO);
  assert.equal(expected.has("jm"), false, "a journeyman of the match roster is no player of the roster");
  assert.deepEqual(sppMismatches(expected, [{ id: "a", spp: { touchdowns: 3, mvps: 2 } }, { id: "b", spp: {} }]), []);
  const twice = [{ id: "a", spp: { touchdowns: 4, mvps: 4 } }, { id: "b" }];
  assert.deepEqual(sppMismatches(expected, twice), ["a: touchdowns 3 ≠ 4", "a: mvps 2 ≠ 4"]);
  assert.deepEqual(sppMismatches(expected, [{ id: "a", spp: { touchdowns: 3, mvps: 2 } }]), ["b: not on the roster after the match"]);
});

test("the match's records are all settled and add up to the statistics, the injury left out", () => {
  const settled = (playerId, counter, delta = 1) => ({ playerId, counter, delta, settledAt: AT });
  const events = [settled("a", "touchdowns"), settled("a", "touchdowns"), settled("a", "touchdowns", -1), { ...settled("b", "injury"), injury: { code: "miss" } }];
  assert.deepEqual(eventMismatches(events, { a: { touchdowns: 1, crowdCasualties: 0 }, b: {} }), []);
  assert.deepEqual(eventMismatches(events, { a: { touchdowns: 2 }, b: {} }), ["a: touchdowns 2 in the statistics ≠ 1 in the records"]);
  assert.deepEqual(eventMismatches([...events, settled("c", "catches")], { a: { touchdowns: 1 } }), ["c: catches 0 in the statistics ≠ 1 in the records"]);
  assert.deepEqual(eventMismatches([{ ...settled("a", "touchdowns"), settledAt: null }], { a: { touchdowns: 1 } }), ["1 record(s) of the match not settled"]);
});

test("the money adds up: the treasury before, the winnings, the sales and the loss make the treasury after", () => {
  const accounting = { opening: 100, winnings: 40, sales: 0, purchases: 0, deposit: 0, loss: 0, closing: 140, safeOpening: 0, safeClosing: 0 };
  assert.deepEqual(moneyMismatches(accounting, { treasury: 100 }, { treasury: 140, coachesSafe: 0 }), []);
  assert.deepEqual(moneyMismatches(accounting, { treasury: 90 }, { treasury: 140, coachesSafe: 0 }), ["the account opens at 100, the team had 90"]);
  assert.deepEqual(moneyMismatches({ ...accounting, closing: 150 }, { treasury: 100 }, { treasury: 150, coachesSafe: 0 }),
    ["100 + 40 + 0 − 0 − 0 − 0 ≠ 150"]);
  assert.deepEqual(moneyMismatches(accounting, { treasury: 100 }, { treasury: 150, coachesSafe: 0 }), ["the team has 150 after the match, the account closes at 140"]);
  assert.deepEqual(moneyMismatches({ ...accounting, deposit: 20, closing: 120, safeClosing: 20 }, { treasury: 100, coachesSafe: 0 }, { treasury: 120, coachesSafe: 10 }),
    ["the safe holds 10 after the match, the account closes it at 20"]);
});

test("the league table is its season and its standings: points, games, byes, touchdowns and casualties of each entry", () => {
  const payload = {
    season: { id: "s1", name: "Season 1", updatedAt: AT },
    standings: [{ entryId: "e1", points: 4, games: 2, byes: 0, touchdowns: 3, casualties: 1, user: { id: "u1", login: "x" }, team: { id: "t1", updatedAt: AT } }],
    myTeams: [{ id: "t1", updatedAt: AT }], rounds: [],
  };
  assert.deepEqual(seasonTable(payload), { id: "s1", standings: [{ entryId: "e1", points: 4, games: 2, byes: 0, touchdowns: 3, casualties: 1 }] });
  assert.deepEqual(seasonTable({}), { id: null, standings: [] });
});

test("a seed names its rows; anything else names none", () => {
  assert.deepEqual(seededRows(record()), record().seeded);
  assert.equal(seededRows(null), null);
  assert.equal(seededRows({ version: 1 }), null);
  // A seed that stopped part-way may have made a row its record does not name: rehearsal:check would count it.
  for (const complete of [false, undefined]) {
    assert.throws(() => seededRows({ ...record(), complete }), /the seed did not finish.*run rehearsal:restore again/s, String(complete));
  }
});

test("the roster the seed creates: Humans, eleven players on four rows, 100 in the treasury, SPP to advance with", () => {
  const body = transitionRoster("Transitions · started · home", "0f1e2d3c-h2");
  assert.equal(body.name, "Transitions · started · home");
  assert.equal(body.baseTeamSlug, "teams/human");
  assert.deepEqual(body.roster.players.map((player) => player.rowIndex), [0, 0, 0, 0, 0, 0, 1, 2, 2, 3, 3]);
  assert.deepEqual(body.roster.players.map((player) => player.id).slice(0, 2), ["t-0f1e2d3c-h2-0", "t-0f1e2d3c-h2-1"]);
  assert.equal(new Set(body.roster.players.map((player) => player.number)).size, 11);
  assert.equal(body.roster.treasury, 100);
  assert.equal(body.roster.dedicatedFans, 2);
  assert.deepEqual(body.roster.players[0].spp, { bonus: 30 });
  assert.equal(body.roster.players[1].spp, undefined);
});

// Two snapshots alike but for the rows the seed made, which a migration does not touch either.
function snapshotWithSeed() {
  return {
    takenAt: AT, migrations: ["001_baseline.sql"], tables: { users: 4, schema_migrations: 1 }, columns: { users: { id: "h" } },
    teams: { t1: { name: "Ashgrove Wardens", revision: 3, roster: "a" }, h1: { name: "Transitions · preparation · home", revision: 1, roster: "b" } },
    season: { pairings: "p", entries: "e" },
    open: {
      preparing: [{ id: "g0", matchKind: "league" }, { id: "g1", matchKind: "friendly" }],
      startedWithoutPost: [{ id: "g2", matchKind: "friendly" }, { id: "g3", matchKind: "friendly" }],
      awaitingConfirmation: [{ id: "g4", matchKind: "friendly" }],
      pendingChallenges: 2, pendingChallengeIds: ["c5", "c9"],
    },
    stages: [
      { id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: true },
      { id: "h1", name: "Transitions · preparation · home", stage: "draft", entered: false, playedMatch: false },
    ],
    preferencesSet: 0, fallen: {}, fallenCheck: {},
  };
}

test("rehearsal:check marks what the seed made and leaves it out of the open states it counts for the day", () => {
  const before = snapshotWithSeed(), after = { ...snapshotWithSeed(), migrations: ["001_baseline.sql", "009_team_stage.sql"] };
  const report = renderReport(before, after, compareSnapshots(before, after), null, seededRows(record()));
  assert.match(report, /^- preparing \(pre-match begun, match not started\): g0 \(league\) · seeded by rehearsal:transitions, not counted: g1 \(friendly\)$/m);
  assert.match(report, /^- started, post-match not finished: none · seeded by rehearsal:transitions, not counted: g2 \(friendly\), g3 \(friendly\)$/m);
  assert.match(report, /^- result awaiting confirmation: none · seeded by rehearsal:transitions, not counted: g4 \(friendly\)$/m);
  assert.match(report, /^- pending friendly challenges: 1 · seeded by rehearsal:transitions, not counted: 1$/m);
  assert.match(report, /^- Transitions · preparation · home — draft — no entry, no match — seeded by rehearsal:transitions$/m);
  assert.match(report, /^- Ashgrove Wardens — active — entered in the current season, has a played match$/m);
  const plain = renderReport(before, after, compareSnapshots(before, after));
  assert.match(plain, /^- started, post-match not finished: g2 \(friendly\), g3 \(friendly\)$/m);
  assert.match(plain, /^- pending friendly challenges: 2$/m);
});
