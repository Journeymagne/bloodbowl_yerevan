import test from "node:test";
import assert from "node:assert/strict";

import { pool } from "../server/db/pool.mjs";
import { encodeLedgerCursor, writeLedgerEntries } from "../server/api/team-ledger.mjs";
import { callApi, loggingErrors, recording, seedCoach, seedTeam, teamRow, withApiDatabase } from "./helpers/api-db.mjs";
import { lockRow, scratchSkip, withForcedOverlap } from "./helpers/scratch-db.mjs";

const db = { skip: scratchSkip };
const ROW = "00000000-0000-4000-8000-000000000099";
const NOBODY = "44444444-4444-4444-8444-444444444444";
const treasury = (id, token, body) => callApi("POST", `/api/teams/${id}/treasury`, { token, body: { reason: "sponsor", revision: 1, ...body } });
const ledger = (id, token, query = "") => callApi("GET", `/api/teams/${id}/ledger${query}`, { token });
/** The team's `updated_at` as Postgres writes it, to the microsecond: a JS Date keeps milliseconds, and two writes can share one. */
const clock = async (client, id) => (await client.query("SELECT updated_at::text AS at FROM saved_teams WHERE id = $1", [id])).rows[0].at;
const movedOn = async (client, id, since) => (await client.query("SELECT updated_at > $2::timestamptz AS later FROM saved_teams WHERE id = $1", [id, since])).rows[0].later;
const lines = async (client, id) => (await client.query("SELECT kind, delta::float AS delta FROM team_ledger WHERE saved_team_id = $1", [id])).rows;

test("a manual entry moves the treasury once, raises the revision and is journaled with its reason", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const { status, body } = await treasury(id, coach.token, { delta: -0.5, reason: "fine", note: "Late kick-off" });
  assert.equal(status, 201);
  assert.deepEqual([body.team.roster.treasury, body.team.revision], [99.5, 2]);
  assert.deepEqual({ kind: body.entry.kind, delta: body.entry.delta, balanceAfter: body.entry.balanceAfter, reason: body.entry.reason, note: body.entry.note },
    { kind: "manual", delta: -0.5, balanceAfter: 99.5, reason: "fine", note: "Late kick-off" });
  const page = await callApi("GET", `/api/teams/${id}/ledger`, { token: coach.token });
  assert.deepEqual(page.body.entries.map((entry) => entry.id), [body.entry.id]);
}));

test("going below zero is the roster rule, a stale or missing revision is the team as it stands; neither writes anything", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const broke = await treasury(id, coach.token, { delta: -100.001 });
  assert.deepEqual([broke.status, broke.body.error.code, broke.body.violations], [422, "ROSTER_BREAKS_THE_RULES", [{ code: "TREASURY_INVALID", params: {} }]]);
  for (const revision of [0, undefined]) {
    const stale = await treasury(id, coach.token, { delta: 5, revision });
    assert.deepEqual([stale.status, stale.body.error.code, stale.body.team.revision], [409, "TEAM_SAVED_ELSEWHERE", 1]);
  }
  assert.deepEqual(await lines(client, id), []);
  assert.equal((await teamRow(client, id)).roster.treasury, 100);
}));

test("two entries sent on one revision at once: one lands, the other hears the team changed, the ledger has one line", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const results = await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 },
    [() => treasury(id, coach.token, { delta: 10 }), () => treasury(id, coach.token, { delta: 20 })]);
  assert.deepEqual(results.map((result) => result.value.status).sort(), [201, 409]);
  const [line] = await lines(client, id);
  assert.equal((await teamRow(client, id)).roster.treasury, 100 + line.delta);
  assert.equal((await lines(client, id)).length, 1);
  const refused = results.find((result) => result.value.status === 409).value.body;
  assert.deepEqual([refused.error.code, refused.team.revision, refused.team.roster.treasury], ["TEAM_SAVED_ELSEWHERE", 2, 100 + line.delta], "the loser is told the team as the winner left it");
}));

