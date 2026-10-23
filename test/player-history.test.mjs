import test from "node:test";
import assert from "node:assert/strict";

import { playerHistory } from "../src/domain/post-match/history.mjs";
import { careerCounters } from "../src/domain/post-match/events.mjs";
import { normalizeSppCounters } from "../src/domain/roster/players.mjs";

const tap = (playerId, counter, delta = 1, settledAt = null, injury = null) => ({ playerId, counter, delta, injury, settledAt });
const zero = normalizeSppCounters();
const match = (values) => ({ pairingId: "m", snapshot: null, application: null, post: null, gamesPlayed: 5, events: [], ...values });

test("a finished match is what the blob took in, MVP included; a live one is its taps, waiting; a match with neither has no details", () => {
  const { matches } = playerHistory("p", [
    match({ pairingId: "done", application: { before: { players: [{ id: "p", spp: { touchdowns: 1 } }] }, after: { players: [{ id: "p", spp: { touchdowns: 3, mvps: 1 } }] } } }),
    match({ pairingId: "live", snapshot: { players: [{ id: "p" }] }, events: [tap("p", "touchdowns"), tap("p", "touchdowns"), tap("p", "touchdowns", -1)] }),
    match({ pairingId: "old" })], []);
  assert.deepEqual(matches.map((row) => [row.pairingId, row.source, row.pending, row.played]), [["done", "applied", false, null], ["live", "events", true, true], ["old", "none", false, null]]);
  assert.deepEqual(matches[0].counters, { ...zero, touchdowns: 2, mvps: 1 });
  assert.deepEqual(matches[1].counters, { ...zero, touchdowns: 1 });
  assert.equal(matches[2].counters, null);
});

test("an injury in the history is the one the roster got: rookie protection with the side's games, from the post-match or from the taps", () => {
  const post = (gamesPlayed) => match({ post: { injuries: { p: { code: "dead", retire: false } }, gamesPlayed } });
  const [rookie, veteran, odd, tapped, healed] = playerHistory("p", [post(2), post(3), post("3"),
    match({ gamesPlayed: 1, events: [tap("p", "injury", 1, null, { code: "lasting", stat: "ag" })] }),
    match({ post: { injuries: {}, gamesPlayed: 9 } })], []).matches;
  assert.deepEqual([rookie.injury, veteran.injury, odd.injury, tapped.injury, healed.injury], [{ code: "badly-hurt" }, { code: "dead" }, { code: "badly-hurt" }, { code: "badly-hurt" }, null]);
});

test("a player who died in the match is not in the roster after it: his row comes from his taps; one not in the snapshot did not play", () => {
  const [row] = playerHistory("p", [match({ snapshot: { players: [{ id: "q" }] }, application: { before: { players: [{ id: "p", spp: {} }] }, after: { players: [] } },
    events: [tap("p", "casualties", 1, "2026-10-16T18:00:00Z")] })], []).matches;
  assert.deepEqual([row.source, row.counters.casualties, row.played], ["events", 1, false]);
});

test("edits outside a match are their own sum, and every row together is the career", () => {
  const blob = { id: "p", spp: { touchdowns: 3, mvps: 1 } }; // 2 TD + MVP from the finished match, 1 TD edited outside one
  const live = [tap("p", "touchdowns")], outside = [tap("p", "touchdowns", 1, "2026-10-16T18:00:00Z")];
  const history = playerHistory("p", [
    match({ application: { before: { players: [{ id: "p", spp: {} }] }, after: { players: [{ id: "p", spp: { touchdowns: 2, mvps: 1 } }] } } }),
    match({ snapshot: { players: [{ id: "p" }] }, events: live })], outside);
  assert.equal(history.outside.touchdowns, 1);
  const total = (key) => history.matches.reduce((sum, row) => sum + (row.counters?.[key] ?? 0), history.outside[key] ?? 0);
  const career = careerCounters(blob, [...live, ...outside]);
  assert.deepEqual([total("touchdowns"), total("mvps")], [career.touchdowns, career.mvps]);
});

test("an MVP edited by hand is a row outside the matches, so the rows add up to the career, MVP included", () => {
  const blob = { id: "p", spp: { touchdowns: 2, mvps: 2 } }; // the match gave two TD and an MVP; the coach added an MVP by hand
  const outside = [tap("p", "mvps", 1, "2026-10-19T10:00:00Z")];
  const history = playerHistory("p", [match({ application: { before: { players: [{ id: "p", spp: {} }] }, after: { players: [{ id: "p", spp: { touchdowns: 2, mvps: 1 } }] } } })], outside);
  assert.equal(history.outside.mvps, 1);
  const total = (key) => history.matches.reduce((sum, row) => sum + (row.counters?.[key] ?? 0), history.outside[key]);
  assert.deepEqual([total("touchdowns"), total("mvps")], [blob.spp.touchdowns, blob.spp.mvps]);
});

