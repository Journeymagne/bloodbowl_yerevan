/**
 * The mock API's side of the roster screen: a team's match records, a save that never arrives, and the
 * fixtures the screen's modes are photographed from (server/routes/team-events.mjs is the reference).
 *
 *   GET   /api/teams/:id/events?pairing=  `{events, revision}`, oldest first: with `pairing`, the team's records
 *                                 of that match; without it, those not settled yet. The revision is the team's.
 *   POST  /api/teams/:id/events   a tap `{pairingId, playerId, counter, delta, injury?}`, checked in the server's
 *                                 order: the body (400 FIELD_INVALID with the field), the match (409 MATCH_NOT_LIVE:
 *                                 a tap names the team's match on and a record outside a match needs one on), the
 *                                 player (422 POST_PLAYER: of the roster, and for a tap of a match one who plays
 *                                 it, so not one who skips it), a step down that would take back nothing (409
 *                                 EVENT_BELOW_ZERO); else 201 `{event}` and it is listed from then on.
 *   The rolls (GET …/rolls, POST …/players/:pid/rolls) are asked first, then the fallen (GET …/fallen, POST
 *                                 …/players/:pid/death, DELETE …/fallen/:fid), then a player's career (GET
 *                                 …/players/:pid/history): scripts/mock/rolls.mjs, scripts/mock/fallen.mjs and
 *                                 scripts/mock/history.mjs answer them and hold their rules and fixtures (t1 has two
 *                                 rolls, two fallen, and three matches told for each of its players).
 *   PATCH /api/teams/t3           the connection is dropped, so a save fails the way it does with no network:
 *                                 `{drop: true}`, which the server of scripts/mock-api.mjs turns into a destroyed
 *                                 socket. Every other save is the treasury's (scripts/mock/treasury.mjs).
 *
 * What it does not do: ids are not UUIDs (the server would 400 `g2`), a side whose post-match no longer follows the
 * events (EVENT_SIDE_LOCKED) is not told apart, and a save of the roster writes no records.
 *
 * Fixtures: Mock Humans' seven players (t2, `humanPlayers`), the records of its match g2 with one edit outside it
 * that waits for the finish (`records`), and g7 (`preparingFriendly`), a friendly of Mock Veterans (t5) whose
 * preparation has begun. mock-api.mjs puts the players and the game in its lists: it makes both.
 */
import { MATCH_COUNTERS, SPP_EVENT_COUNTERS, careerCounters, eventTotal, isValidEventInjury } from "../../src/domain/post-match/events.mjs";
import { storedPlayerId } from "../../src/domain/roster/players.mjs";

import { answerFallen } from "./fallen.mjs";
import { answerHistory } from "./history.mjs";
import { answerRolls } from "./rolls.mjs";

const MAX_PLAYER_ID_LENGTH = 200;
// What a tap of a match carries: the counters a match taps, and the injury. The MVP is picked in the post-match.
const TAPPED_COUNTERS = [...MATCH_COUNTERS, "injury"];

/**
 * Mock Humans, rows of teams/human (0 Lineman, 1 Thrower, 2 Catcher, 3 Blitzer, 5 Ogre): one who skips the next game,
 * one with a casualty, the captain with an advancement, one whose Agility was raised, and a thrower who completes.
 * (Four also has a touchdown in g2's records below, and Five a completion there.)
 *
 * @param {Function} playerOf mock-api.mjs' maker of a player: `(idPrefix, number, rowIndex, name, changes)`
 */
export const humanPlayers = (playerOf) => [
  playerOf("q", 1, 0, "Lineman One"),
  playerOf("q", 2, 0, "Lineman Two", { skipNextGame: true }),
  playerOf("q", 3, 0, "Lineman Three", { spp: { casualties: 1 } }),
  playerOf("q", 4, 3, "Blitzer Four", {
    isCaptain: true,
    extraSkills: [{ name: "Mighty Blow", access: "primary" }],
    advancements: [{ type: "primary", grants: { skill: "Mighty Blow" } }],
    spp: { touchdowns: 3, mvps: 1 },
  }),
  playerOf("q", 5, 2, "Catcher Five", { statMods: { ag: 1 }, spp: { touchdowns: 2, completions: 1 } }),
  playerOf("q", 6, 1, "Thrower Six", { spp: { completions: 4 } }),
  playerOf("q", 7, 5, "Ogre Seven"),
];

/**
 * A friendly of `own` against `opposing` whose preparation is under way, nobody has sent a result: what the
 * roster calls "a preparation that is on". Like g6, it has no season, round or table entry.
 *
 * @param {Function} pairingOf mock-api.mjs' maker of a match: `(id, tableNumber, own, opposing, changes)`
 */
export const preparingFriendly = (pairingOf, own, opposing) => pairingOf("g7", 1, own, opposing, {
  kind: "friendly",
  season: null,
  roundId: null,
  roundNumber: 0,
  homeEntryId: null,
  awayEntryId: null,
  preparationStatus: "preparing",
});

