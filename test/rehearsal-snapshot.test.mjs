import test from "node:test";
import assert from "node:assert/strict";

import { addedMigrations, columnHashSql, compareSnapshots, exitCodeFor, renderReport, takeSnapshot, verdict } from "../scripts/rehearsal/snapshot.mjs";
import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

// One hash per column; the real ones are md5s of the whole column (see columnHashSql).
function columns(overrides = {}) {
  return {
    users: { id: "h-id", login: "h-login", telegram: "h-telegram" },
    season_pairings: { id: "h-pid", home_points: "h-home", away_points: "h-away" },
    ...overrides,
  };
}

function snapshot(overrides = {}) {
  return {
    takenAt: "2026-11-01T10:00:00.000Z",
    migrations: ["001_baseline.sql", "008_withdraw_season_entries.sql"],
    tables: { users: 12, saved_teams: 20, season_pairings: 70, schema_migrations: 2, sessions: 3 },
    columns: columns(),
    teams: { t1: { name: "Ashgrove Wardens", revision: 14, roster: "aaa" }, t2: { name: "Silverbrook Rangers", revision: 3, roster: "bbb" } },
    season: { pairings: "p-hash", entries: "e-hash" },
    open: { preparing: [], startedWithoutPost: [], awaitingConfirmation: [], pendingChallenges: 0 },
    stages: null,
    preferencesSet: null,
    fallen: null,
    fallenCheck: null,
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

test("a clean migration is OK: the migration log and sessions are not data, and stages follow the rule", () => {
  const laterMigrations = ["009_team_stage.sql", "010_fallen_players.sql", "011_preferences.sql", "012_stage_backfill.sql", "013_team_ledger.sql", "014_season_rounds.sql", "015_pairing_stage.sql"];
  const after = snapshot({
    migrations: [...snapshot().migrations, ...laterMigrations],
    tables: { ...snapshot().tables, schema_migrations: 9, team_ledger: 0 },
    stages: [
      { id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: false },
      { id: "t2", name: "Silverbrook Rangers", stage: "draft", entered: false, playedMatch: false },
    ],
    preferencesSet: 0,
    fallen: {},
  });
  assert.deepEqual(compareSnapshots(snapshot(), after).problems, []);
});

test("sessions growing between the snapshots is a note, not a problem", () => {
  const result = compareSnapshots(snapshot(), snapshot({ tables: { ...snapshot().tables, sessions: 5 } }));
  assert.deepEqual(result.problems, []);
  assert.ok(result.notes.some((note) => note.includes("sessions") && note.includes("logins between snapshots")));
});

test("a migration applied before and missing after is a problem", () => {
  const { problems } = compareSnapshots(snapshot(), snapshot({ migrations: ["001_baseline.sql"] }));
  assert.ok(problems.some((problem) => problem.includes("008_withdraw_season_entries.sql") && problem.includes("gone")));
});

test("a stored stage that disagrees with the rule is a problem, whichever way it is wrong", () => {
  const after = snapshot({
    stages: [
      { id: "t1", name: "Ashgrove Wardens", stage: "draft", entered: true, playedMatch: false },
      { id: "t2", name: "Silverbrook Rangers", stage: "active", entered: false, playedMatch: false },
    ],
  });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("Ashgrove Wardens") && problem.includes("expected active")));
  assert.ok(problems.some((problem) => problem.includes("Silverbrook Rangers") && problem.includes("expected draft")));
});

test("open states changing between the snapshots is a problem", () => {
  const after = snapshot({ open: { preparing: [{ id: "p1", matchKind: "league" }], startedWithoutPost: [], awaitingConfirmation: [], pendingChallenges: 0 } });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.some((problem) => problem.includes("open states changed")));
});

test("a comparison with no new migrations says so in a note", () => {
  const { problems, notes } = compareSnapshots(snapshot(), snapshot());
  assert.deepEqual(problems, []);
  assert.ok(notes.some((note) => note.includes("no migrations were applied between the snapshots")));
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
  // A migration does not touch open states, so both snapshots carry the same ones.
  const open = { preparing: [{ id: "p1", matchKind: "league" }], startedWithoutPost: [], awaitingConfirmation: [{ id: "p2", matchKind: "friendly" }], pendingChallenges: 1 };
  const after = snapshot({
    stages: [{ id: "t1", name: "Ashgrove Wardens", stage: "active", entered: true, playedMatch: false }, { id: "t2", name: "Silverbrook Rangers", stage: "draft", entered: false, playedMatch: false }],
    fallen: { t1: 2 },
    open,
  });
  const before = snapshot({ open });
  after.migrations = [...after.migrations, "009_team_stage.sql"];
  const report = renderReport(before, after, compareSnapshots(before, after));
  assert.match(report, /Ashgrove Wardens.*active.*entered/);
  assert.match(report, /Silverbrook Rangers.*draft/);
  assert.match(report, /Ashgrove Wardens.*2/);
  assert.match(report, /p2/);
  assert.match(report, /\*\*OK\*\*/);
});

