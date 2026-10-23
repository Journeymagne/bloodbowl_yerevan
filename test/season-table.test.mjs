import assert from "node:assert/strict";
import test from "node:test";

import { ROUND_STATES, lastRoundOver, leagueRounds, playoffPlacesOf, seasonTable, tableWindow, teamTableRow } from "../src/data/season-table.mjs";
import { TECHNICAL_REASONS } from "../src/domain/league-rules.mjs";

/** A season's entry as `/api/season` sends it; the key is the team's id, `e<key>` the entry's, `u<key>` the coach's. */
const entry = (key, { withdrawn = false, race = "teams/dwarf" } = {}) => ({
  id: `e${key}`, withdrawnAt: withdrawn ? "2026-10-01T10:00:00Z" : null,
  user: { id: `u${key}`, login: `coach-${key}`, telegram: "@coach_x", isAdmin: false },
  team: { id: key, name: `Team ${key}`, baseTeamSlug: race, logoData: null, roster: {} },
});

/** A row of the server's standings: its rank, games and points as the server counted them. */
const standing = (key, rank, games, points, { withdrawn = false } = {}) => {
  const { id, withdrawnAt, user, team } = entry(key, { withdrawn });
  return { entryId: id, withdrawnAt, user, team, points, games, byes: 0, touchdowns: 0, casualties: 0, rank };
};

const round = (roundNumber, status) => ({ roundNumber, status });

/**
 * A pairing as `publicSeasonPairing` sends it; the home side's numbers come first. `away` null is a bye. `resultType`
 * and `technicalReason` are stage 12's; a pairing read before it has neither.
 */
function pairing(at, home, away, { touchdowns = null, casualties = null, points = null, status = "confirmed", table = 1, id = null, technical } = {}) {
  return {
    ...(technical === undefined ? {} : { resultType: "technical", technicalReason: technical }),
    id: id ?? `p${at.roundNumber}-${home}-${away}`, roundId: `r${at.roundNumber}`, roundNumber: at.roundNumber, roundStatus: at.status, tableNumber: table,
    homeEntryId: home ? `e${home}` : null, awayEntryId: away ? `e${away}` : null,
    homeTouchdowns: touchdowns?.[0] ?? null, awayTouchdowns: touchdowns?.[1] ?? null,
    homeCasualties: casualties?.[0] ?? null, awayCasualties: casualties?.[1] ?? null,
    homePoints: points?.[0] ?? null, awayPoints: points?.[1] ?? null, resultStatus: status,
  };
}

/** The answer of `/api/season`: `rounds` is a list of `[round, ...pairings]`. */
function season({ entries = [], standings = [], rounds = [] }) {
  return {
    season: { id: "s1", name: "Mock Season" },
    entries: entries.filter((item) => !item.withdrawnAt),
    historicalEntries: entries.filter((item) => item.withdrawnAt),
    standings,
    rounds: rounds.map(([at, ...pairings]) => ({ id: `r${at.roundNumber}`, roundNumber: at.roundNumber, status: at.status, pairings })),
  };
}

const R1 = round(1, "completed"), R2 = round(2, "started");
const SEASON = season({
  entries: ["a", "b", "c"].map((key) => entry(key)),
  standings: [standing("a", 1, 2, 7), standing("b", 2, 2, 3), standing("c", 3, 1, 0)],
  rounds: [
    [R1, pairing(R1, "a", "b", { touchdowns: [3, 1], casualties: [2, 0], points: [4, 0] })],
    [R2, pairing(R2, "c", "a", { touchdowns: [0, 2], casualties: [1, 1], points: [0, 3] }), pairing(R2, "b", null, { points: [3, null], table: 2 })],
  ],
});

