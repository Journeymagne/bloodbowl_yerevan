import test from "node:test";
import assert from "node:assert/strict";

import { loadMatchEvents, recordSideStatistics, settleMatchEvents, writeMatchEvents } from "../server/season/match-events-store.mjs";
import { sameValues, statisticsFromEvents } from "../src/domain/post-match/events.mjs";
import { INJURIES } from "../src/domain/post-match/rules.mjs";
import { normalizeMatchStats } from "../src/domain/post-match/statistics.mjs";
import { PLAYER_STATS } from "../src/domain/roster/values.mjs";
import { scratchSkip, withScratchDatabase } from "./helpers/scratch-db.mjs";

function fakeClient(rows = []) {
  const log = [];
  return { log, async query(sql, values = []) { log.push({ sql: sql.trim(), values }); return { rows, rowCount: rows.length }; } };
}
const tap = (playerId, counter, delta = 1, injury = null) => ({ playerId, counter, delta, injury, settledAt: null });

test("each event is one INSERT with its own clock time, in the order given", async () => {
  const db = fakeClient();
  assert.equal(await writeMatchEvents(db, { teamId: "t1", pairingId: "g1", actorId: "u1",
    events: [tap("p1", "touchdowns"), tap("p1", "injury", -1, { code: "dead" })] }), 2);
  assert.deepEqual(db.log.map((entry) => entry.values),
    [["t1", "g1", "p1", "touchdowns", 1, null, "u1"], ["t1", "g1", "p1", "injury", -1, '{"code":"dead"}', "u1"]]);
  assert.ok(db.log.every((entry) => entry.sql.startsWith("INSERT INTO match_events") && /clock_timestamp\(\)/.test(entry.sql)));
});

test("no events, no statement", async () => {
  const db = fakeClient();
  assert.equal(await writeMatchEvents(db, { teamId: "t1", pairingId: "g1", events: [] }), 0);
  assert.deepEqual(db.log, []);
});

test("the Players step writes only the difference, and hands back the events as they now stand", async () => {
  const db = fakeClient();
  const side = { team: { id: "t1" }, statistics: { p1: { ...normalizeMatchStats(), touchdowns: 1 } }, injuries: {} };
  const now = await recordSideStatistics(db, "g1", side, [tap("p1", "touchdowns"), tap("p1", "touchdowns")], "u1");
  assert.deepEqual(db.log.map((entry) => entry.values), [["t1", "g1", "p1", "touchdowns", -1, null, "u1"]]);
  assert.equal(statisticsFromEvents({ players: [{ id: "p1" }] }, now).statistics.p1.touchdowns, 1);
  const again = fakeClient();
  assert.deepEqual(await recordSideStatistics(again, "g1", side, now, "u1"), now);
  assert.deepEqual(again.log, []);
});

const id = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const U1 = id(1), U2 = id(2), T1 = id(11), T2 = id(12), T3 = id(13), G1 = id(41), G2 = id(42);

async function twoFriendlies(client) {
  await client.query("INSERT INTO users (id, login, login_key, telegram, password_hash) VALUES ($1, 'a', 'a', '@a', 'x'), ($2, 'b', 'b', '@b', 'x')", [U1, U2]);
  await client.query("INSERT INTO saved_teams (id, user_id, name, base_team_slug) VALUES ($1, $4, 'A', 'teams/human'), ($2, $5, 'B', 'teams/human'), ($3, $5, 'C', 'teams/human')",
    [T1, T2, T3, U1, U2]);
  for (const [pairing, table] of [[G1, 1], [G2, 2]]) {
    await client.query(`INSERT INTO season_pairings (id, match_kind, table_number, friendly_home_user_id, friendly_away_user_id,
      friendly_home_team_id, friendly_away_team_id) VALUES ($1, 'friendly', $2, $3, $4, $5, $6)`, [pairing, table, U1, U2, T1, T2]);
  }
}

