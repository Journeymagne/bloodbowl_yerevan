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
function database({ stage = "active", stored = {}, revision = 4, slug = "teams/human", user = coach, owner = coach, failOn = null } = {}) {
  const log = [];
  const row = { id: TEAM, user_id: owner.id, name: "Lions", base_team_slug: slug, logo_data: null,
    roster: { teamSlug: slug, players: [], treasury: 100, ...stored }, revision, stage };
  const query = async (sql, values = []) => {
    const text = sql.trim();
    log.push({ sql: text, values });
    if (failOn && text.startsWith(failOn)) throw new Error(`${failOn} failed`);
    if (text.includes("FROM sessions")) return { rows: [user] };
    if (text.includes("FOR UPDATE")) {
      // The route's own WHERE: this id, and this owner unless the caller is an admin (owner null).
      const [id, ownerId] = values;
      return { rows: id === row.id && (ownerId === null || ownerId === row.user_id) ? [row] : [] };
    }
    if (text.startsWith("UPDATE saved_teams")) return { rows: [{ ...row, roster: JSON.parse(values[4]), revision: revision + 1 }] };
    if (text.startsWith("INSERT INTO saved_teams")) return { rows: [{ id: row.id }] }; // a create answers with the team read back
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
      assert.equal(db.log.some((entry) => entry.sql === "ROLLBACK"), false);
      assert.equal(db.log.at(-1).sql, "release");
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
    assert.ok(db.log.some((entry) => entry.sql === "ROLLBACK"));
    assert.equal(db.log.some((entry) => entry.sql === "COMMIT"), false);
    assert.equal(db.log.at(-1).sql, "release");
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

// values of one INSERT INTO team_ledger: [team, delta, balanceAfter, kind, reason, note, pairing, actor]
const ledger = (db) => db.log.filter((entry) => entry.sql.startsWith("INSERT INTO team_ledger")).map((entry) => entry.values);

test("buying a Team reroll is journaled as staff, between the write and the commit", async () => {
  await withDatabase({ stage: "active", stored: { treasury: 150 } }, async (db) => {
    await handleTeamRoutes(patch({ teamRerolls: 1, purchasedStaff: { teamRerolls: 1 }, treasury: 30 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, -120, 30, "staff", null, null, null, coach.id]]);
    const sql = db.log.map((entry) => entry.sql), at = sql.findIndex((text) => text.startsWith("INSERT INTO team_ledger"));
    assert.ok(sql.findIndex((text) => text.startsWith("UPDATE saved_teams")) < at && at < sql.indexOf("COMMIT"));
  });
});

test("a sale is journaled at its half price, gold included", async () => {
  await withDatabase({ stored: { players: [{ id: "c1", rowIndex: 2, name: "Catcher" }] } }, async (db) => {
    await handleTeamRoutes(patch({ players: [], treasury: 137.5 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, 37.5, 137.5, "sale", null, null, null, coach.id]]);
  });
});

test("a hire is journaled at the position's price", async () => {
  await withDatabase({}, async (db) => {
    await handleTeamRoutes(patch({ players: [{ id: "n1", rowIndex: 0, name: "New", purchased: true, purchaseRefund: 50 }], treasury: 50 }),
      response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, -50, 50, "hire", null, null, null, coach.id]]);
  });
});

test("a treasury edited by hand is manual without a reason; on the admin route it is admin", async () => {
  await withDatabase({}, async (db) => {
    await handleTeamRoutes(patch({ treasury: 130 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, 30, 130, "manual", null, null, null, coach.id]]);
  });
  await withDatabase({ user: admin }, async (db) => {
    await handleAdminRoutes(patch({ treasury: 130 }), response(), adminUrl);
    assert.deepEqual(ledger(db), [[TEAM, 30, 130, "admin", null, null, null, admin.id]]);
  });
});

test("a race change journals the whole difference as one line, not as sales of the old squad", async () => {
  await withDatabase({ slug: "teams/dwarf", stored: { players: [{ id: "d1", rowIndex: 0, name: "Dwarf" }] } }, async (db) => {
    await handleTeamRoutes(patch({ players: [], treasury: 90 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, -10, 90, "manual", null, null, null, coach.id]]);
  });
});

test("an unchanged treasury journals nothing, and a refused or stale write journals nothing", async () => {
  await withDatabase({}, async (db) => {
    await handleTeamRoutes(patch({}), response(), teamUrl());
    assert.deepEqual(ledger(db), []);
  });
  await withDatabase({ stage: "active", stored: { startingRerolls: 1 } }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ startingRerolls: 2, treasury: 40 }), response(), teamUrl()), { code: "STAGE_PURCHASE_LOCKED" });
    assert.deepEqual(ledger(db), []);
  });
  await withDatabase({ revision: 5 }, async (db) => {
    await handleTeamRoutes(patch({ treasury: 40 }, 4), response(), teamUrl());
    assert.deepEqual(ledger(db), []);
  });
});