test("the server's place, points and games stand; wins, draws, losses, conceded and suffered come from the league pairings with both sides scored", () => {
  const rows = seasonTable(SEASON);
  assert.deepEqual(rows.map(({ rank, team, games, points }) => [rank, team.id, games, points]), [[1, "a", 2, 7], [2, "b", 2, 3], [3, "c", 1, 0]]);
  const a = rows[0];
  assert.deepEqual([a.wins, a.draws, a.losses, a.touchdowns, a.conceded, a.casualties, a.suffered], [2, 0, 0, 5, 1, 3, 1]);
  assert.deepEqual(a.form, ["w", "w"]);
  assert.deepEqual(a.user, { id: "ua", login: "coach-a" }, "the coach is who and nothing else: no contact rides along");
  assert.deepEqual(a.team, { id: "a", name: "Team a", baseTeamSlug: "teams/dwarf" });
  assert.equal(a.entryId, "ea");
  assert.equal(a.withdrawn, false);
  const c = rows[2];
  assert.deepEqual([c.wins, c.draws, c.losses, c.touchdowns, c.conceded, c.casualties, c.suffered, c.form], [0, 0, 1, 0, 2, 1, 1, ["l"]]);
});

test("the rows go by the server's rank, never sorted again by the client", () => {
  const shuffled = { ...SEASON, standings: [SEASON.standings[2], SEASON.standings[0], SEASON.standings[1]] };
  assert.deepEqual(seasonTable(shuffled).map((row) => row.rank), [1, 2, 3]);
  const level = season({ entries: [entry("x"), entry("y")], standings: [standing("y", 1, 0, 0), standing("x", 2, 0, 0)] });
  assert.deepEqual(seasonTable(level).map((row) => row.team.id), ["y", "x"], "two rows level on everything keep the server's order");
});

test("a bye counts in the games and in no result; a friendly, a pairing without points and an empty side count nowhere", () => {
  const draft = round(3, "draft");
  const data = season({
    entries: [entry("a"), entry("b")],
    standings: [standing("a", 1, 3, 7), standing("b", 2, 1, 0)],
    rounds: [
      [R1, pairing(R1, "a", "b", { touchdowns: [2, 0], casualties: [1, 0], points: [4, 0] })],
      [R2,
        pairing(R2, "a", null, { touchdowns: [2, 0], casualties: [1, 0], points: [3, null] }),
        pairing(R2, null, null, { touchdowns: [1, 0], points: [3, 0], table: 2 }),
        pairing(R2, "b", "a", { touchdowns: [1, 1], status: "awaiting_confirmation", table: 3 })],
      [draft, pairing(draft, "a", "b", { touchdowns: [5, 0], casualties: [4, 0], points: [5, 0] })],
    ],
  });
  const [a, b] = seasonTable(data);
  assert.equal(a.games, 3, "the server's games, the bye among them");
  assert.equal(a.wins + a.draws + a.losses, 1);
  assert.deepEqual([a.touchdowns, a.conceded, a.casualties, a.suffered], [2, 0, 1, 0], "the bye's touchdowns are not among the scored ones shown");
  assert.deepEqual(a.form, ["w"]);
  assert.deepEqual([b.wins, b.draws, b.losses, b.form], [0, 0, 1, ["l"]]);
});

test("the form is the last five results by round, the oldest first", () => {
  const scores = [[1, 0], [0, 1], [1, 1], [2, 0], [0, 2], [3, 1], [1, 1]];
  const rounds = scores.map((touchdowns, index) => {
    const at = round(index + 1, "completed");
    return [at, pairing(at, "a", "b", { touchdowns, casualties: [0, 0], points: [1, 1] })];
  });
  const data = season({ entries: [entry("a"), entry("b")], standings: [standing("a", 1, 7, 9), standing("b", 2, 7, 9)], rounds: [...rounds].reverse() });
  const [a, b] = seasonTable(data);
  assert.deepEqual(a.form, ["d", "w", "l", "w", "d"]);
  assert.deepEqual(b.form, ["d", "l", "w", "l", "d"]);
});

