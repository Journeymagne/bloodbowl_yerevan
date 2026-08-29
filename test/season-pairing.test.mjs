import assert from "node:assert/strict";
import test from "node:test";

import { pairRound, takeByeEntry } from "../server/season/pairing.mjs";

const entries = (...ids) => ids.map((id) => ({ id }));

/** `["a:b", "c:d"]` — who has already played whom. */
function history(...pairs) {
  const met = new Map();
  for (const pair of pairs) {
    const [one, two] = pair.split(":");
    if (!met.has(one)) met.set(one, new Set());
    if (!met.has(two)) met.set(two, new Set());
    met.get(one).add(two);
    met.get(two).add(one);
  }
  return met;
}

const asText = (result) => result.pairs.map(([home, away]) => `${home.id}:${away.id}`);

test("a first round pairs straight down the standings", () => {
  const result = pairRound(entries("a", "b", "c", "d"), history());
  assert.deepEqual(asText(result), ["a:b", "c:d"]);
  assert.equal(result.rematches, 0);
});

test("a rematch at the top is avoided rather than accepted", () => {
  // The greedy pass paired a:b here — a rematch — and then c:d.
  const result = pairRound(entries("a", "b", "c", "d"), history("a:b"));
  assert.deepEqual(asText(result), ["a:c", "b:d"]);
  assert.equal(result.rematches, 0);
});

test("it backs up when the obvious choice strands somebody", () => {
  // a may play c or d; b has played everyone but d. Taking a:c first works
  // only if b:d is then possible — it is. Taking a:d strands b.
  const result = pairRound(entries("a", "b", "c", "d"), history("a:b", "b:c"));
  assert.deepEqual(asText(result), ["a:c", "b:d"]);
  assert.equal(result.rematches, 0);
});

test("six coaches where five have played each other", () => {
  const met = history("a:b", "a:c", "a:d", "a:e", "b:c", "b:d", "b:e", "c:d", "c:e", "d:e");
  const result = pairRound(entries("a", "b", "c", "d", "e", "f"), met);
  // Only f has anyone left to play, so two of the three pairs must repeat.
  // No search can do better; what matters is that the number is reported.
  assert.equal(result.pairs.length, 3);
  assert.equal(result.rematches, 2);
  assert.equal(result.exhaustive, true);
});

test("when everybody has played everybody, it says how many rematches", () => {
  const met = history("a:b", "a:c", "a:d", "b:c", "b:d", "c:d");
  const result = pairRound(entries("a", "b", "c", "d"), met);
  assert.deepEqual(asText(result), ["a:b", "c:d"], "standings order, so the round is at least consistent");
  assert.equal(result.rematches, 2);
  assert.equal(result.exhaustive, true, "the tree was small enough to prove it");
});

test("a search that ran out of budget says so rather than claiming proof", () => {
  const result = pairRound(entries("a", "b", "c", "d"), history(), { budget: 0 });
  assert.equal(result.exhaustive, false);
  // It still returns a round: standings order, with any repeats counted.
  assert.deepEqual(asText(result), ["a:b", "c:d"]);
  assert.equal(result.rematches, 0);
});

test("the bye goes to the lowest-placed coach who has not had one", () => {
  const { bye, rest } = takeByeEntry(entries("a", "b", "c", "d", "e"), new Set(["e"]));
  assert.equal(bye.id, "d");
  assert.deepEqual(rest.map((entry) => entry.id), ["a", "b", "c", "e"]);
});

test("when everybody has had a bye it goes to the bottom of the table", () => {
  const { bye } = takeByeEntry(entries("a", "b", "c"), new Set(["a", "b", "c"]));
  assert.equal(bye.id, "c");
});

test("an even round has no bye", () => {
  const { bye, rest } = takeByeEntry(entries("a", "b"), new Set());
  assert.equal(bye, null);
  assert.equal(rest.length, 2);
});
