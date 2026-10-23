import test from "node:test";
import assert from "node:assert/strict";
import { createMatch, getPlayer, onPitch } from "../src/play/model.mjs";
import { applyCommand, actingSide } from "../src/play/engine.mjs";
import { lineupProblems, fieldPlayers, isLineman } from "../src/play/lineup.mjs";
import { beginDrive, landKick } from "../src/play/drives.mjs";
import { blockStrength } from "../src/play/blocks.mjs";
import { rerollOptions } from "../src/play/rolls.mjs";
import { acceptDice, finishSetup } from "./helpers/play-state.mjs";

const step = (s, type, rest = {}) => applyCommand(s, { type, ...rest }, () => { throw new Error("Dice used before confirmation"); });
function toss(s, ...values) {
  let i = 0;
  const sides = s.pending.request.sides;
  return applyCommand(s, { type: "confirmRoll" }, () => {
    assert.ok(i < values.length);
    return (values[i++] - .5) / sides;
  });
}
function setupState() {
  const s = createMatch();
  s.pending = { type: "receive-choice", chooser: 0 };
  return step(s, "chooseReceive", { receive: true });
}
function kickReady(target = { x: 3, y: 5 }) {
  let s = setupState();
  s = step(s, "setupConfirm"); s = step(s, "setupConfirm");
  const kicker = fieldPlayers(s, 1).find(p => p.x !== 10);
  s = step(s, "chooseKicker", { id: kicker.id });
  return step(s, "kickTarget", target);
}
const eventDice = number => [Math.min(6, number - 1), number - Math.min(6, number - 1)];
const trigger = (number, extra = [], state = kickReady()) => acceptDice(state, { type: "kick" }, [2, 1, ...eventDice(number), ...extra]);

test("fresh matches put every roster player on the bench; weather and roll-off wait for each coach", () => {
  let s = createMatch();
  assert.equal(s.players.length, 20);
  assert.ok(s.players.every(p => p.status === "reserve"));
  assert.deepEqual(s.turn, [0, 0]); assert.equal(s.ball.carrier, null);
  assert.throws(() => step(s, "move", { id: "0-0", x: 4, y: 4 }));
  s = step(s, "pregameWeather");
  assert.equal(actingSide(s), 0); s = toss(s, 3); s = step(s, "acceptRoll");
  assert.equal(actingSide(s), 1); s = toss(s, 3); s = step(s, "acceptRoll");
  assert.equal(s.weather.id, "normal"); assert.equal(s.pending.type, "coin-toss");
  s = acceptDice(s, { type: "coinToss" }, [2, 2]);
  assert.equal(s.pending.type, "coin-toss");
  s = acceptDice(s, { type: "coinToss" }, [1, 6]);
  assert.equal(actingSide(s), 1);
  s = step(s, "chooseReceive", { receive: false });
  assert.equal(s.firstReceiver, 0);
  assert.equal(s.pending.chooser, 1);
  assert.equal(fieldPlayers(s, 0).length, 0);
  assert.equal(fieldPlayers(s, 1).length, 7);
});

test("lineup caps seven and requires three available Linemen; substitutes move only during their team's setup", () => {
  let s = setupState();
  assert.equal(fieldPlayers(s, 1).filter(isLineman).length >= 3, true);
  assert.deepEqual(lineupProblems(s, 1), []);
  const benched = fieldPlayers(s, 1)[0], old = { x: benched.x, y: benched.y };
  s = step(s, "setupToggle", { id: benched.id });
  assert.equal(getPlayer(s, benched.id).status, "reserve");
  assert.throws(() => step(s, "setupConfirm"), /Line of Scrimmage/);
  assert.throws(() => step(s, "setupToggle", { id: "0-7" }));
  s = step(s, "setupPlace", { id: "1-7", ...old });
  s = step(s, "setupAuto");
  assert.equal(getPlayer(s, "1-7").status, "standing");
  assert.equal(getPlayer(s, benched.id).status, "reserve");
  assert.equal(fieldPlayers(s, 1).length, 7);
  assert.equal(fieldPlayers(s, 1).filter(isLineman).length >= 3, true);
  assert.throws(() => step(s, "setupPlace", { id: "1-8", x: 13, y: 4 }), /Bench a player/);
  assert.throws(() => step(s, "setupPlace", { id: "1-7", x: 8, y: 4 }), /own half/);
  s = step(s, "setupConfirm");
  assert.equal(s.pending.chooser, 0);
  assert.throws(() => step(s, "setupToggle", { id: "1-7" }));
});

