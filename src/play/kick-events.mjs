import { getPlayer, playerAt, rollDie, rollDice, record, zones, distance, inside, teamInfo, resetActivation } from "./model.mjs";
import { fieldPlayers, confirmLineup, inOwnHalf } from "./lineup.mjs";
import { changedWeather, randomOnPitch } from "./kick-weather.mjs";
import { landKick } from "./drives.mjs";

export const KICK_EVENTS = {
  2: ["Bribes", "Each team receives one Bribe for this match."],
  3: ["Timeout", "Both turn markers move back if the kicking marker is 4+, otherwise forward."],
  4: ["Solid Defence", "D3+1 Open kicking players may reposition, keeping a legal formation."],
  5: ["High Kick", "One Open receiver may move under the ball."],
  6: ["Cheering Fans", "D6 + cheerleaders. Winners gain +1 ST for their next Block; ties benefit both."],
  7: ["Brilliant Coaching", "D6 + assistant coaches. Winners gain one reroll for this drive; ties benefit both."],
  8: ["Changing Weather", "Roll on GATA's Autumn weather table. Normal weather scatters the ball three times."],
  9: ["Quick Snap", "D3+1 Open receivers may each move one square."],
  10: ["Blitz", "One Open kicking player may take a Move or Blitz before the ball lands."],
  11: ["Fight with the Ref", "Each coach nominates three players. One from each selection is sent off until half-time."],
  12: ["Pitch Invasion", "One random player from each team is Stunned."],
};

const openPlayers = (s, side) => fieldPlayers(s, side).filter(p => p.status === "standing" && zones(s, p) === 0);
const eventPending = (s, event, side, limit = 1) => ({
  type: "kick-event", event, chooser: side, limit, moved: [], nominated: [],
  eligible: (event === 11 ? fieldPlayers(s, side) : openPlayers(s, side)).map(p => p.id),
});

function staffContest(s, random, event) {
  const key = event === 6 ? "cheerleaders" : "assistantCoaches", title = KICK_EVENTS[event][0];
  const rolls = [0, 1].map(side => rollDie(s, random, `${title} · ${side === 0 ? "home" : "away"}`, 6,
    { chooser: side, detail: `${teamInfo(s, side)[key] || 0} ${key}` }) + Number(teamInfo(s, side)[key] || 0));
  for (const side of [0, 1]) if (rolls[side] >= rolls[1 - side]) {
    if (event === 6) s.cheering[side] = true;
    else s.driveRerolls[side]++;
  }
}

export function kickoffEvent(s, random) {
  const event = rollDice(s, random, "GATA kickoff event", { count: 2, chooser: s.drive.receiver }).reduce((a, b) => a + b, 0);
  s.drive.event = event; record(s, `${KICK_EVENTS[event][0]}: ${KICK_EVENTS[event][1]}`, "turn");
  if ([4, 5, 9, 10, 11].includes(event)) {
    const side = [4, 10, 11].includes(event) ? s.drive.kicker : s.drive.receiver;
    const limit = [4, 9].includes(event) ? Math.ceil(rollDie(s, random, `${KICK_EVENTS[event][0]} · D3 + 1`, 6, { chooser: side }) / 2) + 1 : event === 11 ? 3 : 1;
    s.pending = eventPending(s, event, side, limit);
    if (event === 11) s.pending.nextSide = s.drive.receiver;
    if (s.pending.eligible.length) return;
    if (event === 11) { nextRefSide(s, random); return; }
  } else if (event === 2) s.bribes = s.bribes.map(value => value + 1);
  else if (event === 3) {
    const change = s.turn[s.drive.kicker] >= 4 ? -1 : 1;
    s.turn = s.turn.map(turn => Math.max(0, Math.min(6, turn + change)));
  } else if ([6, 7].includes(event)) staffContest(s, random, event);
  else if (event === 8) changedWeather(s, random);
  else if (event === 12) {
    for (const side of [0, 1]) {
      const p = randomOnPitch(s, random, fieldPlayers(s, side), "Pitch Invasion · random player", side);
      if (p) { p.status = "stunned"; p.stunTurn = s.turn[side]; record(s, `${p.name} is Stunned.`); }
    }
  }
  landKick(s, random);
}

function nextRefSide(s, random) {
  const next = s.pending.nextSide;
  if (next !== undefined) {
    s.pending = eventPending(s, 11, next, 3);
    if (s.pending.eligible.length) return;
  }
  landKick(s, random);
}

function eventMove(s, cmd) {
  const event = s.pending, p = getPlayer(s, cmd.id);
  if (!event.eligible.includes(cmd.id) || event.moved.includes(cmd.id)) throw new Error("Choose an eligible Open player who has not moved.");
  if (event.moved.length >= event.limit) throw new Error("All event moves have been used.");
  let { x, y } = cmd;
  if (event.event === 5) ({ x, y } = s.drive.landing);
  if (!inside(x, y) || playerAt(s, x, y)) throw new Error("Choose an empty square on the pitch.");
  if (event.event === 4 && !inOwnHalf(s, p.team, x)) throw new Error("Solid Defence must stay in your own half.");
  if (event.event === 5 && !inOwnHalf(s, s.drive.receiver, x)) throw new Error("This kick is a touchback; skip High Kick.");
  if (event.event === 9 && distance(p, { x, y }) !== 1) throw new Error("Quick Snap moves exactly one square.");
  p.x = x; p.y = y; event.moved.push(p.id);
  record(s, `${KICK_EVENTS[event.event][0]}: ${p.name} moves.`);
}

function chooseBlitzer(s, id) {
  if (!s.pending.eligible.includes(id)) throw new Error("Choose an Open kicking player.");
  s.drive.blitzer = id; s.phase = "kickoff-blitz"; s.active = s.drive.kicker; s.pending = null;
  s.activation = null; s.action = null; s.blitzUsed = false;
  resetActivation(getPlayer(s, id));
  record(s, "Kickoff Blitz: move or blitz with this player, then finish the event. Team rerolls are unavailable.");
}

export function eventCommand(s, cmd, random) {
  const event = s.pending;
  if (cmd.type === "eventMove" && [4, 5, 9].includes(event.event)) eventMove(s, cmd);
  else if (cmd.type === "eventPlayer" && event.event === 10) chooseBlitzer(s, cmd.id);
  else if (cmd.type === "eventPlayer" && event.event === 5) eventMove(s, cmd);
  else if (cmd.type === "eventNominate" && event.event === 11) {
    if (!event.eligible.includes(cmd.id)) throw new Error("Choose a player on the pitch.");
    event.nominated = event.nominated.includes(cmd.id) ? event.nominated.filter(id => id !== cmd.id) : [...event.nominated, cmd.id];
    if (event.nominated.length > 3) throw new Error("Nominate at most three players.");
  } else if (cmd.type === "eventConfirm") {
    if (event.event === 4) confirmLineup(s, event.chooser);
    if (event.event === 11) {
      if (event.nominated.length !== Math.min(3, event.eligible.length)) throw new Error("Nominate three players, or all remaining players if fewer.");
      const p = randomOnPitch(s, random, event.nominated.map(id => getPlayer(s, id)), "Fight with the Ref · player", event.chooser);
      p.status = "sent-off"; p.sentOffHalf = s.half; p.x = -1; p.y = -1;
      record(s, `${p.name} is sent off until the end of this half.`, "danger");
      nextRefSide(s, random);
    } else landKick(s, random);
  } else throw new Error("Resolve the kickoff event first.");
}
