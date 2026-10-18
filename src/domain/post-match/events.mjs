/**
 * Match events: what the coaches tap during a game (`match_events`, migrations 014 and 016), read into the
 * numbers the post-match works with.
 *
 * A counter is one of the roster's SPP counters, plus the injury. A match taps all of them but the MVP
 * (`MATCH_COUNTERS`), which is picked in the post-match; an edit outside a match steps any of them, the
 * MVP included (016, the owner's decision at M1), so a hand-edited MVP has its row in the history.
 * The post-match takes its statistics and injuries from the rows of a match, the
 * "Players" step appends the difference so that the rows and the entered numbers agree, and
 * finishing the post-match sets `settled_at`. A live career is the blob plus the rows not yet settled
 * (a preview, see `careerCounters`).
 * A row without a match is an edit outside one: a roster save writes its SPP change as settled rows
 * (`sppEdits`), and one made while a match is on waits for the finish to add it to the blob
 * (`applyOutsideEdits`).
 * Crowd and foul casualties are not tapped, so no row ever carries them.
 *
 * A row is one step of +1 or -1. Sums are plain sums of `delta`; they are clamped to the
 * 0..99 `postCount` allows only when read as statistics, and a difference aims at the raw
 * sum, so what the clamp hid is taken back too. The module is pure.
 */
import { normalizeSppCounters } from '../roster/players.mjs';
import { boundedSppCounter } from '../roster/validate.mjs';
import { PLAYER_STATS } from '../roster/values.mjs';
import { SIDES } from '../match/rules.mjs';
import { INJURIES, POST_STEPS, postCount } from './rules.mjs';
import { normalizeMatchStats } from './statistics.mjs';

// The order of the CHECK on `counter` in 016.
export const EVENT_COUNTERS = Object.freeze(['touchdowns', 'casualties', 'knockouts', 'completions', 'catches', 'interceptions', 'throws', 'landings', 'bonus', 'mvps', 'injury']);
// What an edit outside a match steps: the roster's SPP counters, the MVP among them (the injury's step is no count).
export const SPP_EVENT_COUNTERS = Object.freeze(EVENT_COUNTERS.filter(counter => counter !== 'injury'));
// What a match taps and the post-match reads: the MVP is picked there, never tapped.
export const MATCH_COUNTERS = Object.freeze(SPP_EVENT_COUNTERS.filter(counter => counter !== 'mvps'));
const MAX_COUNT = 99; // postCount's bound
const PLAYERS_STAGE = POST_STEPS.indexOf('players'); // a side past it keeps what its coach saved
const isStep = event => event.delta === 1 || event.delta === -1;
const isInjuryEvent = event => event.counter === 'injury';

// The events of each player, in the order given; a row that is not a +1 or a -1 is not read.
function groupByPlayer(events) {
  const groups = new Map();
  for (const event of events) {
    if (!isStep(event)) continue;
    if (!groups.has(event.playerId)) groups.set(event.playerId, []);
    groups.get(event.playerId).push(event);
  }
  return groups;
}

// Raw sum of the steps of each of `counters`; a counter outside them (the injury, crowdCasualties, and the MVP of a match) is no sum.
function sumCounters(events, counters) {
  const sums = Object.fromEntries(counters.map(counter => [counter, 0]));
  for (const event of events) if (Object.hasOwn(sums, event.counter)) sums[event.counter] += event.delta;
  return sums;
}

/**
 * The raw sum of one player's steps on one counter: what the rows add up to before any clamp, so it can
 * be below zero. A -1 is checked against it (server/routes/team-events.mjs): a step down where the rows
 * it would take back add up to nothing takes back nothing, and the next step up would vanish into it.
 */
export function eventTotal(events, playerId, counter) {
  let total = 0;
  for (const event of events) if (isStep(event) && event.playerId === playerId && event.counter === counter) total += event.delta;
  return total;
}

// `{ code }` for an injury of the table, `{ code, stat }` for a lasting one with a characteristic, else null.
// "none" is not an injury, and a stat on any other injury is dropped.
function eventInjury(value) {
  if (!value || typeof value !== 'object' || !INJURIES.includes(value.code) || value.code === 'none') return null;
  if (value.code !== 'lasting') return { code: value.code };
  return PLAYER_STATS.includes(value.stat) ? { code: value.code, stat: value.stat } : null;
}

/**
 * True for an injury the way an event stores it, as the one `eventInjury` reads out of it: `{ code }`, or
 * `{ code: 'lasting', stat }`, and no key of its own beyond those. Anything else (none, a stat on another
 * injury, a lasting one with no characteristic, a stray key, a non-object) would not read back as itself.
 * The gate for a row about to be written.
 */
export function isValidEventInjury(value) {
  const normal = eventInjury(value);
  return normal !== null && sameValues(value, normal);
}