test("a manual entry and a roster save on one revision at once: one of them, never both", db, () => withApiDatabase(async ({ client, url }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { players: 0 });
  const save = () => callApi("PATCH", `/api/teams/${id}`, { token: coach.token,
    body: { name: "Lions", baseTeamSlug: "teams/human", revision: 1, roster: { teamSlug: "teams/human", players: [], treasury: 130 } } });
  const results = await withForcedOverlap(url, { lock: lockRow("saved_teams", id), waiting: 2 }, [() => treasury(id, coach.token, { delta: 10 }), save]);
  const [posted, saved] = results.map((result) => result.value.status);
  assert.ok((posted === 201 && saved === 409) || (posted === 409 && saved === 200), `${posted} ${saved}`);
  const row = await teamRow(client, id);
  assert.deepEqual([row.revision, row.roster.treasury], [2, posted === 201 ? 110 : 130]);
  assert.equal((await lines(client, id)).length, 1);
}));

test("the history pages newest first by the database's own time and id: 25 lines of one transaction and a tie, none twice, none missed", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query("BEGIN");
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: Array.from({ length: 25 }, (_, i) => ({ kind: "manual", delta: i + 1 })) });
  await client.query("COMMIT");
  await client.query(`INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind, created_at)
    VALUES ($1, 0.5, 0.5, 'admin', $2), ($1, 0.5, 1, 'admin', $2)`, [id, "2020-01-01 00:00:00.000001+00"]);
  const seen = [];
  let next = null;
  do {
    const page = await callApi("GET", `/api/teams/${id}/ledger${next ? `?before=${encodeURIComponent(next)}` : ""}`, { token: coach.token });
    seen.push(...page.body.entries); next = page.body.next;
  } while (next);
  assert.equal(seen.length, 27);
  assert.equal(new Set(seen.map((entry) => entry.id)).size, 27);
  assert.deepEqual(seen.slice(0, 3).map((entry) => entry.delta), [25, 24, 23]);
  assert.ok(seen.every((entry) => typeof entry.delta === "number" && typeof entry.balanceAfter === "number"));
  const big = await callApi("GET", `/api/teams/${id}/ledger?limit=26`, { token: coach.token });
  const last = await callApi("GET", `/api/teams/${id}/ledger?limit=1&before=${encodeURIComponent(big.body.next)}`, { token: coach.token });
  assert.deepEqual([last.body.entries.length, last.body.next], [1, null]);
  assert.notEqual(last.body.entries[0].id, big.body.entries[25].id);
}));

test("the history counts every line of the team whatever page is asked for, and no other team's (08: «Вся история · N»)", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), other = await seedTeam(client, coach.id, { name: "Wolves" });
  assert.equal((await ledger(id, coach.token)).body.total, 0);
  await client.query("BEGIN");
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: Array.from({ length: 25 }, (_, i) => ({ kind: "manual", delta: i + 1 })) });
  await writeLedgerEntries(client, { teamId: other, opening: 0, entries: [{ kind: "manual", delta: 1 }] });
  await client.query("COMMIT");
  const first = await ledger(id, coach.token, "?limit=3");
  assert.deepEqual([first.body.entries.length, first.body.total], [3, 25]);
  assert.equal((await ledger(id, coach.token, `?before=${first.body.next}&limit=3`)).body.total, 25);
  assert.equal((await ledger(other, coach.token)).body.total, 1);
}));

test("an empty ?before= is the first page: a client that sends the cursor it holds, empty when it holds none, starts at the top", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  assert.equal((await treasury(id, coach.token, { delta: 5 })).status, 201);
  const first = await ledger(id, coach.token);
  const empty = await ledger(id, coach.token, "?before=");
  assert.deepEqual([empty.status, empty.body], [200, first.body]);
  assert.deepEqual([(await ledger(id, coach.token, "?before=&limit=1")).body.entries.length, (await ledger(id, coach.token, "?before=%20")).status], [1, 400],
    "empty is no cursor; a blank one is a cursor that is none");
}));

