import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { EVENT_COUNTERS, applyOutsideEdits, careerCounters, eventTotal, eventsDiff, isValidEventInjury, sppEdits, statisticsFromEvents } from "../src/domain/post-match/events.mjs";
import { INJURIES, POST_STATS } from "../src/domain/post-match/rules.mjs";
import { normalizeMatchStats } from "../src/domain/post-match/statistics.mjs";
import { normalizeSppCounters } from "../src/domain/roster/players.mjs";
import { PLAYER_STATS } from "../src/domain/roster/values.mjs";
import { sppCounterDefinitions } from "../src/domain/league-rules.mjs";

const snapshot = { players: [{ id: "p1" }, { id: "p2" }, { id: "journeyman-8", kind: "journeyman" }, { id: "star-griff", kind: "star" }] };
const tap = (playerId, counter, delta = 1) => ({ playerId, counter, delta, injury: null, settledAt: null });
const hurt = (playerId, code, delta = 1, stat) => ({ ...tap(playerId, "injury", delta), injury: stat ? { code, stat } : { code } });
const stats = (values = {}) => ({ ...normalizeMatchStats(), ...values });
const injuriesOf = (...events) => statisticsFromEvents(snapshot, events).injuries;

test("the counters are the ones 014 allows: the SPP counters without the MVP, plus injury", () => {
  const sql = readFileSync(new URL("../server/db/migrations/014_match_events.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(counter IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...EVENT_COUNTERS]);
  const counted = EVENT_COUNTERS.filter((counter) => counter !== "injury");
  assert.deepEqual(counted, sppCounterDefinitions.map(([key]) => key).filter((key) => key !== "mvps"));
  assert.ok(counted.every((counter) => POST_STATS.includes(counter)));
});

test("every snapshot player starts at zero, taps add up, and a tap taken back cancels", () => {
  const { statistics, injuries } = statisticsFromEvents(snapshot,
    [tap("p1", "touchdowns"), tap("p1", "touchdowns"), tap("p1", "touchdowns", -1), tap("p2", "casualties")]);
  assert.deepEqual(Object.keys(statistics), ["p1", "p2", "journeyman-8", "star-griff"]);
  assert.deepEqual(statistics.p1, stats({ touchdowns: 1 }));
  assert.deepEqual(statistics.p2, stats({ casualties: 1 }));
  assert.deepEqual(statistics["journeyman-8"], stats());
  assert.deepEqual(injuries, {});
});

test("a journeyman and a star exist only in the snapshot and are counted; a player outside it is not", () => {
  const { statistics } = statisticsFromEvents(snapshot, [tap("journeyman-8", "touchdowns"), tap("star-griff", "casualties"), tap("ghost", "touchdowns")]);
  assert.equal(statistics["journeyman-8"].touchdowns, 1);
  assert.equal(statistics["star-griff"].casualties, 1);
  assert.equal(Object.hasOwn(statistics, "ghost"), false);
});

test("more taps taken back than given read as zero, and a counter the table does not have is not read", () => {
  const { statistics } = statisticsFromEvents(snapshot, [tap("p1", "touchdowns", -1), tap("p1", "mvps"), tap("p1", "crowdCasualties")]);
  assert.deepEqual(statistics.p1, stats());
});

test("the injury is the latest one still standing: taking one back uncovers the one before", () => {
  assert.deepEqual(injuriesOf(hurt("p1", "miss")), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "dead")), { p1: { code: "dead", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "dead"), hurt("p1", "dead", -1)), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "dead"), hurt("p1", "miss"), hurt("p1", "dead"), hurt("p1", "dead", -1)), { p1: { code: "miss", retire: false } });
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "miss", -1)), {});
  assert.deepEqual(injuriesOf(hurt("p1", "miss", -1)), {});
  assert.deepEqual(injuriesOf(hurt("p1", "lasting", 1, "ag"), hurt("p1", "lasting", -1, "ma")), { p1: { code: "lasting", stat: "ag", retire: false } });
});

