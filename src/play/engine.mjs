import { createMatch, getPlayer, distance, reachable, zones, rollDie, record } from "./model.mjs";
import { endTurn, knockDown, catchBounce, scoreTouchdown } from "./flow.mjs";
import { rollBlock, chooseBlock, choosePush, followUp } from "./blocks.mjs";
import { withDiceTray } from "./rolls.mjs";
import { driveCommand, landKick } from "./drives.mjs";

const ACTIONS = ["move", "block", "blitz", "pass", "handoff"];
const skillFor = { dodge: "Dodge", pickup: "Sure Hands", pass: "Pass", catch: "Catch" };
const testLabels = { rush: "Rush", dodge: "Dodge", pickup: "Pick up", pass: "Pass", catch: "Catch" };

export function actingSide(s) {
  return s.pending?.chooser ?? s.active;
}

function activate(s, id, action = "move") {
  const p = getPlayer(s, id);
  if (!p || p.team !== s.active || !["standing", "prone"].includes(p.status) || p.used) throw new Error("This player cannot be activated.");
  if (!ACTIONS.includes(action)) throw new Error("Unknown action.");
  if (s.phase === "kickoff-blitz" && (id !== s.drive.blitzer || !["move", "blitz"].includes(action))) throw new Error("Only the nominated kickoff player may Move or Blitz.");
  if (action === "pass" && p.pa === null) throw new Error("This player has no passing characteristic.");
  if (s.activation === id) {
    if (s.action !== action) throw new Error("An action is already declared. Finish this activation first.");
    return p;
  }
  if (action === "blitz" && s.blitzUsed) throw new Error("The blitz has already been used this turn.");
  if (action === "pass" && s.passUsed) throw new Error("The pass has already been used this turn.");
  if (action === "handoff" && s.handoffUsed) throw new Error("The handoff has already been used this turn.");
  if (action === "block" && p.status !== "standing") throw new Error("A prone player cannot declare a block.");
  if (s.activation) getPlayer(s, s.activation).used = true;
  s.activation = id; s.action = action;
  if (action === "blitz") s.blitzUsed = true;
  if (action === "pass") s.passUsed = true;
  if (action === "handoff") s.handoffUsed = true;
  if (p.status === "prone") { p.status = "standing"; p.moved += 3; record(s, `${p.name} stands up: 3 MA.`); }
  return p;
}

function finishActivation(s, p) {
  p.used = true; s.activation = null; s.action = null;
}

function passTarget(s, p, target) {
  if (!target || target.id === p.id || target.team !== p.team || target.status !== "standing") throw new Error("Choose a standing teammate.");
  const range = distance(p, target);
  if (s.ball.carrier !== p.id) throw new Error("This player does not have the ball.");
  if (s.action === "handoff" && range !== 1) throw new Error("A handoff requires an adjacent teammate.");
  if (s.action === "pass" && range > 6) throw new Error("Demo passes are limited to 6 squares.");
  return range;
}

function success(s, test, random) {
  const p = getPlayer(s, test.player);
  if (test.kind === "rush") return walkStep(s, p, test.context.path, random, true);
  if (test.kind === "dodge") return arrive(s, p, test.context.path, random);
  if (test.kind === "pickup") {
    s.ball.carrier = p.id; record(s, `${p.name} picks up the ball.`, "success");
    if (!scoreTouchdown(s, random)) walk(s, p, test.context.path, random);
  }
  if (test.kind === "pass") {
    const receiver = getPlayer(s, test.context.receiver);
    s.ball = { carrier: null, x: receiver.x, y: receiver.y };
    testRoll(s, { kind: "catch", player: receiver.id, target: receiver.ag + zones(s, receiver),
      context: { thrower: p.id, pass: true } }, random);
  }
  if (test.kind === "catch") {
    s.ball.carrier = p.id; record(s, `${p.name} catches the ball.`, "success");
    const thrower = getPlayer(s, test.context.thrower);
    if (test.context.pass) thrower.spp++;
    finishActivation(s, thrower);
    scoreTouchdown(s, random);
  }
}

function failure(s, test, random) {
  const p = getPlayer(s, test.player);
  if (test.kind === "rush" || test.kind === "dodge") {
    const destination = test.context.path[0];
    p.x = destination.x; p.y = destination.y; p.moved++;
    knockDown(s, p, random);
    if (!s.ball.carrier && s.ball.x === p.x && s.ball.y === p.y) catchBounce(s, random, p.x, p.y);
  } else {
    s.ball.carrier = null;
    const target = test.kind === "pass" && test.roll !== 1 ? getPlayer(s, test.context.receiver) : p;
    catchBounce(s, random, target.x, target.y);
  }
  endTurn(s, random, `${testLabels[test.kind]} failed`);
}

function testRoll(s, test, random) {
  const p = getPlayer(s, test.player);
  if (s.weather.id === "rain" && ["catch", "pickup"].includes(test.kind)) test.target++;
  const roll = rollDie(s, random, testLabels[test.kind], 6, {
    player: p.id, detail: p.name, target: test.target, skill: skillFor[test.kind],
    teamReroll: true, chooser: p.team,
  });
  const passed = value => value === 6 || (value !== 1 && value >= test.target);
  record(s, `${testLabels[test.kind]}: ${roll} / ${test.target}+ ${passed(roll) ? "✓" : "✕"}`, passed(roll) ? "dice" : "danger");
  if (passed(roll)) return success(s, test, random);
  test.roll = roll;
  failure(s, test, random);
}

