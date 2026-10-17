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
 * The same POST without a pairing is an edit outside a match, taken only while the team has a match on:
 * the blob cannot move then (the finish checks its revision), so the edit waits as a row for the finish
 * to carry in (server/season/match-events-store.mjs). It is for a player of the roster — the blob is what
 * it edits — holds the team's row and nothing else, and is never an injury, which only a match deals out.
 * Without a match on, SPP is edited in the roster itself (`PATCH`), which writes the change as settled rows.
 *
 * A step down takes back a step up: a -1 where the rows it would take back add up to nothing (a match's
 * own rows in a match; outside one, the blob's counter and the edits waiting on it) is refused, since it
 * would take back nothing now and the next +1 later.
 *
 * A team is the owner's. Its events may be read by an administrator too; a tap is the owner's alone, and
 * to anybody else the team is not there (`teamForUser`).
 */
import { EVENT_COUNTERS, eventTotal, isValidEventInjury } from "../../src/domain/post-match/events.mjs";
import { normalizeSppCounters } from "../../src/domain/roster/players.mjs";
import { UUID_SOURCE, isUuid, teamForUser } from "../api/team-access.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { lockLiveSide, teamHasLiveMatch } from "../season/live-match.mjs";
import { loadTeamEvents, recordMatchEvent } from "../season/match-events-store.mjs";

const EVENTS = new RegExp(`^/api/teams/(${UUID_SOURCE})/events$`, "i");
const MAX_PLAYER_ID_LENGTH = 200;

const invalid = (field) => httpError(400, "FIELD_INVALID", { field });

/** A -1 on a counter (an injury is no count): what may be refused as taking back nothing. */
const takesBack = ({ counter, delta }) => delta === -1 && counter !== "injury";

const belowZero = ({ playerId, counter }) => httpError(409, "EVENT_BELOW_ZERO", { playerId, counter });

/**
 * What a tap's body says, checked field by field, and a 400 for the first that is wrong: `pairingId` a
 * UUID, or none (null or left out: an edit outside a match); `playerId` a string of 1 to 200 characters;
 * `counter` one of the event counters, and not the injury without a match; `delta` 1 or -1; `injury` a
 * valid one on the injury counter, and none on any other. Whether the player is one of the side's, or of
 * the roster, is for the transaction to say.
 *
 * @returns {{ pairingId: string|null, playerId: string, counter: string, delta: number, injury: object|null }}
 */
function checkTap(body) {
  const { pairingId = null, playerId, counter, delta, injury = null } = body ?? {};
  if (pairingId !== null && !isUuid(pairingId)) throw invalid("pairingId");
  if (typeof playerId !== "string" || !playerId || playerId.length > MAX_PLAYER_ID_LENGTH) throw invalid("playerId");
  if (!EVENT_COUNTERS.includes(counter) || (pairingId === null && counter === "injury")) throw invalid("counter");
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
 * A step down is checked against the rows of this match, read under those locks. Refused at any point,
 * nothing is written.
 */
async function writeTap(client, team, user, { pairingId, playerId, counter, delta, injury }) {
  const { fixture, snapshot } = await lockLiveSide(client, { pairingId, teamId: team.id, user });
  if (!snapshot.players?.some((player) => player.id === playerId)) throw httpError(422, "POST_PLAYER");
  if (takesBack({ counter, delta })) {
    const ofTheMatch = await loadTeamEvents(client, team.id, { pairingId: fixture.id });
    if (eventTotal(ofTheMatch, playerId, counter) <= 0) throw belowZero({ playerId, counter });
  }
  return recordMatchEvent(client, {
    teamId: team.id, pairingId: fixture.id, event: { playerId, counter, delta, injury }, actorId: user.id,
  });
}

/**
 * The transaction of an edit outside a match: the team's row, locked and read again, is the only lock;
 * then a match of the team that is on, the player on the roster, and the one row, waiting for the finish.
 * A step down is checked against the blob's counter and the edits already waiting on it, read under that
 * lock (every writer of such rows holds it). Refused at any point, nothing is written.
 */
async function writeOutsideEdit(client, { id }, user, { playerId, counter, delta }) {
  const team = await teamForUser(client, id, user, { lock: true });
  if (!(await teamHasLiveMatch(client, team.id))) throw httpError(409, "MATCH_NOT_LIVE");
  const players = Array.isArray(team.roster?.players) ? team.roster.players : [];
  const player = players.find((item) => item?.id === playerId);
  if (!player) throw httpError(422, "POST_PLAYER");
  if (takesBack({ counter, delta })) {
    const waiting = (await loadTeamEvents(client, team.id)).filter((event) => event.pairingId === null);
    if ((normalizeSppCounters(player.spp)[counter] ?? 0) + eventTotal(waiting, playerId, counter) <= 0) throw belowZero({ playerId, counter });
  }
  return recordMatchEvent(client, { teamId: team.id, pairingId: null, event: { playerId, counter, delta, injury: null }, actorId: user.id });
}

/**
 * `POST /api/teams/:id/events` `{ pairingId, playerId, counter, delta, injury? }` — the owner taps in the
 * team's live match, or, without `pairingId`, edits a player of the roster outside it: 201 `{ event }`.
 */
async function tapEvent(request, response, teamId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // Whose team it is comes before anything else about the request: a stranger is told 404 for a bad
  // body as for a good one. This look takes no lock: a tap's first lock is the pairing's (lockLiveSide),
  // an edit's the team's own, taken again in its transaction.
  const team = await teamForUser(pool, teamId, user);
  const tap = checkTap(await readJson(request)); // a bad body costs no transaction
  const write = tap.pairingId === null ? writeOutsideEdit : writeTap;
  const event = await withTransaction((client) => write(client, team, user, tap));
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
