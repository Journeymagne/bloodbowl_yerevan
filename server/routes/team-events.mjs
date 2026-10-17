/**
 * A team's match events over HTTP: what has been tapped, and a tap.
 *
 * `GET /api/teams/:id/events?pairing=` lists the team's events, oldest first: with `pairing`, all of
 * them in that match, settled or not; without it, every one not settled yet — what a live career adds
 * to the blob. The team's revision comes with them, read in the same snapshot, so a client can tell
 * whether the blob it holds is the one those events are added to. `POST /api/teams/:id/events` is a tap
 * during the team's live match: one row, written under the post-match's own locks (`lockLiveSide`), for a
 * player of the side's match roster — journeymen and stars included, as the roster has them — and for no
 * one else, since the post-match reads no one else.
 *
 * A team is the owner's. Its events may be read by an administrator too; a tap is the owner's alone, and
 * to anybody else the team is not there (`teamForUser`).
 */
import { EVENT_COUNTERS, isValidEventInjury } from "../../src/domain/post-match/events.mjs";
import { UUID_SOURCE, isUuid, teamForUser } from "../api/team-access.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { lockLiveSide } from "../season/live-match.mjs";
import { loadTeamEvents, recordMatchEvent } from "../season/match-events-store.mjs";

const EVENTS = new RegExp(`^/api/teams/(${UUID_SOURCE})/events$`, "i");
const MAX_PLAYER_ID_LENGTH = 200;

const invalid = (field) => httpError(400, "FIELD_INVALID", { field });

/**
 * What a tap's body says, checked field by field, and a 400 for the first that is wrong: `pairingId` a
 * UUID, or none (null or left out); `playerId` a string of 1 to 200 characters; `counter` one of the event
 * counters; `delta` 1 or -1; `injury` a valid one on the injury counter, and none on any other. Whether the
 * player is one of the side's is for the transaction to say.
 *
 * @returns {{ pairingId: string|null, playerId: string, counter: string, delta: number, injury: object|null }}
 */
function checkTap(body) {
  const { pairingId = null, playerId, counter, delta, injury = null } = body ?? {};
  if (pairingId !== null && !isUuid(pairingId)) throw invalid("pairingId");
  if (typeof playerId !== "string" || !playerId || playerId.length > MAX_PLAYER_ID_LENGTH) throw invalid("playerId");
  if (!EVENT_COUNTERS.includes(counter)) throw invalid("counter");
  if (delta !== 1 && delta !== -1) throw invalid("delta");
  if (counter === "injury" ? !isValidEventInjury(injury) : injury !== null) throw invalid("injury");
  return { pairingId, playerId, counter, delta, injury };
}

/** `?pairing=` as the match it names: none when it is left out, and a 400 for `pairing` when it is no UUID. */
function pairingOf(params) {
  const pairing = params.get("pairing");
  if (pairing !== null && !isUuid(pairing)) throw invalid("pairing");
  return pairing;
}

/** `GET /api/teams/:id/events?pairing=` — `{ events, revision }`: the team's events of one match, or all it has not settled. */
async function sendEvents(request, response, teamId, params) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // One snapshot: the team, its revision and its events at the same moment. The team comes first, so a
  // stranger is told 404 whatever the query says.
  const answer = await withTransaction(async (client) => {
    const team = await teamForUser(client, teamId, user, { admin: true });
    return { events: await loadTeamEvents(client, team.id, { pairingId: pairingOf(params) }), revision: team.revision };
  }, { readOnly: true });
  sendJson(response, 200, answer);
}

/**
 * The transaction of a tap: the match held as the post-match holds it, then the player, then the one row.
 * Refused at any point, nothing is written.
 */
async function writeTap(client, team, user, { pairingId, playerId, counter, delta, injury }) {
  const { fixture, snapshot } = await lockLiveSide(client, { pairingId, teamId: team.id, user });
  if (!snapshot.players?.some((player) => player.id === playerId)) throw httpError(422, "POST_PLAYER");
  return recordMatchEvent(client, {
    teamId: team.id, pairingId: fixture.id, event: { playerId, counter, delta, injury }, actorId: user.id,
  });
}

/**
 * `POST /api/teams/:id/events` `{ pairingId, playerId, counter, delta, injury? }` — the owner taps in the
 * team's live match: 201 `{ event }`.
 */
async function tapEvent(request, response, teamId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // Whose team it is comes before anything else about the request: a stranger is told 404 for a bad
  // body as for a good one. This look takes no lock: a tap's first lock is the pairing's (lockLiveSide).
  const team = await teamForUser(pool, teamId, user);
  const tap = checkTap(await readJson(request)); // a bad body costs no transaction
  // Without a pairing a tap is an edit outside a match, which is not taken here: no match to write it to.
  if (tap.pairingId === null) throw httpError(409, "MATCH_NOT_LIVE");
  const event = await withTransaction((client) => writeTap(client, team, user, tap));
  sendJson(response, 201, { event });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleEventRoutes(request, response, url) {
  const path = EVENTS.exec(url.pathname);
  if (path && request.method === "GET") {
    await sendEvents(request, response, path[1], url.searchParams);
    return true;
  }
  if (path && request.method === "POST") {
    await tapEvent(request, response, path[1]);
    return true;
  }
  return false;
}