test("on a real database: a match's events come back per team, oldest first; settling takes only that team's open events of that match, once", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoFriendlies(client);
    await client.query("BEGIN");
    await writeMatchEvents(client, { teamId: T1, pairingId: G1, actorId: U1,
      events: [tap("p1", "touchdowns"), tap("p1", "injury", 1, { code: "lasting", stat: "ag" }), tap("p1", "touchdowns", -1)] });
    await writeMatchEvents(client, { teamId: T2, pairingId: G1, events: [tap("journeyman-8", "catches")] });
    await writeMatchEvents(client, { teamId: T1, pairingId: G2, events: [tap("p1", "touchdowns")] });
    await client.query("COMMIT");
    const loaded = await loadMatchEvents(client, G1, [T1, T2, T3]);
    assert.deepEqual(loaded[T1], [tap("p1", "touchdowns"), tap("p1", "injury", 1, { code: "lasting", stat: "ag" }), tap("p1", "touchdowns", -1)]);
    assert.deepEqual(loaded[T2], [tap("journeyman-8", "catches")]);
    assert.deepEqual(loaded[T3], []);
    assert.equal(await settleMatchEvents(client, { teamId: T1, pairingId: G1 }), 3);
    assert.equal(await settleMatchEvents(client, { teamId: T1, pairingId: G1 }), 0);
    const open = (await client.query("SELECT saved_team_id, pairing_id FROM match_events WHERE settled_at IS NULL ORDER BY pairing_id")).rows;
    assert.deepEqual(open, [{ saved_team_id: T2, pairing_id: G1 }, { saved_team_id: T1, pairing_id: G2 }]);
    assert.ok((await loadMatchEvents(client, G1, [T1]))[T1].every((event) => event.settledAt instanceof Date));
  });
});

test("a row is read as the domain's event: jsonb as an object, timestamptz as a Date, a team with none as an empty list", async () => {
  const settledAt = new Date("2026-10-16T12:00:00Z");
  const db = fakeClient([
    { saved_team_id: "t2", player_id: "p9", counter: "catches", delta: 1, injury: null, settled_at: null },
    { saved_team_id: "t1", player_id: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "ag" }, settled_at: settledAt },
    { saved_team_id: "t1", player_id: "p1", counter: "touchdowns", delta: -1, injury: null, settled_at: null },
  ]);
  const loaded = await loadMatchEvents(db, "g1", ["t1", "t2", "t3"]);
  assert.deepEqual(loaded, {
    t1: [{ playerId: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "ag" }, settledAt }, tap("p1", "touchdowns", -1)],
    t2: [tap("p9", "catches")],
    t3: [],
  });
  assert.equal(db.log.length, 1);
  assert.match(db.log[0].sql, /^SELECT saved_team_id, player_id, counter, delta, injury, settled_at\s+FROM match_events\s+WHERE pairing_id = \$1 AND saved_team_id = ANY\(\$2::uuid\[\]\)\s+ORDER BY created_at, id$/);
  assert.deepEqual(db.log[0].values, ["g1", ["t1", "t2", "t3"]]);
});

test("settling is one UPDATE of the team's open events of the match, and counts the rows it took", async () => {
  const db = fakeClient([{}, {}]);
  assert.equal(await settleMatchEvents(db, { teamId: "t1", pairingId: "g1" }), 2);
  assert.equal(db.log.length, 1);
  assert.match(db.log[0].sql, /^UPDATE match_events SET settled_at = now\(\)\s+WHERE saved_team_id = \$1 AND pairing_id = \$2 AND settled_at IS NULL$/);
  assert.deepEqual(db.log[0].values, ["t1", "g1"]);
});

test("a row without an injury key is written with a null injury, and the actor is optional", async () => {
  const db = fakeClient();
  const row = { playerId: "p1", counter: "touchdowns", delta: 1 }; // the shape eventsDiff returns
  assert.equal(await writeMatchEvents(db, { teamId: "t1", pairingId: "g1", events: [row, row] }), 2);
  assert.deepEqual(db.log.map((entry) => entry.values), Array(2).fill(["t1", "g1", "p1", "touchdowns", 1, null, null]));
});

const REFUSED = [
  ["an injury row without an injury", tap("p1", "injury"), /injury/],
  ["an injury row whose injury is none", tap("p1", "injury", 1, { code: "none" }), /injury/],
  ["an injury row with a code the table does not have", tap("p1", "injury", 1, { code: "eaten" }), /injury/],
  ["a lasting injury without a characteristic", tap("p1", "injury", 1, { code: "lasting" }), /injury/],
  ["a lasting injury with a characteristic that is not one", tap("p1", "injury", 1, { code: "lasting", stat: "luck" }), /injury/],
  ["a characteristic on an injury that is not lasting", tap("p1", "injury", 1, { code: "dead", stat: "ag" }), /injury/],
  ["an injury with a key of its own beyond the code and the characteristic", tap("p1", "injury", 1, { code: "lasting", stat: "ag", retire: false }), /injury/],
  ["an injury that is not an object", tap("p1", "injury", 1, "dead"), /injury/],
  ["an injury on a counter that is not the injury", tap("p1", "touchdowns", 1, { code: "miss" }), /injury/],
  ["a counter the table does not have", tap("p1", "mvps"), /counter/],
  ["a counter the post-match has but nobody taps (crowd casualties)", tap("p1", "crowdCasualties"), /counter/],
  ["a delta of zero", tap("p1", "touchdowns", 0), /delta/],
  ["a delta of two", tap("p1", "touchdowns", 2), /delta/],
  ["a delta that is a string", tap("p1", "touchdowns", "1"), /delta/],
  ["a delta that is not a number", tap("p1", "touchdowns", Number.NaN), /delta/],
  ["no player", tap("", "touchdowns"), /player/],
];

