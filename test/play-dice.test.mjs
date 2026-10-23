import test from "node:test";
import assert from "node:assert/strict";
import { getPlayer, record, BLOCK_FACES } from "../src/play/model.mjs";
import { createMatch } from "./helpers/play-state.mjs";
import { applyCommand, actingSide } from "../src/play/engine.mjs";
import { rerollOptions } from "../src/play/rolls.mjs";
import { diceFace } from "../src/play/dice-faces.mjs";

const neverRandom = () => { throw new Error("Randomness before confirmation"); };
const step = (s, type, rest = {}) => applyCommand(s, { type, ...rest }, neverRandom);
const throwDice = (s, ...values) => {
  let i = 0;
  const sides = s.pending.request.sides;
  const next = applyCommand(s, { type: "confirmRoll" }, () => {
    assert.ok(i < values.length, "no additional dice may be rolled");
    return (values[i++] - .5) / sides;
  });
  assert.equal(i, values.length);
  return next;
};
function isolated(...ids) {
  const s = createMatch();
  for (const p of s.players) if (!ids.includes(p.id)) p.status = "casualty";
  return s;
}
function blockState(attack = 3, defense = 3) {
  const s = isolated("0-0", "1-0");
  Object.assign(getPlayer(s, "0-0"), { st: attack, x: 9, y: 5 });
  Object.assign(getPlayer(s, "1-0"), { st: defense, x: 10, y: 5 });
  return step(s, "block", { id: "0-0", target: "1-0" });
}

test("a free die requires a throw and result confirmation; forged faces and repeated throws are rejected", () => {
  const initial = createMatch(), before = structuredClone(initial);
  let s = step(initial, "roll");
  assert.equal(s.pending.stage, "ready");
  assert.equal(s.rollCount, 0);
  assert.deepEqual(initial, before);
  for (const type of ["acceptRoll", "endTurn", "selectReroll", "chooseBlock"]) assert.throws(() => step(s, type));
  s = applyCommand(s, { type: "confirmRoll", values: [6], state: { score: [9, 9] } }, () => 0);
  assert.deepEqual(s.pending.entry.values, [1]);
  assert.equal(s.pending.stage, "result");
  assert.deepEqual(s.score, [0, 0]);
  assert.throws(() => step(s, "confirmRoll"));
  assert.throws(() => step(s, "selectReroll", { source: "Team" }));
  assert.equal(step(s, "acceptRoll").pending, null);
});

test("pass and catch pause separately, consuming no unseen randomness or premature SPP", () => {
  let s = isolated("0-5", "0-4");
  Object.assign(getPlayer(s, "0-4"), { x: 10, y: 8 });
  s = step(s, "throw", { id: "0-5", target: "0-4", action: "pass" });
  assert.equal(s.pending.request.label, "Pass");
  s = throwDice(s, 6);
  assert.equal(s.ball.carrier, "0-5");
  s = step(s, "acceptRoll");
  assert.equal(s.pending.request.label, "Catch");
  assert.equal(s.rollCount, 1);
  assert.equal(s.ball.carrier, null);
  assert.equal(getPlayer(s, "0-5").spp, 0);
  s = throwDice(s, 6);
  s = step(s, "acceptRoll");
  assert.equal(s.ball.carrier, "0-4");
  assert.equal(getPlayer(s, "0-5").spp, 1);
  assert.equal(s.rollCount, 2);
});

test("block pool uses 1, 2 or 3 custom dice and the attacker decides rerolls before the defender chooses", () => {
  for (const [attack, defense, count, chooser] of [[3,3,1,0], [4,3,2,0], [7,3,3,0], [3,7,3,1]]) {
    let s = blockState(attack, defense);
    assert.equal(s.pending.request.count, count);
    assert.equal(s.pending.request.kind, "block");
    assert.equal(actingSide(s), 0);
    s = throwDice(s, ...Array(count).fill(3));
    assert.deepEqual(rerollOptions(s), ["Team"]);
    assert.throws(() => step(s, "chooseBlock", { index: 0 }));
    s = step(s, "acceptRoll");
    assert.equal(s.pending.type, "block");
    assert.equal(actingSide(s), chooser);
    assert.deepEqual(s.pending.faces, Array(count).fill("push"));
    assert.throws(() => step(s, "selectReroll", { source: "Team" }));
  }
  assert.deepEqual(BLOCK_FACES, ["skull", "both", "push", "push", "stumble", "pow"]);
  assert.equal(new Set([...new Set(BLOCK_FACES)].map(face => diceFace("block", face))).size, 5);
});

