/**
 * The score against the match records (stage 09b): what a side's records add up to, where they and the
 * agreed score part, the points the table gives for the match and what they are made of, who may be MVP
 * (the ones who stood out first), and who comes back for the next match or misses it. Pure: no DOM and
 * no words — the post-match steps say it.
 *
 * A side's records are its statistics (the plan's decision 4). A side begun in 3.0 carries the
 * `followsEvents` key: until its coach saves the Players step it reads its statistics and injuries from
 * the match events again on every read (`followEvents`), and that save writes the difference back as
 * events (`eventsDiff`), so what the side holds is what its records say — its own and the opponent's
 * alike, with no second read. A side begun before 3.0 has no events behind its numbers: it has no
 * records, and nothing of it is "against the records".
 *
 * A mismatch is what `validateStatistics` refuses at `lock-players`: TD and CAS (crowd and foul
 * casualties are part of CAS) against the score, nil for a technical result, the TD of the side that
 * conceded (either way of conceding) not compared. The points are `matchPoints`, the server's, with the
 * parts they are made of; a technical win is 2 (content: "2 points for a technical win").
 */
import { SIDES, otherSide } from '../match/rules.mjs';
import { matchPoints, seasonPoints } from '../league-rules.mjs';
import { sppCounterWeights } from '../roster/progression.mjs';
import { effectiveInjury, mvpCount } from './rules.mjs';
import { earnedCounters } from './statistics.mjs';
import { MATCH_COUNTERS } from './events.mjs';

/** Every part the points of a match are made of, in the order `postPoints` lists them. */
export const POINT_PARTS = Object.freeze(['win', 'draw', 'loss', 'bigWin', 'shutout', 'casualties', 'technical']);

const TECHNICAL_WIN = 2;
const SCORE_COUNTERS = ['touchdowns', 'casualties'];
const SKIPPING = ['miss', 'niggling', 'lasting']; // the injuries that keep a player out of the next match

/** True for a side begun in 3.0: its statistics are the match's records. */
export function hasRecords(side) {
  return Object.hasOwn(side, 'followsEvents');
}

/**
 * What a side's records add up to: its TD and CAS, how many steps they are (every counter a match taps,
 * and each injury standing), and the players of the snapshot with a TD or a CAS, in its order. Null for
 * a side begun before 3.0.
 *
 * @returns {null | {touchdowns: number, casualties: number, count: number,
 *   scorers: {id: string, number: string, name: string, touchdowns: number, casualties: number}[]}}
 */
export function sideRecords(side) {
  if (!hasRecords(side)) return null;
  const counted = (id, counter) => Number(side.statistics[id]?.[counter]) || 0;
  const sum = counter => Object.keys(side.statistics).reduce((total, id) => total + counted(id, counter), 0);
  const injuries = Object.values(side.injuries).filter(injury => injury && injury.code !== 'none').length;
  const scorers = side.snapshot.players.filter(({ id }) => counted(id, 'touchdowns') || counted(id, 'casualties'))
    .map(({ id, number, name }) => ({ id, number, name, touchdowns: counted(id, 'touchdowns'), casualties: counted(id, 'casualties') }));
  return { touchdowns: sum('touchdowns'), casualties: sum('casualties'),
    count: MATCH_COUNTERS.reduce((total, counter) => total + sum(counter), 0) + injuries, scorers };
}

/**
 * Where the agreed score and the records part, side by side: what `lock-players` would refuse with
 * POST_STATISTICS. A side without records has none; with no score yet there is nothing to compare.
 *
 * @returns {{side: "home"|"away", counter: "touchdowns"|"casualties", score: number, records: number}[]}
 */
export function scoreMismatches(state) {
  const result = state.result;
  if (!result) return [];
  const mismatches = [];
  for (const name of SIDES) {
    const records = sideRecords(state[name]);
    if (!records) continue;
    for (const counter of SCORE_COUNTERS) {
      if (counter === 'touchdowns' && result.mode.startsWith('conceded') && result.winner !== name) continue;
      const score = result.mode === 'technical' ? 0 : result[name][counter];
      if (score !== records[counter]) mismatches.push({ side: name, counter, score, records: records[counter] });
    }
  }
  return mismatches;
}