test("an injury that is not one is not read: none, an unknown code, lasting without a stat, no injury at all", () => {
  assert.deepEqual(injuriesOf(hurt("p1", "none"), hurt("p1", "eaten"), hurt("p1", "lasting"), hurt("p1", "lasting", 1, "luck"), tap("p1", "injury")), {});
  assert.deepEqual(injuriesOf(hurt("p1", "miss", 1, "ag")), { p1: { code: "miss", retire: false } });
});

test("an injury is valid as stored only when it reads back as itself: no null, no stray key, no stat but on a lasting one", () => {
  assert.equal(isValidEventInjury({ code: "dead" }), true);
  assert.equal(isValidEventInjury({ code: "lasting", stat: "ag" }), true);
  for (const value of [null, undefined, "dead", [], {}, { code: "none" }, { code: "eaten" }, { code: "lasting" }, { code: "lasting", stat: "luck" },
    { code: "dead", stat: "ag" }, { code: "dead", retire: false }, { code: "lasting", stat: "ag", retire: false }]) {
    assert.equal(isValidEventInjury(value), false, JSON.stringify(value));
  }
});

test("the saved numbers written back as a difference make the events read exactly as saved, and a second difference is empty", () => {
  const events = [tap("p1", "touchdowns"), tap("p1", "touchdowns"), tap("p1", "touchdowns", -1), tap("p2", "touchdowns", -1),
    hurt("p1", "miss"), hurt("p1", "dead"), hurt("p2", "niggling"), tap("ghost", "touchdowns")];
  const saved = { statistics: { p1: stats({ touchdowns: 3, completions: 1 }), p2: stats(), "journeyman-8": stats({ catches: 2 }), "star-griff": stats() },
    injuries: { p1: { code: "lasting", stat: "ma", retire: true }, p2: { code: "none" } } };
  const diff = eventsDiff(saved, events);
  assert.ok(diff.every((event) => event.delta === 1 || event.delta === -1));
  const after = statisticsFromEvents(snapshot, [...events, ...diff]);
  assert.deepEqual(after.statistics, saved.statistics);
  assert.deepEqual(after.injuries, { p1: { code: "lasting", stat: "ma", retire: false } });
  assert.deepEqual(eventsDiff(saved, [...events, ...diff]), []);
  assert.ok(!diff.some((event) => event.playerId === "ghost"));
});

test("the difference is as small as it can be: agreement writes nothing, one touchdown fewer writes one -1, three more write three +1", () => {
  const events = [tap("p1", "touchdowns"), tap("p1", "touchdowns")];
  const seeded = statisticsFromEvents(snapshot, events);
  assert.deepEqual(eventsDiff(seeded, events), []);
  seeded.statistics.p1.touchdowns = 1;
  assert.deepEqual(eventsDiff(seeded, events), [{ playerId: "p1", counter: "touchdowns", delta: -1 }]);
  seeded.statistics.p1.touchdowns = 5;
  assert.deepEqual(eventsDiff(seeded, events), Array.from({ length: 3 }, () => ({ playerId: "p1", counter: "touchdowns", delta: 1 })));
});

test("crowd and foul casualties are not counters: the difference leaves them alone", () => {
  const saved = { statistics: { p1: stats({ casualties: 1, crowdCasualties: 1 }) }, injuries: {} };
  assert.deepEqual(eventsDiff(saved, []), [{ playerId: "p1", counter: "casualties", delta: 1 }]);
});

test("an injury changed on the Players step takes back only what stands above the one wanted", () => {
  const events = [hurt("p1", "miss"), hurt("p1", "dead")];
  const wanted = (injury) => ({ statistics: { p1: stats() }, injuries: injury ? { p1: injury } : {} });
  const back = (code) => ({ playerId: "p1", counter: "injury", delta: -1, injury: { code } });
  assert.deepEqual(eventsDiff(wanted({ code: "dead", retire: false }), events), []);
  assert.deepEqual(eventsDiff(wanted({ code: "miss" }), events), [back("dead")]);
  assert.deepEqual(eventsDiff(wanted(null), events), [back("dead"), back("miss")]);
  assert.deepEqual(eventsDiff(wanted({ code: "none" }), events), [back("dead"), back("miss")]);
  assert.deepEqual(eventsDiff(wanted({ code: "lasting", stat: "st", retire: true }), events),
    [back("dead"), back("miss"), { playerId: "p1", counter: "injury", delta: 1, injury: { code: "lasting", stat: "st" } }]);
});