test("selecting or cancelling a reroll spends nothing; confirmation rerolls the entire pool exactly once", () => {
  let s = throwDice(blockState(7, 3), 1, 2, 6);
  s = step(s, "selectReroll", { source: "Team" });
  assert.equal(s.rerolls[0], 2);
  assert.equal(s.rollCount, 3);
  s = step(s, "cancelReroll");
  assert.deepEqual(s.pending.entry.values, [1, 2, 6]);
  s = step(s, "selectReroll", { source: "Team" });
  s = throwDice(s, 3, 4, 5);
  assert.equal(s.rerolls[0], 1);
  assert.equal(s.rollCount, 6);
  assert.deepEqual(rerollOptions(s), []);
  assert.throws(() => step(s, "selectReroll", { source: "Team" }));
  assert.throws(() => step(s, "confirmRoll"));
  s = step(s, "acceptRoll");
  assert.equal(s.rerolls[0], 1);
  assert.equal(s.rollCount, 6);
  assert.deepEqual(s.pending.faces, ["push", "push", "stumble"]);
});

test("follow-up is decided and moved before armour and injury, without exposing either roll", () => {
  let s = throwDice(blockState(), 6);
  s = step(s, "acceptRoll");
  s = step(s, "chooseBlock", { index: 0 });
  s = step(s, "push", { x: 11, y: 5 });
  assert.equal(s.pending.type, "follow");
  assert.equal(s.rollCount, 1);
  assert.equal(getPlayer(s, "0-0").x, 9);
  assert.equal(getPlayer(s, "1-0").x, 11);
  assert.equal(getPlayer(s, "1-0").status, "standing");
  assert.throws(() => step(s, "confirmRoll"));
  s = step(s, "follow", { follow: true });
  assert.equal(getPlayer(s, "0-0").x, 10);
  assert.equal(s.pending.request.label, "Armour");
  assert.equal(s.pending.request.count, 2);
  s = throwDice(s, 6, 6);
  assert.equal(getPlayer(s, "1-0").status, "prone");
  assert.deepEqual(rerollOptions(s), []);
  s = step(s, "acceptRoll");
  assert.equal(s.pending.request.label, "Injury");
  assert.equal(s.pending.request.count, 2);
  assert.equal(s.rollCount, 3);
  s = throwDice(s, 5, 5);
  assert.equal(getPlayer(s, "1-0").status, "prone");
  s = step(s, "acceptRoll");
  assert.equal(s.pending, null);
  assert.equal(getPlayer(s, "1-0").status, "casualty");
  assert.equal(getPlayer(s, "0-0").spp, 2);
  assert.equal(s.rollCount, 5);
});

test("declining follow-up keeps the attacker in place while resolving the knockdown", () => {
  let s = step(throwDice(blockState(), 6), "acceptRoll");
  s = step(s, "chooseBlock", { index: 0 });
  s = step(s, "push", { x: 11, y: 5 });
  s = step(s, "follow", { follow: false });
  assert.equal(s.pending.request.label, "Armour");
  assert.equal(getPlayer(s, "0-0").x, 9);
  s = step(throwDice(s, 1, 1), "acceptRoll");
  assert.equal(s.pending, null);
  assert.equal(getPlayer(s, "0-0").x, 9);
  assert.equal(getPlayer(s, "1-0").status, "prone");
});

test("follow-up precedes crowd injury and a pushed loose-ball bounce", () => {
  for (const crowd of [true, false]) {
    let s = isolated("0-0", "1-0");
    const attackerX = crowd ? 18 : 9, defenderX = attackerX + 1;
    Object.assign(getPlayer(s, "0-0"), { x: attackerX, y: 5 });
    Object.assign(getPlayer(s, "1-0"), { x: defenderX, y: 5 });
    s.ball = { carrier: null, x: 11, y: 5 };
    s = step(s, "block", { id: "0-0", target: "1-0" });
    s = step(throwDice(s, 3), "acceptRoll");
    s = step(s, "chooseBlock", { index: 0 });
    s = step(s, "push", { x: defenderX + 1, y: 5 });
    assert.equal(s.pending.type, "follow");
    assert.equal(s.rollCount, 1);
    if (crowd) assert.equal(getPlayer(s, "1-0").status, "crowd");
    s = step(s, "follow", { follow: true });
    assert.equal(getPlayer(s, "0-0").x, defenderX);
    assert.equal(s.pending.request.label, crowd ? "Crowd injury" : "Bounce D8");
    s = step(crowd ? throwDice(s, 5, 5) : throwDice(s, 5), "acceptRoll");
    assert.equal(s.pending, null);
    if (crowd) assert.equal(getPlayer(s, "1-0").status, "casualty");
    else assert.deepEqual(s.ball, { carrier: null, x: 12, y: 5 });
  }
});