test("a note with a NUL in it is refused as the note, before anything is written", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), before = await teamRow(client, id);
  for (const note of ["\u0000", "paid\u0000 back", "\u0000   "]) {
    const { result, log } = await recording(() => treasury(id, coach.token, { delta: 5, note }));
    assert.deepEqual([result.status, result.body.error.code, result.body.error.params], [400, "FIELD_INVALID", { field: "note" }], JSON.stringify(note));
    assert.deepEqual(log, [], "no transaction was opened");
  }
  assert.deepEqual([await teamRow(client, id), await lines(client, id)], [before, []]);
}));

test("the entry an entry answers with is the line it wrote: a line that sorts after it (a clock set back) refuses the entry, and nothing is written", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query(`INSERT INTO team_ledger (saved_team_id, delta, balance_after, kind, reason, created_at)
    VALUES ($1, 1, 101, 'manual', 'sponsor', now() + interval '1 day')`, [id]);
  const before = await teamRow(client, id);
  const { result, logged } = await loggingErrors(() => recording(() => treasury(id, coach.token, { delta: 5 })));
  assert.deepEqual([result.result.status, result.result.body.error.code], [500, "SERVER_ERROR"]);
  assert.deepEqual(result.log.slice(-2), ["ROLLBACK", "release"]);
  assert.equal(logged.length, 1);
  assert.deepEqual([await teamRow(client, id), (await lines(client, id)).length], [before, 1]);
}));

test("the history says since when it is kept, refuses a cursor it did not make, and is the owner's and the admin's only", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), admin = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id);
  const { rows: [migration] } = await client.query("SELECT applied_at FROM schema_migrations WHERE name = '010_team_ledger.sql'");
  const page = await callApi("GET", `/api/teams/${id}/ledger?limit=500`, { token: coach.token });
  assert.deepEqual([page.status, page.body.since, page.body.next], [200, migration.applied_at.toISOString(), null]);
  assert.equal((await callApi("GET", `/api/teams/${id}/ledger?before=nope`, { token: coach.token })).body.error.params.field, "before");
  assert.equal((await callApi("GET", `/api/teams/${id}/ledger`, { token: other.token })).body.error.code, "TEAM_NOT_FOUND");
  assert.equal((await callApi("GET", `/api/teams/${id}/ledger`, { token: admin.token })).status, 200);
  assert.equal((await treasury(id, other.token, { delta: 5 })).body.error.code, "TEAM_NOT_FOUND");
}));

test("a ledger write that fails after the treasury moved takes the treasury back: ROLLBACK after the UPDATE, then release", async () => {
  const log = [], saved = { query: pool.query, connect: pool.connect };
  const team = { id: "11111111-1111-4111-8111-111111111111", user_id: "22222222-2222-4222-8222-222222222222", revision: 1, roster: { treasury: 100 } };
  const query = async (sql) => {
    const text = sql.trim(); log.push(text.split(/\s+/).slice(0, 2).join(" "));
    if (text.includes("FROM sessions")) return { rows: [{ id: team.user_id, is_admin: false }] };
    if (text.includes("FROM saved_teams")) return { rows: [team] }; // the first look at the team, the locked one, and the one the answer is made from
    if (text.startsWith("UPDATE saved_teams")) return { rows: [team] };
    if (text.startsWith("INSERT INTO team_ledger")) throw new Error("disk full");
    return { rows: [] };
  };
  Object.assign(pool, { query, connect: async () => ({ query, release: () => log.push("release") }) });
  try {
    const { result: { status }, logged } = await loggingErrors(() => callApi("POST", `/api/teams/${team.id}/treasury`, { token: "t", body: { delta: 5, reason: "fine", revision: 1 } }));
    assert.equal(status, 500);
    assert.deepEqual(log.slice(log.indexOf("UPDATE saved_teams")), ["UPDATE saved_teams", "INSERT INTO", "ROLLBACK", "release"]);
    assert.deepEqual(logged.map(([error]) => error.message), ["disk full"], "the failure is logged once, and says what it was");
  } finally { Object.assign(pool, saved); }
});

