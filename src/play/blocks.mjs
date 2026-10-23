import { BLOCK_FACES, FACE_LABELS, distance, getPlayer, inside, playerAt, record, rollDice } from "./model.mjs";
import { catchBounce, endTurn, knockDown, scoreTouchdown } from "./flow.mjs";

function assists(s, player, target) {
  return s.players.filter(p => p.team === player.team && p.id !== player.id && p.status === "standing"
    && distance(p, target) === 1 && !s.players.some(q => q.team !== p.team && q.id !== target.id
      && q.status === "standing" && distance(q, p) === 1)).length;
}

export function blockStrength(s, attacker, defender) {
  const attack = attacker.st + assists(s, attacker, defender) + (s.cheering?.[attacker.team] ? 1 : 0);
  const defense = defender.st + assists(s, defender, attacker);
  const count = attack === defense ? 1 : Math.max(attack, defense) > 2 * Math.min(attack, defense) ? 3 : 2;
  return { attack, defense, count, chooser: attack >= defense ? attacker.team : defender.team };
}

export function rollBlock(s, attacker, defender, random) {
  if (!defender || defender.team === attacker.team || defender.status !== "standing" || distance(attacker, defender) !== 1) throw new Error("Choose an adjacent standing opponent.");
  const strength = blockStrength(s, attacker, defender);
  const faces = rollDice(s, random, "Block", { count: strength.count, kind: "block", teamReroll: true,
    player: attacker.id, detail: `${attacker.name} → ${defender.name} · ST ${strength.attack} : ${strength.defense}`,
    chooser: attacker.team }).map(value => BLOCK_FACES[value - 1]);
  s.cheering[attacker.team] = false;
  s.pending = { type: "block", attacker: attacker.id, defender: defender.id, faces, ...strength };
  record(s, `${attacker.name} → ${defender.name}: ${strength.attack} against ${strength.defense}. Choose a die.`, "dice");
}

function pushSquares(s, attacker, defender) {
  const dx = Math.sign(defender.x - attacker.x), dy = Math.sign(defender.y - attacker.y);
  const offsets = dx && dy ? [[dx, dy], [dx, 0], [0, dy]]
    : dx ? [[dx, -1], [dx, 0], [dx, 1]] : [[-1, dy], [0, dy], [1, dy]];
  const squares = offsets.map(([ox, oy]) => ({ x: defender.x + ox, y: defender.y + oy }));
  const empty = squares.filter(q => !inside(q.x, q.y) || !playerAt(s, q.x, q.y));
  return empty.length ? empty : squares;
}

function finishBlock(s, random, attacker) {
  attacker.acted = true;
  s.pending = null;
  if (s.action !== "blitz") { attacker.used = true; s.activation = null; s.action = null; }
  scoreTouchdown(s, random);
}

export function chooseBlock(s, index, random) {
  const pending = s.pending;
  if (pending?.type !== "block" || !Number.isInteger(index) || !pending.faces[index]) throw new Error("Choose a block result.");
  const attacker = getPlayer(s, pending.attacker), defender = getPlayer(s, pending.defender);
  const face = pending.faces[index];
  record(s, `Block: ${FACE_LABELS[face]}.`, "dice");
  if (face === "skull" || face === "both") {
    // GATA: defensive Block does not prevent Both Down.
    if (face === "both") knockDown(s, defender, random, attacker);
    const falls = face === "skull" || !attacker.skills.includes("Block");
    if (falls) knockDown(s, attacker, random);
    if (falls) {
      attacker.acted = true; attacker.used = true; s.pending = null;
      endTurn(s, random, `${attacker.name} is knocked down`);
    } else finishBlock(s, random, attacker);
    return;
  }
  const evasive = defender.skills.includes("Evasive") && !attacker.skills.includes("Tackle");
  const knock = face === "pow" || (face === "stumble" && !evasive);
  s.pending = { type: "push", attacker: attacker.id, defender: defender.id, knock,
    squares: pushSquares(s, attacker, defender), chooser: attacker.team };
}

function crowdInjury(s, defender, attacker, random) {
  const injury = rollDice(s, random, "Crowd injury", { count: 2, detail: defender.name }).reduce((a, b) => a + b, 0);
  defender.status = injury >= 10 ? "casualty" : injury >= 8 ? "ko" : "reserve";
  if (injury >= 8) attacker.spp += injury >= 10 ? 2 : 1;
  record(s, `${defender.name} is pushed into the crowd (${injury}).`, "danger");
}

function pushChain(s, target, x, y, effects, visited = new Set()) {
  if (visited.has(target.id)) throw new Error("Invalid chain push.");
  visited.add(target.id);
  const from = { x: target.x, y: target.y };
  if (!inside(x, y)) {
    effects.push({ type: "crowd", player: target.id, from, hadBall: s.ball.carrier === target.id });
    target.x = x; target.y = y; target.status = "crowd";
    return;
  }
  const occupied = playerAt(s, x, y);
  if (occupied) pushChain(s, occupied, x + Math.sign(x - target.x), y + Math.sign(y - target.y), effects, visited);
  target.x = x; target.y = y;
  if (s.ball.carrier === target.id) { s.ball.x = x; s.ball.y = y; }
  else if (!s.ball.carrier && s.ball.x === x && s.ball.y === y) effects.push({ type: "bounce", x, y });
}

export function choosePush(s, x, y) {
  const pending = s.pending;
  if (pending?.type !== "push" || !pending.squares.some(q => q.x === x && q.y === y)) throw new Error("Choose a highlighted push square.");
  const attacker = getPlayer(s, pending.attacker), defender = getPlayer(s, pending.defender);
  const origin = { x: defender.x, y: defender.y };
  const effects = [];
  pushChain(s, defender, x, y, effects);
  // Follow-up is decided before armour, crowd injuries or ball-bounce dice.
  s.pending = { type: "follow", attacker: attacker.id, defender: defender.id, origin, effects,
    knock: pending.knock && inside(x, y), chooser: attacker.team };
  record(s, `Push resolved. ${attacker.name}: follow up?`);
}

function resolvePushEffects(s, pending, attacker, random) {
  for (const effect of pending.effects) {
    if (effect.type === "bounce") catchBounce(s, random, effect.x, effect.y);
    else {
      crowdInjury(s, getPlayer(s, effect.player), attacker, random);
      if (effect.hadBall) { s.ball.carrier = null; catchBounce(s, random, effect.from.x, effect.from.y); }
    }
  }
  if (pending.knock) knockDown(s, getPlayer(s, pending.defender), random, attacker);
}

export function followUp(s, follow, random) {
  const pending = s.pending;
  if (pending?.type !== "follow") throw new Error("There is no follow-up to resolve.");
  const attacker = getPlayer(s, pending.attacker);
  if (follow) {
    attacker.x = pending.origin.x; attacker.y = pending.origin.y;
    if (s.ball.carrier === attacker.id) { s.ball.x = attacker.x; s.ball.y = attacker.y; }
  }
  resolvePushEffects(s, pending, attacker, random);
  finishBlock(s, random, attacker);
}
