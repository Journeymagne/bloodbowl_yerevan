import { getPlayer, inside, playerAt, record, resetActivation, rollDie, teamName, zones, onPitch } from "./model.mjs";
import { autoSetup, benchPlayer, confirmLineup, fieldPlayers, inOwnHalf, onLine, setupPlace, toggleSetupPlayer } from "./lineup.mjs";
import { scatterOffsets, pregameWeather, kickDeviation } from "./kick-weather.mjs";
import { kickoffEvent, eventCommand } from "./kick-events.mjs";
import { beginTurn, endTurn, catchBounce } from "./flow.mjs";

export function beginDrive(s, receiver, random) {
  s.phase = "setup"; s.activation = null; s.action = null; s.pending = null;
  s.rerollUsed = false; s.blitzUsed = false; s.passUsed = false; s.handoffUsed = false;
  s.driveRerolls = [0, 0]; s.cheering = [false, false]; s.driveTurns = [0, 0];
  s.ball = { carrier: null, x: -1, y: -1, airborne: true };
  s.drive = { number: (s.drive?.number || 0) + 1, receiver, kicker: 1 - receiver, target: null, landing: null };
  for (const p of s.players) {
    if (p.status === "sent-off" && p.sentOffHalf < s.half) benchPlayer(p);
    if (onPitch(p)) benchPlayer(p);
    if (p.status === "ko") {
      const target = s.weather.id === "chill" ? 5 : 4;
      if (rollDie(s, random, "KO recovery", 6, { target, detail: p.name, chooser: p.team }) >= target) benchPlayer(p);
    }
    resetActivation(p);
  }
  const unable = [0, 1].find(side => !s.players.some(p => p.team === side && p.status === "reserve"));
  if (unable !== undefined) {
    s.phase = "finished"; s.finished = true;
    record(s, `${teamName(s, unable)} have no available players. Exhibition ended; league records are unchanged.`, "danger");
    return;
  }
  s.active = s.drive.kicker;
  autoSetup(s, s.drive.kicker);
  s.pending = { type: "setup", chooser: s.drive.kicker };
  record(s, `Drive ${s.drive.number}: ${teamName(s, s.drive.kicker)} set up first. Choose up to seven players, including three Linemen when available.`);
}

function confirmSetup(s) {
  const side = s.pending.chooser;
  confirmLineup(s, side);
  record(s, `${teamName(s, side)} lock their lineup and formation.`);
  if (side === s.drive.kicker) {
    s.active = s.drive.receiver; autoSetup(s, s.active);
    s.pending = { type: "setup", chooser: s.active };
  } else {
    s.phase = "kickoff"; s.active = s.drive.kicker;
    s.pending = { type: "kicker", chooser: s.active };
  }
}

export function eligibleKickers(s) {
  const players = fieldPlayers(s, s.drive.kicker).filter(p => p.status === "standing");
  const preferred = players.filter(p => !onLine(s, p) && p.y >= 2 && p.y <= 8);
  return preferred.length ? preferred : players;
}

function nominateKicker(s, id) {
  if (!eligibleKickers(s).some(p => p.id === id)) throw new Error("Choose an eligible kicker outside the wide zones and Line of Scrimmage.");
  s.drive.kickerId = id;
  s.pending = { type: "kick-target", chooser: s.drive.kicker };
  record(s, `${getPlayer(s, id).name} will kick. Choose the target square in the receiving half.`);
}

function launchKick(s, random) {
  if (!s.drive.target) throw new Error("Select a kick target first.");
  kickDeviation(s, random);
  kickoffEvent(s, random);
}

export function finishKickoff(s, random) {
  s.pending = null; s.phase = "play"; s.ball.airborne = false;
  s.activation = null; s.action = null; s.blitzUsed = false; s.passUsed = false; s.handoffUsed = false; s.rerollUsed = false;
  s.players.forEach(resetActivation);
  s.active = s.drive.receiver;
  if (s.turn[s.active] >= 6) s.active = 1 - s.active;
  if (s.turn[0] >= 6 && s.turn[1] >= 6) { endTurn(s, random); return; }
  record(s, `Kickoff complete. ${teamName(s, s.active)} take the first turn.`, "turn");
  beginTurn(s, random);
}

function touchback(s) {
  const players = fieldPlayers(s, s.drive.receiver);
  const standing = players.filter(p => p.status === "standing" && !p.skills.includes("No Hands"));
  const eligible = standing.length ? standing : players;
  if (!eligible.length) {
    s.phase = "finished"; s.finished = true;
    record(s, "No receiving players remain on the pitch. Exhibition ended; league records are unchanged.", "danger");
    return;
  }
  s.pending = { type: "touchback", chooser: s.drive.receiver, eligible: eligible.map(p => p.id) };
  s.phase = "kickoff";
  record(s, standing.length ? "Touchback. The receiving coach chooses a standing player to take possession."
    : "Touchback. No receiver can hold the ball: choose a player from whose square it will bounce.");
}