test("a ledger line the database refuses takes the treasury back for real: the team is exactly as it was and the connection is given back", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query("CREATE FUNCTION refuse_line() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'disk full'; END $$");
  await client.query("CREATE TRIGGER refuse BEFORE INSERT ON team_ledger FOR EACH ROW EXECUTE FUNCTION refuse_line()");
  const before = await teamRow(client, id);
  const { result: { result, log }, logged } = await loggingErrors(() => recording(() => treasury(id, coach.token, { delta: 5 })));
  assert.deepEqual([result.status, result.body.error.code], [500, "SERVER_ERROR"]);
  assert.ok(log.some((sql) => sql.startsWith("UPDATE saved_teams")), "the treasury had moved when the line failed");
  assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"]);
  assert.deepEqual(await teamRow(client, id), before);
  assert.deepEqual(logged.map(([error]) => error.message), ["disk full"]);
}));

test("an entry the team refuses is rolled back whole: a stale revision or a treasury below zero changes no team and writes no line", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const before = await teamRow(client, id);
  const stale = ["1", true, [1], null, 1.5, 2, undefined].map((revision) => [{ delta: 5, revision }, "TEAM_SAVED_ELSEWHERE"]); // the team is at 1: only the number 1 is its revision
  for (const [body, code] of [...stale, [{ delta: -100.001 }, "ROSTER_BREAKS_THE_RULES"]]) {
    const { result, log } = await recording(() => treasury(id, coach.token, body));
    const said = JSON.stringify(body);
    assert.equal(result.body.error.code, code, said);
    assert.deepEqual(log.slice(-2), ["ROLLBACK", "release"], said);
    assert.ok(!log.includes("COMMIT"), said);
    assert.ok(!log.some((sql) => /^(UPDATE|INSERT)/.test(sql)), `${said}: nothing was written before it was refused`);
    assert.deepEqual(await teamRow(client, id), before, said);
    assert.deepEqual(await lines(client, id), [], said);
  }
}));

test("an entry that lands changes the treasury, the revision and the clock and nothing else of the team, and the line says who wrote it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { coachesSafe: 12, notes: "keep me" } });
  const before = await teamRow(client, id), beforeAt = await clock(client, id);
  const { result: { status, body }, log } = await recording(() => treasury(id, coach.token, { delta: 25, reason: "friendly", note: "Win over the Wolves" }));
  assert.equal(status, 201);
  assert.deepEqual(Object.keys(body).sort(), ["entry", "team"]);
  assert.deepEqual(log.slice(-2), ["COMMIT", "release"]);
  const after = await teamRow(client, id);
  assert.deepEqual({ ...after.roster, treasury: before.roster.treasury }, before.roster, "every other field of the roster is as it was");
  assert.deepEqual([after.revision, after.roster.treasury], [2, 125]);
  assert.equal(await movedOn(client, id, beforeAt), true, "the clock moved on, to the microsecond");
  const { user_id: owner, name, base_team_slug: slug, logo_data: logo, stage, created_at: created } = after;
  assert.deepEqual([owner, name, slug, logo, stage, created], [before.user_id, before.name, before.base_team_slug, before.logo_data, before.stage, before.created_at]);
  const { rows } = await client.query(`SELECT kind, reason, note, delta::float AS delta, balance_after::float AS balance_after, pairing_id, actor_user_id
    FROM team_ledger WHERE saved_team_id = $1`, [id]);
  assert.deepEqual(rows, [{ kind: "manual", reason: "friendly", note: "Win over the Wolves", delta: 25, balance_after: 125, pairing_id: null, actor_user_id: coach.id }]);
  assert.deepEqual(Object.keys(body.entry).sort(), ["balanceAfter", "createdAt", "delta", "id", "kind", "note", "pairingId", "reason"], "a line in an answer is the whitelist and no more");
  assert.equal(typeof body.entry.createdAt, "string");
}));