test("career is the blob plus what is not settled yet; a settled event is already in the blob", () => {
  const player = { id: "p1", spp: { touchdowns: 2, mvps: 1 } };
  const events = [tap("p1", "touchdowns"), { ...tap("p1", "touchdowns"), settledAt: "2026-10-16T18:00:00Z" },
    tap("p2", "touchdowns"), hurt("p1", "dead"), { ...tap("p1", "casualties"), pairingId: null }];
  assert.deepEqual(careerCounters(player, events), { ...normalizeSppCounters(), touchdowns: 3, casualties: 1, mvps: 1 });
  assert.equal(careerCounters({ id: "p1", spp: {} }, [tap("p1", "touchdowns", -1)]).touchdowns, 0);
  assert.deepEqual(careerCounters({ id: "p9" }), normalizeSppCounters());
});

// What the database lets a row be: 014's CHECKs, plus the shape the domain promises on top of them
// (the injury column is filled for the injury counter and only for it, always a valid {code, stat?}).
function assertRowsFit(rows) {
  for (const row of rows) {
    assert.deepEqual(Object.keys(row).filter((key) => !["playerId", "counter", "delta", "injury"].includes(key)), []);
    assert.ok(EVENT_COUNTERS.includes(row.counter), `counter ${row.counter}`);
    assert.ok(row.delta === 1 || row.delta === -1, `delta ${row.delta}`);
    if (row.counter !== "injury") { assert.equal(Object.hasOwn(row, "injury"), false); continue; }
    const { code, stat } = row.injury;
    assert.ok(INJURIES.includes(code) && code !== "none", `injury code ${code}`);
    assert.deepEqual(Object.keys(row.injury), code === "lasting" ? ["code", "stat"] : ["code"]);
    if (code === "lasting") assert.ok(PLAYER_STATS.includes(stat), `injury stat ${stat}`);
  }
}

test("the difference writes nothing the table would refuse, whatever the saved side carries", () => {
  const messy = { ...stats({ touchdowns: 2, casualties: 3, crowdCasualties: 2, foulCasualties: 1 }), mvps: 4, stray: 7, injury: 2 };
  const saved = { statistics: { p1: messy, p2: stats(), "journeyman-8": stats() },
    injuries: { p1: { code: "lasting", stat: "luck" }, p2: { code: "eaten" }, "journeyman-8": { code: "lasting", stat: "pa" } } };
  const events = [hurt("p1", "miss"), { ...tap("p2", "casualties"), injury: { code: "dead" } }, hurt("p2", "niggling")];
  const diff = eventsDiff(saved, events);
  assertRowsFit(diff);
  assert.deepEqual(diff.filter((row) => row.playerId === "p1" && row.counter !== "injury").map((row) => row.counter),
    ["touchdowns", "touchdowns", "casualties", "casualties", "casualties"]);
  assert.deepEqual(diff.filter((row) => row.counter === "injury"), [
    { playerId: "p1", counter: "injury", delta: -1, injury: { code: "miss" } },
    { playerId: "p2", counter: "injury", delta: -1, injury: { code: "niggling" } },
    { playerId: "journeyman-8", counter: "injury", delta: 1, injury: { code: "lasting", stat: "pa" } }]);
  assert.ok(diff.every((row) => !["mvps", "stray", "crowdCasualties", "foulCasualties"].includes(row.counter)));
});

test("an injury stray on a counter that is not the injury is not read, and a step that is not one is not read", () => {
  const stray = { ...tap("p1", "touchdowns"), injury: { code: "dead" } };
  assert.deepEqual(injuriesOf(stray, { ...tap("p1", "casualties"), injury: { code: "miss" } }), {});
  const { statistics } = statisticsFromEvents(snapshot, [stray, tap("p1", "touchdowns", 2), tap("p1", "touchdowns", 0), tap("p1", "touchdowns", "1")]);
  assert.equal(statistics.p1.touchdowns, 1);
  assert.deepEqual(injuriesOf(hurt("p1", "miss"), hurt("p1", "dead", 0)), { p1: { code: "miss", retire: false } });
});

