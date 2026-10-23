import { WIDTH, HEIGHT, getPlayer, playerAt, endZone, resetActivation, rollDie, rollDice, record, zones, teamName } from "./model.mjs";
import { beginDrive, landKick } from "./drives.mjs";

export function scatter(s, random, x, y) {
  const offsets = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];
  const offset = offsets[rollDie(s, random, "Bounce D8", 8) - 1];
  x += offset[0]; y += offset[1];
  if (x < 0 || x >= WIDTH || y < 0 || y >= HEIGHT) {
    const length = rollDie(s, random, "GATA throw-in");
    x = Math.min(WIDTH - 1, Math.max(0, x));
    y = Math.min(HEIGHT - 1, Math.max(0, y));
    // Demo: straight throw-in from the nearest edge; full template is deferred.
    if (x === 0) x += length;
    else if (x === WIDTH - 1) x -= length;
    else if (y === 0) y += length;
    else y -= length;
    record(s, `Ball out of bounds. Throw-in: ${length} squares.`, "dice");
  }
  s.ball = { carrier: null, x, y };
  return playerAt(s, x, y);
}

export function catchBounce(s, random, x, y) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const catcher = scatter(s, random, x, y);
    if (!catcher) return;
    if (catcher.status === "standing" && !catcher.skills.includes("No Hands")) {
      const target = catcher.ag + zones(s, catcher) + (s.weather.id === "rain" ? 1 : 0);
      const roll = rollDie(s, random, "Bounce catch", 6, {
        target, player: catcher.id, detail: catcher.name, skill: "Catch", chooser: catcher.team,
      });
      if (roll === 6 || (roll !== 1 && roll >= target)) {
        s.ball.carrier = catcher.id;
        record(s, `${catcher.name} catches the bouncing ball.`, "success");
        return;
      }
    }
    x = s.ball.x; y = s.ball.y;
  }
  // Bound repeated bounces; settle only on a genuinely empty square.
  for (let row = 0; row < HEIGHT; row++) for (let col = 0; col < WIDTH; col++) {
    if (!playerAt(s, col, row)) { s.ball = { carrier: null, x: col, y: row }; return; }
  }
}

export function knockDown(s, p, random, attacker = null) {
  p.status = "prone";
  if (s.ball.carrier === p.id) {
    s.ball.carrier = null;
    catchBounce(s, random, p.x, p.y);
  }
  const armor = rollDice(s, random, "Armour", { count: 2, target: p.av + (s.weather.id === "leaves" ? 1 : 0), detail: p.name }).reduce((a, b) => a + b, 0) - (s.weather.id === "leaves" ? 1 : 0);
  if (armor < p.av) {
    record(s, `${p.name} is knocked down. Armour ${armor} / ${p.av}+ holds.`, "dice");
    return;
  }
  const injury = rollDice(s, random, "Injury", { count: 2, detail: p.name }).reduce((a, b) => a + b, 0);
  p.status = injury >= 10 ? "casualty" : injury >= 8 ? "ko" : "stunned";
  if (p.status === "stunned") p.stunTurn = s.turn[p.team];
  if (attacker && injury >= 8) attacker.spp += injury >= 10 ? 2 : 1;
  const label = { casualty: "casualty, out for the match", ko: "knocked out", stunned: "stunned" };
  record(s, `${p.name}: armour broken (${armor}), ${label[p.status]} (${injury}).`, "danger");
}

function resetTurn(s) {
  s.activation = null; s.action = null; s.pending = null;
  s.rerollUsed = false; s.blitzUsed = false; s.passUsed = false; s.handoffUsed = false;
  for (const p of s.players.filter(p => p.team === s.active)) resetActivation(p);
}

export function beginTurn(s, random) {
  s.turn[s.active]++;
  s.driveTurns[s.active]++;
  resetTurn(s);
  record(s, `Turn ${s.turn[s.active]}: ${teamName(s, s.active)}.`, "turn");
  scoreTouchdown(s, random);
}

export function endTurn(s, random, reason = "") {
  if (s.finished) return;
  if (reason) record(s, `TURNOVER · ${reason}`, "danger");
  if (s.phase === "kickoff-blitz") { landKick(s, random); return; }
  for (const p of s.players.filter(p => p.team === s.active && p.status === "stunned" && p.stunTurn < s.turn[p.team])) p.status = "prone";
  s.active = 1 - s.active;
  if (s.turn[0] >= 6 && s.turn[1] >= 6) {
    if (s.half === 2) {
      s.finished = true; s.pending = null; s.activation = null;
      record(s, `Full time! ${s.score[0]} : ${s.score[1]}.`, "success");
      return;
    }
    s.half = 2; s.turn = [0, 0]; s.rerolls = [...(s.initialRerolls || [2, 2])];
    record(s, "Second half. Teams switch ends.", "turn");
    beginDrive(s, 1 - s.firstReceiver, random);
    return;
  }
  beginTurn(s, random);
}

export function scoreTouchdown(s, random) {
  if (s.phase !== "play") return false;
  const carrier = getPlayer(s, s.ball.carrier);
  if (!carrier || carrier.team !== s.active || carrier.status !== "standing" || carrier.x !== endZone(s, carrier.team)) return false;
  if (s.driveTurns[carrier.team] < 2) {
    record(s, "GATA: no touchdown on the first turn of a drive. Hold the ball until your second turn.", "info");
    return false;
  }
  s.score[carrier.team]++; carrier.spp += 3;
  record(s, `TOUCHDOWN! ${carrier.name}. Score ${s.score[0]} : ${s.score[1]}.`, "success");
  const receiver = 1 - carrier.team;
  // End the scoring turn before the next receiving turn; respect half boundaries.
  if (s.turn[0] >= 6 && s.turn[1] >= 6) endTurn(s, random);
  else {
    for (const p of s.players.filter(p => p.team === s.active && p.status === "stunned")) p.status = "prone";
    beginDrive(s, receiver, random);
  }
  return true;
}
