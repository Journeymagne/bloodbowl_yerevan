/**
 * Match events on the server (`match_events`, migration 014): the one place that writes a match's
 * rows and settles them.
 *
 * Every function runs on the client of the post-match transaction, under its locks (the pairing and
 * both teams `FOR UPDATE`, the post-match row `FOR UPDATE`) and after its checks (`POST_REVISION`,
 * `POST_TEAM_CHANGED`, stage and status). So a refused request leaves no row behind and no
 * `settled_at` (the ROLLBACK takes them), and a repeated one finds the rows already there and writes
 * an empty difference.
 *
 * `created_at` is `clock_timestamp()`, not `now()`: `now()` is the same for the whole transaction, and
 * the rows of one save would lose their order. The order matters: an injury is the last one not taken
 * back. A row comes out in the shape the domain reads (`playerId`, `settledAt`; src/domain/post-match/events.mjs).
 *
 * The table has no CHECK that ties `injury` to `counter = 'injury'`, so `writeMatchEvents`, its only
 * writer, does.
 */
import { EVENT_COUNTERS, eventsDiff } from "../../src/domain/post-match/events.mjs";
import { INJURIES } from "../../src/domain/post-match/rules.mjs";
import { PLAYER_STATS } from "../../src/domain/roster/values.mjs";

const SELECT_EVENTS = `
  SELECT saved_team_id, player_id, counter, delta, injury, settled_at
  FROM match_events
  WHERE pairing_id = $1 AND saved_team_id = ANY($2::uuid[])
  ORDER BY created_at, id`;

const INSERT_EVENT = `
  INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_by, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())`;

const SETTLE_EVENTS = `
  UPDATE match_events SET settled_at = now()
  WHERE saved_team_id = $1 AND pairing_id = $2 AND settled_at IS NULL`;

// What the domain reads as an injury, in the form it reads it: `{ code }`, or `{ code, stat }` for a lasting one.
// Anything else (none, a stat on another injury, a lasting one with no characteristic) would not read back as itself.
function validInjury(injury) {
  if (!injury || typeof injury !== "object" || Array.isArray(injury)) return false;
  if (!INJURIES.includes(injury.code) || injury.code === "none") return false;
  if (injury.code === "lasting") return PLAYER_STATS.includes(injury.stat) && Object.keys(injury).length === 2;
  return Object.keys(injury).length === 1;
}

// The table checks the counter and the delta; the tie between the injury and its counter is only kept here.
function assertEventRow(row, at) {
  const label = `match event ${at}`;
  if (typeof row.playerId !== "string" || !row.playerId) throw new Error(`${label}: a player id is required`);
  if (!EVENT_COUNTERS.includes(row.counter)) throw new Error(`${label}: counter ${JSON.stringify(row.counter)} is not one of the event counters`);
  if (row.delta !== 1 && row.delta !== -1) throw new Error(`${label}: delta must be 1 or -1`);
  const hasInjury = row.injury !== null && row.injury !== undefined;
  if (row.counter === "injury" && !validInjury(row.injury)) throw new Error(`${label}: an injury row needs a valid injury ({ code } or { code: "lasting", stat })`);
  if (row.counter !== "injury" && hasInjury) throw new Error(`${label}: only an injury row carries an injury`);
}

const toEvent = (row) => ({
  playerId: row.player_id, counter: row.counter, delta: row.delta, injury: row.injury ?? null, settledAt: row.settled_at ?? null,
});

/**
 * The events of a match, per team, oldest first. Every team of `teamIds` has a key, an empty list
 * when nothing was tapped for it.
 *
 * @param {{ query: Function }} client a pg client
 * @param {string} pairingId
 * @param {string[]} teamIds
 * @returns {Promise<Record<string, object[]>>}
 */
export async function loadMatchEvents(client, pairingId, teamIds) {
  const events = Object.fromEntries(teamIds.map((teamId) => [teamId, []]));
  const { rows } = await client.query(SELECT_EVENTS, [pairingId, teamIds]);
  for (const row of rows) events[row.saved_team_id]?.push(toEvent(row));
  return events;
}

/**
 * One INSERT per event, in the order given. Returns how many rows were written. A row that the
 * table's constraints would not catch but the domain would misread throws, and then nothing is written:
 * every row is checked before the first INSERT.
 *
 * @param {{ query: Function }} client a pg client inside the post-match transaction
 * @param {{ teamId: string, pairingId: string, events: object[], actorId?: string|null }} write
 *   `events` are `{ playerId, counter, delta, injury? }`; `injury` only on an `injury` counter
 * @returns {Promise<number>}
 */
export async function writeMatchEvents(client, { teamId, pairingId, events, actorId = null }) {
  events.forEach(assertEventRow);
  for (const { playerId, counter, delta, injury } of events) {
    await client.query(INSERT_EVENT, [teamId, pairingId, playerId, counter, delta, injury ? JSON.stringify(injury) : null, actorId]);
  }
  return events.length;
}

/**
 * The Players step: write what makes the team's events add up to the statistics and injuries the coach
 * entered, and give back the events as they now stand (the new ones with `settledAt: null`). Nothing
 * entered differently, nothing written.
 *
 * `side` must be the validated, normalised post-match side (`{ team, statistics, injuries }` as the
 * Players step stored it): an invalid injury in it would make the difference take the standing injuries back.
 *
 * @param {{ query: Function }} client a pg client inside the post-match transaction
 * @param {string} pairingId
 * @param {{ team: { id: string }, statistics: object, injuries: object }} side
 * @param {object[]} events the team's events of the match, as `loadMatchEvents` returned them
 * @param {string|null} [actorId]
 * @returns {Promise<object[]>}
 */
export async function recordSideStatistics(client, pairingId, side, events, actorId = null) {
  const added = eventsDiff(side, events).map((row) => ({ ...row, injury: row.injury ?? null, settledAt: null }));
  await writeMatchEvents(client, { teamId: side.team.id, pairingId, events: added, actorId });
  return [...events, ...added];
}

/**
 * Finishing the post-match: the team's open events of this match are now in the blob. Returns how many
 * rows it took, so a repeat takes none.
 *
 * @param {{ query: Function }} client a pg client inside the post-match transaction
 * @param {{ teamId: string, pairingId: string }} match
 * @returns {Promise<number>}
 */
export async function settleMatchEvents(client, { teamId, pairingId }) {
  return (await client.query(SETTLE_EVENTS, [teamId, pairingId])).rowCount;
}