for (const [name, row, message] of REFUSED) {
  test(`refused before anything is written: ${name}`, async () => {
    const db = fakeClient();
    await assert.rejects(writeMatchEvents(db, { teamId: "t1", pairingId: "g1", events: [tap("p1", "touchdowns"), row] }), message);
    assert.deepEqual(db.log, [], "the good row before the bad one is not written either");
  });
}

test("what the store accepts as an injury is what the domain reads back, the same", async () => {
  const readBack = (injury) => {
    const read = statisticsFromEvents({ players: [{ id: "p1" }] }, [tap("p1", "injury", 1, injury)]).injuries.p1;
    return read && { code: read.code, ...(read.stat && { stat: read.stat }) };
  };
  const candidates = [
    ...INJURIES.map((code) => ({ code })),
    ...INJURIES.flatMap((code) => PLAYER_STATS.map((stat) => ({ code, stat }))),
    { code: "lasting", stat: "ag", retire: false }, { code: "dead", retire: false },
    { code: "lasting", stat: "luck" }, { code: "eaten" }, {}, [], null,
  ];
  let accepted = 0;
  for (const injury of candidates) {
    const written = await writeMatchEvents(fakeClient(), { teamId: "t1", pairingId: "g1", events: [tap("p1", "injury", 1, injury)] }).then(() => true, () => false);
    assert.equal(written, sameValues(readBack(injury), injury), JSON.stringify(injury));
    accepted += written;
  }
  assert.equal(accepted, INJURIES.length - 2 + PLAYER_STATS.length); // the four plain ones and lasting with each characteristic
});

test("on a real database: the Players step reads back as entered, and saving it again writes nothing", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoFriendlies(client);
    const snapshot = { players: [{ id: "p1" }, { id: "journeyman-8" }] };
    const side = {
      team: { id: T1 },
      statistics: { p1: { ...normalizeMatchStats(), touchdowns: 2, casualties: 1 }, "journeyman-8": { ...normalizeMatchStats(), catches: 1 } },
      injuries: { p1: { code: "lasting", stat: "ag", retire: false } },
    };
    await client.query("BEGIN");
    await writeMatchEvents(client, { teamId: T1, pairingId: G1, actorId: U1, events: [tap("p1", "touchdowns"), tap("p1", "touchdowns"), tap("p1", "touchdowns")] });
    const tapped = (await loadMatchEvents(client, G1, [T1]))[T1];
    const now = await recordSideStatistics(client, G1, side, tapped, U1);
    await client.query("COMMIT");
    const stored = (await loadMatchEvents(client, G1, [T1]))[T1];
    assert.deepEqual(stored, now, "what recordSideStatistics hands back is what the table holds");
    assert.equal(stored.length, 3 + 1 + 1 + 1 + 1); // three taps, one taken back, a casualty, a catch, the injury
    const read = statisticsFromEvents(snapshot, stored);
    assert.deepEqual(read.statistics, side.statistics);
    assert.deepEqual(read.injuries, side.injuries);
    await client.query("BEGIN");
    assert.deepEqual(await recordSideStatistics(client, G1, side, stored, U1), stored);
    await client.query("COMMIT");
    assert.equal((await client.query("SELECT count(*)::int AS n FROM match_events")).rows[0].n, stored.length);
    assert.ok((await client.query("SELECT created_by FROM match_events")).rows.every((row) => row.created_by === U1));
  });
});

test("on a real database: a rolled-back transaction leaves no events and settles none", { skip: scratchSkip }, async () => {
  await withScratchDatabase(async ({ client }) => {
    await twoFriendlies(client);
    await client.query("BEGIN");
    await writeMatchEvents(client, { teamId: T1, pairingId: G1, events: [tap("p1", "touchdowns")] });
    await client.query("ROLLBACK");
    assert.deepEqual((await loadMatchEvents(client, G1, [T1]))[T1], []);
    await writeMatchEvents(client, { teamId: T1, pairingId: G1, events: [tap("p1", "touchdowns")] });
    await client.query("BEGIN");
    assert.equal(await settleMatchEvents(client, { teamId: T1, pairingId: G1 }), 1);
    await client.query("ROLLBACK");
    assert.deepEqual((await loadMatchEvents(client, G1, [T1]))[T1], [tap("p1", "touchdowns")]);
  });
});