test("a knocked-down carrier drops the ball only after the follow-up position is committed", () => {
  let s = isolated("0-0", "1-0");
  Object.assign(getPlayer(s, "0-0"), { x: 9, y: 5 });
  Object.assign(getPlayer(s, "1-0"), { x: 10, y: 5 });
  s.ball = { carrier: "1-0", x: 10, y: 5 };
  s = step(s, "block", { id: "0-0", target: "1-0" });
  s = step(throwDice(s, 6), "acceptRoll");
  s = step(s, "chooseBlock", { index: 0 });
  s = step(s, "push", { x: 11, y: 5 });
  assert.equal(s.pending.type, "follow");
  assert.equal(s.ball.carrier, "1-0");
  s = step(s, "follow", { follow: true });
  assert.equal(s.pending.request.label, "Bounce D8");
  assert.equal(getPlayer(s, "0-0").x, 10);
  s = step(throwDice(s, 4), "acceptRoll");
  assert.equal(s.pending.request.label, "Bounce catch");
  assert.equal(s.pending.request.player, "0-0");
  s = step(throwDice(s, 6), "acceptRoll");
  assert.equal(s.ball.carrier, "0-0");
  assert.equal(s.pending.request.label, "Armour");
});

test("a saved/reconnected pending roll resumes with identical dice and preserves chat without duplicating it", () => {
  let s = throwDice(blockState(), 3);
  record(s, "Orcs: keep the push?", "chat");
  s.version++;
  const restored = JSON.parse(JSON.stringify(s));
  const next = step(restored, "acceptRoll");
  assert.deepEqual(next.pending.faces, ["push"]);
  assert.equal(next.rollCount, 1);
  assert.equal(next.version, s.version + 1);
  assert.equal(next.log.filter(e => e.text === "Orcs: keep the push?").length, 1);
  assert.equal(next.log.filter(e => e.text === "Block: Push.").length, 1);
});

test("Dodge skill is optional, only works once per turn, and cannot reroll an already rerolled die", () => {
  let s = isolated("0-5", "1-0");
  Object.assign(getPlayer(s, "0-5"), { skills: ["Dodge"] });
  Object.assign(getPlayer(s, "1-0"), { x: 7, y: 8 });
  s = step(s, "move", { id: "0-5", action: "move", x: 7, y: 9 });
  s = throwDice(s, 1);
  assert.deepEqual(rerollOptions(s), ["Dodge", "Team"]);
  s = step(s, "selectReroll", { source: "Dodge" });
  s = throwDice(s, 6);
  assert.equal(getPlayer(s, "0-5").dodgeUsed, true);
  assert.deepEqual(rerollOptions(s), []);
  s = step(s, "acceptRoll");
  s = step(s, "move", { id: "0-5", x: 8, y: 9, action: "move" });
  s = throwDice(s, 1);
  assert.deepEqual(rerollOptions(s), ["Team"]);
});

test("kickoff distance and direction are separately confirmed D6 and D8", () => {
  let s = createMatch();
  s.turn = [6, 6]; s.active = 1;
  s = step(s, "endTurn");
  assert.equal(s.pending.type, "setup");
  s = step(s, "setupConfirm");
  s = step(s, "setupConfirm");
  s = step(s, "chooseKicker", { id: "0-3" });
  s = step(s, "kickTarget", { x: 3, y: 5 });
  s = step(s, "kick");
  assert.equal(s.pending.request.sides, 8);
  assert.equal(s.pending.request.kind, "d8");
  s = throwDice(s, 8);
  s = step(s, "acceptRoll");
  assert.equal(s.pending.request.label, "GATA kick distance");
  s = throwDice(s, 6);
  s = step(s, "acceptRoll");
  assert.equal(s.half, 2);
  assert.equal(s.rollCount, 2);
  assert.equal(s.ball.airborne, true);
  assert.equal(s.pending.request.label, "GATA kickoff event");
  assert.deepEqual(s.drive.landing, { x: 6, y: 8 });
});
