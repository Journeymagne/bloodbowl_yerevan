import test from "node:test";
import assert from "node:assert/strict";
import { getPlayer, reachable, onPitch } from "../src/play/model.mjs";
import { createMatch, finishSetup } from "./helpers/play-state.mjs";
import { applyCommand } from "../src/play/engine.mjs";
import { scoreTouchdown, knockDown } from "../src/play/flow.mjs";
import { blockStrength } from "../src/play/blocks.mjs";
import { rerollOptions } from "../src/play/rolls.mjs";

const roll = (...values) => {
  let index = 0;
  return () => ((values[index++] ?? 3) - 0.5) / 6;
};
// Rules scenarios explicitly accept each tray result; phase/permission tests
// below and in play-dice.test.mjs exercise the pauses themselves.
const act = (s, cmd, ...dice) => {
  const random = roll(...dice);
  let next = applyCommand(s, cmd, random);
  for (let i = 0; next.pending?.type === "roll"; i++) {
    assert.ok(i < 200, "the dice sequence must terminate");
    next = applyCommand(next, { type: next.pending.stage === "ready" ? "confirmRoll" : "acceptRoll" }, random);
  }
  return next;
};
const confirm = (s, ...dice) => applyCommand(s, { type: "confirmRoll" }, roll(...dice));
function isolated(...ids) {
  const s = createMatch();
  for (const p of s.players) if (!ids.includes(p.id)) p.status = "casualty";
  return s;
}

test("GATA opening: 7 players, at least 3 on LOS, at most 4 specialists, no overlaps", () => {
  const s = createMatch();
  for (const side of [0, 1]) {
    const players = s.players.filter(p => p.team === side);
    assert.equal(players.length, 7);
    assert.equal(players.filter(p => p.x === (side === 0 ? 9 : 10) && p.y >= 2 && p.y <= 8).length, 3);
    assert.ok(players.filter(p => p.role !== "Lineman").length <= 4);
    assert.ok(players.filter(p => p.y < 2).length <= 1);
    assert.ok(players.filter(p => p.y > 8).length <= 1);
  }
  assert.equal(new Set(s.players.map(p => `${p.x},${p.y}`)).size, 14);
});

test("movement uses a legal path and ball follows carrier; input is immutable", () => {
  const s = createMatch(), before = structuredClone(s);
  const next = act(s, { type: "move", id: "0-5", action: "move", x: 8, y: 8 });
  assert.equal(getPlayer(next, "0-5").moved, 2);
  assert.deepEqual(next.ball, { carrier: "0-5", x: 8, y: 8 });
  assert.deepEqual(s, before);
});

test("occupied squares, opposing players and changing an activation's action are rejected atomically", () => {
  const s = createMatch();
  assert.throws(() => act(s, { type: "move", id: "0-5", x: 7, y: 7 }));
  assert.throws(() => act(s, { type: "move", id: "1-5", x: 14, y: 8 }));
  const next = act(s, { type: "move", id: "0-5", action: "move", x: 7, y: 8 });
  assert.throws(() => act(next, { type: "activate", id: "0-5", action: "pass" }));
  const switched = act(next, { type: "activate", id: "0-4", action: "move" });
  assert.equal(getPlayer(switched, "0-5").used, true);
  assert.throws(() => act(switched, { type: "activate", id: "0-5", action: "move" }));
});

test("prone players block paths and standing costs 3 movement", () => {
  const s = createMatch(), p = getPlayer(s, "0-5");
  p.status = "prone";
  assert.equal(reachable(s, p).has("7,7"), false);
  const next = act(s, { type: "move", id: p.id, action: "move", x: 7, y: 8 });
  assert.equal(getPlayer(next, p.id).moved, 4);
  assert.equal(getPlayer(next, p.id).status, "standing");
});

test("failed rush offers one team reroll; success resumes the exact remaining path", () => {
  const s = isolated("0-5");
  let next = applyCommand(s, { type: "move", id: "0-5", action: "move", x: 14, y: 8 });
  next = confirm(next, 1);
  assert.deepEqual(rerollOptions(next), ["Team"]);
  assert.equal(getPlayer(next, "0-5").moved, 6);
  next = applyCommand(next, { type: "selectReroll", source: "Team" });
  next = confirm(next, 6);
  next = act(next, { type: "acceptRoll" }, 6);
  assert.equal(next.pending, null);
  assert.equal(next.rerolls[0], 1);
  assert.equal(getPlayer(next, "0-5").x, 14);
  assert.equal(getPlayer(next, "0-5").moved, 8);
  assert.equal(next.active, 0);
});