test("coaches may deliberately field fewer than seven; auto formation preserves that choice", () => {
  let s = setupState();
  s = step(s, "setupToggle", { id: "1-5" });
  assert.equal(fieldPlayers(s, 1).length, 6);
  assert.deepEqual(lineupProblems(s, 1), []);
  s = step(s, "setupAuto");
  assert.equal(fieldPlayers(s, 1).length, 6);
  assert.equal(getPlayer(s, "1-5").status, "reserve");
  s = step(s, "setupConfirm");
  assert.equal(s.pending.chooser, 0);
});

test("Line of Scrimmage and wide-zone limits are validated before locking setup", () => {
  let s = setupState();
  s = step(s, "setupPlace", { id: "1-0", x: 13, y: 0 });
  assert.throws(() => step(s, "setupConfirm"), /Line of Scrimmage/);
  s = step(s, "setupPlace", { id: "1-1", x: 14, y: 1 });
  assert.ok(lineupProblems(s, 1).some(error => error.includes("wide zone")));
  s = step(s, "setupAuto");
  assert.deepEqual(lineupProblems(s, 1), []);
});

test("direction, distance, event and landing are distinct confirmations; no turn starts in the air", () => {
  let s = step(kickReady(), "kick");
  assert.equal(s.pending.request.sides, 8);
  s = toss(s, 2); s = step(s, "acceptRoll");
  assert.equal(s.pending.request.label, "GATA kick distance");
  s = toss(s, 1); s = step(s, "acceptRoll");
  assert.deepEqual(s.drive.landing, { x: 3, y: 5 });
  assert.equal(s.pending.request.count, 2);
  assert.deepEqual(s.turn, [0, 0]);
  s = toss(s, 1, 1); s = step(s, "acceptRoll");
  assert.equal(s.pending.request.label, "Kickoff bounce");
  assert.equal(s.ball.airborne, true);
  s = toss(s, 2); s = step(s, "acceptRoll");
  assert.equal(s.phase, "play"); assert.equal(s.active, 0);
  assert.deepEqual(s.turn, [1, 0]); assert.deepEqual(s.bribes, [1, 1]);
  assert.equal(s.ball.airborne, false);
});

test("touchback waits for the event and the receiving coach chooses possession", () => {
  let s = acceptDice(kickReady({ x: 0, y: 0 }), { type: "kick" }, [1, 6, 1, 1]);
  assert.equal(s.pending.type, "touchback"); assert.deepEqual(s.bribes, [1, 1]);
  assert.deepEqual(s.turn, [0, 0]);
  assert.throws(() => step(s, "touchback", { id: "1-0" }));
  assert.throws(() => step(s, "touchback", { id: "0-9" }));
  s = step(s, "touchback", { id: "0-5" });
  assert.equal(s.ball.carrier, "0-5"); assert.equal(s.phase, "play");
});

test("kickoff catch can use Catch but never a team reroll; failure bounces without a turnover", () => {
  let s = kickReady({ x: 5, y: 5 });
  const p = s.players.find(p => p.team === 0 && p.x === 5 && p.y === 5); p.skills.push("Catch");
  s = step(s, "kick");
  for (const dice of [[2], [1], [1, 1]]) { s = toss(s, ...dice); s = step(s, "acceptRoll"); }
  assert.equal(s.pending.request.label, "Kickoff catch");
  s = toss(s, 1); assert.deepEqual(rerollOptions(s), ["Catch"]);
  s = step(s, "acceptRoll"); assert.equal(s.pending.request.label, "Kickoff bounce");
  s = toss(s, 2); s = step(s, "acceptRoll");
  assert.equal(s.active, 0); assert.equal(s.phase, "play"); assert.deepEqual(s.turn, [1, 0]);
  assert.ok(!s.log.some(entry => entry.text.includes("TURNOVER")));
});

