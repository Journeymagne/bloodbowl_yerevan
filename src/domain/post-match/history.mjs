/**
 * What a player did, match by match: a finished match is the difference its post-match made to the roster
 * (MVP and prayers included, exactly what the blob took in), a live one is its taps, a match from before the
 * site's post-match has no details; edits outside a match are their own sum, so all rows together are the
 * career (`careerCounters`) for everything recorded since 3.0; an injury is shown the way the roster got it
 * (`effectiveInjury`).
 *
 * Even since 3.0 the equality has three holes, each a rare flow that moved the blob without a row to match:
 * where a finish had to hold a counter at zero (a roster save during the match lowered it below the edits
 * waiting on it, so those rows take back more than the blob lost), where a player was gone at the finish
 * (his waiting edits are settled and change nothing), and where a legacy counter outside 0…999 was brought
 * into range without rows (`sppEdits`).
 *
 * A match is read from what the server finds of the team's side of it: its roster snapshot, the post-match
 * application (the roster before and after), the side of the stored post-match, and the player's own events.
 * A row says where its counters come from: `applied` when he is on the roster the post-match left, `events`
 * when he is not (he died, left, or the match is still on) and has taps, `none` otherwise — and then there
 * are no counters at all, not zeros. A row from taps counts them the way the post-match reads them
 * (`statisticsFromEvents`, held to 0…99, no MVP: that is picked in the post-match), so its keys are a
 * roster's. `pending` is a match with no application where one of his taps is not settled yet: the match
 * is not over, and the blob does not have it.
 *
 * `outside` is the player's rows without a match, settled or waiting, added up as they stand — below zero
 * too — with a key for each counter of the rows (not the MVP, not the injury): a counter nobody edited is
 * 0, so a client reads the same keys for any player, one nobody ever recorded included. A row is added up
 * by `eventTotal`, the one place that adds rows.
 *
 * A player who was never in the team has every match without details and nothing outside; the caller
 * decides whether that is an answer. The module is pure.
 */
import { normalizeSppCounters } from '../roster/players.mjs';
import { EVENT_COUNTERS, eventTotal, statisticsFromEvents } from './events.mjs';
import { effectiveInjury } from './rules.mjs';

// The counters an edit outside a match steps: those of the rows, not the injury (its step is no count).
const COUNTED = EVENT_COUNTERS.filter(counter => counter !== 'injury');

const playerOf = (roster, playerId) => (Array.isArray(roster?.players) ? roster.players : []).find(player => player?.id === playerId);

// The side of one player that `statisticsFromEvents` reads his taps from: a roster of one, whoever is on the match roster.
const alone = playerId => ({ players: [{ id: playerId }] });

// What the post-match added to him, counter by counter: the roster it left less the roster it began from
// (a player who was not on the first one starts from zeros). Null when he is not on the roster after it.
function appliedCounters(playerId, { before, after }) {
  const left = playerOf(after, playerId);
  if (!left) return null;
  const was = normalizeSppCounters(playerOf(before, playerId)?.spp), now = normalizeSppCounters(left.spp);
  return Object.fromEntries(Object.keys(now).map(counter => [counter, now[counter] - was[counter]]));
}

// His taps added up the way the post-match reads them; `mvps` is 0, since it is picked there and tapped nowhere.
const tappedCounters = (playerId, events) => normalizeSppCounters(statisticsFromEvents(alone(playerId), events).statistics[playerId]);

const wholeGames = gamesPlayed => (Number.isInteger(gamesPlayed) ? gamesPlayed : 0);

// The injury the roster got, or will get: from the post-match's side when there is one (what its Players step
// saved), else from the taps still standing, either way through rookie protection with the side's games.
// `retire` is the coach's choice and not part of the injury; a characteristic belongs to a lasting injury only.
// `effectiveInjury` looks a player up in a plain object, which answers `constructor` for any id that is not in
// it, and an id comes from a URL: so it is handed one entry, under a key of our own, and only the player's own.
function injuryOf(playerId, { post, gamesPlayed, events }) {
  const [injuries, games] = post
    ? [post.injuries ?? {}, post.gamesPlayed]
    : [statisticsFromEvents(alone(playerId), events).injuries, gamesPlayed];
  const held = Object.hasOwn(injuries, playerId) ? injuries[playerId] : undefined;
  const { code, stat } = effectiveInjury({ injuries: { held }, gamesPlayed: wholeGames(games) }, 'held');
  if (!code || code === 'none') return null;
  return code === 'lasting' && stat ? { code, stat } : { code };
}

function historyRow(playerId, { pairingId, snapshot, application, post, gamesPlayed, events }) {
  const own = events.filter(event => event.playerId === playerId);
  const applied = application ? appliedCounters(playerId, application) : null;
  const source = applied ? 'applied' : own.length ? 'events' : 'none';
  return {
    pairingId,
    played: snapshot ? Boolean(playerOf(snapshot, playerId)) : null,
    source,
    counters: applied ?? (own.length ? tappedCounters(playerId, own) : null),
    injury: injuryOf(playerId, { post, gamesPlayed, events: own }),
    pending: !application && own.some(event => !event.settledAt),
  };
}

/**
 * One player's career: a row for each of the team's matches, in the order given, and the edits outside a match.
 *
 * @param {string} playerId the player's id in the team's roster, and in its snapshots and events
 * @param {Array<{ pairingId: string, snapshot: { players: object[] }|null, application: { before: object, after: object }|null,
 *   post: { injuries: object, gamesPlayed: number }|null, gamesPlayed: number, events: object[] }>} matches
 *   one for each match of the team: its roster snapshot; the post-match's application for this team's side
 *   (the rosters before and after); `post`, the stored side of the post-match, which is the word on the injury
 *   and on the games when it is given (the caller gives it only where the roster has what it says); `gamesPlayed`,
 *   the games the team had played before the match, read when there is no `post`; and the player's events of
 *   the match as the domain reads them (`playerId`, `counter`, `delta`, `injury`, `settledAt`)
 * @param {object[]} outside the team's events without a match, as the domain reads them
 * @returns {{ matches: Array<{ pairingId: string, played: boolean|null, source: 'applied'|'events'|'none',
 *   counters: Record<string, number>|null, injury: { code: string, stat?: string }|null, pending: boolean }>,
 *   outside: Record<string, number> }}
 */
export function playerHistory(playerId, matches, outside = []) {
  return {
    matches: matches.map(match => historyRow(playerId, match)),
    outside: Object.fromEntries(COUNTED.map(counter => [counter, eventTotal(outside, playerId, counter)])),
  };
}