test("a reroll cannot itself be rerolled; failed rush causes a turnover", () => {
  const s = isolated("0-5");
  let next = applyCommand(s, { type: "move", id: "0-5", action: "move", x: 13, y: 8 });
  next = confirm(next, 1);
  next = applyCommand(next, { type: "selectReroll", source: "Team" });
  next = confirm(next, 1);
  assert.deepEqual(rerollOptions(next), []);
  next = act(next, { type: "acceptRoll" }, 2, 2, 2);
  assert.equal(next.active, 1);
  assert.equal(next.pending, null);
  assert.equal(next.ball.carrier, null);
  assert.notEqual(getPlayer(next, "0-5").status, "standing");
});

test("Sure Hands requires confirmation and the same pickup cannot get a team reroll afterward", () => {
  const s = isolated("0-5");
  s.ball = { carrier: null, x: 7, y: 8 };
  let next = applyCommand(s, { type: "move", id: "0-5", x: 7, y: 8, action: "move" });
  next = confirm(next, 1);
  assert.deepEqual(rerollOptions(next), ["Sure Hands", "Team"]);
  next = applyCommand(next, { type: "selectReroll", source: "Sure Hands" });
  assert.equal(next.rollCount, 1);
  next = confirm(next, 1);
  assert.deepEqual(rerollOptions(next), []);
  next = act(next, { type: "acceptRoll" });
  assert.equal(next.active, 1);
  assert.equal(next.rerolls[0], 2);
  assert.equal(next.pending, null);
});

test("dodge difficulty includes destination tackle zones and natural 6 succeeds", () => {
  const s = isolated("0-5", "1-0");
  Object.assign(getPlayer(s, "1-0"), { x: 7, y: 8 });
  let next = applyCommand(s, { type: "move", id: "0-5", action: "move", x: 7, y: 9 });
  assert.equal(next.pending.request.label, "Dodge");
  assert.equal(next.pending.request.target, 4);
  next = confirm(next, 3);
  next = applyCommand(next, { type: "selectReroll", source: "Team" });
  next = confirm(next, 6);
  next = act(next, { type: "acceptRoll" });
  assert.equal(getPlayer(next, "0-5").y, 9);
});

test("GATA Block protects only the active attacker from Both Down", () => {
  const s = isolated("0-3", "1-3");
  Object.assign(getPlayer(s, "0-3"), { x: 9, y: 5 });
  Object.assign(getPlayer(s, "1-3"), { x: 10, y: 5 });
  let next = act(s, { type: "block", id: "0-3", target: "1-3" }, 2);
  next = act(next, { type: "chooseBlock", index: 0 }, 2, 2);
  assert.equal(getPlayer(next, "0-3").status, "standing");
  assert.equal(getPlayer(next, "1-3").status, "prone");
  assert.equal(next.active, 0);
});

test("assists determine block dice and lower-strength blocks belong to defender", () => {
  const s = isolated("0-0", "0-1", "1-0");
  const a = getPlayer(s, "0-0"), d = getPlayer(s, "1-0");
  Object.assign(a, { x: 9, y: 5, st: 2 }); Object.assign(d, { x: 10, y: 5, st: 6 });
  Object.assign(getPlayer(s, "0-1"), { x: 9, y: 4 });
  assert.deepEqual(blockStrength(s, a, d), { attack: 3, defense: 6, count: 2, chooser: 1 });
});

test("push and follow-up leave a blitz activation open, but no second block", () => {
  const s = isolated("0-3", "1-0");
  Object.assign(getPlayer(s, "0-3"), { x: 9, y: 5 });
  Object.assign(getPlayer(s, "1-0"), { x: 10, y: 5 });
  let next = act(s, { type: "block", id: "0-3", target: "1-0", action: "blitz" }, 3);
  next = act(next, { type: "chooseBlock", index: 0 });
  next = act(next, { type: "push", x: 11, y: 5 });
  next = act(next, { type: "follow", follow: true });
  assert.equal(next.activation, "0-3");
  assert.equal(getPlayer(next, "0-3").x, 10);
  assert.equal(getPlayer(next, "0-3").moved, 1);
  assert.throws(() => act(next, { type: "block", id: "0-3", target: "1-0" }));
});