/**
 * A side's points for the match, as the table counts them, and the parts they add up to. A friendly is
 * none; a technical result is 2 to the winner, nothing to the loser.
 *
 * @param {string} kind the match's kind (`match_kind`): "friendly" gives no points
 * @returns {{total: number, parts: {key: string, points: number}[]}} each `key` one of `POINT_PARTS`
 */
export function postPoints(state, name, kind) {
  const result = state.result;
  if (kind === 'friendly' || !result) return { total: 0, parts: [] };
  if (result.mode === 'technical') {
    return result.winner === name ? { total: TECHNICAL_WIN, parts: [{ key: 'technical', points: TECHNICAL_WIN }] }
      : { total: seasonPoints.loss, parts: [{ key: 'loss', points: seasonPoints.loss }] };
  }
  const scored = result[name].touchdowns, conceded = result[otherSide(name)].touchdowns, casualties = result[name].casualties;
  const outcome = scored > conceded ? 'win' : scored === conceded ? 'draw' : 'loss';
  const parts = [{ key: outcome, points: seasonPoints[outcome] }];
  if (outcome === 'win' && scored - conceded >= seasonPoints.bigWinMargin) parts.push({ key: 'bigWin', points: seasonPoints.bigWinBonus });
  if (scored > 0 && conceded === 0) parts.push({ key: 'shutout', points: seasonPoints.shutoutBonus });
  if (casualties >= seasonPoints.casualtyThreshold) parts.push({ key: 'casualties', points: seasonPoints.casualtyBonus });
  return { total: matchPoints({ touchdownsFor: scored, touchdownsAgainst: conceded, casualtiesFor: casualties }), parts };
}

// A shirt number to sort by: one that is not a number goes last.
const byNumber = (left, right) => {
  const order = value => { const number = Number(value); return Number.isFinite(number) ? number : Number.MAX_SAFE_INTEGER; };
  return order(left.number) - order(right.number);
};

/**
 * Who the side may name MVP: the snapshot's players but the stars and the dead (rookie protection
 * applied). `top` are the ones who stood out — SPP earned in the match, the MVP's own left out — most
 * first, in the snapshot's order where equal; `rest` the others by number. `count` is how many MVPs the
 * side names (`mvpCount`: two to the winner of a technical result or a full concession, none to its loser).
 *
 * @returns {{count: number, top: {id: string, number: string, name: string, spp: number}[],
 *   rest: {id: string, number: string, name: string, spp: number}[]}}
 */
export function mvpChoices(state, name) {
  const side = state[name], weights = sppCounterWeights(side.reference);
  const spp = id => Object.entries(earnedCounters(state, name, id))
    .reduce((total, [counter, count]) => counter === 'mvps' ? total : total + count * (weights[counter] || 0), 0);
  const fit = side.snapshot.players.filter(player => player.kind !== 'star' && effectiveInjury(side, player.id).code !== 'dead')
    .map(player => ({ id: player.id, number: player.number, name: player.name, spp: spp(player.id) }));
  const stoodOut = choice => choice.spp > 0;
  return { count: mvpCount(state, name),
    top: fit.filter(stoodOut).sort((left, right) => right.spp - left.spp),
    rest: fit.filter(choice => !stoodOut(choice)).sort(byNumber) };
}

/**
 * Who of the roster after this post-match (`projectPostRoster(...).roster`) comes back for the next
 * match — missed this one's next game before, plays it now — and who misses it: with the injury of this
 * post-match that keeps the player out (rookie protection applied), or null for an earlier reason, and
 * whether the player is retired for now. Both in the roster's order.
 *
 * @returns {{returning: {id: string, number: string, name: string}[],
 *   missing: {id: string, number: string, name: string, injury: object|null, retired: boolean}[]}}
 */
export function nextMatchChanges(state, name, roster) {
  const side = state[name], skipped = new Set(side.baseRoster.players.filter(player => player.skipNextGame).map(player => player.id));
  const person = player => ({ id: player.id, number: player.number, name: player.name });
  const missing = roster.players.filter(player => player.skipNextGame).map(player => {
    const injury = effectiveInjury(side, player.id);
    return { ...person(player), injury: SKIPPING.includes(injury.code) ? { ...injury } : null, retired: Boolean(player.temporarilyRetired) };
  });
  return { returning: roster.players.filter(player => skipped.has(player.id) && !player.skipNextGame).map(person), missing };
}