test("a withdrawn entry keeps the server's rank and is marked; the team's row is none of it", () => {
  const data = season({
    entries: [entry("a"), entry("w", { withdrawn: true }), entry("c")],
    standings: [standing("a", 1, 1, 3), standing("w", 2, 1, 0, { withdrawn: true }), standing("c", 3, 0, 0)],
  });
  const rows = seasonTable(data);
  assert.deepEqual(rows.map((row) => [row.rank, row.withdrawn]), [[1, false], [2, true], [3, false]]);
  assert.deepEqual(rows.map((row) => row.zonePlace), [1, null, 2], "the playoff zone counts the entries still in the season: the third is second there");
  assert.equal(teamTableRow(rows, "w"), null);
  assert.equal(teamTableRow(rows, "c"), rows[2]);
  assert.equal(teamTableRow(rows, "nobody"), null);
});

test("the window is the first six without the withdrawn; a team below them takes the last place in it", () => {
  const keys = ["k1", "k2", "k3", "k4", "k5", "k6", "k7", "k8", "k9", "k10"];
  const table = (withdrawnRank = 0) => seasonTable(season({
    entries: keys.map((key, index) => entry(key, { withdrawn: index + 1 === withdrawnRank })),
    standings: keys.map((key, index) => standing(key, index + 1, 1, 10 - index, { withdrawn: index + 1 === withdrawnRank })),
  }));
  const ranks = (rows) => rows.map((row) => row.rank);
  assert.deepEqual(ranks(tableWindow(table(), "k8")), [1, 2, 3, 4, 5, 8]);
  assert.deepEqual(ranks(tableWindow(table(), "k3")), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ranks(tableWindow(table(), "nobody")), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(ranks(tableWindow(table(2), "k3")), [1, 3, 4, 5, 6, 7], "the withdrawn on the 2nd is left out");
  assert.deepEqual(ranks(tableWindow(table(2), "k9")), [1, 3, 4, 5, 6, 9]);
  assert.deepEqual(ranks(tableWindow(table(), "k8", 3)), [1, 2, 8]);
  assert.deepEqual(tableWindow([], "k1"), []);
});

test("the league's rounds: newest first, drafts left out, pairs by table, a bye as one side, the score once confirmed", () => {
  const draft = round(3, "draft");
  const data = season({
    entries: [entry("a"), entry("b"), entry("c"), entry("w", { withdrawn: true })],
    standings: [],
    rounds: [
      [R1,
        pairing(R1, "c", "w", { status: "pending", table: 2 }),
        pairing(R1, "a", "b", { touchdowns: [3, 1], casualties: [2, 0], points: [4, 0], table: 1 })],
      [R2,
        pairing(R2, "c", "a", { touchdowns: [0, 2], status: "awaiting_confirmation", table: 3 }),
        pairing(R2, null, "b", { points: [null, 3], table: 1 }),
        pairing(R2, null, null, { table: 2 })],
      [draft, pairing(draft, "a", "c")],
    ],
  });
  const rounds = leagueRounds(data);
  assert.deepEqual(rounds.map(({ number, status }) => [number, status]), [[2, "started"], [1, "completed"]]);
  const [second, first] = rounds;
  assert.deepEqual(second.pairings.map((item) => [item.table, item.home?.team.id, item.away?.team.id ?? null, item.waiting]),
    [[1, "b", null, "none"], [3, "c", "a", "confirmation"]], "the bye is its one side, at home; the empty pair is left out");
  assert.equal(second.pairings[1].score, null, "a score waiting for its confirmation is no score yet");
  assert.deepEqual(first.pairings.map((item) => [item.table, item.home.team.id, item.away.team.id, item.waiting]),
    [[1, "a", "b", null], [2, "c", "w", "result"]]);
  assert.deepEqual([first.pairings[0].score, first.pairings[0].casualties], [[3, 1], [2, 0]]);
  assert.deepEqual(first.pairings[1].away, { entryId: "ew", user: entry("w").user, team: entry("w").team, withdrawn: true },
    "a withdrawn entry's side is found among the historical entries, and says so");
  assert.equal(first.pairings[0].home.withdrawn, false);
  assert.equal(second.pairings[0].score, null, "a bye has no score");
});

test("the last round over is the highest completed one; none is null", () => {
  assert.equal(lastRoundOver(SEASON), 1);
  const later = season({ rounds: [[round(4, "completed")], [round(2, "completed")], [round(5, "started")]] });
  assert.equal(lastRoundOver(later), 4);
  assert.equal(lastRoundOver(season({ rounds: [[R2]] })), null);
  assert.equal(lastRoundOver(null), null);
});

test("a season nobody has read, or one without standings or rounds, is no row and no round", () => {
  for (const data of [null, undefined, {}, { standings: [] }, { rounds: [] }]) {
    assert.deepEqual(seasonTable(data), []);
    assert.deepEqual(leagueRounds(data), []);
  }
  const bare = seasonTable({ standings: [standing("a", 1, 2, 6)] });
  assert.deepEqual([bare[0].wins, bare[0].draws, bare[0].losses, bare[0].touchdowns, bare[0].conceded, bare[0].form], [0, 0, 0, 0, 0, []],
    "a table without rounds: zeros and no form");
});

test("the states a round is shown and counted in", () => {
  assert.deepEqual(ROUND_STATES, ["started", "completed"]);
  assert.ok(Object.isFrozen(ROUND_STATES));
});

test("the playoff places are the season's setting, a whole number from 1; anything else is no zone", () => {
  const of = (playoffPlaces) => playoffPlacesOf({ season: { id: "s1", name: "Mock Season", playoffPlaces } });
  assert.equal(of(4), 4);
  assert.equal(of(1), 1);
  assert.equal(of(64), 64);
  for (const none of [null, undefined, 0, -2, 2.5, "4", Number.NaN]) assert.equal(of(none), null, String(none));
  assert.equal(playoffPlacesOf(null), null, "a season nobody has read");
  assert.equal(playoffPlacesOf({}), null);
});

test("a technical pairing says its winner and its reason; one before stage 12 is «other»", () => {
  const data = season({
    entries: ["a", "b", "c", "d", "e", "f"].map((key) => entry(key)),
    standings: [],
    rounds: [[R1,
      pairing(R1, "a", "b", { touchdowns: [0, 2], casualties: [0, 0], points: [0, 4], table: 1, technical: "no_team" }),
      pairing(R1, "c", "d", { touchdowns: [2, 0], casualties: [0, 0], points: [2, 0], table: 2, technical: null }),
      pairing(R1, "e", "f", { touchdowns: [2, 1], casualties: [1, 0], points: [3, 0], table: 3 }),
    ], [R2,
      pairing(R2, "a", "c", { touchdowns: [2, 0], casualties: [0, 0], points: [2, 0], table: 1, technical: "other" }),
      pairing(R2, "b", "d", { touchdowns: [0, 2], casualties: [0, 0], points: [0, 2], table: 2, technical: "late" }),
      pairing(R2, "e", "f", { status: "pending", table: 3 }),
      pairing(R2, "f", null, { points: [3, null], table: 4 }),
    ]],
  });
  const [second, first] = leagueRounds(data);
  assert.deepEqual(first.pairings.map((item) => item.technical), [
    { winner: "away", reason: "no_team" },
    { winner: "home", reason: "other" },
    null,
  ], "the winner is the side with the touchdowns, as the server's; a technical result stored before 017 has no reason: «other», 2 points");
  assert.deepEqual(first.pairings[0].score, [0, 2], "the score stands as the server wrote it");
  assert.deepEqual(second.pairings.map((item) => item.technical), [
    { winner: "home", reason: "other" },
    { winner: "away", reason: "other" },
    null,
    null,
  ], "a reason the client does not know is read as «other»; a pairing with no result and a bye are no technical result");
  assert.deepEqual(TECHNICAL_REASONS, ["no_team", "other"], "the reasons a calendar line says: league.technical.* has one for each");
});