test("GATA Dodge does not cancel a stumble, but Evasive does", () => {
  for (const skill of ["Dodge", "Evasive"]) {
    const s = isolated("0-0", "1-0");
    getPlayer(s, "1-0").skills = [skill];
    let next = act(s, { type: "block", id: "0-0", target: "1-0" }, 5);
    next = act(next, { type: "chooseBlock", index: 0 });
    assert.equal(next.pending.knock, skill === "Dodge");
  }
});

test("handoff requires adjacency, transfers possession and ends the thrower's activation", () => {
  const s = isolated("0-5", "0-4");
  Object.assign(getPlayer(s, "0-4"), { x: 7, y: 8 });
  const next = act(s, { type: "throw", id: "0-5", target: "0-4", action: "handoff" }, 6);
  assert.equal(next.ball.carrier, "0-4");
  assert.equal(getPlayer(next, "0-5").used, true);
  assert.equal(next.handoffUsed, true);
});

test("successful short pass rolls passing and catching and awards completion SPP", () => {
  const s = isolated("0-5", "0-4");
  Object.assign(getPlayer(s, "0-4"), { x: 10, y: 8 });
  const next = act(s, { type: "throw", id: "0-5", target: "0-4", action: "pass" }, 6, 6);
  assert.equal(next.ball.carrier, "0-4");
  assert.equal(getPlayer(next, "0-5").spp, 1);
  assert.equal(next.passUsed, true);
});

test("GATA forbids first-drive-turn TD, scores at start of second, resets receiving drive", () => {
  const s = createMatch();
  Object.assign(getPlayer(s, "0-5"), { x: 19, y: 8 });
  assert.equal(scoreTouchdown(s, roll()), false);
  assert.equal(s.score[0], 0);
  let next = act(s, { type: "endTurn" });
  next = act(next, { type: "endTurn" }, 6, 3);
  assert.equal(next.score[0], 1);
  assert.equal(next.phase, "setup");
  assert.equal(next.drive.receiver, 1);
  assert.equal(next.driveTurns[1], 0);
  assert.equal(getPlayer(next, "0-5").spp, 3);
});

test("two halves contain exactly six turns per side and swap ends", () => {
  let s = createMatch();
  for (let i = 0; i < 12; i++) s = act(s, { type: "endTurn" });
  assert.equal(s.half, 2); assert.equal(s.phase, "setup");
  s = finishSetup(s);
  assert.deepEqual(s.turn, [0, 1]);
  assert.equal(getPlayer(s, "0-0").x, 10);
  for (let i = 0; i < 12; i++) s = act(s, { type: "endTurn" });
  assert.equal(s.finished, true);
  assert.deepEqual(s.turn, [6, 6]);
  assert.throws(() => act(s, { type: "endTurn" }));
});

test("self-inflicted stun survives the turnover and clears only after next own turn", () => {
  const s = createMatch(), p = getPlayer(s, "0-0");
  knockDown(s, p, roll(6, 6, 2, 2));
  assert.equal(p.status, "stunned");
  let next = act(s, { type: "endTurn" });
  assert.equal(getPlayer(next, p.id).status, "stunned");
  next = act(next, { type: "endTurn" });
  assert.equal(getPlayer(next, p.id).status, "stunned");
  next = act(next, { type: "endTurn" });
  assert.equal(getPlayer(next, p.id).status, "prone");
});

test("failed commands cannot consume blitz, movement or random rolls on the caller's state", () => {
  const s = createMatch(), before = structuredClone(s);
  assert.throws(() => act(s, { type: "block", id: "0-5", target: "1-5", action: "blitz" }));
  assert.deepEqual(s, before);
  assert.equal(s.players.filter(onPitch).length, 14);
  assert.throws(() => act(s, { type: "constructor" }));
  assert.throws(() => act(s, { type: "__proto__" }));
});

test("monotonic roll counter detects new dice even when the visible six-die history repeats", () => {
  let s = createMatch();
  for (let i = 0; i < 6; i++) s = act(s, { type: "roll" }, 4);
  const next = act(s, { type: "roll" }, 4);
  assert.deepEqual(s.dice, next.dice);
  assert.equal(next.rollCount, s.rollCount + 1);
});
