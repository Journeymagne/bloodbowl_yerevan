import { PRACTICE_TEAMS, squadPlayers, teamName } from "./squads.mjs";
export { teamInfo, teamName } from "./squads.mjs";

export const WIDTH = 20;
export const HEIGHT = 11;
export const BLOCK_FACES = ["skull", "both", "push", "push", "stumble", "pow"];
export const FACE_LABELS = { skull: "Attacker Down", both: "Both Down", push: "Push", stumble: "Defender Stumbles", pow: "Defender Down" };
const names = [
  ["Aram", "Levon", "Davit", "Vardan", "Tigran", "Hayk", "Narek"],
  ["Gorbak", "Urzag", "Morg", "Grak", "Ruk", "Zog", "Borz"],
];

function makePlayer(team, index) {
  const role = index < 3 ? "Lineman" : index < 5 ? "Blitzer" : index === 5 ? "Thrower" : "Lineman";
  const skills = index === 5 ? ["Pass", "Sure Hands"] : index === 3 || index === 4
    ? ["Block", team === 0 ? "Tackle" : "Break Tackle"] : [];
  return {
    id: `${team}-${index}`, team, number: index + 1, name: names[team][index] || `Reserve ${index - 6}`, role, skills,
    specialist: role !== "Lineman", lineman: role === "Lineman", available: true,
    ma: (team === 0 ? 6 : 5) + (index === 3 || index === 4 ? 1 : 0) + (team === 1 && index === 5 ? 1 : 0),
    st: 3, ag: 3, pa: index === 5 ? 3 : 4, av: team === 0 || index === 5 ? 9 : 10,
    x: -1, y: -1,
    status: "standing", used: false, moved: 0, acted: false, dodgeUsed: false, spp: 0, stunTurn: -1,
  };
}

export function createMatch(teams = null) {
  const state = {
    version: 0, half: 1, active: 0, turn: [0, 0], driveTurns: [0, 0], score: [0, 0], phase: "pregame",
    rerolls: [2, 2], rerollUsed: false, blitzUsed: false, passUsed: false, handoffUsed: false,
    activation: null, action: null, pending: { type: "pregame", chooser: 0 }, finished: false,
    players: [0, 1].flatMap(team => Array.from({ length: 10 }, (_, i) => makePlayer(team, i))),
    ball: { carrier: null, x: -1, y: -1, airborne: true },
    log: [{ text: "Match preparation. All players are in reserve. Roll the weather, then decide who kicks.", kind: "info" }],
    dice: [], rollCount: 0, lastRoll: null, notice: "Start the pre-game sequence in the drive panel.",
    weather: { id: "normal", name: "Perfect Conditions", season: "Autumn" }, firstReceiver: null,
    drive: null, driveRerolls: [0, 0], cheering: [false, false], bribes: teams ? teams.map(team => team.bribes || 0) : [0, 0],
    teams: structuredClone(teams || PRACTICE_TEAMS), initialRerolls: teams ? teams.map(team => team.rerolls) : [2, 2],
    setup: teams ? structuredClone(teams) : null,
  };
  if (teams) {
    state.players = squadPlayers(teams);
    state.rerolls = [...state.initialRerolls];
    state.log.push({ text: `${teamName(state, 0)} vs ${teamName(state, 1)}. Full rosters loaded; exhibitions do not update league records.`, kind: "info" });
  }
  for (const p of state.players) if (p.status !== "unavailable") p.status = "reserve";
  return state;
}

export const inside = (x, y) => Number.isInteger(x) && Number.isInteger(y) && x >= 0 && x < WIDTH && y >= 0 && y < HEIGHT;
export const onPitch = p => ["standing", "prone", "stunned"].includes(p.status);
export const distance = (a, b) => Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
export const playerAt = (s, x, y) => s.players.find(p => onPitch(p) && p.x === x && p.y === y);
export const getPlayer = (s, id) => s.players.find(p => p.id === id);
export const direction = (s, team) => (team === 0 ? 1 : -1) * (s.half === 1 ? 1 : -1);
export const endZone = (s, team) => direction(s, team) === 1 ? WIDTH - 1 : 0;
export const zones = (s, p, x = p.x, y = p.y) => s.players.filter(q =>
  q.team !== p.team && q.status === "standing" && distance(q, { x, y }) === 1).length;

export function record(s, text, kind = "info") {
  if (kind === "chat" && s.pending?.type === "roll") s.pending.transaction.chat.push({ text, kind });
  s.log.push({ text, kind });
  s.log = s.log.slice(-100);
  s.notice = text;
}

export function displayRoll(s, request, values, source = null) {
  const { label, sides, kind } = request;
  s.rollCount += values.length;
  s.dice.push(...values.map(value => ({ label, value, sides, kind })));
  s.dice = s.dice.slice(-6);
  s.lastRoll = { ...request, id: s.rollCount, values, source };
  const results = values.map(value => kind === "block" ? FACE_LABELS[BLOCK_FACES[value - 1]] : value).join(" · ");
  record(s, `${label}${source ? ` (${source} reroll)` : ""}: ${results}.`, "dice");
}

export function rollDice(s, random, label, options = {}) {
  const request = { label, sides: 6, count: 1, kind: "d6", chooser: s.active, ...options };
  if (random.roll) return random.roll(s, request);
  const values = Array.from({ length: request.count }, () => Math.floor(random() * request.sides) + 1);
  displayRoll(s, request, values);
  return values;
}

export function rollDie(s, random, label, sides = 6, options = {}) {
  return rollDice(s, random, label, { sides, kind: sides === 8 ? "d8" : sides === 6 ? "d6" : "number", ...options })[0];
}

export function resetActivation(p) {
  p.used = false; p.moved = 0; p.acted = false; p.dodgeUsed = false;
}

/** Shortest walk around occupied squares, including prone players. */
export function reachable(s, p) {
  const result = new Map();
  if (!p || !onPitch(p) || p.status === "stunned" || p.used || p.team !== s.active || s.pending || s.finished
    || !["play", "kickoff-blitz"].includes(s.phase) || (s.phase === "kickoff-blitz" && s.drive.blitzer !== p.id)) return result;
  const stand = p.status === "prone" ? 3 : 0;
  const budget = p.ma + 2 - p.moved - stand;
  const queue = [{ x: p.x, y: p.y, path: [] }];
  const visited = new Set([`${p.x},${p.y}`]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (current.path.length >= budget) continue;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const x = current.x + dx, y = current.y + dy, key = `${x},${y}`;
      if ((!dx && !dy) || !inside(x, y) || visited.has(key) || playerAt(s, x, y)) continue;
      visited.add(key);
      const path = [...current.path, { x, y }];
      result.set(key, path);
      queue.push({ x, y, path });
    }
  }
  return result;
}