test("a journal line that cannot be written takes the team write with it", async () => {
  await withDatabase({ failOn: "INSERT INTO team_ledger" }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ treasury: 40 }), response(), teamUrl()), /INSERT INTO team_ledger failed/);
    assert.ok(wrote(db));
    assert.equal(db.log.some((entry) => entry.sql === "COMMIT"), false);
    assert.ok(db.log.some((entry) => entry.sql === "ROLLBACK"));
    assert.equal(db.log.at(-1).sql, "release");
  });
});

test("fractional thousands are kept exactly, from an opening balance that has gold too", async () => {
  await withDatabase({ stored: { treasury: 150.5, players: [{ id: "c1", rowIndex: 2, name: "Catcher" }] } }, async (db) => {
    await handleTeamRoutes(patch({ players: [], treasury: 188 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, 37.5, 188, "sale", null, null, null, coach.id]]);
  });
  await withDatabase({ stored: { treasury: 150.5 } }, async (db) => {
    await handleTeamRoutes(patch({ treasury: 130.1 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, -20.4, 130.1, "manual", null, null, null, coach.id]]);
  });
});

test("a stored squad with no player ids is not read as sold: the whole difference is one line", async () => {
  const stored = { players: [{ rowIndex: 2, name: "Catcher" }] }; // saved before ids existed
  const same = { players: [{ id: "c1", rowIndex: 2, name: "Catcher" }] }; // what the editor sends back, ids made up on load
  await withDatabase({ stored }, async (db) => {
    await handleTeamRoutes(patch(same), response(), teamUrl());
    assert.deepEqual(ledger(db), []);
  });
  await withDatabase({ stored }, async (db) => {
    await handleTeamRoutes(patch({ ...same, treasury: 110 }), response(), teamUrl());
    assert.deepEqual(ledger(db), [[TEAM, 10, 110, "manual", null, null, null, coach.id]]);
  });
});

// values of one INSERT INTO match_events: [team, pairing, player, counter, delta, injury, actor]
const edits = (db) => db.log.filter((entry) => entry.sql.startsWith("INSERT INTO match_events")).map((entry) => entry.values);

test("an SPP change is written as settled rows without a match, in the save's transaction after the journal; a refused or stale save writes none", async () => {
  const stored = { players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 1 } }] };
  await withDatabase({ stored }, async (db) => {
    await handleTeamRoutes(patch({ players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 2, mvps: 1 } }], treasury: 90 }), response(), teamUrl());
    assert.deepEqual(edits(db), [[TEAM, null, "a", "touchdowns", 1, null, coach.id], [TEAM, null, "a", "mvps", 1, null, coach.id]]);
    const sql = db.log.map((entry) => entry.sql), at = sql.findIndex((text) => text.startsWith("INSERT INTO match_events"));
    assert.match(sql[at], /created_at, settled_at\)\s+SELECT [^]*\bat, at\s+FROM \(SELECT clock_timestamp\(\) AS at\)/, "settled as it is written, at the moment it is written");
    assert.ok(sql.findIndex((text) => text.startsWith("INSERT INTO team_ledger")) < at && at < sql.indexOf("COMMIT"));
  });
  await withDatabase({ stored, user: admin }, async (db) => {
    await handleAdminRoutes(patch({ players: [{ id: "a", rowIndex: 0, spp: {} }] }), response(), adminUrl);
    assert.deepEqual(edits(db), [[TEAM, null, "a", "touchdowns", -1, null, admin.id]], "the admin's save is the admin's");
  });
  await withDatabase({ stored: { ...stored, startingRerolls: 1 } }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ startingRerolls: 2, players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 5 } }] }), response(), teamUrl()),
      { code: "STAGE_PURCHASE_LOCKED" });
    assert.deepEqual(edits(db), []);
  });
  await withDatabase({ stored, revision: 5 }, async (db) => {
    await handleTeamRoutes(patch({ players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 5 } }] }, 4), response(), teamUrl());
    assert.deepEqual(edits(db), []);
  });
});

test("the team a save answers with is read after the write, with every column GET reads", async () => {
  await withDatabase({}, async (db) => {
    const answer = response();
    await handleTeamRoutes(patch({ treasury: 90 }), answer, teamUrl());
    const sql = db.log.map((entry) => entry.sql), read = sql.findIndex((text) => text.includes("in_active_season"));
    assert.ok(sql.findIndex((text) => text.startsWith("UPDATE saved_teams")) < read && read < sql.indexOf("COMMIT"));
    assert.equal(answer.payload.team.inActiveSeason, false);
  });
});