test("a new column on an existing table is a note, not a problem", () => {
  const after = snapshot({ columns: columns({ users: { ...columns().users, rehearsal_probe: "h-probe" } }) });
  const { problems, notes } = compareSnapshots(snapshot(), after);
  assert.deepEqual(problems, []);
  assert.ok(notes.includes("new columns in users: rehearsal_probe"), notes.join("\n"));
});

test("several new columns, and a new table's columns, are one note per table", () => {
  const after = snapshot({
    columns: columns({ users: { ...columns().users, preferences: "h-p", stage: "h-s" }, team_ledger: { id: "h-l", amount: "h-a" } }),
  });
  const { problems, notes } = compareSnapshots(snapshot(), after);
  assert.deepEqual(problems, []);
  assert.ok(notes.includes("new columns in users: preferences, stage"));
  assert.ok(notes.includes("new columns in team_ledger: id, amount"));
});

test("a changed value in an existing column is a problem naming the column", () => {
  const after = snapshot({ columns: columns({ users: { ...columns().users, login: "h-other" } }) });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.deepEqual(problems, ["column users.login changed"]);
});

test("a NULL moving between two adjacent columns is a problem for both: 3/null becomes null/3", () => {
  // home_points 3, away_points NULL  ->  home_points NULL, away_points 3: every other column and the
  // row count are the same, and the two columns' hashes trade places.
  const after = snapshot({ columns: columns({ season_pairings: { ...columns().season_pairings, home_points: "h-away", away_points: "h-home" } }) });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.deepEqual(problems, ["column season_pairings.home_points changed", "column season_pairings.away_points changed"]);
});

test("a dropped column, or every column of a dropped table, is a problem", () => {
  const { login, ...users } = columns().users;
  const dropped = compareSnapshots(snapshot(), snapshot({ columns: columns({ users }) }));
  assert.deepEqual(dropped.problems, ["column users.login is gone"]);
  const { season_pairings, ...rest } = columns();
  const table = compareSnapshots(snapshot(), snapshot({ columns: rest }));
  assert.deepEqual(table.problems, ["column season_pairings.id is gone", "column season_pairings.home_points is gone", "column season_pairings.away_points is gone"]);
});

test("a snapshot without column hashes cannot be called OK", () => {
  const { columns: missing, ...old } = snapshot();
  for (const [before, after] of [[old, snapshot()], [snapshot(), old], [old, old]]) {
    const { problems } = compareSnapshots(before, after);
    assert.ok(problems.some((problem) => problem.includes("column hashes")), problems.join("\n"));
  }
});

test("the column hash query quotes names, tags SQL NULL apart from a JSON null, and orders by the key", () => {
  const sql = columnHashSql('we"ird', "col", ["id", "side"]);
  assert.match(sql, /FROM "we""ird" t$/);
  assert.match(sql, /to_jsonb\(t\."col"\)::text/);
  assert.match(sql, /coalesce\(to_jsonb\(t\."col"\)::text, 'NULL'\)/);
  assert.match(sql, /ORDER BY t\."id", t\."side"\)/);
});

test("a table without a primary key is ordered by the column's own value", () => {
  assert.match(columnHashSql("log", "note", []), /ORDER BY to_jsonb\(t\."note"\)::text\)/);
});

