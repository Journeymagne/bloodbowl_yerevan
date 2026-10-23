import { createMatch as freshMatch } from "../../src/play/model.mjs";
import { applyCommand } from "../../src/play/engine.mjs";

/** An already-started drive for isolated movement/block tests. Lifecycle tests use freshMatch. */
export function createMatch() {
  const s = freshMatch();
  s.players = s.players.filter(p => p.number <= 7);
  const positions = [[9, 4], [9, 5], [9, 6], [7, 3], [7, 7], [6, 8], [5, 5]];
  for (const p of s.players) {
    const [x, y] = positions[p.number - 1];
    p.x = p.team ? 19 - x : x; p.y = y; p.status = "standing";
  }
  s.phase = "play"; s.pending = null; s.firstReceiver = 0;
  s.turn = [1, 0]; s.driveTurns = [1, 0];
  s.drive = { number: 1, receiver: 0, kicker: 1, landing: { x: 5, y: 5 } };
  s.ball = { carrier: "0-5", x: 6, y: 8 };
  return s;
}

export function acceptDice(state, command, values = []) {
  let s = applyCommand(state, command);
  let index = 0;
  for (let i = 0; s.pending?.type === "roll"; i++) {
    if (i > 200) throw new Error("Dice did not resolve.");
    if (s.pending.stage === "ready") {
      const sides = s.pending.request.sides;
      s = applyCommand(s, { type: "confirmRoll" }, () => ((values[index++] ?? Math.ceil(sides / 2)) - .5) / sides);
    } else s = applyCommand(s, { type: "acceptRoll" });
  }
  return s;
}

export function finishSetup(s) {
  while (s.pending?.type === "setup") s = acceptDice(s, { type: "setupConfirm" });
  const kicker = s.players.find(p => p.team === s.drive.kicker && p.status === "standing" && p.x !== 9 && p.x !== 10 && p.y >= 2 && p.y <= 8);
  s = acceptDice(s, { type: "chooseKicker", id: kicker.id });
  s = acceptDice(s, { type: "kickTarget", x: s.drive.receiver === (s.half === 1 ? 0 : 1) ? 3 : 16, y: 5 });
  // Direction, zero distance, Bribes event, empty-square bounce.
  return acceptDice(s, { type: "kick" }, [2, 1, 1, 1, 2]);
}