test("Solid Defence uses only the original Open players, limits moves and keeps setup legal", () => {
  let s = trigger(4, [1]);
  assert.equal(s.pending.event, 4); assert.equal(s.pending.limit, 2);
  assert.throws(() => step(s, "eventMove", { id: "1-0", x: 13, y: 2 }));
  const id = s.pending.eligible[0];
  s = step(s, "eventMove", { id, x: 13, y: 2 });
  assert.throws(() => step(s, "eventMove", { id, x: 14, y: 2 }));
  s = acceptDice(s, { type: "eventConfirm" }, [2]);
  assert.equal(s.phase, "play");
});

test("High Kick moves one Open receiver under the ball, then resolves the catch", () => {
  let s = trigger(5);
  const id = s.pending.eligible[0];
  s = step(s, "eventPlayer", { id });
  assert.deepEqual({ x: getPlayer(s, id).x, y: getPlayer(s, id).y }, s.drive.landing);
  assert.throws(() => step(s, "eventPlayer", { id: s.pending.eligible[1] }));
  s = acceptDice(s, { type: "eventConfirm" }, [6]);
  assert.equal(s.ball.carrier, id);
});

test("Quick Snap moves each originally Open receiver only once and only one square", () => {
  let s = trigger(9, [1]);
  const id = s.pending.eligible[0], p = getPlayer(s, id);
  assert.throws(() => step(s, "eventMove", { id, x: p.x - 2, y: p.y }));
  s = step(s, "eventMove", { id, x: p.x - 1, y: p.y });
  assert.throws(() => step(s, "eventMove", { id, x: p.x - 2, y: p.y }));
  s = acceptDice(s, { type: "eventConfirm" }, [2]);
  assert.equal(s.phase, "play");
});

test("kickoff Blitz is one selected player, grants no team turn or team reroll, and leaves the ball airborne", () => {
  let s = trigger(10);
  const id = s.pending.eligible[0];
  s = step(s, "eventPlayer", { id });
  assert.equal(s.phase, "kickoff-blitz");
  assert.throws(() => step(s, "activate", { id: "1-0", action: "move" }));
  assert.throws(() => step(s, "activate", { id, action: "pass" }));
  assert.throws(() => step(s, "roll"), /kickoff Move or Blitz/);
  s = step(s, "activate", { id, action: "blitz" });
  assert.deepEqual(s.turn, [0, 0]);
  s = acceptDice(s, { type: "endTurn" }, [2]);
  assert.equal(s.phase, "play"); assert.equal(s.active, 0); assert.equal(s.blitzUsed, false);
});

test("Fight with the Ref requires nominations from both sides; sent-off players return at half-time", () => {
  let s = trigger(11);
  for (let side = 0; side < 2; side++) {
    assert.throws(() => step(s, "eventConfirm"), /Nominate three/);
    for (const id of s.pending.eligible.slice(0, 3)) s = step(s, "eventNominate", { id });
    s = acceptDice(s, { type: "eventConfirm" }, [1, 2]);
  }
  assert.equal(s.players.filter(p => p.status === "sent-off").length, 2);
  assert.equal(s.phase, "play");
  const banned = s.players.filter(p => p.status === "sent-off").map(p => p.id);
  beginDrive(s, 1, () => .5);
  assert.ok(banned.every(id => getPlayer(s, id).status === "sent-off"));
  s.half = 2; beginDrive(s, 1, () => .5);
  assert.ok(banned.every(id => ["standing", "reserve"].includes(getPlayer(s, id).status)));
});

test("Pitch Invasion stuns one fielded player per team, never bench players", () => {
  const s = trigger(12, [1, 1, 2]);
  const stunned = s.players.filter(p => p.status === "stunned");
  assert.equal(stunned.length, 2); assert.deepEqual(stunned.map(p => p.team).sort(), [0, 1]);
  assert.equal(s.players.filter(p => p.status === "reserve").length, 6);
});