test("the team a manual entry answers with has the keys every other answer about a team has, inActiveSeason included, and is read after the write", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const keys = (team) => Object.keys(team).sort();
  const { body: { team: read } } = await callApi("GET", `/api/teams/${id}`, { token: coach.token });
  const save = (revision) => callApi("PATCH", `/api/teams/${id}`, { token: coach.token,
    body: { name: read.name, baseTeamSlug: read.baseTeamSlug, roster: read.roster, revision } });
  const refused = await save(0);
  assert.equal(refused.status, 409);
  const { status, body } = await treasury(id, coach.token, { delta: 5 });
  assert.equal(status, 201);
  assert.deepEqual(keys(body.team), keys(refused.body.team), "PATCH's own answer to a stale save");
  assert.deepEqual(keys(body.team), keys(read), "and what GET says");
  assert.equal(body.team.inActiveSeason, false, "the question the raw row of the UPDATE cannot answer");
  assert.deepEqual([body.team.revision, body.team.roster.treasury], [2, 105]);
  const saved = await save(2);
  assert.equal(saved.status, 200);
  assert.ok(keys(saved.body.team).every((key) => keys(body.team).includes(key)), "whatever a PATCH that lands says, an entry says too");
  const { rows: [season] } = await client.query("INSERT INTO seasons (name, status) VALUES ('Now', 'active') RETURNING id");
  await client.query("INSERT INTO season_entries (season_id, user_id, saved_team_id) VALUES ($1, $2, $3)", [season.id, coach.id, id]);
  const playing = await treasury(id, coach.token, { delta: 5, revision: saved.body.team.revision });
  assert.equal(playing.status, 201);
  assert.equal(playing.body.team.inActiveSeason, true);
}));

test("a body the site does not accept is a 400 naming the field, opens no transaction, writes nothing, and comes before a stale revision", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const before = await teamRow(client, id);
  const says = (field) => [400, "FIELD_INVALID", { field }];
  const asked = async (send, field, label) => {
    const { result, log } = await recording(send);
    assert.deepEqual([result.status, result.body.error.code, result.body.error.params], says(field), label);
    assert.deepEqual(log, [], `${label}: no transaction was opened`);
  };
  for (const [body, field] of [[{ delta: 0 }, "delta"], [{ delta: "5" }, "delta"], [{ delta: null }, "delta"], [{ delta: undefined }, "delta"], [{ delta: 100000.5 }, "delta"],
    [{ delta: 0.0004 }, "delta"], [{ delta: 5, reason: "gift" }, "reason"], [{ delta: 5, reason: undefined }, "reason"], [{ delta: 5, note: 7 }, "note"],
    [{ delta: 5, note: "x".repeat(201) }, "note"], [{ delta: 0, revision: 99 }, "delta"]]) {
    await asked(() => treasury(id, coach.token, body), field, JSON.stringify(body));
  }
  // A body that is no object is refused as the body, before any field of it is read (readJson); none at all has no delta.
  for (const [body, field] of [[[], "body"], [null, "body"], ["5", "body"], [5, "body"], [undefined, "delta"]]) {
    await asked(() => callApi("POST", `/api/teams/${id}/treasury`, { token: coach.token, body }), field, `body ${JSON.stringify(body)}`);
  }
  assert.deepEqual(await teamRow(client, id), before);
  assert.deepEqual(await lines(client, id), []);
}));

test("who may do what: nobody without a session, a stranger is told 404 whatever they send, an admin reads a coach's history and cannot add to it", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), other = await seedCoach(client, "wolf"), admin = await seedCoach(client, "boss", { admin: true });
  const id = await seedTeam(client, coach.id);
  const own = await treasury(id, coach.token, { delta: 5 });
  const before = await teamRow(client, id), revision = before.revision;
  assert.deepEqual([(await ledger(id)).status, (await treasury(id, undefined, { delta: 5, revision })).status], [401, 401]);
  const missing = await ledger(NOBODY, coach.token);
  assert.deepEqual([missing.status, missing.body], [404, { error: { code: "TEAM_NOT_FOUND", params: {}, message: "Team not found." } }]);
  for (const [who, request] of [
    ["a stranger reading", () => ledger(id, other.token)],
    ["a stranger reading with a cursor that is nonsense", () => ledger(id, other.token, "?before=nope")],
    ["a stranger adding", () => treasury(id, other.token, { delta: 5, revision })],
    ["a stranger adding what is not an entry", () => treasury(id, other.token, { delta: 0, reason: "gift" })],
    ["an admin adding", () => treasury(id, admin.token, { delta: 5, revision })],
    ["the owner adding to a team that is not there", () => treasury(NOBODY, coach.token, { delta: 5, revision })],
    ["the owner adding to a team that is not there, with nonsense", () => treasury(NOBODY, coach.token, { delta: 0 })],
  ]) {
    const answer = await request();
    assert.deepEqual([answer.status, answer.body], [missing.status, missing.body], `${who} is told what a team that is not there is told`);
  }
  const seen = await ledger(id, admin.token);
  assert.deepEqual([seen.status, seen.body.entries.map((entry) => entry.id)], [200, [own.body.entry.id]]);
  assert.deepEqual(await teamRow(client, id), before);
  assert.equal((await lines(client, id)).length, 1);
}));