test("outside is the raw sum of the player's own edits outside a match on every counter of the rows — below zero too, settled or waiting — and a counter nobody edited is 0", () => {
  const { outside } = playerHistory("p", [], [tap("p", "touchdowns", -1), tap("p", "touchdowns", -1, "2026-10-16T18:00:00Z"), tap("p", "catches"), tap("q", "catches"),
    tap("p", "casualties", 1, "2026-10-16T18:00:00Z"), tap("p", "casualties", -1), tap("p", "casualties")]);
  assert.deepEqual(outside, { touchdowns: -2, casualties: 1, knockouts: 0, completions: 0, catches: 1, interceptions: 0, throws: 0, landings: 0, bonus: 0, mvps: 0 });
  assert.deepEqual(playerHistory("p", [], []).outside, { touchdowns: 0, casualties: 0, knockouts: 0, completions: 0, catches: 0, interceptions: 0, throws: 0, landings: 0, bonus: 0, mvps: 0 },
    "a player nobody edited has zeros, not a missing counter");
});

test("a player who is nowhere has every match row without details, not played where there is a roster to say so, and nothing outside", () => {
  const roster = { players: [{ id: "q", spp: { touchdowns: 5 } }] };
  const history = playerHistory("p", [
    match({ pairingId: "a", snapshot: { players: [{ id: "q" }] }, post: { injuries: { q: { code: "miss", retire: false } }, gamesPlayed: 9 }, application: { before: roster, after: roster } }),
    match({ pairingId: "b", events: [tap("q", "touchdowns")] }), match({ pairingId: "c" })], [tap("q", "bonus")]);
  assert.deepEqual(history.matches.map((row) => [row.pairingId, row.source, row.counters, row.injury, row.played, row.pending]),
    [["a", "none", null, null, false, false], ["b", "none", null, null, null, false], ["c", "none", null, null, null, false]]);
  assert.ok(Object.values(history.outside).every((sum) => sum === 0));
});

test("an applied row counts from zero when the player was not in the roster before, and reads the counters the way the roster does", () => {
  const [joined, odd] = playerHistory("p", [
    match({ application: { before: { players: [{ id: "q", spp: {} }] }, after: { players: [{ id: "p", spp: { casualties: 2, bonus: 1 } }] } } }),
    match({ application: { before: { players: [{ id: "p", spp: { touchdowns: "2", catches: "x" } }] }, after: { players: [{ id: "p", spp: { touchdowns: "5", mvps: 1 } }] } } })], []).matches;
  assert.deepEqual(joined.counters, { ...zero, casualties: 2, bonus: 1 });
  assert.deepEqual(odd.counters, { ...zero, touchdowns: 3, mvps: 1 });
});

test("a row waits for the finish only while the match has no application and one of the player's own taps is not settled; others' taps are not his", () => {
  const settled = "2026-10-16T18:00:00Z", snapshot = { players: [{ id: "p" }, { id: "q" }] };
  const rows = playerHistory("p", [
    match({ snapshot, events: [tap("p", "touchdowns", 1, settled), tap("p", "touchdowns")] }), match({ snapshot, events: [tap("p", "touchdowns", 1, settled)] }),
    match({ snapshot, events: [tap("q", "touchdowns")] }),
    match({ snapshot, events: [tap("p", "touchdowns")], application: { before: { players: [] }, after: { players: [] } } })], []).matches;
  assert.deepEqual(rows.map((row) => [row.source, row.pending]), [["events", true], ["events", false], ["none", false], ["events", false]]);
  assert.equal(rows[2].counters, null, "a tap of another player is no row of his");
});

test("an injury keeps its characteristic and loses the coach's retire flag; one the post-match holds for another player is not his", () => {
  const [lasting, bare, stray, absent] = playerHistory("p", [
    match({ post: { injuries: { p: { code: "lasting", stat: "ag", retire: true } }, gamesPlayed: 6 } }),
    match({ post: { injuries: { p: { code: "miss", stat: undefined, retire: false } }, gamesPlayed: 6 } }),
    match({ post: { injuries: { p: { code: "niggling", stat: "st", retire: false } }, gamesPlayed: 6 } }), // a characteristic the roster never takes
    match({ post: { injuries: { q: { code: "dead", retire: false } }, gamesPlayed: 6 } })], []).matches;
  assert.deepEqual([lasting.injury, bare.injury, stray.injury, absent.injury], [{ code: "lasting", stat: "ag" }, { code: "miss" }, { code: "niggling" }, null]);
});

test("a player is found by his own id only: one named like a property every object has has no injury, no taps and no counters", () => {
  for (const name of ["constructor", "toString", "hasOwnProperty", "valueOf", "__proto__"]) {
    const rows = playerHistory(name, [match({ gamesPlayed: 0, post: { injuries: {}, gamesPlayed: 0 } }), match({ gamesPlayed: 0 }),
      match({ gamesPlayed: 0, snapshot: { players: [{ id: "p" }] }, events: [tap("p", "injury", 1, null, { code: "dead" }), tap("p", "touchdowns")] })], []).matches;
    assert.deepEqual(rows.map((row) => [row.source, row.counters, row.injury, row.pending]), Array(3).fill(["none", null, null, false]), name);
  }
});

test("a finished match is what the blob took in even where his own taps say more: the post-match decides what counts, a technical result no touchdown", () => {
  const settled = "2026-10-16T18:00:00Z";
  const [row] = playerHistory("p", [match({ snapshot: { players: [{ id: "p" }] }, events: [tap("p", "touchdowns", 1, settled), tap("p", "touchdowns", 1, settled)],
    application: { before: { players: [{ id: "p", spp: {} }] }, after: { players: [{ id: "p", spp: { mvps: 1 } }] } } })], []).matches;
  assert.deepEqual([row.source, row.counters, row.pending], ["applied", { ...zero, mvps: 1 }, false]);
});