test("a saved number outside 0..99 is refused, as everywhere in the post-match", () => {
  const events = [];
  assert.throws(() => eventsDiff({ statistics: { p1: stats({ touchdowns: 100 }) }, injuries: {} }, events), { code: "POST_VALUE" });
  assert.throws(() => eventsDiff({ statistics: { p1: stats({ touchdowns: -1 }) }, injuries: {} }, events), { code: "POST_VALUE" });
  assert.throws(() => eventsDiff({ statistics: { p1: stats({ touchdowns: 1.5 }) }, injuries: {} }, events), { code: "POST_VALUE" });
});

test("a counter is read clamped but written back from the raw sum, so what the clamp hid is taken back too", () => {
  const events = Array.from({ length: 102 }, () => tap("p1", "touchdowns"));
  assert.equal(statisticsFromEvents(snapshot, events).statistics.p1.touchdowns, 99);
  const saved = { statistics: { p1: stats({ touchdowns: 99 }) }, injuries: {} };
  const diff = eventsDiff(saved, events);
  assert.deepEqual(diff, Array.from({ length: 3 }, () => ({ playerId: "p1", counter: "touchdowns", delta: -1 })));
  assert.deepEqual(eventsDiff(saved, [...events, ...diff]), []);
});

test("for any events and any saved numbers: the difference makes them agree, and a second one is empty", () => {
  let seed = 20261016;
  const next = (below) => { seed = (seed * 48271) % 2147483647; return seed % below; };
  const codes = INJURIES.filter((code) => code !== "none");
  const ids = ["p1", "p2", "journeyman-8", "star-griff", "ghost"];
  for (let round = 0; round < 200; round += 1) {
    const events = Array.from({ length: next(14) }, () => {
      const playerId = ids[next(ids.length)], delta = next(2) ? 1 : -1;
      if (next(3)) return tap(playerId, EVENT_COUNTERS[next(EVENT_COUNTERS.length - 1)], delta);
      const code = codes[next(codes.length)];
      return hurt(playerId, code, delta, code === "lasting" ? PLAYER_STATS[next(PLAYER_STATS.length)] : undefined);
    });
    const savedStats = Object.fromEntries(snapshot.players.map(({ id }) => [id, stats(Object.fromEntries(EVENT_COUNTERS.slice(0, 9).map((counter) => [counter, next(4)])))]));
    const savedInjuries = {};
    for (const { id } of snapshot.players) {
      const pick = next(codes.length + 2);
      if (pick < codes.length) savedInjuries[id] = codes[pick] === "lasting" ? { code: "lasting", stat: PLAYER_STATS[next(5)], retire: false } : { code: codes[pick], retire: false };
    }
    const saved = { statistics: savedStats, injuries: savedInjuries };
    const diff = eventsDiff(saved, events);
    assertRowsFit(diff);
    const after = statisticsFromEvents(snapshot, [...events, ...diff]);
    assert.deepEqual(after.statistics, savedStats);
    assert.deepEqual(after.injuries, savedInjuries);
    assert.deepEqual(eventsDiff(saved, [...events, ...diff]), []);
  }
});

test("an edit to the roster's SPP is the steps between the two counters, without the MVP and without players who came or went", () => {
  const before = { players: [{ id: "a", spp: { touchdowns: 1, mvps: 0 } }, { id: "gone", spp: { touchdowns: 5 } }, { rowIndex: 0, spp: {} }] };
  const after = { players: [{ id: "new", spp: { touchdowns: 3 } }, { id: "a", spp: { touchdowns: 3, casualties: 0, completions: 0, mvps: 2 } }] };
  const step = (delta) => ({ playerId: "a", counter: "touchdowns", delta, injury: null });
  assert.deepEqual(sppEdits(before, after), [step(1), step(1)]);
  assert.deepEqual(sppEdits(after, before), [step(-1), step(-1)]);
  assert.deepEqual(sppEdits(after, after), []);
});