/** Landing happens after the event. A failed kickoff catch never causes a turnover. */
export function landKick(s, random) {
  s.phase = "kickoff"; s.pending = null; s.activation = null; s.action = null;
  let { x, y } = s.drive.landing;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (!inside(x, y) || !inOwnHalf(s, s.drive.receiver, x)) {
      touchback(s); return;
    }
    const p = playerAt(s, x, y);
    s.ball = { carrier: null, x, y, airborne: true };
    if (p?.status === "standing" && !p.skills.includes("No Hands")) {
      const target = p.ag + zones(s, p) + (s.weather.id === "rain" ? 1 : 0);
      const roll = rollDie(s, random, "Kickoff catch", 6, { chooser: p.team, player: p.id, detail: p.name, target, skill: "Catch" });
      if (roll === 6 || (roll > 1 && roll >= target)) {
        s.ball.carrier = p.id; record(s, `${p.name} catches the kick.`, "success"); finishKickoff(s, random); return;
      }
    } else if (attempt > 0 && !p) { finishKickoff(s, random); return; }
    const [dx, dy] = scatterOffsets[rollDie(s, random, "Kickoff bounce", 8, { chooser: s.drive.receiver }) - 1];
    x += dx; y += dy;
  }
  throw new Error("Kickoff bounce limit reached.");
}

function pregameCommand(s, cmd, random) {
  if (s.pending.type === "pregame" && cmd.type === "pregameWeather") {
    pregameWeather(s, random); s.pending = { type: "coin-toss", chooser: 0 }; return;
  }
  if (s.pending.type === "coin-toss" && cmd.type === "coinToss") {
    const home = rollDie(s, random, "Kick / receive roll · home", 6, { chooser: 0 });
    const away = rollDie(s, random, "Kick / receive roll · away", 6, { chooser: 1 });
    if (home === away) record(s, "Kick / receive roll tied. Roll again.");
    else s.pending = { type: "receive-choice", chooser: home > away ? 0 : 1 };
    return;
  }
  if (s.pending.type === "receive-choice" && cmd.type === "chooseReceive") {
    s.firstReceiver = cmd.receive === true ? s.pending.chooser : 1 - s.pending.chooser;
    beginDrive(s, s.firstReceiver, random); return;
  }
  throw new Error("Complete the pre-game step first.");
}

export function driveCommand(s, cmd, random) {
  if (s.phase === "pregame") { pregameCommand(s, cmd, random); return true; }
  if (s.pending?.type === "setup") {
    if (cmd.type === "setupPlace") setupPlace(s, cmd.id, cmd.x, cmd.y);
    else if (cmd.type === "setupToggle") toggleSetupPlayer(s, cmd.id);
    else if (cmd.type === "setupAuto") autoSetup(s, s.pending.chooser, true);
    else if (cmd.type === "setupConfirm") confirmSetup(s);
    else throw new Error("Finish team selection and setup before playing.");
    return true;
  }
  if (s.pending?.type === "kick-event") { eventCommand(s, cmd, random); return true; }
  if (s.phase !== "kickoff") return false;
  if (s.pending?.type === "kicker" && cmd.type === "chooseKicker") nominateKicker(s, cmd.id);
  else if (s.pending?.type === "kick-target" && cmd.type === "kickTarget") {
    if (!inside(cmd.x, cmd.y) || !inOwnHalf(s, s.drive.receiver, cmd.x)) throw new Error("Kick into the receiving team's half.");
    s.drive.target = { x: cmd.x, y: cmd.y };
  } else if (s.pending?.type === "kick-target" && cmd.type === "kick") launchKick(s, random);
  else if (s.pending?.type === "touchback" && cmd.type === "touchback") {
    if (!s.pending.eligible.includes(cmd.id)) throw new Error("Choose an eligible receiver.");
    const p = getPlayer(s, cmd.id);
    const canHold = p.status === "standing" && !p.skills.includes("No Hands");
    s.ball = { carrier: canHold ? p.id : null, x: p.x, y: p.y };
    if (!canHold) catchBounce(s, random, p.x, p.y);
    record(s, `${p.name} takes the touchback.`); finishKickoff(s, random);
  } else throw new Error("Complete the kickoff before taking a turn.");
  return true;
}
