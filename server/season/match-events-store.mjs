/**
 * Match events on the server (`match_events`, migration 014): the one place that writes a match's
 * rows and settles them.
 *
 * Every write of a match's rows runs on the client of a transaction that holds the post-match's locks
 * (the pairing and both teams `FOR UPDATE`, the post-match row `FOR UPDATE`): the post-match's own,
 * after its checks (`POST_REVISION`, `POST_TEAM_CHANGED`, stage and status), or a tap's, which takes
 * the same locks in the same order (server/season/live-match.mjs). So a refused request leaves no row
 * behind and no `settled_at` (the ROLLBACK takes them), a repeated one finds the rows already there and
 * writes an empty difference, and a tap lands wholly before or after a Players step or a finish.
 *
 * An edit outside a match (no pairing) is written under its team's row lock, which every writer of
 * such rows holds: a roster save writes its SPP change settled, the blob having taken it (`settled`);
 * one made while a match is on waits, unsettled, until the finish, which holds the team's row as well,
 * adds it to the blob (`settleOutsideEdits`).
 *
 * `created_at` is `clock_timestamp()`, not `now()`: `now()` is the same for the whole transaction, and
 * the rows of one save would lose their order. The order matters: an injury is the last one not taken
 * back. A row comes out in the shape the domain reads (`playerId`, `settledAt`; src/domain/post-match/events.mjs),
 * and to a client as `publicEvent`, which is that shape and a little more.
 *
 * The table has no CHECK that ties `injury` to `counter = 'injury'`, so its two writers here,
 * `writeMatchEvents` and `recordMatchEvent`, check every row before it is written (`assertEventRow`).
 */
import { EVENT_COUNTERS, applyOutsideEdits, eventsDiff, isValidEventInjury } from "../../src/domain/post-match/events.mjs";

const SELECT_EVENTS = `
  SELECT saved_team_id, player_id, counter, delta, injury, settled_at
  FROM match_events
  WHERE pairing_id = $1 AND saved_team_id = ANY($2::uuid[])
  ORDER BY created_at, id`;

// What `publicEvent` reads: the row without the team it belongs to and who tapped it.
const PUBLIC_COLUMNS = "id, pairing_id, player_id, counter, delta, injury, settled_at, created_at";

const SELECT_TEAM_OPEN_EVENTS = `
  SELECT ${PUBLIC_COLUMNS}
  FROM match_events
  WHERE saved_team_id = $1 AND settled_at IS NULL
  ORDER BY created_at, id`;

const SELECT_TEAM_MATCH_EVENTS = `
  SELECT ${PUBLIC_COLUMNS}
  FROM match_events
  WHERE saved_team_id = $1 AND pairing_id = $2
  ORDER BY created_at, id`;

const INSERT_EVENT = `
  INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_by, created_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp())
  RETURNING *`;

// The same row, already in the blob: an edit a roster save made, which the blob took as it was saved.
const INSERT_SETTLED_EVENT = `
  INSERT INTO match_events (saved_team_id, pairing_id, player_id, counter, delta, injury, created_by, created_at, settled_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, clock_timestamp(), now())
  RETURNING *`;

const SETTLE_EVENTS = `
  UPDATE match_events SET settled_at = now()
  WHERE saved_team_id = $1 AND pairing_id = $2 AND settled_at IS NULL`;

const SELECT_WAITING_OUTSIDE_EDITS = `
  SELECT id, player_id, counter, delta, injury, settled_at
  FROM match_events
  WHERE saved_team_id = $1 AND pairing_id IS NULL AND settled_at IS NULL
  ORDER BY created_at, id`;

const SETTLE_EVENTS_BY_ID = "UPDATE match_events SET settled_at = now() WHERE id = ANY($1::uuid[])";

// The table checks the counter and the delta; the tie between the injury and its counter is only kept here.
function assertEventRow(row, at) {
  const label = `match event ${at}`;
  if (typeof row.playerId !== "string" || !row.playerId) throw new Error(`${label}: a player id is required`);
  if (!EVENT_COUNTERS.includes(row.counter)) throw new Error(`${label}: counter ${JSON.stringify(row.counter)} is not one of the event counters`);
  if (row.delta !== 1 && row.delta !== -1) throw new Error(`${label}: delta must be 1 or -1`);
  const hasInjury = row.injury !== null && row.injury !== undefined;
  if (row.counter === "injury" && !isValidEventInjury(row.injury)) throw new Error(`${label}: an injury row needs a valid injury ({ code } or { code: "lasting", stat })`);
  if (row.counter !== "injury" && hasInjury) throw new Error(`${label}: only an injury row carries an injury`);
}

const toEvent = (row) => ({
  playerId: row.player_id, counter: row.counter, delta: row.delta, injury: row.injury ?? null, settledAt: row.settled_at ?? null,
});

/**
 * A `match_events` row as the API shows it: the event the domain reads (`toEvent`) with its id, its
 * match (null for an edit outside one) and when it was tapped. The team and who tapped stay on the server.
 *
 * @param {object} row a row of `match_events`
 * @returns {{ id: string, pairingId: string|null, playerId: string, counter: string, delta: number,
 *   injury: object|null, settledAt: Date|null, createdAt: Date }}
 */