function arrive(s, p, path, random) {
  const target = path[0];
  p.x = target.x; p.y = target.y; p.moved++;
  if (s.ball.carrier === p.id) { s.ball.x = p.x; s.ball.y = p.y; }
  if (!s.ball.carrier && s.ball.x === p.x && s.ball.y === p.y) {
    testRoll(s, { kind: "pickup", player: p.id, target: p.ag + zones(s, p), context: { path: path.slice(1) } }, random);
    return;
  }
  if (!scoreTouchdown(s, random)) walk(s, p, path.slice(1), random);
}

function walkStep(s, p, path, random, rushed = false) {
  if (!rushed && p.moved >= p.ma) {
    testRoll(s, { kind: "rush", player: p.id, target: 2, context: { path } }, random);
    return;
  }
  if (zones(s, p)) {
    const target = path[0];
    testRoll(s, { kind: "dodge", player: p.id, target: p.ag + zones(s, p, target.x, target.y), context: { path } }, random);
  } else arrive(s, p, path, random);
}

function walk(s, p, path, random) {
  if (!path.length) {
    record(s, `${p.name}: ${String.fromCharCode(65 + p.x)}${p.y + 1}. Movement used: ${p.moved} / ${p.ma} MA.`);
    return;
  }
  walkStep(s, p, path, random);
}

function move(s, cmd, random) {
  const before = getPlayer(s, cmd.id), action = cmd.action || s.action || "move";
  if (action === "block") throw new Error("Declare a blitz to move and block.");
  const path = reachable(s, before).get(`${cmd.x},${cmd.y}`);
  if (!path) throw new Error("This square is occupied or out of reach.");
  const p = activate(s, cmd.id, action);
  walk(s, p, path, random);
}

function block(s, cmd, random) {
  const action = s.activation === cmd.id ? s.action : cmd.action || "block";
  if (!["block", "blitz"].includes(action)) throw new Error("Declare a block or blitz first.");
  const p = activate(s, cmd.id, action), defender = getPlayer(s, cmd.target);
  if (p.acted) throw new Error("This player has already made a block.");
  if (action === "blitz") {
    if (p.moved >= p.ma) throw new Error("A blitz block needs 1 non-rush MA in this demo.");
    p.moved++;
  }
  rollBlock(s, p, defender, random);
}

function throwBall(s, cmd, random) {
  const action = cmd.action || s.action || "pass";
  if (!["pass", "handoff"].includes(action)) throw new Error("Choose a pass or handoff.");
  const p = activate(s, cmd.id, action), target = getPlayer(s, cmd.target);
  const range = passTarget(s, p, target);
  if (action === "handoff") {
    s.ball = { carrier: null, x: target.x, y: target.y };
    testRoll(s, { kind: "catch", player: target.id, target: target.ag + zones(s, target),
      context: { thrower: p.id, pass: false } }, random);
  } else testRoll(s, { kind: "pass", player: p.id, target: p.pa + zones(s, p) + (range > 3 ? 1 : 0),
    context: { receiver: target.id } }, random);
}

function executeCommand(s, cmd, random) {
  if (driveCommand(s, cmd, random)) return;
  if (s.phase === "kickoff-blitz" && !["activate", "move", "block", "chooseBlock", "push", "follow", "endActivation", "endTurn"].includes(cmd.type)) {
    throw new Error("Complete the nominated player's kickoff Move or Blitz first.");
  }
  if (s.pending && !["chooseBlock", "push", "follow"].includes(cmd.type)) throw new Error("Resolve the pending roll first.");
  const handlers = {
    move: () => move(s, cmd, random), block: () => block(s, cmd, random), throw: () => throwBall(s, cmd, random),
    activate: () => activate(s, cmd.id, cmd.action),
    endActivation: () => { if (s.activation) finishActivation(s, getPlayer(s, s.activation)); if (s.phase === "kickoff-blitz") landKick(s, random); },
    endTurn: () => endTurn(s, random), chooseBlock: () => chooseBlock(s, cmd.index, random),
    push: () => choosePush(s, cmd.x, cmd.y), follow: () => followUp(s, Boolean(cmd.follow), random),
    roll: () => { rollDie(s, random, "Free D6"); },
  };
  if (!Object.hasOwn(handlers, cmd.type)) throw new Error("Unknown command.");
  handlers[cmd.type]();
}

/** Atomic validated commands, shared by local play and the authoritative room server. */
export function applyCommand(state, cmd, random = Math.random) {
  if (!cmd || typeof cmd.type !== "string") throw new Error("Invalid command.");
  if (state.finished && cmd.type !== "reset") throw new Error("The match has ended.");
  if (cmd.type === "reset") return { ...createMatch(state.setup), version: state.version + 1 };
  return withDiceTray(state, cmd, random, executeCommand);
}