test("entries follow one another on the revision each answer gives: the treasury and the history add up, newest first", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const sent = [[10, "friendly"], [-2.5, "purchase"], [0.001, "sponsor"], [-7.501, "fine"], [300, "other"]];
  let revision = 1, answer;
  for (const [delta, reason] of sent) {
    answer = await treasury(id, coach.token, { delta, reason, revision });
    assert.equal(answer.status, 201);
    revision = answer.body.team.revision;
  }
  assert.equal(revision, 6);
  const { body: page } = await ledger(id, coach.token);
  assert.deepEqual(page.entries.map((entry) => entry.delta), [300, -7.501, 0.001, -2.5, 10]);
  assert.deepEqual(page.entries.map((entry) => entry.balanceAfter), [400, 100, 107.501, 107.5, 110]);
  assert.deepEqual(page.entries.map((entry) => entry.reason), ["other", "fine", "sponsor", "purchase", "friendly"]);
  assert.deepEqual(page.entries[0], answer.body.entry, "the line an entry answers with is the newest line of the history");
  assert.equal((await teamRow(client, id)).roster.treasury, 400);
}));

test("amounts add to the gold and not to the float: 0.1 and then 0.2 make exactly 0.3, in the treasury and in the line", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id, { roster: { treasury: 0 } });
  const first = await treasury(id, coach.token, { delta: 0.1 });
  const second = await treasury(id, coach.token, { delta: 0.2, revision: first.body.team.revision });
  assert.deepEqual([second.status, second.body.team.roster.treasury, second.body.entry.balanceAfter, second.body.entry.delta], [201, 0.3, 0.3, 0.2]);
  assert.equal((await teamRow(client, id)).roster.treasury, 0.3);
}));

test("a treasury may go down to nothing and up by one gold, and 100000 is the most one entry moves", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  let revision = 1;
  const post = async (delta) => {
    const answer = await treasury(id, coach.token, { delta, revision });
    if (answer.status === 201) revision = answer.body.team.revision;
    return answer;
  };
  const landed = async (delta, closing) => {
    const answer = await post(delta);
    assert.deepEqual([answer.status, answer.body.team?.roster.treasury, answer.body.entry?.balanceAfter], [201, closing, closing], String(delta));
  };
  await landed(-100, 0);
  await landed(0.001, 0.001);
  await landed(-0.001, 0);
  await landed(100000, 100000);
  for (const delta of [100000.001, -100000.001]) {
    const { status, body } = await post(delta);
    assert.deepEqual([status, body.error.code, body.error.params], [400, "FIELD_INVALID", { field: "delta" }], String(delta));
  }
  assert.equal((await post(-0.001)).status, 201);
  await landed(-99999.999, 0);
  assert.equal((await post(-0.001)).body.error.code, "ROSTER_BREAKS_THE_RULES");
  assert.equal((await teamRow(client, id)).roster.treasury, 0);
}));