const sameInjury = (left, right) => Boolean(left && right) && left.code === right.code && left.stat === right.stat;

// The injuries still standing for one player, oldest first: +1 puts one on, -1 takes back
// the latest identical one (an undo), and a -1 with nothing to take back does nothing.
function standingInjuries(events) {
  const standing = [];
  for (const event of events) {
    const injury = eventInjury(event.injury);
    if (!injury) continue;
    if (event.delta > 0) { standing.push(injury); continue; }
    const at = standing.findLastIndex((item) => sameInjury(item, injury));
    if (at >= 0) standing.splice(at, 1);
  }
  return standing;
}

/**
 * The statistics and injuries the events add up to: one row per player of the snapshot, journeymen
 * and stars included, in the snapshot's order. A player outside the snapshot is not read.
 * The injury is the latest one still standing; `retire` is the coach's to set on the Players step.
 * Injury events record the injury as entered. Rookie protection (`effectiveInjury`, while the team has
 * fewer than 3 games played) may turn it into Badly Hurt in the roster, so a per-match history of
 * injuries must apply the same rule, with the side's `gamesPlayed`, instead of reading the events as what happened.
 */
export function statisticsFromEvents(snapshot, events = []) {
  const groups = groupByPlayer(events);
  const statistics = {}, injuries = {};
  for (const { id } of snapshot.players) {
    const own = groups.get(id) || [];
    const sums = sumCounters(own, MATCH_COUNTERS);
    statistics[id] = normalizeMatchStats(Object.fromEntries(MATCH_COUNTERS.map(counter => [counter, Math.min(MAX_COUNT, Math.max(0, sums[counter]))])));
    const standing = standingInjuries(own.filter(isInjuryEvent)).at(-1);
    if (standing) injuries[id] = { ...standing, retire: false };
  }
  return { statistics, injuries };
}

// n rows of a step, as many as the gap is wide.
function stepsOf(gap, row) {
  return Array.from({ length: Math.abs(gap) }, () => ({ ...row, delta: Math.sign(gap) }));
}

// The injury rows that leave `target` on top of the stack: take back what stands above it, and
// when nothing of it stands at all, put it on.
function injuryRows(playerId, own, target) {
  const standing = standingInjuries(own);
  const rows = [];
  while (standing.length && !sameInjury(standing.at(-1), target)) {
    rows.push({ playerId, counter: 'injury', delta: -1, injury: standing.pop() });
  }
  if (!standing.length && target) rows.push({ playerId, counter: 'injury', delta: 1, injury: target });
  return rows;
}

/**
 * The rows that make the events add up to the entered numbers: `{ statistics, injuries }` is a side
 * of the post-match (or what `statisticsFromEvents` returned), the rows are ±1 steps. Players in key
 * order, each with their counters in table order and then the injury. A player outside `statistics`
 * is not touched, and a counter a match does not tap (the MVP; crowd and foul casualties) gets no row.
 * Applied, the rows make `statisticsFromEvents` read exactly what was entered; a second difference is empty.
 */
export function eventsDiff({ statistics, injuries }, events) {
  const groups = groupByPlayer(events);
  const rows = [];
  for (const playerId of Object.keys(statistics)) {
    const own = groups.get(playerId) || [], entered = statistics[playerId] || {};
    const sums = sumCounters(own, MATCH_COUNTERS);
    for (const counter of MATCH_COUNTERS) rows.push(...stepsOf(postCount(entered[counter]) - sums[counter], { playerId, counter }));
    rows.push(...injuryRows(playerId, own.filter(isInjuryEvent), eventInjury(injuries?.[playerId])));
  }
  return rows;
}

/**
 * A player's counters for a career while a match is on: the blob plus the events not yet settled, never
 * below zero. The injury is not a counter (its events are read as entered, see `statisticsFromEvents`).
 * The MVP a match will give is picked at its finish, so no tap of the match is in it; one edited outside
 * the match is.
 *
 * It is a preview, not what the finish will leave in the blob. "Settled" means a finished post-match
 * applied the statistics (`settled_at`), not that every event became SPP: a technical result counts only
 * the MVPs, a conceded loser and the stars nothing, and prayer bonuses add counters nobody tapped. So
 * the career can change at the finish, up or down. It can also sit below the roster's value in a live
 * match: an edit outside the match that steps a counter down comes off the blob's total (a -1 of the
 * match's own only takes back a tap of it). Read the blob and the events in one snapshot, or a finish
 * between the two reads counts a match twice or not at all.
 */
export function careerCounters(player, events = []) {
  const own = groupByPlayer(events.filter(event => !event.settledAt)).get(player.id) || [];
  const sums = sumCounters(own, SPP_EVENT_COUNTERS);
  const result = normalizeSppCounters(player.spp);
  for (const counter of SPP_EVENT_COUNTERS) result[counter] = Math.max(0, result[counter] + sums[counter]);
  return result;
}

