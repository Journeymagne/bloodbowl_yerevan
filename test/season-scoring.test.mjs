import assert from "node:assert/strict";
import test from "node:test";

import { matchPoints, seasonPoints } from "../src/domain/league-rules.mjs";
import { pool } from "../server/db/pool.mjs";
import { generateSwissRound } from "../server/season/rounds.mjs";
import { computeSeasonStandings, scoreLeagueResult } from "../server/season/scoring.mjs";

test("a win is three points, a draw one, a loss none", () => {
  assert.equal(matchPoints({ touchdownsFor: 2, touchdownsAgainst: 1 }), seasonPoints.win);
  assert.equal(matchPoints({ touchdownsFor: 1, touchdownsAgainst: 1 }), seasonPoints.draw);
  assert.equal(matchPoints({ touchdownsFor: 1, touchdownsAgainst: 2 }), seasonPoints.loss);
});

test("the bonuses, one at a time", () => {
  // Three clear, so the margin bonus but no shutout.
  assert.equal(matchPoints({ touchdownsFor: 4, touchdownsAgainst: 1 }), 4);
  // Shutout without the margin.
  assert.equal(matchPoints({ touchdownsFor: 2, touchdownsAgainst: 0 }), 4);
  // Three casualties, in a match that was lost anyway.
  assert.equal(matchPoints({ touchdownsFor: 0, touchdownsAgainst: 3, casualtiesFor: 3 }), 1);
  // Two casualties is below the threshold.
  assert.equal(matchPoints({ touchdownsFor: 1, touchdownsAgainst: 1, casualtiesFor: 2 }), 1);
});

test("the bonuses stack: 4-0 with three casualties is six", () => {
  assert.equal(matchPoints({ touchdownsFor: 4, touchdownsAgainst: 0, casualtiesFor: 3 }), 6);
});

test("a 0-0 is a draw, not a shutout for both sides", () => {
  assert.equal(matchPoints({ touchdownsFor: 0, touchdownsAgainst: 0 }), seasonPoints.draw);
});

test("scoreLeagueResult scores both sides of one match", () => {
  const result = scoreLeagueResult({
    homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 3, awayCasualties: 1,
  });
  assert.equal(result.homePoints, 6, "win, three clear, shutout, three casualties");
  assert.equal(result.awayPoints, 0);
});

test("a match with no result yet scores nothing", () => {
  const pending = scoreLeagueResult({ homeTouchdowns: null, awayTouchdowns: null });
  assert.equal(pending.homePoints, null);
  assert.equal(pending.awayPoints, null);

  const empty = scoreLeagueResult({ hasHome: false, hasAway: false });
  assert.equal(empty.homePoints, null);
  assert.equal(empty.awayPoints, null);
});

/** The row shapes computeSeasonStandings reads, without a database. */
const entry = (id, login, teamName) => ({
  id,
  user_id: `${id}-user`,
  user_login: login,
  user_telegram: `@${login}`,
  user_is_admin: false,
  saved_team_id: `${id}-team`,
  team_name: teamName,
  base_team_slug: "teams/amazon",
  logo_data: null,
  created_at: "2026-08-01T00:00:00.000Z",
});

const pairing = (home, away, values = {}) => ({
  round_status: "completed",
  round_number: 1,
  home_entry_id: home,
  away_entry_id: away,
  home_points: null,
  away_points: null,
  home_touchdowns: null,
  away_touchdowns: null,
  home_casualties: null,
  away_casualties: null,
  ...values,
});

test("the table adds up what was played", () => {
  const entries = [entry("a", "ann", "Amazons"), entry("b", "bob", "Black Orcs")];
  const pairings = [pairing("a", "b", {
    home_points: 4, away_points: 0, home_touchdowns: 3, away_touchdowns: 0, home_casualties: 1, away_casualties: 2,
  })];

  const [first, second] = computeSeasonStandings(entries, pairings);
  assert.equal(first.entryId, "a");
  assert.deepEqual(
    { points: first.points, games: first.games, touchdowns: first.touchdowns, casualties: first.casualties, rank: first.rank },
    { points: 4, games: 1, touchdowns: 3, casualties: 1, rank: 1 },
  );
  assert.equal(second.points, 0);
  assert.equal(second.rank, 2);
  assert.equal(Object.hasOwn(first, "opponents"), false, "standings expose no unused opponent tiebreak data");
});