test("the history is paged by limit, 1 to 100 and 20 for anything else, and names the next page only while there is one", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  await client.query("BEGIN");
  await writeLedgerEntries(client, { teamId: id, opening: 0, entries: Array.from({ length: 25 }, (_, i) => ({ kind: "manual", delta: i + 1 })) });
  await client.query("COMMIT");
  const size = async (query) => { const { status, body } = await ledger(id, coach.token, query); return [status, body.entries.length, body.next !== null]; };
  assert.deepEqual(await size(""), [200, 20, true]);
  for (const query of ["?limit=0", "?limit=-1", "?limit=101", "?limit=500", "?limit=abc", "?limit=2.5", "?limit=", "?limit=%20", "?limit=1e1"]) {
    assert.deepEqual(await size(query), [200, 20, true], query);
  }
  assert.deepEqual(await size("?limit=1"), [200, 1, true]);
  assert.deepEqual(await size("?limit=24"), [200, 24, true]);
  assert.deepEqual(await size("?limit=25"), [200, 25, false]);
  assert.deepEqual(await size("?limit=100"), [200, 25, false]);
}));

test("a cursor the history did not make is a 400 for `before`, whatever is wrong with it, and never a 500", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const at = "2026-10-16 18:00:00+00";
  // An empty one is the first page (R11), so it is not among these.
  for (const before of ["nope", " ", encodeLedgerCursor({ at: "yesterday", id: ROW }), encodeLedgerCursor({ at, id: "1; DROP" }),
    encodeLedgerCursor({ at: "2026-13-45 99:99:99+00", id: ROW }), encodeLedgerCursor({ at: "2026-02-30 00:00:00+00", id: ROW }),
    encodeLedgerCursor({ at: "2026-10-16 18:00:00+99", id: ROW })]) {
    const { status, body } = await ledger(id, coach.token, `?before=${encodeURIComponent(before)}`);
    assert.deepEqual([status, body.error.code, body.error.params], [400, "FIELD_INVALID", { field: "before" }], before);
  }
  assert.equal((await ledger(id, coach.token, `?before=${encodeURIComponent(encodeLedgerCursor({ at, id: ROW }))}`)).status, 200);
}));

test("the history is read in one snapshot that cannot write, and holds nobody else's lines", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id), other = await seedTeam(client, coach.id, { name: "Wolves" });
  await writeLedgerEntries(client, { teamId: other, opening: 0, entries: [{ kind: "manual", delta: 99 }] });
  const { result, log } = await recording(() => ledger(id, coach.token));
  assert.deepEqual([result.status, result.body.entries], [200, []]);
  assert.equal(log[0], "BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
  assert.deepEqual(log.slice(-2), ["COMMIT", "release"]);
  assert.ok(!log.some((sql) => sql.includes("FOR UPDATE")), "a read holds no lock");
}));

test("only a GET asks for the history and only a POST adds to the treasury; a team's id may be written in capitals, and a path that is no team is no route", db, () => withApiDatabase(async ({ client }) => {
  const coach = await seedCoach(client, "lion"), id = await seedTeam(client, coach.id);
  const entry = { delta: 5, reason: "fine", revision: 1 };
  for (const [method, path] of [["POST", "ledger"], ["PATCH", "ledger"], ["DELETE", "ledger"], ["GET", "treasury"], ["PUT", "treasury"], ["PATCH", "treasury"], ["DELETE", "treasury"]]) {
    const { status, body } = await callApi(method, `/api/teams/${id}/${path}`, { token: coach.token, body: method === "GET" ? undefined : entry });
    assert.deepEqual([status, body.error.code], [404, "ROUTE_NOT_FOUND"], `${method} ${path}`);
  }
  for (const path of ["/api/teams/p0/ledger", `/api/teams/${id}0/ledger`, `/api/teams/${id}/ledger/`, `/api/teams/${id}/ledger/x`, `/api/teams/${id}/treasury/`, `/api/teams//treasury`]) {
    const { status, body } = await callApi(path.endsWith("treasury") || path.endsWith("treasury/") ? "POST" : "GET", path, { token: coach.token, body: entry });
    assert.deepEqual([status, body.error.code], [404, "ROUTE_NOT_FOUND"], path);
  }
  assert.deepEqual(await lines(client, id), [], "none of them touched the treasury");
  assert.equal((await ledger(id.toUpperCase(), coach.token)).status, 200);
  const { status, body } = await callApi("POST", `/api/teams/${id.toUpperCase()}/treasury`, { token: coach.token, body: entry });
  assert.deepEqual([status, body.team.id, body.team.roster.treasury], [201, id, 105]);
}));