const hasId = player => typeof player?.id === 'string' && player.id !== '';

/**
 * A roster save's change to SPP, as the rows of an edit outside a match: for every player with an id
 * in both rosters, in the order of `after`, each SPP counter (`SPP_EVENT_COUNTERS`: the table's order, the
 * MVP last, no injury) moved by as many steps of +1 or -1 as its value moved, the values read as the history
 * counts them (`boundedSppCounter`: the roster's reading, held to 0…999 and cut to a whole number). A player
 * who came or went has no value to move from or to: he gets no row.
 *
 * An edit outside a match changes the blob at once and is kept as settled rows, so the history can show it.
 * A roster is only taken with counters inside that bound, so the bound bites only a blob stored before
 * the rule: a legacy value outside it (5000, 2.5) changes the blob without rows for what lies outside.
 */
export function sppEdits(before, after) {
  const was = new Map((before?.players ?? []).filter(hasId).map(player => [player.id, player]));
  const rows = [];
  for (const player of (after?.players ?? []).filter(hasId)) {
    if (!was.has(player.id)) continue;
    const from = was.get(player.id).spp, to = player.spp;
    for (const counter of SPP_EVENT_COUNTERS) {
      rows.push(...stepsOf(boundedSppCounter(to?.[counter]) - boundedSppCounter(from?.[counter]), { playerId: player.id, counter, injury: null }));
    }
  }
  return rows;
}

/**
 * The roster with the edits outside a match that waited for a finish added to it: each player on the
 * roster gets the sum of his rows on each counter they step, never below zero, and nothing else of him
 * changes. A row of an injury, or of a player no longer on the roster, is not read (it is settled all
 * the same, see server/season/match-events-store.mjs). A copy; the input is left alone.
 */
export function applyOutsideEdits(roster, events) {
  const groups = groupByPlayer(events.filter(event => !isInjuryEvent(event)));
  const next = structuredClone(roster);
  for (const player of next?.players ?? []) {
    const own = groups.get(player?.id);
    if (!own) continue;
    const sums = sumCounters(own, SPP_EVENT_COUNTERS), base = normalizeSppCounters(player.spp);
    const stepped = SPP_EVENT_COUNTERS.filter(counter => sums[counter] !== 0);
    if (stepped.length) player.spp = { ...player.spp, ...Object.fromEntries(stepped.map(counter => [counter, Math.max(0, base[counter] + sums[counter])])) };
  }
  return next;
}

// Same values whatever the order of the keys, the way two JSON texts of them would read: Postgres jsonb
// hands an object back with its keys reordered and without the keys that held undefined, so comparing
// stringified copies would call every stored state changed.
export function sameValues(left, right) {
  if (left === right) return true;
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object' || Array.isArray(left) !== Array.isArray(right)) return false;
  if (Array.isArray(left)) return left.length === right.length && left.every((item, at) => sameValues(item, right[at]));
  const keys = Object.keys(left).filter(key => left[key] !== undefined);
  return keys.length === Object.keys(right).filter(key => right[key] !== undefined).length
    && keys.every(key => Object.hasOwn(right, key) && sameValues(left[key], right[key]));
}

/**
 * True for a side of an open post-match that still reads its statistics and injuries from the events:
 * begun in 3.0 (`followsEvents`), its Players step not saved, and not past that step. Any other side
 * keeps the numbers it holds, and the finish writes the events back to them: a tap on it would be taken
 * back without a word, so a tap is refused there (server/season/live-match.mjs).
 */
export function sideFollowsEvents(side) {
  return side?.followsEvents === true && !(side.stage > PLAYERS_STAGE);
}

/**
 * A side follows the match until its coach saves the Players step: each call reads its statistics and
 * injuries from the events again (`eventsBySide.home` / `.away`, none listed means none tapped). A side
 * begun before 3.0 has no `followsEvents` flag and keeps the statistics it was given, as does a side
 * past the Players step and any side of a completed post-match. When a followed side reads differently
 * its chosen advancements go (they were picked against other numbers) and the revision moves, so a
 * step sent on what the coach saw before a tap is refused instead of writing that tap away.
 * Nothing read differently gives the same state back; otherwise a copy, and the input is left alone.
 */
export function followEvents(state, eventsBySide = {}) {
  if (state.status === 'completed') return state;
  const read = {};
  for (const name of SIDES) {
    const side = state[name];
    if (!sideFollowsEvents(side)) continue;
    const recorded = statisticsFromEvents(side.snapshot, eventsBySide[name] ?? []);
    if (!sameValues([side.statistics, side.injuries], [recorded.statistics, recorded.injuries])) read[name] = recorded;
  }
  const changed = Object.keys(read);
  if (!changed.length) return state;
  const next = structuredClone(state);
  for (const name of changed) Object.assign(next[name], read[name], { advancements: {} });
  next.revision++;
  return next;
}