let lastEvent = 0;
/** A record as the server's `publicEvent` sends it, tapped `minutes` ago and not settled. */
const recordOf = ({ pairingId, playerId, counter, delta = 1, injury = null }, minutes = 0) => ({
  id: `e${++lastEvent}`,
  pairingId,
  playerId,
  counter,
  delta,
  injury,
  settledAt: null,
  createdAt: new Date(Date.now() - minutes * 60_000).toISOString(),
});

// Each team's records, oldest first. Mock Humans' match g2 has three taps, and, outside it, an edit that waits for the finish.
const records = new Map([["t2", [
  recordOf({ pairingId: "g2", playerId: "q4", counter: "touchdowns" }, 50),
  recordOf({ pairingId: "g2", playerId: "q5", counter: "completions" }, 40),
  recordOf({ pairingId: "g2", playerId: "q6", counter: "injury", injury: { code: "lasting", stat: "ag" } }, 30),
  recordOf({ pairingId: null, playerId: "q5", counter: "interceptions" }, 20),
]]]);
const recordsOf = (teamId) => records.get(teamId) ?? records.set(teamId, []).get(teamId);

/**
 * Whether a match is on, as the server counts it (`LIVE_MATCH`, server/season/live-match.mjs): the rule of `isMatchLive`
 * (src/shell/current-match.mjs), repeated here since that module draws with the DOM and the dictionaries.
 */
function isLive(game) {
  const postMatch = game.postMatchStatus ?? "not_started";
  return game.preparationStatus === "in_progress"
    && postMatch !== "completed"
    && (postMatch !== "not_started" || game.resultStatus !== "confirmed");
}

/** The match of the team that is on, or none. */
const liveMatchOf = (games, teamId) => games.find((game) => isLive(game) && [game.home, game.away].some((side) => side?.team.id === teamId));

/**
 * What a tap's body says, checked field by field as `checkTap` (server/routes/team-events.mjs) checks it: the first
 * field that is wrong, or the tap. A `pairingId` is any text here.
 */
function checkTap(body) {
  const { pairingId = null, playerId, counter, delta, injury = null } = body;
  const wrong = [
    ["pairingId", pairingId !== null && (typeof pairingId !== "string" || pairingId === "")],
    ["playerId", typeof playerId !== "string" || playerId === "" || playerId.length > MAX_PLAYER_ID_LENGTH],
    ["counter", !(pairingId === null ? SPP_EVENT_COUNTERS : TAPPED_COUNTERS).includes(counter)],
    ["delta", delta !== 1 && delta !== -1],
    ["injury", counter === "injury" ? !isValidEventInjury(injury) : injury !== null],
  ].find(([, bad]) => bad);
  return wrong ? { field: wrong[0] } : { tap: { pairingId, playerId, counter, delta, injury } };
}

/** `POST …/events` with its tap checked: the match, the player and the step down, then the record. */
function writeTap(found, { pairingId, playerId, counter, delta, injury }, { games, reply, refuse }) {
  const live = liveMatchOf(games, found.id);
  if (!live || (pairingId !== null && live.id !== pairingId)) return refuse(409, "MATCH_NOT_LIVE");
  const player = (found.roster.players ?? []).find((item) => storedPlayerId(item) === playerId);
  if (!player || (pairingId !== null && player.skipNextGame)) return refuse(422, "POST_PLAYER");
  const own = recordsOf(found.id);
  // What a step down would take back: the match's own rows in a match; outside one, the blob and the edits waiting on it.
  const held = pairingId === null
    ? careerCounters(player, own.filter((record) => record.pairingId === null))[counter]
    : eventTotal(own.filter((record) => record.pairingId === pairingId), playerId, counter);
  if (delta === -1 && counter !== "injury" && held <= 0) return refuse(409, "EVENT_BELOW_ZERO", { playerId, counter });
  const event = recordOf({ pairingId, playerId, counter, delta, injury });
  own.push(event);
  return reply({ event }, 201);
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], games: object[], readBody: Function, reply: Function, refuse: Function}} mock the mock's
 *   lists and its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|{drop: true}|null>} null for a route that is not this module's
 */
export async function answerRoster(request, pathname, mock) {
  for (const answer of [answerRolls, answerFallen, answerHistory]) {
    const answered = await answer(request, pathname, mock);
    if (answered) return answered;
  }
  const { teams, readBody, reply, refuse } = mock;
  const { method } = request;
  if (method === "PATCH" && pathname === "/api/teams/t3" && teams.some(({ id }) => id === "t3")) {
    // The body is read first: closing on an unread request can reset the connection instead of ending it.
    await readBody(request).catch(() => null);
    return { drop: true };
  }
  const id = pathname.match(/^\/api\/teams\/([^/]+)\/events$/)?.[1];
  if (!id || (method !== "GET" && method !== "POST")) return null;
  const found = teams.find((item) => item.id === id);
  if (!found) return refuse(404, "TEAM_NOT_FOUND");
  if (method === "GET") {
    const pairing = new URL(request.url, "http://localhost").searchParams.get("pairing") || null;
    const listed = recordsOf(id).filter((record) => (pairing === null ? !record.settledAt : record.pairingId === pairing));
    return reply({ events: listed, revision: found.revision });
  }
  const { field, tap } = checkTap(await readBody(request));
  return field ? refuse(400, "FIELD_INVALID", { field }) : writeTap(found, tap, mock);
}
