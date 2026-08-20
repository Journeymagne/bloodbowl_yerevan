import test from "node:test";
import assert from "node:assert/strict";

import { ROSTER_SHAPES, classifyRosterShape, hasVestigialKeys } from "../src/domain/roster/shape.mjs";
import { ensureDraftPlayers } from "../src/domain/roster/players.mjs";

// The point of this module: tell, before deploying, whether removing support
// for the retired shapes would empty anyone's roster. So each case below is
// paired with what the app actually does with that blob.

const team = { team: { roster: [{ position: "Lineman", price: "50K", qty: "0-16", skills: [] }] } };

function playersAfterLoad(roster) {
  const draft = JSON.parse(JSON.stringify(roster));
  ensureDraftPlayers(team, draft);
  return draft.players.length;
}

test("a roster with players is current", () => {
  const roster = { players: [{ id: "a", rowIndex: 0 }], roster: { 0: 1 } };
  assert.equal(classifyRosterShape(roster).shape, ROSTER_SHAPES.CURRENT);
  assert.equal(playersAfterLoad(roster), 1);
});

test("the slots shape is retired and would read as empty", () => {
  const roster = { slots: [{ rowIndex: 0, name: "Old" }, null, null] };
  const verdict = classifyRosterShape(roster);
  assert.equal(verdict.shape, ROSTER_SHAPES.RETIRED);
  assert.equal(verdict.slots, 1);
  assert.equal(playersAfterLoad(roster), 0, "this is exactly the loss the script warns about");
});

test("the counts plus playerEdits shape is retired and would read as empty", () => {
  const roster = { roster: { 0: 2 }, playerEdits: { "0-0": { name: "A" }, "0-1": { name: "B" } } };
  const verdict = classifyRosterShape(roster);
  assert.equal(verdict.shape, ROSTER_SHAPES.RETIRED);
  assert.equal(verdict.edits, 2);
  assert.equal(verdict.counts, 1);
  assert.equal(playersAfterLoad(roster), 0);
});

test("counts alone, without edits, still count as retired", () => {
  const verdict = classifyRosterShape({ roster: { 0: 3 } });
  assert.equal(verdict.shape, ROSTER_SHAPES.RETIRED);
});

test("an untouched new team is empty, not retired", () => {
  for (const roster of [
    {},
    { players: [] },
    { players: [], roster: {} },
    { players: [], roster: { 0: 0 }, playerEdits: {} },
    null,
    undefined,
  ]) {
    assert.equal(classifyRosterShape(roster).shape, ROSTER_SHAPES.EMPTY, JSON.stringify(roster));
  }
});

test("leftover keys next to real players are vestigial, not retired", () => {
  const roster = {
    players: [{ id: "a", rowIndex: 0 }],
    roster: { 0: 1 },
    playerEdits: { "0-0": { name: "stale" } },
    slots: [{ rowIndex: 0 }],
  };
  assert.equal(classifyRosterShape(roster).shape, ROSTER_SHAPES.CURRENT);
  assert.equal(hasVestigialKeys(roster), true);
  assert.equal(playersAfterLoad(roster), 1, "the stale keys change nothing");
});

test("garbage in the column does not crash the check", () => {
  for (const roster of ["", 0, [], "not json", { players: "nope" }, { slots: "nope" }, { playerEdits: [] }]) {
    const verdict = classifyRosterShape(roster);
    assert.ok(Object.values(ROSTER_SHAPES).includes(verdict.shape), JSON.stringify(roster));
  }
});
