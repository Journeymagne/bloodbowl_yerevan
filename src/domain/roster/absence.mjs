/**
 * Why a player misses the next match, as a coach marks it on the roster (design spec 3.0 §3.3): the reason,
 * the missed match, and what the injury itself does — the same thing a post-match does with it
 * (`applyInjuryEffects`, which the post-match calls too). Back on the roster ends the missed match only. Pure.
 */
import { ABSENCE_CODES, normalizeAbsence } from "./schema.mjs";
import { storedPlayerId } from "./players.mjs";
import { PLAYER_STATS } from "./values.mjs";

/**
 * What an injury does to the player, in place: a Niggling Injury is counted (a 2.x player with the flag and
 * no count already has one), a lasting injury takes a point off the characteristic, in the total and in the
 * injury's own tally. The other codes do nothing here; missing the match is not an effect of the injury.
 *
 * @param {object} player changed in place
 * @param {{code: string, stat?: string}} injury
 */
export function applyInjuryEffects(player, injury) {
  if (injury.code === "niggling") {
    player.nigglingInjuries = Number(player.nigglingInjuries ?? (player.niglingInjury ? 1 : 0)) + 1;
    player.niglingInjury = true;
  }
  if (injury.code === "lasting" && PLAYER_STATS.includes(injury.stat)) {
    player.statMods ||= {};
    player.statMods[injury.stat] = Number(player.statMods[injury.stat] || 0) - 1;
    player.injuryStatMods ||= {};
    player.injuryStatMods[injury.stat] = Number(player.injuryStatMods[injury.stat] || 0) - 1;
  }
}

/**
 * The player as a coach marks him absent: sitting out the next match, with the reason, and what the injury
 * does applied. A copy; the input is left alone. A mark that is not whole is the caller's bug (the screen
 * checks first), so it throws.
 *
 * @param {object} player
 * @param {{code: string, stat?: string, note?: string}} mark `stat` is read for `lasting`, `note` for `other`
 */
export function markAbsence(player, mark) {
  const code = mark?.code;
  if (!ABSENCE_CODES.includes(code)) throw new Error(`An absence has no code ${String(code)}`);
  if (code === "lasting" && !PLAYER_STATS.includes(mark.stat)) throw new Error("A lasting injury names the characteristic it took");
  if (code === "other" && !(typeof mark.note === "string" && mark.note.trim())) throw new Error("An absence of another kind says what it is");
  const marked = structuredClone(player);
  applyInjuryEffects(marked, { code, stat: mark.stat });
  marked.skipNextGame = true;
  marked.absence = normalizeAbsence({ code, stat: code === "lasting" ? mark.stat : undefined, note: code === "other" ? mark.note : undefined });
  return marked;
}

/**
 * The player back on the roster: the missed match and its reason are over. What the injury did stays — a
 * Niggling Injury, a characteristic down — and so does a player's temporary retirement. A copy.
 */
export function clearAbsence(player) {
  return { ...structuredClone(player), skipNextGame: false, absence: null };
}

const sitsOut = (player) => Boolean(player.skipNextGame || player.temporarilyRetired);
const reasonOf = (player) => JSON.stringify(normalizeAbsence(player.absence, sitsOut(player)));

/**
 * How many players of a roster save sit out differently from what they did before it: the same id (as text,
 * `storedPlayerId`) in both, whether he misses the next match (`skipNextGame` or `temporarilyRetired`)
 * or why (`normalizeAbsence`) not the same. A player who was not on the roster before is not counted. Both
 * rosters are read by their `players`, the way `sppEdits` reads them; anything else counts as none.
 */
export function markEdits(before, after) {
  const was = new Map();
  for (const player of before?.players ?? []) if (storedPlayerId(player) !== null) was.set(storedPlayerId(player), player);
  let count = 0;
  for (const player of after?.players ?? []) {
    const prior = was.get(storedPlayerId(player));
    if (prior && (sitsOut(prior) !== sitsOut(player) || reasonOf(prior) !== reasonOf(player))) count += 1;
  }
  return count;
}
