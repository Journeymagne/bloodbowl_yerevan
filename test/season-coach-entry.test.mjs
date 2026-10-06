import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";
import { createSeasonCoachWithTeam } from "../server/season/coach-entry.mjs";
import { verifyPassword } from "../server/auth/session.mjs";
import { pool } from "../server/db/pool.mjs";
import { handleSeasonRoutes } from "../server/routes/season.mjs";
import { loadTeamReference } from "../server/domain/roster.mjs";
import { generateSwissRound } from "../server/season/rounds.mjs";
import { computeSeasonStandings } from "../server/season/scoring.mjs";

const data = {
  login: " Late Coach ", password: "season-pass", telegram: " @late ",
  name: "Late Team", baseTeamSlug: "teams/amazon", logoData: null,
  roster: { teamSlug: "teams/amazon", players: [], treasury: 600 },
};

function databaseFixture({ failAt = "", error = new Error("storage failed") } = {}) {
  const writes = [];
  let released = false;
  let committed = false;
  let rows = { users: [], teams: [], entries: [] };
  const client = {
    async query(sql, values) {
      writes.push({ sql, values });
      if (sql === "ROLLBACK") rows = { users: [], teams: [], entries: [] };
      if (sql === "COMMIT") committed = true;
      if (failAt && sql.includes(failAt)) throw error;
      if (sql.includes("INSERT INTO users")) {
        rows.users.push({ id: "new-coach", login: values[0], login_key: values[1], telegram: values[2], password_hash: values[3] });
        return { rows: rows.users };
      }
      if (sql.includes("INSERT INTO saved_teams")) {
        rows.teams.push({ id: "new-team", user_id: values[0], name: values[1], roster: JSON.parse(values[4]) });
        return { rows: rows.teams };
      }
      if (sql.includes("INSERT INTO season_entries")) {
        rows.entries.push({ id: "new-entry", season_id: values[0], user_id: values[1], saved_team_id: values[2] });
        return { rows: rows.entries };
      }
      return { rows: [] };
    },
    release() { released = true; },
  };
  return { connect: async () => client, writes, get rows() { return rows; },
    get released() { return released; }, get committed() { return committed; } };
}

test("creating a coach commits their account, team and season entry together", async () => {
  const db = databaseFixture();
  const entry = await createSeasonCoachWithTeam("ongoing-season", data, db);
  assert.equal(db.committed, true);
  assert.equal(db.released, true);
  assert.equal(db.rows.users[0].login, "Late Coach");
  assert.equal(db.rows.users[0].login_key, "late coach");
  assert.equal(db.rows.users[0].telegram, "@late");
  assert.equal(verifyPassword(data.password, db.rows.users[0].password_hash), true);
  assert.equal(db.rows.teams[0].user_id, db.rows.users[0].id);
  assert.equal(entry.saved_team_id, db.rows.teams[0].id);
  assert.equal(entry.season_id, "ongoing-season");
  assert.equal(db.writes.some(({ sql }) => /sessions|season_rounds|season_pairings|is_admin/.test(sql)), false);
});

for (const failAt of ["INSERT INTO saved_teams", "INSERT INTO season_entries", "COMMIT"]) {
  test(`failure at ${failAt} leaves no partial coach or team`, async () => {
    const db = databaseFixture({ failAt });
    await assert.rejects(createSeasonCoachWithTeam("ongoing-season", data, db), /storage failed/);
    assert.deepEqual(db.rows, { users: [], teams: [], entries: [] });
    assert.equal(db.writes.at(-1).sql, "ROLLBACK");
    assert.equal(db.released, true);
  });
}

test("a duplicate coach login gives a translated conflict and rolls back", async () => {
  const db = databaseFixture({ failAt: "INSERT INTO users", error: Object.assign(new Error("duplicate"), { code: "23505" }) });
  await assert.rejects(createSeasonCoachWithTeam("ongoing-season", data, db), { status: 409, code: "LOGIN_ALREADY_REGISTERED" });
  assert.equal(db.committed, false);
  assert.deepEqual(db.rows, { users: [], teams: [], entries: [] });
  assert.equal(db.released, true);
});

for (const [fields, code] of [
  [{ login: "  a " }, "LOGIN_TOO_SHORT"],
  [{ password: "abc" }, "PASSWORD_TOO_SHORT"],
  [{ telegram: "   " }, "TELEGRAM_REQUIRED"],
]) {
  test(`invalid account fields are refused before any write: ${code}`, async () => {
    const db = databaseFixture();
    await assert.rejects(createSeasonCoachWithTeam("ongoing-season", { ...data, ...fields }, db), { status: 400, code });
    assert.equal(db.writes.length, 0);
  });
}

test("only admins may create season coaches", async () => {
  const original = pool.query;
  const response = () => ({ writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } });
  const url = new URL("http://localhost/api/season/admin/coaches");
  try {
    const anonymous = response();
    await handleSeasonRoutes({ method: "POST", headers: {} }, anonymous, url);
    assert.equal(anonymous.status, 401);
    pool.query = async () => ({ rows: [{ id: "coach", is_admin: false }] });
    const coach = response();
    await handleSeasonRoutes({ method: "POST", headers: { authorization: "Bearer test" } }, coach, url);
    assert.equal(coach.status, 403);
    assert.equal(coach.payload.error.code, "ADMIN_REQUIRED");
  } finally { pool.query = original; }
});

test("new coach registration validates the team before creating an account", async () => {
  await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));
  const original = pool.query;
  try {
    pool.query = async (sql) => {
      assert.match(sql, /FROM sessions/);
      return { rows: [{ id: "admin", is_admin: true }] };
    };
    const request = Readable.from([Buffer.from(JSON.stringify({ ...data, baseTeamSlug: "teams/missing" }))]);
    request.method = "POST";
    request.headers = { authorization: "Bearer test" };
    await assert.rejects(handleSeasonRoutes(request, {}, new URL("http://localhost/api/season/admin/coaches")),
      (error) => error.status === 422 && error.violations[0].code === "UNKNOWN_TEAM");
  } finally { pool.query = original; }
});

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