test("a bye counts as a played game for the coach who sat out", () => {
  const entries = [entry("a", "ann", "Amazons")];
  const [only] = computeSeasonStandings(entries, [pairing("a", null, { home_points: 3 })]);
  assert.equal(only.points, 3);
  assert.equal(only.byes, 1);
  assert.equal(only.games, 1);
});

test("a round that has not started counts for nothing", () => {
  const entries = [entry("a", "ann", "Amazons"), entry("b", "bob", "Black Orcs")];
  const draft = [pairing("a", "b", { round_status: "draft", home_points: 3, away_points: 0 })];
  const [first] = computeSeasonStandings(entries, draft);
  assert.equal(first.points, 0);
  assert.equal(first.games, 0);
});

test("ties break on touchdowns, then casualties, then games", () => {
  const entries = [
    entry("a", "ann", "Amazons"),
    entry("b", "bob", "Black Orcs"),
    entry("c", "cid", "Chaos"),
  ];
  const pairings = [
    // Everybody ends on three points; a scored more, b and c are level on
    // touchdowns and separated by casualties.
    pairing("a", "b", { home_points: 3, away_points: 3, home_touchdowns: 4, away_touchdowns: 2, home_casualties: 0, away_casualties: 3 }),
    pairing("c", null, { home_points: 3, home_touchdowns: 2, home_casualties: 1 }),
  ];

  const table = computeSeasonStandings(entries, pairings);
  assert.deepEqual(table.map((row) => row.entryId), ["a", "b", "c"]);
  assert.deepEqual(table.map((row) => row.rank), [1, 2, 3]);
});

test("two coaches equal on everything keep a stable order", () => {
  const entries = [entry("b", "bob", "Black Orcs"), entry("a", "ann", "Amazons")];
  const table = computeSeasonStandings(entries, []);
  assert.deepEqual(table.map((row) => row.user.login), ["ann", "bob"], "by login, so the table does not shuffle");
});

// Moved from test/season-coach-entry.test.mjs when stage 12 deleted the 2.x season coach route it tested:
// a coach the admin enters mid-season (`POST /api/admin/coaches` with `enter`) is this late entrant.
test("a late entrant starts at zero and appears in the next draw without changing past results", async () => {
  const entry = (id) => ({ id, user_id: `${id}-coach`, user_login: id,
    saved_team_id: `${id}-team`, team_name: `${id} Team`, base_team_slug: "teams/amazon" });
  const entries = [entry("a"), entry("b"), entry("c"), entry("late")];
  const pairings = [{ home_entry_id: "a", away_entry_id: "b", round_number: 1,
    round_status: "completed", result_status: "confirmed", home_points: 3, away_points: 0 },
  { home_entry_id: "c", away_entry_id: null, round_number: 1,
    round_status: "completed", result_status: "confirmed", home_points: 3, away_points: null }];
  const history = structuredClone(pairings);
  const before = computeSeasonStandings(entries.slice(0, 3), pairings);
  const after = computeSeasonStandings(entries, pairings);
  assert.equal(after.find(row => row.entryId === "late").points, 0);
  assert.equal(after.find(row => row.entryId === "late").games, 0);
  for (const standing of before) {
    const current = after.find(row => row.entryId === standing.entryId);
    assert.equal(current.points, standing.points);
    assert.equal(current.games, standing.games);
  }
  const originalQuery = pool.query;
  const originalConnect = pool.connect;
  const nextPairings = [];
  try {
    pool.query = async (sql) => {
      if (sql.includes("FROM season_entries se")) return { rows: entries };
      if (sql.includes("FROM season_pairings")) return { rows: pairings };
      if (sql.includes("FROM season_rounds")) return { rows: [{ round_number: 1, status: "completed" }] };
      assert.fail(`Unexpected query: ${sql}`);
    };
    pool.connect = async () => ({ release() {}, async query(sql, values) {
      if (sql.includes("INSERT INTO season_rounds")) return { rows: [{ id: "round-2", round_number: values[1] }] };
      if (sql.includes("INSERT INTO season_pairings")) nextPairings.push(values.slice(2, 4));
      return { rows: [] };
    } });
    const round = await generateSwissRound({ id: "ongoing-season", current_round: 1 });
    assert.equal(round.round_number, 2);
    assert.deepEqual(new Set(nextPairings.flat()), new Set(entries.map(row => row.id)));
    assert.deepEqual(pairings, history);
  } finally { pool.query = originalQuery; pool.connect = originalConnect; }
});