export function publicEvent(row) {
  return { id: row.id, pairingId: row.pairing_id ?? null, ...toEvent(row), createdAt: row.created_at };
}

// One row as written: `event` is checked before this (`assertEventRow`).
async function insertEvent(client, { teamId, pairingId, actorId, settled = false }, { playerId, counter, delta, injury }) {
  const { rows } = await client.query(settled ? INSERT_SETTLED_EVENT : INSERT_EVENT,
    [teamId, pairingId, playerId, counter, delta, injury ? JSON.stringify(injury) : null, actorId]);
  return rows[0];
}

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
 * `settled` writes the rows as already in the blob (`settled_at = now()`): what a roster save writes,
 * an edit outside a match (`pairingId` null) that the blob took in the same transaction.
 *
 * @param {{ query: Function }} client a pg client inside the transaction that writes the rows: the
 *   post-match's, or a roster save's
 * @param {{ teamId: string, pairingId: string|null, events: object[], actorId?: string|null, settled?: boolean }} write
 *   `events` are `{ playerId, counter, delta, injury? }`; `injury` only on an `injury` counter
 * @returns {Promise<number>}
 */
export async function writeMatchEvents(client, { teamId, pairingId, events, actorId = null, settled = false }) {
  events.forEach(assertEventRow);
  for (const event of events) await insertEvent(client, { teamId, pairingId, actorId, settled }, event);
  return events.length;
}

/**
 * One tap: the row checked as `writeMatchEvents` checks one, the same INSERT, and the row it wrote.
 *
 * Call it on the client of the transaction that holds the match (`lockLiveSide`), after the player is
 * known to be one of the side's: the store checks the row, not whose it is.
 *
 * @param {{ query: Function }} client a pg client inside the tap's transaction
 * @param {{ teamId: string, pairingId: string, event: { playerId: string, counter: string, delta: number, injury?: object|null },
 *   actorId?: string|null }} tap
 * @returns {Promise<ReturnType<typeof publicEvent>>}
 */
export async function recordMatchEvent(client, { teamId, pairingId, event, actorId = null }) {
  assertEventRow(event, 0);
  return publicEvent(await insertEvent(client, { teamId, pairingId, actorId }, event));
}

/**
 * A team's events as the API lists them, oldest first. With `pairingId`, every event of the team in that
 * match, settled or not; without it, every event of the team that is not settled yet, whatever its match,
 * and the edits outside a match too: the rows a live career adds to the blob.
 *
 * @param {{ query: Function }} db a pg pool, or a client (one snapshot with whatever else it reads)
 * @param {string} teamId
 * @param {{ pairingId?: string|null }} [options]
 * @returns {Promise<ReturnType<typeof publicEvent>[]>}
 */
export async function loadTeamEvents(db, teamId, { pairingId = null } = {}) {
  const { rows } = pairingId
    ? await db.query(SELECT_TEAM_MATCH_EVENTS, [teamId, pairingId])
    : await db.query(SELECT_TEAM_OPEN_EVENTS, [teamId]);
  return rows.map(publicEvent);
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
 * Call it in the same transaction as, and after, `applyPostMatchRoster`: rows are settled exactly when
 * the blob took them in.
 *
 * @param {{ query: Function }} client a pg client inside the post-match transaction
 * @param {{ teamId: string, pairingId: string }} match
 * @returns {Promise<number>}
 */
export async function settleMatchEvents(client, { teamId, pairingId }) {
  return (await client.query(SETTLE_EVENTS, [teamId, pairingId])).rowCount;
}

/**
 * Finishing the post-match takes in the team's edits outside a match that waited for it: added to the
 * blob, then settled. Returns how many rows it took; none waiting, nothing is written.
 *
 * While a match is on the blob cannot move (its revision is what the finish checks), so edits outside
 * it wait as rows and the finish takes them in, in its own transaction, after the match's own record
 * (`after_roster`) is written. Call it there, after `applyPostMatchRoster`, under the team's row lock
 * the post-match holds: the roster is read again from `saved_teams`, where that record left it, and
 * written back with the edits (`applyOutsideEdits`) without moving the revision, which the finish has
 * moved already. A row of a player who is no longer on the roster (he died meanwhile) changes nothing
 * and is settled all the same, so nothing waits for a player who is not coming back.
 *
 * @param {{ query: Function }} client a pg client inside the post-match transaction
 * @param {string} teamId
 * @returns {Promise<number>}
 */
export async function settleOutsideEdits(client, teamId) {
  const { rows } = await client.query(SELECT_WAITING_OUTSIDE_EDITS, [teamId]);
  if (!rows.length) return 0;
  const { rows: [team] } = await client.query("SELECT roster FROM saved_teams WHERE id = $1", [teamId]);
  await client.query("UPDATE saved_teams SET roster = $2, updated_at = now() WHERE id = $1",
    [teamId, JSON.stringify(applyOutsideEdits(team.roster, rows.map(toEvent)))]);
  await client.query(SETTLE_EVENTS_BY_ID, [rows.map((row) => row.id)]);
  return rows.length;
}
