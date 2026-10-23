import { WIDTH, inside, direction, onPitch, getPlayer, playerAt, resetActivation, record } from "./model.mjs";
import { openingLineup } from "./squads.mjs";

export const isLineman = player => player.lineman ?? !player.specialist;
export const inOwnHalf = (s, side, x) => direction(s, side) === 1 ? x < WIDTH / 2 : x >= WIDTH / 2;
export const onLine = (s, p) => p.x === (direction(s, p.team) === 1 ? 9 : 10) && p.y >= 2 && p.y <= 8;
export const availableForDrive = p => ["standing", "prone", "stunned", "reserve"].includes(p.status);
export const fieldPlayers = (s, side) => s.players.filter(p => p.team === side && onPitch(p));

export function lineupRequirements(s, side) {
  const available = s.players.filter(p => p.team === side && availableForDrive(p));
  const linemen = available.filter(isLineman).length;
  return { count: Math.min(7, linemen + Math.min(4, available.length - linemen)), linemen: Math.min(3, linemen) };
}

export function lineupProblems(s, side) {
  const players = fieldPlayers(s, side), required = lineupRequirements(s, side), errors = [];
  if (players.length > 7) errors.push("At most seven players may play in a drive.");
  if (required.count && !players.length) errors.push("Field at least one available player.");
  if (players.filter(isLineman).length < required.linemen) errors.push(`Field at least ${required.linemen} Linemen.`);
  if (players.filter(p => !isLineman(p)).length > 4) errors.push("At most four specialists may play in a drive.");
  const lineCount = players.filter(p => onLine(s, p)).length;
  if (lineCount < Math.min(3, players.length)) errors.push("Place at least three players on the central Line of Scrimmage.");
  if (players.some(p => !inside(p.x, p.y) || !inOwnHalf(s, side, p.x))) errors.push("Set up entirely in your own half.");
  if ([players.filter(p => p.y < 2), players.filter(p => p.y > 8)].some(zone => zone.length > 1)) errors.push("Only one player is allowed in each wide zone.");
  return errors;
}

export function benchPlayer(p) { p.status = "reserve"; p.x = -1; p.y = -1; resetActivation(p); }

export function autoSetup(s, side, preserve = false) {
  const candidates = s.players.filter(p => p.team === side && availableForDrive(p));
  const current = candidates.filter(onPitch);
  const available = preserve && current.length ? current : candidates;
  const ids = openingLineup(available.map(p => ({ ...p, available: true })));
  const chosen = ids.map(id => getPlayer(s, id)).sort((a, b) => Number(isLineman(b)) - Number(isLineman(a)));
  candidates.forEach(benchPlayer);
  const positions = [[9, 4], [9, 5], [9, 6], [7, 3], [7, 7], [6, 8], [5, 5]];
  chosen.forEach((p, index) => {
    const [x, y] = positions[index];
    p.x = direction(s, side) === 1 ? x : WIDTH - 1 - x; p.y = y; p.status = "standing";
  });
}

export function setupPlace(s, id, x, y) {
  const side = s.pending.chooser, p = getPlayer(s, id);
  if (!p || p.team !== side || !availableForDrive(p)) throw new Error("Choose an available player from this team's bench.");
  if (!inside(x, y) || !inOwnHalf(s, side, x)) throw new Error("Choose a square in your own half.");
  const occupied = playerAt(s, x, y);
  if (occupied && occupied.id !== id) {
    if (!onPitch(p) || occupied.team !== side) throw new Error("That square is occupied.");
    occupied.x = p.x; occupied.y = p.y;
  }
  if (!onPitch(p) && fieldPlayers(s, side).length >= 7) throw new Error("Bench a player before adding a replacement.");
  p.x = x; p.y = y; p.status = "standing"; resetActivation(p);
}

export function toggleSetupPlayer(s, id) {
  const p = getPlayer(s, id), side = s.pending.chooser;
  if (!p || p.team !== side || !availableForDrive(p)) throw new Error("This player cannot enter this drive.");
  if (onPitch(p)) { benchPlayer(p); return; }
  for (const x of direction(s, side) === 1 ? [7, 6, 5, 8, 9, 4] : [12, 13, 14, 11, 10, 15]) {
    for (let y = 2; y <= 8; y++) if (!playerAt(s, x, y)) { setupPlace(s, id, x, y); return; }
  }
}

export function confirmLineup(s, side) {
  const errors = lineupProblems(s, side);
  if (errors.length) throw new Error(errors.join(" "));
  const required = lineupRequirements(s, side);
  if (required.count < 7 || required.linemen < 3) record(s, `Short-handed setup: ${required.count} players and ${required.linemen} available Linemen.`, "danger");
}