// A client that answers the snapshot's queries from a small fixed database.
function fakeDatabase({ failOn } = {}) {
  const statements = [];
  return {
    statements,
    async query(sql, params = []) {
      statements.push(sql.trim().replace(/\s+/g, " "));
      if (failOn && sql.includes(failOn)) throw new Error("boom");
      if (/^(BEGIN|COMMIT|ROLLBACK)/.test(sql.trim())) return { rows: [] };
      if (sql.includes("information_schema.tables")) return { rows: [{ table_name: "schema_migrations" }, { table_name: "sessions" }, { table_name: "users" }] };
      if (sql.includes("table_name, column_name")) {
        return { rows: ["id", "login"].map((column) => ({ table_name: "users", column_name: column })).concat({ table_name: "sessions", column_name: "token_hash" }) };
      }
      if (sql.includes("PRIMARY KEY")) return { rows: [{ column_name: "id" }] };
      if (sql.includes("md5(coalesce(string_agg(coalesce(to_jsonb")) return { rows: [{ h: `hash of ${sql.match(/t\.("\w+")\)::text, 'NULL'/)[1]}` }] };
      if (sql.includes("to_regclass")) return { rows: [{ ok: false }] };
      if (sql.includes("count(*)")) return { rows: [{ n: 4 }] };
      if (sql.includes("FROM schema_migrations")) return { rows: [{ name: "001_baseline.sql" }] };
      if (sql.includes("information_schema.columns")) return { rows: [] };
      if (sql.includes("result_type = 'technical'") || sql.includes("SELECT id, name, roster FROM saved_teams")) return { rows: [] };
      return { rows: [{ hash: "x" }] };
    },
  };
}