test("staff events use the imported staff and award tied teams; coaching rerolls expire next drive", () => {
  let s = kickReady(); s.teams[0].assistantCoaches = 2;
  s = trigger(7, [2, 4, 2], s);
  assert.deepEqual(s.driveRerolls, [1, 1]);
  s = step(s, "roll");
  assert.equal(s.pending.request.teamReroll, undefined);
  s = acceptDice(kickReady(), { type: "kick" }, [2, 1, 5, 1, 4, 4, 2]);
  assert.deepEqual(s.cheering, [true, true]);
  const attacker = getPlayer(s, "0-0"), defender = getPlayer(s, "1-0");
  const boosted = blockStrength(s, attacker, defender).attack; s.cheering[0] = false;
  assert.equal(boosted, blockStrength(s, attacker, defender).attack + 1);
  s.driveRerolls = [1, 1]; beginDrive(s, 1, () => .5);
  assert.deepEqual(s.driveRerolls, [0, 0]);
});

test("Timeout moves both markers using GATA's turn-four threshold", () => {
  let s = trigger(3, [2]);
  assert.deepEqual(s.turn, [2, 1]);
  let late = kickReady(); late.turn = [4, 4];
  late = trigger(3, [2], late);
  assert.deepEqual(late.turn, [4, 3]);
});

test("Changing Weather uses D6, normal weather scatters three times, Autumn wind uses its template", () => {
  let s = trigger(8, [3, 2, 2, 2, 2]);
  assert.equal(s.weather.id, "normal");
  assert.equal(s.log.filter(entry => /Weather scatter \d:/.test(entry.text)).length, 3);
  s = kickReady(); s.weather.id = "wind";
  s = step(s, "kick"); assert.equal(s.pending.request.label, "Wind direction");
  s = toss(s, 3); s = step(s, "acceptRoll"); assert.equal(s.pending.request.label, "Wind throw-in template");
  s = toss(s, 3); s = step(s, "acceptRoll"); assert.equal(s.pending.request.sides, 8);
});

test("between-drive KO recovery is confirmed before setup; casualties and failed KOs remain off pitch", () => {
  let s = finishSetup(setupState());
  getPlayer(s, "0-0").status = "ko"; getPlayer(s, "0-1").status = "casualty";
  s.turn = [6, 6]; s.active = 1; s.rerolls = [0, 0];
  s = step(s, "endTurn");
  assert.equal(s.pending.request.label, "KO recovery");
  assert.equal(s.phase, "setup");
  s = toss(s, 1); s = step(s, "acceptRoll");
  assert.equal(s.half, 2); assert.equal(s.drive.receiver, 1);
  assert.deepEqual(s.rerolls, [2, 2]); assert.equal(s.pending.type, "setup");
  assert.equal(getPlayer(s, "0-0").status, "ko"); assert.equal(getPlayer(s, "0-1").status, "casualty");
  assert.throws(() => step(s, "setupToggle", { id: "0-0" }));
});

test("serialized pending kick rolls resume identically without hidden future rolls", () => {
  let s = step(kickReady(), "kick"); s = toss(s, 8);
  const restored = JSON.parse(JSON.stringify(s));
  assert.deepEqual(step(restored, "acceptRoll"), step(s, "acceptRoll"));
  assert.equal(s.rollCount, 1);
});

test("severely depleted teams use all legal available players; zero available players end the exhibition", () => {
  let s = createMatch();
  for (const p of s.players.filter(p => p.team === 1 && p.number > 2)) p.status = "casualty";
  beginDrive(s, 0, () => .5);
  assert.equal(fieldPlayers(s, 1).length, 2);
  assert.deepEqual(lineupProblems(s, 1), []);
  for (const p of s.players.filter(p => p.team === 1)) p.status = "casualty";
  beginDrive(s, 0, () => .5);
  assert.equal(s.finished, true);
  assert.equal(s.pending, null);
});

test("touchback with only stunned receivers bounces from the coach's choice, including in the second half", () => {
  let s = kickReady();
  s.half = 2; s.drive.landing = { x: -1, y: 0 };
  for (const p of fieldPlayers(s, 0)) { p.status = "stunned"; p.x = 19 - p.x; }
  landKick(s, () => { throw new Error("Touchback must wait for the coach"); });
  assert.equal(s.pending.type, "touchback");
  s = step(s, "touchback", { id: "0-5" });
  assert.equal(s.pending.request.label, "Bounce D8");
  s = toss(s, 2); s = step(s, "acceptRoll");
  assert.equal(s.phase, "play"); assert.equal(s.active, 0);
  assert.equal(s.ball.carrier, null); assert.ok(s.ball.x >= 10);
});