test("a roster with an SPP counter outside 0…999, or two players under one id, is refused before any transaction, on the owner's route and the admin's", async () => {
  const bad = [
    [{ players: [{ id: "a", rowIndex: 0, spp: { touchdowns: 1000 } }] }, [{ code: "SPP_OUT_OF_RANGE", params: { playerId: "a", player: "#1", counter: "TD" } }]],
    [{ players: [{ id: "a", name: "Bo", rowIndex: 0, spp: { mvps: -1 } }] }, [{ code: "SPP_OUT_OF_RANGE", params: { playerId: "a", player: "Bo", counter: "MVP" } }]],
    [{ players: [{ id: "a", rowIndex: 0 }, { id: "a", name: "Al", rowIndex: 0 }] }, [{ code: "DUPLICATE_PLAYER_ID", params: { playerId: "a", names: "#1, Al" } }]],
  ];
  for (const [roster, violations] of bad) {
    for (const [user, send] of [[coach, () => handleTeamRoutes(patch(roster), response(), teamUrl())], [admin, () => handleAdminRoutes(patch(roster), response(), adminUrl)]]) {
      await withDatabase({ user }, async (db) => {
        await assert.rejects(send(), (error) => {
          assert.deepEqual([error.status, error.code, error.violations], [422, "ROSTER_BREAKS_THE_RULES", violations]);
          return true;
        }, `${user.login} ${JSON.stringify(roster)}`);
        assert.deepEqual(db.log.map((entry) => entry.sql).filter((sql) => !sql.includes("FROM sessions")), [], "nothing but who is asking");
      });
    }
  }
});

test("a save whose SPP change would be more than 2000 steps is refused before anything is written", async () => {
  const players = (knockouts) => [{ id: "a", rowIndex: 0, spp: { touchdowns: 999, casualties: 999 } }, { id: "b", rowIndex: 0, spp: { knockouts } }];
  const stored = { players: [{ id: "a", rowIndex: 0 }, { id: "b", rowIndex: 0 }] };
  await withDatabase({ stored }, async (db) => {
    await assert.rejects(handleTeamRoutes(patch({ players: players(3), treasury: 90 }), response(), teamUrl()), (error) => {
      assert.deepEqual([error.status, error.code, error.violations], [422, "ROSTER_BREAKS_THE_RULES", [{ code: "SPP_EDIT_TOO_LARGE", params: { limit: 2000 } }]]);
      return true;
    });
    assert.deepEqual(db.log.filter((entry) => /^(INSERT|UPDATE|DELETE)/.test(entry.sql)), [], "no write, the rolls' included");
    assert.deepEqual(db.log.slice(-2).map((entry) => entry.sql), ["ROLLBACK", "release"]);
  });
  await withDatabase({ stored }, async (db) => {
    await handleTeamRoutes(patch({ players: players(2), treasury: 90 }), response(), teamUrl());
    assert.equal(edits(db).length, 2000);
  });
});

// Owner ruling of 2026-10-19 (stage 07c, question 2): the limit of 14 counts everyone on the roster, players
// sitting out the next match too, and the server holds it exactly as the browser does (one `validateRoster`).
test("a save of more than 14 players is refused whoever of them sits out the next match, on the owner's route and the admin's; 14 are saved", async () => {
  const squad = (playing, skipping) => [
    ...Array.from({ length: playing }, (_, n) => ({ id: `p${n}`, rowIndex: 0 })),
    ...Array.from({ length: skipping }, (_, n) => ({ id: `s${n}`, rowIndex: 0, skipNextGame: true }))];
  for (const [user, route, url] of [[coach, handleTeamRoutes, teamUrl()], [admin, handleAdminRoutes, adminUrl]]) {
    await withDatabase({ user }, async (db) => {
      await assert.rejects(route(patch({ players: squad(12, 3) }), response(), url), (error) => {
        assert.deepEqual([error.status, error.code, error.violations],
          [422, "ROSTER_BREAKS_THE_RULES", [{ code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 15 } }]]);
        return true;
      }, `${user.login}: 12 playing and 3 skipping`);
      assert.equal(wrote(db), false, "nothing is written");
    });
    await withDatabase({ user }, async (db) => {
      const answer = response();
      await route(patch({ players: squad(11, 3) }), answer, url);
      assert.equal(answer.status, 200, `${user.login}: 11 playing and 3 skipping`);
      const update = db.log.find((entry) => entry.sql.startsWith("UPDATE saved_teams"));
      assert.equal(JSON.parse(update.values[4]).players.length, 14, "the fourteen are what is written");
    });
  }
});
