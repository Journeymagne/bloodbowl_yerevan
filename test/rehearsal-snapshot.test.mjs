import test from "node:test";
import assert from "node:assert/strict";

import { compareSnapshots, renderReport } from "../scripts/rehearsal/snapshot.mjs";

function snapshot(overrides = {}) {
  return {
    takenAt: "2026-11-01T10:00:00.000Z",
    migrations: ["001_baseline.sql", "008_withdraw_season_entries.sql"],
    tables: { users: 12, saved_teams: 20, season_pairings: 70 },
    teams: { t1: { name: "Ashgrove Wardens", revision: 14, roster: "aaa" }, t2: { name: "Silverbrook Rangers", revision: 3, roster: "bbb" } },
    season: { pairings: "p-hash", entries: "e-hash" },
    open: { preparing: [], startedWithoutPost: [], awaitingConfirmation: [], pendingChallenges: 0 },
    stages: null,
    preferencesSet: null,
    fallen: null,
    ...overrides,
  };
}

test("an untouched database compares clean", () => {
  assert.deepEqual(compareSnapshots(snapshot(), snapshot()).problems, []);
});

test("new tables and migrations are notes, not problems", () => {
  const after = snapshot({ migrations: [...snapshot().migrations, "009_team_stage.sql"], tables: { ...snapshot().tables, team_ledger: 0 } });
  const result = compareSnapshots(snapshot(), after);
  assert.deepEqual(result.problems, []);
  assert.ok(result.notes.some((note) => note.includes("009_team_stage.sql")));
  assert.ok(result.notes.some((note) => note.includes("team_ledger")));
});

test("a changed roster, revision, row count or season result is a problem", () => {
  const teams = { ...snapshot().teams, t1: { ...snapshot().teams.t1, roster: "zzz" }, t2: { ...snapshot().teams.t2, revision: 4 } };
  const after = snapshot({ teams, tables: { ...snapshot().tables, users: 11 }, season: { pairings: "other", entries: "e-hash" } });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("Ashgrove Wardens") && problem.includes("roster")));
  assert.ok(problems.some((problem) => problem.includes("Silverbrook Rangers") && problem.includes("revision")));
  assert.ok(problems.some((problem) => problem.includes("users") && problem.includes("12") && problem.includes("11")));
  assert.ok(problems.some((problem) => problem.includes("season_pairings")));
});

test("a missing team or table is a problem", () => {
  const { t2, ...teams } = snapshot().teams;
  const { saved_teams, ...tables } = snapshot().tables;
  const { problems } = compareSnapshots(snapshot(), snapshot({ teams, tables }));
  assert.ok(problems.some((problem) => problem.includes("Silverbrook Rangers")));
  assert.ok(problems.some((problem) => problem.includes("saved_teams")));
});

test("a stage outside draft and active, or preferences already set, is a problem", () => {
  const after = snapshot({
    stages: [{ id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: true }, { id: "t2", name: "Silverbrook Rangers", stage: "retired", entered: false, playedMatch: false }],
    preferencesSet: 2,
  });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("retired")));
  assert.ok(problems.some((problem) => problem.includes("preferences")));
});

test("the report lists stages with reasons, fallen players and open states", () => {
  const after = snapshot({
    stages: [{ id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: false }, { id: "t2", name: "Silverbrook Rangers", stage: "draft", entered: false, playedMatch: false }],
    fallen: { t1: 2 },
    open: { preparing: [{ id: "p1", matchKind: "league" }], startedWithoutPost: [], awaitingConfirmation: [{ id: "p2", matchKind: "friendly" }], pendingChallenges: 1 },
  });
  const report = renderReport(snapshot(), after, compareSnapshots(snapshot(), after));
  assert.match(report, /Ashgrove Wardens.*active.*entered/);
  assert.match(report, /Silverbrook Rangers.*draft/);
  assert.match(report, /Ashgrove Wardens.*2/);
  assert.match(report, /p2/);
  assert.match(report, /\*\*OK\*\*/);
});