test("an edit's steps come player by player in the new roster's order, each in the table's order of counters, from the counters as the roster reads them", () => {
  const before = { players: [{ id: "a", spp: { bonus: 1 } }, { id: "b", spp: { touchdowns: "2", casualties: -3 } }, { id: "c" }] };
  const after = { players: [{ id: "b", spp: { casualties: 1, touchdowns: 2 } }, { id: "c", spp: { landings: 1 } }, { id: "a", spp: { touchdowns: 1 } }] };
  assert.deepEqual(sppEdits(before, after).map((row) => [row.playerId, row.counter, row.delta]),
    [["b", "casualties", 1], ["c", "landings", 1], ["a", "touchdowns", 1], ["a", "bonus", -1]]);
  assert.deepEqual(sppEdits({}, after), [], "a roster with no players had nobody to edit");
  assert.deepEqual(sppEdits({ players: [{ rowIndex: 0, spp: {} }, { id: "", spp: {} }] }, { players: [{ rowIndex: 0, spp: { touchdowns: 9 } }, { id: "", spp: { bonus: 1 } }] }), [],
    "a player without an id is nobody's: there is no telling him from another");
});

test("edits outside a match reach the blob at the finish: summed per player, never below zero, the gone and the injured skipped", () => {
  const roster = { treasury: 5, players: [{ id: "a", spp: { touchdowns: 1, mvps: 1 } }, { id: "b", spp: {} }] };
  const edits = [tap("a", "touchdowns"), tap("a", "completions"), tap("b", "casualties", -1), tap("ghost", "touchdowns"), hurt("a", "dead")];
  const after = applyOutsideEdits(roster, edits);
  assert.deepEqual([after.players[0].spp.touchdowns, after.players[0].spp.completions, after.players[0].spp.mvps, after.players[1].spp.casualties], [2, 1, 1, 0]);
  assert.equal(roster.players[0].spp.touchdowns, 1, "the input is left alone");
});

test("edits outside a match change only the counters they step, and a player they do not name not at all", () => {
  const roster = { treasury: 5, players: [{ id: "a", spp: { touchdowns: 2, stray: 4 } }, { id: "b", name: "Bo" }] };
  const after = applyOutsideEdits(roster, [tap("a", "touchdowns", -1), tap("a", "catches"), tap("a", "catches", -1), tap("a", "touchdowns", 2)]);
  assert.deepEqual(after, { treasury: 5, players: [{ id: "a", spp: { touchdowns: 1, stray: 4 } }, { id: "b", name: "Bo" }] });
  assert.deepEqual(applyOutsideEdits(roster, []), roster);
});

test("a counter's total is the raw sum of one player's steps on it, below zero too, and nothing else", () => {
  const events = [tap("a", "touchdowns"), tap("a", "touchdowns", -1), tap("a", "touchdowns", -1), tap("b", "touchdowns"), tap("a", "completions"),
    tap("a", "touchdowns", 2), tap("a", "touchdowns", "1"), hurt("a", "dead")];
  assert.deepEqual([eventTotal(events, "a", "touchdowns"), eventTotal(events, "a", "completions"), eventTotal(events, "b", "touchdowns")], [-1, 1, 1]);
  assert.deepEqual([eventTotal(events, "ghost", "touchdowns"), eventTotal([], "a", "touchdowns")], [0, 0]);
});

test("an edit is counted from the stored counter held to 0…999 and cut to a whole number: a legacy value outside that changes the blob without rows", () => {
  // The rows, or how many there are when there are too many to compare one by one.
  const save = (from, to) => {
    const rows = sppEdits({ players: [{ id: "a", spp: { touchdowns: from } }] }, { players: [{ id: "a", spp: { touchdowns: to } }] });
    return rows.length > 10 ? `${rows.length} rows` : rows;
  };
  const step = (delta) => ({ playerId: "a", counter: "touchdowns", delta, injury: null });
  assert.deepEqual(save(5000, 999), [], "a legacy 5000 saved as 999");
  assert.deepEqual(save(5000, 997), [step(-1), step(-1)], "from 999, not from 5000");
  assert.deepEqual(save(2.5, 3), [step(1)], "from 2: the fraction was never a step");
  assert.deepEqual(save(2 ** 32 + 999, 999), [], "no RangeError: the save that fixes it goes through");
  assert.deepEqual(save(-4, 1), [step(1)]);
});
