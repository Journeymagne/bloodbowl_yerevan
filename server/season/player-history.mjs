/**
 * A player's career by match, read from the database: the team's matches, what each left of the player
 * (the roster snapshot, the post-match's application, its stored side, his events), and the edits made
 * outside any match, given to `playerHistory` (src/domain/post-match/history.mjs), which says what they mean.
 *
 * Every read is on the `db` it is given, and a caller that wants one answer from several tables hands it
 * the client of a read-only snapshot (`withTransaction(…, { readOnly: true })`): the matches, the records
 * of each and his events are then one moment of the database, whoever finishes a match meanwhile. Nothing
 * here takes a lock or writes. The JSON of a roster, a snapshot or a state is read in JS, not queried: the
 * one exception is the side of a stored post-match, which holds the match rosters and the reference data of
 * both teams (about 40 KB a side), where only four small members are taken, with plain `->` (no cast, so
 * nothing in a stored value can make the query fail).
 *
 * A match is the team's when it has a result or is under way (`result_status = 'confirmed'` or preparation
 * `in_progress`) and has two teams: a bye with a result has no opponent, and nobody played it.
 */
import { sideFollowsEvents } from "../../src/domain/post-match/events.mjs";
import { playerHistory } from "../../src/domain/post-match/history.mjs";
import { publicEvent } from "./match-events-store.mjs";
import { gamesPlayedBefore } from "./post-match.mjs";

const SELECT_MATCHES = `
  SELECT id, match_kind, season_id, round_number, result_status, home_team_id, away_team_id, home_team_name, away_team_name,
         home_touchdowns, away_touchdowns
    FROM match_pairing_context
   WHERE $1::uuid IN (home_team_id, away_team_id) AND home_team_id IS NOT NULL AND away_team_id IS NOT NULL
     AND (result_status = 'confirmed' OR preparation_status = 'in_progress')
     AND ($2::uuid IS NULL OR season_id = $2::uuid)
   ORDER BY created_at, id`;

const SELECT_SNAPSHOTS = `
  SELECT pairing_id, snapshot FROM match_roster_snapshots
   WHERE saved_team_id = $1 AND pairing_id = ANY($2::uuid[])`;

const SELECT_APPLICATIONS = `
  SELECT pairing_id, before_roster, after_roster FROM match_post_applications
   WHERE saved_team_id = $1 AND pairing_id = ANY($2::uuid[])`;

// The team's side of each stored post-match: what it says of injuries and games, and whether it still follows the taps.
const SELECT_POST_SIDES = `
  SELECT g.pairing_id, side.state -> 'injuries' AS injuries, side.state -> 'gamesPlayed' AS games_played,
         side.state -> 'followsEvents' AS follows_events, side.state -> 'stage' AS stage
    FROM match_post_games g
    JOIN match_pairing_context c ON c.id = g.pairing_id
   CROSS JOIN LATERAL (SELECT g.state -> (CASE WHEN c.home_team_id = $1::uuid THEN 'home' ELSE 'away' END) AS state) AS side
   WHERE g.pairing_id = ANY($2::uuid[])`;

// The columns `publicEvent` reads: the player's rows in these matches, and his rows outside any.
const SELECT_EVENTS = `
  SELECT id, pairing_id, player_id, counter, delta, injury, settled_at, created_at FROM match_events
   WHERE saved_team_id = $1 AND player_id = $2 AND (pairing_id = ANY($3::uuid[]) OR pairing_id IS NULL)
   ORDER BY created_at, id`;

const byMatch = (rows, pick) => new Map(rows.map((row) => [row.pairing_id, pick(row)]));

/**
 * What `playerHistory` is given of one match.
 *
 * The stored side of its post-match speaks for injuries, and gives the games rookie protection counts, once the
 * roster has what it said: the match is finished, or the side no longer follows the taps (its Players step is
 * saved, or it began before 3.0). A side that still follows them holds what they read when somebody last looked,
 * and a tap since has left it behind: there the taps speak, and the side only gives its games. A match with no
 * stored post-match counts the games from the team's other confirmed matches, and only when a tap of the player
 * needs them.
 */
async function matchInput(db, teamId, { id, snapshot, application, stored, events }) {
  const speaks = stored && (application || !sideFollowsEvents(stored));
  const games = stored ? stored.gamesPlayed : events.length ? (await gamesPlayedBefore(db, [teamId], id))[teamId] : 0;
  return {
    pairingId: id, snapshot, application, events, gamesPlayed: games,
    post: speaks ? { injuries: stored.injuries, gamesPlayed: stored.gamesPlayed } : null,
  };
}

/** What the match was, from the team's own side: the part of a history row that is not the player's. */
function describeMatch(row, teamId) {
  const [side, other] = row.home_team_id === teamId ? ["home", "away"] : ["away", "home"];
  const confirmed = row.result_status === "confirmed";
  const own = row[`${side}_touchdowns`], against = row[`${other}_touchdowns`];
  return {
    kind: row.match_kind,
    seasonId: row.season_id ?? null,
    roundNumber: row.round_number ?? null,
    status: confirmed ? "confirmed" : "in_progress",
    opponent: { teamId: row[`${other}_team_id`], name: row[`${other}_team_name`] },
    score: confirmed && own !== null && against !== null ? { own: Number(own), opponent: Number(against) } : null,
  };
}

/**
 * The career of one player of a team, match by match, oldest first: a row for each match the team has played
 * or has on, and the player's edits outside any match as sums.
 *
 * @param {{ query: Function }} db a pg client; for one answer from several tables, the client of a read-only snapshot
 * @param {{ teamId: string, playerId: string, seasonId?: string|null }} query `teamId` is the team's id as the
 *   database holds it (the row `teamForUser` returned); `playerId` may be an id the team never had, and then
 *   every row is without details; `seasonId`, a UUID the caller has checked (`isUuid`) or null, narrows the
 *   matches to that season's league matches, and leaves the edits outside a match as they are
 * @returns {Promise<{ playerId: string, matches: object[], outside: Record<string, number> }>}
 */
export async function loadPlayerHistory(db, { teamId, playerId, seasonId = null }) {
  const { rows: pairings } = await db.query(SELECT_MATCHES, [teamId, seasonId]);
  const ids = pairings.map((row) => row.id);
  const snapshots = byMatch((await db.query(SELECT_SNAPSHOTS, [teamId, ids])).rows, (row) => row.snapshot);
  const applications = byMatch((await db.query(SELECT_APPLICATIONS, [teamId, ids])).rows, (row) => ({ before: row.before_roster, after: row.after_roster }));
  const sides = byMatch((await db.query(SELECT_POST_SIDES, [teamId, ids])).rows,
    (row) => ({ injuries: row.injuries, gamesPlayed: row.games_played, followsEvents: row.follows_events, stage: row.stage }));
  const events = (await db.query(SELECT_EVENTS, [teamId, playerId, ids])).rows.map(publicEvent);
  const ofMatch = new Map(ids.map((id) => [id, events.filter((event) => event.pairingId === id)]));
  const matches = [];
  for (const { id } of pairings) {
    matches.push(await matchInput(db, teamId, {
      id, snapshot: snapshots.get(id) ?? null, application: applications.get(id) ?? null, stored: sides.get(id), events: ofMatch.get(id),
    }));
  }
  const career = playerHistory(playerId, matches, events.filter((event) => event.pairingId === null));
  return { playerId, matches: career.matches.map((entry, at) => ({ ...entry, ...describeMatch(pairings[at], teamId) })), outside: career.outside };
}