test("the snapshot is one read-only repeatable-read transaction, with a hash for every column of every table but sessions and the migration log", async () => {
  const client = fakeDatabase();
  const taken = await takeSnapshot(client);
  assert.equal(client.statements[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.equal(client.statements.at(-1), "COMMIT");
  assert.deepEqual(taken.columns, { users: { id: 'hash of "id"', login: 'hash of "login"' } });
  assert.deepEqual([taken.technical, taken.overRerolls], [[], []]);
  assert.deepEqual(Object.keys(taken.tables), ["schema_migrations", "sessions", "users"]);
  assert.equal(taken.fallenCheck, null); // no team_fallen_players yet, so nothing to check
});

test("a failure inside the snapshot rolls the transaction back and is reported", async () => {
  const client = fakeDatabase({ failOn: "md5(coalesce(string_agg(coalesce(to_jsonb" });
  await assert.rejects(() => takeSnapshot(client), /boom/);
  assert.equal(client.statements.at(-1), "ROLLBACK");
  assert.ok(!client.statements.includes("COMMIT"));
});

function migrated(overrides = {}) {
  return snapshot({ migrations: [...snapshot().migrations, "009_team_stage.sql", "010_team_ledger.sql", "011_fallen_players.sql"], ...overrides });
}

test("the migrations added between the snapshots are the names only the second one has", () => {
  assert.deepEqual(addedMigrations(snapshot(), migrated()), ["009_team_stage.sql", "010_team_ledger.sql", "011_fallen_players.sql"]);
  assert.deepEqual(addedMigrations(snapshot(), snapshot()), []);
});

test("OK needs a migration: without one the headline and the console say nothing was tested", () => {
  const same = snapshot();
  const comparison = compareSnapshots(same, snapshot());
  assert.deepEqual(comparison.problems, []);
  assert.match(renderReport(same, snapshot(), comparison), /\*\*OK, but no migrations were applied\*\* — nothing was tested/);
  assert.doesNotMatch(renderReport(same, snapshot(), comparison), /no existing data changed/);
  assert.deepEqual(verdict(same, snapshot(), comparison), { strong: "OK, but no migrations were applied", rest: " — nothing was tested" });
});

test("with a migration and no problems it is the plain OK, and problems always lead", () => {
  const after = migrated();
  assert.match(renderReport(snapshot(), after, compareSnapshots(snapshot(), after)), /\*\*OK\*\* — no existing data changed/);
  assert.deepEqual(verdict(snapshot(), after, compareSnapshots(snapshot(), after)), { strong: "OK", rest: " — no existing data changed" });
  const broken = snapshot({ tables: { ...snapshot().tables, users: 11 } });
  const withProblem = compareSnapshots(snapshot(), broken);
  assert.deepEqual(verdict(snapshot(), broken, withProblem), { strong: "1 problem(s)", rest: "" });
  assert.match(renderReport(snapshot(), broken, withProblem), /\*\*1 problem\(s\)\*\*/);
});

test("the report says how long the migrations took, or that they did not go through rehearsal:migrate", () => {
  const after = migrated();
  const comparison = compareSnapshots(snapshot(), after);
  const log = { at: "2026-11-01T10:05:00.000Z", applied: ["009_team_stage.sql", "010_fallen_players.sql"], ms: 1234 };
  assert.match(renderReport(snapshot(), after, comparison, log), /^Migrations: 2 applied in 1234 ms \(009_team_stage\.sql, 010_fallen_players\.sql\)$/m);
  assert.match(renderReport(snapshot(), after, comparison, { ...log, applied: [] }), /^Migrations: 0 applied in 1234 ms$/m);
  assert.match(renderReport(snapshot(), after, comparison, null), /^Migrations: not run through rehearsal:migrate$/m);
  assert.match(renderReport(snapshot(), after, comparison), /^Migrations: not run through rehearsal:migrate$/m);
});

test("a new journal, dice or match-events table must start empty; one that existed before is compared as usual", () => {
  const after = migrated({ tables: { ...snapshot().tables, team_ledger: 3, dice_rolls: 0 } });
  const { problems } = compareSnapshots(snapshot(), after);
  assert.ok(problems.includes("new table team_ledger has 3 rows; it must start empty"));
  assert.ok(!problems.some((problem) => problem.includes("dice_rolls")));
  const before = snapshot({ tables: { ...snapshot().tables, team_ledger: 2 } });
  assert.deepEqual(compareSnapshots(before, migrated({ tables: { ...before.tables } })).problems, []);
});

test("once 015 has run, the fallen it carried over must be what the rule finds", () => {
  const after = migrated({ migrations: [...migrated().migrations, "015_backfill_fallen_players.sql"],
    fallenCheck: { t1: { carried: 1, expected: 2 }, t2: { carried: 1, expected: 1 } } });
  assert.deepEqual(compareSnapshots(snapshot(), after).problems, ["team Ashgrove Wardens: 1 fallen carried over, the rule expects 2"]);
  // 011 applied, 015 not yet: nothing has been carried over, so there is nothing to compare.
  assert.deepEqual(compareSnapshots(snapshot(), migrated({ fallenCheck: { t1: { carried: 0, expected: 2 } } })).problems, []);
  // 015 was already in "before": it did not run between these snapshots, so what it carried over is not what is under test.
  const ran = migrated({ migrations: [...migrated().migrations, "015_backfill_fallen_players.sql"] });
  const later = { ...ran, migrations: [...ran.migrations, "016_later.sql"], fallenCheck: { t1: { carried: 1, expected: 2 } } };
  assert.deepEqual(compareSnapshots(ran, later).problems, []);
});

test("exit codes: 1 with problems, 2 with nothing migrated, 0 for a real OK", () => {
  assert.equal(exitCodeFor(snapshot(), migrated(), compareSnapshots(snapshot(), migrated())), 0);
  assert.equal(exitCodeFor(snapshot(), snapshot(), compareSnapshots(snapshot(), snapshot())), 2);
  const broken = snapshot({ tables: { ...snapshot().tables, users: 11 } });
  assert.equal(exitCodeFor(snapshot(), broken, compareSnapshots(snapshot(), broken)), 1);
});

test("the report says when the time adds up several migrate runs", () => {
  const after = migrated();
  const run = { at: "2026-11-01T10:05:00.000Z", applied: ["009_team_stage.sql", "010_team_ledger.sql"], ms: 900 };
  const record = { ...run, runs: [run, { at: "2026-11-01T10:06:00.000Z", applied: [], ms: 5 }] };
  assert.match(renderReport(snapshot(), after, compareSnapshots(snapshot(), after), record),
    /^Migrations: 2 applied in 900 ms over 2 runs \(009_team_stage\.sql, 010_team_ledger\.sql\)$/m);
});

// Stage 12, decision 4 and 27: the report lists the technical results (until 017 none carried a reason, and one without reads as
// "other", 2 points — the owner names the ones where the opponent could not field a team) and the rosters over eight Starting and
// Team Re-rolls together (every write refuses them until they are put right). Both are for a person to read before the window.
test("the report lists the technical results and the rosters over eight re-rolls, and they decide nothing", () => {
  const technical = [
    { id: "p9", season: "Season 1", round: 3, home: "Ashgrove Wardens", away: "Silverbrook Rangers", score: "2–0", points: "2–0", reason: null },
    { id: "p12", season: "Season 1", round: 5, home: "Silverbrook Rangers", away: "Ashgrove Wardens", score: "0–2", points: "0–4", reason: "no_team" },
    { id: "f3", season: null, round: null, home: "Ashgrove Wardens", away: "Silverbrook Rangers", score: "2–0", points: null, reason: "other" },
  ];
  const overRerolls = [{ id: "t2", name: "Silverbrook Rangers", count: 9 }];
  const plain = migrated({ technical: [], overRerolls: [] });
  const listed = migrated({ technical, overRerolls });
  const report = renderReport(snapshot(), listed, compareSnapshots(snapshot(), listed));
  assert.match(report, /^## Technical results\n\n- Season 1, round 3: Ashgrove Wardens — Silverbrook Rangers, 2–0, points 2–0, reason: none — read as other \(p9\)\n- Season 1, round 5: Silverbrook Rangers — Ashgrove Wardens, 0–2, points 0–4, reason: no_team \(p12\)\n- friendly: Ashgrove Wardens — Silverbrook Rangers, 2–0, no points, reason: other \(f3\)\n$/m);
  assert.match(report, /^## Rosters over 8 re-rolls\n\n- Silverbrook Rangers \(t2\): 9\n$/m);
  const none = renderReport(snapshot(), plain, compareSnapshots(snapshot(), plain));
  assert.match(none, /^## Technical results\n\n- none\n$/m);
  assert.match(none, /^## Rosters over 8 re-rolls\n\n- none\n$/m);
  // They decide nothing: the problems, the headline and the exit code are the ones without them.
  assert.deepEqual(compareSnapshots(snapshot(), listed), compareSnapshots(snapshot(), plain));
  assert.deepEqual(verdict(snapshot(), listed, compareSnapshots(snapshot(), listed)), { strong: "OK", rest: " — no existing data changed" });
  assert.equal(exitCodeFor(snapshot(), listed, compareSnapshots(snapshot(), listed)), 0);
  const broken = { ...listed, tables: { ...listed.tables, users: 11 } };
  assert.equal(exitCodeFor(snapshot(), broken, compareSnapshots(snapshot(), broken)), 1);
  // Before them, a "before" taken without the lists is compared as usual.
  assert.deepEqual(compareSnapshots(plain, listed).problems, []);
});

test("what rehearsal:transitions seeded is marked in both lists, and a snapshot taken without them says so", () => {
  const listed = migrated({
    technical: [{ id: "p9", season: "Season 1", round: 3, home: "Seed Live Home", away: "Seed Live Away", score: "2–0", points: "2–0", reason: null }],
    overRerolls: [{ id: "t9", name: "Seed Live Home", count: 10 }],
  });
  const seed = { pairingIds: ["p9"], challengeIds: [], teamIds: ["t9"] };
  const report = renderReport(snapshot(), listed, compareSnapshots(snapshot(), listed), null, seed);
  assert.match(report, /^- Season 1, round 3: .* \(p9\) — seeded by rehearsal:transitions$/m);
  assert.match(report, /^- Seed Live Home \(t9\): 10 — seeded by rehearsal:transitions$/m);
  const old = renderReport(snapshot(), migrated(), compareSnapshots(snapshot(), migrated()));
  assert.match(old, /^## Technical results\n\n- \(not in this snapshot\)\n$/m);
  assert.match(old, /^## Rosters over 8 re-rolls\n\n- \(not in this snapshot\)\n$/m);
});

test("the snapshot reads the technical results with their reason when the column is there, and the rosters over eight as the server reads them", async () => {
  const client = fakeDatabase();
  const query = client.query;
  const rows = {
    technical: [{ id: "p9", season: "Season 1", round: 3, home: "A", away: "B", home_touchdowns: 2, away_touchdowns: 0, home_points: 2, away_points: 0, reason: null },
      { id: "p10", season: null, round: null, home: "B", away: "A", home_touchdowns: null, away_touchdowns: null, home_points: null, away_points: null, reason: null }],
    rosters: [{ id: "t1", name: "A", roster: { startingRerolls: 5, teamRerolls: 4 } }, { id: "t2", name: "B", roster: { rerolls: 6, teamRerolls: "3" } },
      { id: "t3", name: "C", roster: { startingRerolls: 4, teamRerolls: 4 } }, { id: "t4", name: "D", roster: { rerolls: 9, startingRerolls: 0 } },
      { id: "t5", name: "E", roster: {} }],
  };
  client.query = async (sql, params) => {
    const answer = await query(sql, params);
    if (sql.includes("result_type = 'technical'")) return { rows: rows.technical };
    if (sql.includes("SELECT id, name, roster FROM saved_teams")) return { rows: rows.rosters };
    return answer;
  };
  const taken = await takeSnapshot(client);
  assert.deepEqual(taken.technical, [
    { id: "p9", season: "Season 1", round: 3, home: "A", away: "B", score: "2–0", points: "2–0", reason: null },
    { id: "p10", season: null, round: null, home: "B", away: "A", score: null, points: null, reason: null },
  ]);
  // `rerolls` is the first builder's Starting Re-rolls, read only when `startingRerolls` is not there (normalizeDraft).
  assert.deepEqual(taken.overRerolls, [{ id: "t1", name: "A", count: 9 }, { id: "t2", name: "B", count: 9 }]);
  const technicalSql = client.statements.find((sql) => sql.includes("result_type = 'technical'"));
  assert.match(technicalSql, /NULL::text AS reason/, "no technical_reason column (the fake has none): no reason");
  assert.equal(client.statements.at(-1), "COMMIT");
});

const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** A schema-008 season: three coaches, a played pairing, a technical one, a technical friendly; teams with 2.x and 3.0 re-rolls. */
async function seedTechnical(client) {
  for (const n of [1, 2, 3]) {
    await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, $2, $2, '@c', 'x')", [uuid(n), `coach-${n}`]);
  }
  const teams = [[11, 1, "Alpha", { startingRerolls: 5, teamRerolls: 4 }], [12, 2, "Beta", { rerolls: 6, teamRerolls: 3 }],
    [13, 3, "Gamma", { startingRerolls: 4, teamRerolls: 4 }], [14, 1, "Delta", { rerolls: 2 }]];
  for (const [n, user, name, roster] of teams) {
    await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug, roster) VALUES ($1, $2, $3, 'teams/human', $4)",
      [uuid(n), uuid(user), name, JSON.stringify({ treasury: 10, players: [], ...roster })]);
  }
  await client.query("INSERT INTO seasons (id, name) VALUES ($1, 'Season 1')", [uuid(21)]);
  for (const [n, user, team] of [[31, 1, 11], [32, 2, 12], [33, 3, 13]]) {
    await client.query("INSERT INTO season_entries (id, season_id, user_id, saved_team_id) VALUES ($1, $2, $3, $4)", [uuid(n), uuid(21), uuid(user), uuid(team)]);
  }
  await client.query("INSERT INTO season_rounds (id, season_id, round_number, status) VALUES ($1, $2, 1, 'completed'), ($3, $2, 2, 'started')",
    [uuid(41), uuid(21), uuid(42)]);
  const pairing = "INSERT INTO season_pairings (id, round_id, table_number, home_entry_id, away_entry_id, home_touchdowns, away_touchdowns, home_casualties, away_casualties, result_type, home_points, away_points, result_status) VALUES ($1, $2, $3, $4, $5, $6, $7, 0, 0, $8, $9, $10, 'confirmed')";
  await client.query(pairing, [uuid(51), uuid(41), 1, uuid(31), uuid(32), 1, 1, "played", 1, 1]);
  await client.query(pairing, [uuid(52), uuid(42), 1, uuid(33), uuid(31), 0, 2, "technical", 0, 2]);
  await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id, friendly_home_team_id,
    friendly_away_team_id, home_touchdowns, away_touchdowns, result_type, result_status) VALUES ($1, 'friendly', 1, $2, $3, $4, $5, 2, 0, 'technical', 'confirmed')`,
  [uuid(53), uuid(2), uuid(3), uuid(12), uuid(13)]);
}

test("on a schema-008 database the snapshot lists its technical results, without a reason, and the rosters over eight, a 2.x one among them", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await seedTechnical(client);
    const taken = await takeSnapshot(client);
    assert.deepEqual(taken.technical, [
      { id: uuid(52), season: "Season 1", round: 2, home: "Gamma", away: "Alpha", score: "0–2", points: "0–2", reason: null },
      { id: uuid(53), season: null, round: null, home: "Beta", away: "Gamma", score: "2–0", points: null, reason: null },
    ]);
    assert.deepEqual(taken.overRerolls, [{ id: uuid(11), name: "Alpha", count: 9 }, { id: uuid(12), name: "Beta", count: 9 }]);
    // 017 (stage 12) adds the column; here by hand, so the read is tested on both sides of it.
    await client.query("ALTER TABLE season_pairings ADD COLUMN technical_reason TEXT");
    await client.query("UPDATE season_pairings SET technical_reason = 'no_team' WHERE id = $1", [uuid(52)]);
    assert.deepEqual((await takeSnapshot(client)).technical.map((row) => row.reason), ["no_team", null]);
  }, { through: "008_withdraw_season_entries.sql" });
});
