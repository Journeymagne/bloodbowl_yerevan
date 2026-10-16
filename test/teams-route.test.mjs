import test from "node:test";
import assert from "node:assert/strict";
import { Readable } from "node:stream";
import { fileURLToPath } from "node:url";

import { pool } from "../server/db/pool.mjs";
import { loadTeamReference } from "../server/domain/roster.mjs";
import { handleTeamRoutes } from "../server/routes/teams.mjs";
import { handleAdminRoutes } from "../server/routes/admin.mjs";

await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));

const TEAM = "11111111-1111-4111-8111-111111111111";
const NO_SUCH_TEAM = "44444444-4444-4444-8444-444444444444";
const coach = { id: "22222222-2222-4222-8222-222222222222", login: "coach", is_admin: false };
const other = { id: "55555555-5555-4555-8555-555555555555", login: "other", is_admin: false };
const admin = { id: "33333333-3333-4333-8333-333333333333", login: "admin", is_admin: true };

/** A database holding one team; every statement is logged in order. */
function database({ stage = "active", stored = {}, revision = 4, slug = "teams/human", user = coach, owner = coach } = {}) {
  const log = [];
  const row = { id: TEAM, user_id: owner.id, name: "Lions", base_team_slug: slug, logo_data: null,
    roster: { teamSlug: slug, players: [], treasury: 100, ...stored }, revision, stage };
  const query = async (sql, values = []) => {
    const text = sql.trim();
    log.push({ sql: text, values });
    if (text.includes("FROM sessions")) return { rows: [user] };
    if (text.includes("FOR UPDATE")) {
      // The route's own WHERE: this id, and this owner unless the caller is an admin (owner null).
      const [id, ownerId] = values;
      return { rows: id === row.id && (ownerId === null || ownerId === row.user_id) ? [row] : [] };
    }
    if (text.startsWith("UPDATE saved_teams")) return { rows: [{ ...row, roster: JSON.parse(values[4]), revision: revision + 1 }] };
    if (text.includes("in_active_season")) return { rows: [{ ...row, in_active_season: false }] };
    return { rows: [] };
  };
  return { log, query, connect: async () => ({ query, release() { log.push({ sql: "release" }); } }) };
}

async function withDatabase(options, run) {
  const db = database(options);
  const saved = { query: pool.query, connect: pool.connect };
  pool.query = db.query;
  pool.connect = db.connect;
  try { await run(db); } finally { Object.assign(pool, saved); }
}

function request(method, body) {
  const stream = Readable.from([Buffer.from(JSON.stringify(body))]);
  stream.method = method;
  stream.headers = { authorization: "Bearer token" };
  return stream;
}

const response = () => ({ writeHead(status) { this.status = status; }, end(body) { this.payload = JSON.parse(body); } });
const patch = (roster, revision = 4) => request("PATCH", { name: "Lions", baseTeamSlug: "teams/human", revision,
  roster: { teamSlug: "teams/human", players: [], treasury: 100, ...roster } });
const teamUrl = (id = TEAM) => new URL(`http://localhost/api/teams/${id}`);
const adminUrl = new URL(`http://localhost/api/admin/teams/${TEAM}`);
const wrote = (db) => db.log.some((entry) => entry.sql.startsWith("UPDATE saved_teams"));

test("an active team cannot add Starting rerolls: 422, rolled back, nothing written", async () => {
  await withDatabase({ stage: "active", stored: { startingRerolls: 1 } }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ startingRerolls: 2 }), response(), teamUrl()),
      { status: 422, code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" } });
    assert.equal(wrote(db), false);
    assert.ok(db.log.some((entry) => entry.sql === "ROLLBACK"));
    assert.equal(db.log.at(-1).sql, "release");
  });
});

test("a draft team cannot add Team rerolls", async () => {
  await withDatabase({ stage: "draft" }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ teamRerolls: 1 }), response(), teamUrl()),
      { status: 422, code: "STAGE_PURCHASE_LOCKED", params: { key: "teamRerolls", stage: "draft" } });
    assert.equal(wrote(db), false);
  });
});

test("each stage buys its own rerolls, and lowering a locked counter is allowed", async () => {
  for (const [stage, roster] of [["active", { teamRerolls: 1 }], ["draft", { startingRerolls: 3 }], ["active", { startingRerolls: 0 }]]) {
    await withDatabase({ stage, stored: { startingRerolls: 1 } }, async (db) => {
      const answer = response();
      assert.equal(await handleTeamRoutes(patch(roster), answer, teamUrl()), true);
      assert.equal(answer.status, 200, `${stage} ${JSON.stringify(roster)}`);
      assert.equal(wrote(db), true);
      assert.ok(db.log.some((entry) => entry.sql === "COMMIT"));
    });
  }
});

test("a stale revision is a conflict before any stage check, and writes nothing", async () => {
  await withDatabase({ stage: "active", stored: { startingRerolls: 1 }, revision: 5 }, async (db) => {
    const answer = response();
    await handleTeamRoutes(patch({ startingRerolls: 2 }, 4), answer, teamUrl());
    assert.equal(answer.status, 409);
    assert.equal(answer.payload.error.code, "TEAM_SAVED_ELSEWHERE");
    assert.equal(answer.payload.team.id, TEAM);
    assert.equal(wrote(db), false);
  });
});

test("a team that is not there, or not the coach's, is a 404", async () => {
  const cases = [
    ["no such team", { id: NO_SUCH_TEAM }],
    ["another coach's team", { id: TEAM, owner: other }],
  ];
  for (const [label, { id, owner }] of cases) {
    await withDatabase({ owner }, async (db) => {
      const answer = response();
      await handleTeamRoutes(patch({ teamRerolls: 1 }), answer, teamUrl(id));
      assert.equal(answer.status, 404, label);
      assert.equal(answer.payload.error.code, "TEAM_NOT_FOUND", label);
      assert.equal(wrote(db), false, label);
      assert.equal(db.log.at(-1).sql, "release", label);
    });
  }
});

test("the admin route is not held to the stage", async () => {
  await withDatabase({ stage: "active", stored: { startingRerolls: 1 }, user: admin }, async (db) => {
    const answer = response();
    await handleAdminRoutes(patch({ startingRerolls: 2 }), answer, adminUrl);
    assert.equal(answer.status, 200);
    assert.equal(wrote(db), true);
  });
});

test("creating a team leaves the stage to the database default", async () => {
  await withDatabase({}, async (db) => {
    await handleTeamRoutes(request("POST", { name: "New", baseTeamSlug: "teams/human",
      roster: { teamSlug: "teams/human", players: [], startingRerolls: 3 } }), response(), new URL("http://localhost/api/teams"));
    const insert = db.log.find((entry) => entry.sql.startsWith("INSERT INTO saved_teams"));
    assert.ok(insert);
    assert.doesNotMatch(insert.sql, /stage/);
  });
});
