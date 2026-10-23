/**
 * The mock API's fallen: a team's deaths, a death a coach marks by hand, and the undo of one
 * (server/routes/team-fallen.mjs is the reference, and src/domain/roster/transfers.mjs moves the player).
 *
 *   GET    /api/teams/:id/fallen            `{fallen}`, newest first; `[]` for a team that has none.
 *   POST   /api/teams/:id/players/:pid/death `{cause, revision}`, checked in the server's order: the team (404
 *                                  TEAM_NOT_FOUND), the cause (1 to 500 characters once trimmed, else 400
 *                                  FIELD_INVALID `cause`), the revision (409 TEAM_SAVED_ELSEWHERE with the team),
 *                                  the player (404 PLAYER_NOT_FOUND); else he leaves the roster, the revision goes
 *                                  one up and the record comes first: 201 `{team, fallen}`.
 *   DELETE /api/teams/:id/fallen/:fid     no record is 404 FALLEN_NOT_FOUND, a death of a match 403
 *                                  FALLEN_FROM_MATCH (the coach's word does not unsettle a match: no administrator
 *                                  is told apart here), a roster that is full already 422 ROSTER_BREAKS_THE_RULES
 *                                  (ROSTER_MAX_PLAYERS); else he is back, last, the revision one up and the record
 *                                  gone: 200 `{team}`. No revision is asked, as on the server.
 *
 * What it does not do: the other rules of a roster with him back (positions, value) are not checked, nor is an
 * id two players share, and a record the roster cannot read is not told apart (FALLEN_NOT_RESTORABLE).
 *
 * Fixtures: Mock Team (t1) has two fallen. f1, Blitzer Ten (p10, 2 touchdowns), was marked by hand three days ago; f2,
 * Linewoman Nine (p9, a completion), died in g5 (round 2), and no cause was written. Every other team has none. f1's id
 * is no roster player's (stage 07e): as Blitzer Eight (p8) he shared Linewoman Eight's, whom the mock's roster holds, and
 * «Состав» draws a player where the roster holds him (decision 21 of stage 07b) — so he was on no table of the fallen.
 * Their careers by match are scripts/mock/history.mjs's: f1 a veteran the site knows in no match, f2 dead in g5 with no
 * tap of hers.
 */
import { rosterSizeLimits } from "../../src/domain/league-rules.mjs";
import { removeFallenPlayer, returnFallenPlayer } from "../../src/domain/roster/transfers.mjs";
import { VALIDATION_CODES } from "../../src/domain/roster/validate.mjs";
import { errorPayload } from "../../server/http/errors.mjs";

const DAY = 86_400_000;
const MAX_CAUSE_LENGTH = 500;
const LIST = /^\/api\/teams\/([^/]+)\/fallen$/;
const DEATH = /^\/api\/teams\/([^/]+)\/players\/([^/]+)\/death$/;
const ONE = /^\/api\/teams\/([^/]+)\/fallen\/([^/]+)$/;

/** A player as the roster stores him (the mock's `playerOf` makes the same), who died with `spp` on him. */
const stored = (number, rowIndex, name, spp = {}) => ({
  id: `p${number}`,
  rowIndex,
  number: String(number),
  name,
  statMods: {},
  extraSkills: [],
  favouredSkills: [],
  spp,
  advancements: [],
});

/** A record as the server's `publicFallen` sends it, of a death `days` before the mock started. */
const recordOf = (id, days, player, { cause = null, pairingId = null, roundNumber = null, fromMatch = false } = {}) => ({
  id,
  player,
  cause,
  pairingId,
  roundNumber,
  diedAt: new Date(Date.now() - days * DAY).toISOString(),
  fromMatch,
});

// Each team's deaths, newest first. The ids are quoted: check-references reads a bare `t1:` as a use of `t`.
const records = new Map([["t1", [
  recordOf("f1", 3, stored(10, 2, "Blitzer Ten", { touchdowns: 2 }), { cause: "Foul by the Grimtusk Raiders, Casualty 15" }),
  recordOf("f2", 6, stored(9, 0, "Linewoman Nine", { completions: 1 }), { pairingId: "g5", roundNumber: 2, fromMatch: true }),
]]]);
let lastRecord = 2;
const recordsOf = (teamId) => records.get(teamId) ?? records.set(teamId, []).get(teamId);

/** The 409 of a write made against a revision the team has moved past: the team travels beside the error. */
const savedElsewhere = (found, reply) => reply({ ...errorPayload("TEAM_SAVED_ELSEWHERE"), team: found }, 409);

/** The cause a body gives, trimmed: 1 to 500 characters with no NUL (which the server's column cannot hold), else null. */
function causeOf(body) {
  const text = typeof body.cause === "string" ? body.cause.trim() : "";
  return text && text.length <= MAX_CAUSE_LENGTH && !text.includes("\u0000") ? text : null;
}

/** `POST …/death`: the cause, the revision and the player in the server's order, then the roster without him and his record. */
function markDeath(found, playerId, body, { reply, refuse }) {
  const cause = causeOf(body);
  if (cause === null) return refuse(400, "FIELD_INVALID", { field: "cause" });
  if (body.revision !== found.revision) return savedElsewhere(found, reply);
  const removed = removeFallenPlayer(found.roster, playerId);
  if (!removed) return refuse(404, "PLAYER_NOT_FOUND");
  const stamp = new Date().toISOString();
  Object.assign(found, { roster: removed.roster, revision: found.revision + 1, updatedAt: stamp });
  const fallen = { id: `f${++lastRecord}`, player: removed.player, cause, pairingId: null, roundNumber: null, diedAt: stamp, fromMatch: false };
  recordsOf(found.id).unshift(fallen);
  return reply({ team: found, fallen }, 201);
}

/** `DELETE …/fallen/:fid`: the record, whose it is, the room on the roster, then the player back, last, and the record gone. */
function undoDeath(found, fallenId, { reply, refuse }) {
  const listed = recordsOf(found.id);
  const dead = listed.find((record) => record.id === fallenId);
  if (!dead) return refuse(404, "FALLEN_NOT_FOUND");
  if (dead.fromMatch) return refuse(403, "FALLEN_FROM_MATCH");
  const restored = returnFallenPlayer(found.roster, dead.player);
  if (restored.players.length > rosterSizeLimits.max) {
    const violations = [{ code: VALIDATION_CODES.ROSTER_MAX_PLAYERS, params: { max: rosterSizeLimits.max, count: restored.players.length } }];
    return reply({ ...errorPayload("ROSTER_BREAKS_THE_RULES"), violations }, 422);
  }
  Object.assign(found, { roster: restored, revision: found.revision + 1, updatedAt: new Date().toISOString() });
  listed.splice(listed.indexOf(dead), 1);
  return reply({ team: found });
}

/**
 * @param {object} request the HTTP request
 * @param {string} pathname
 * @param {{teams: object[], readBody: Function, reply: Function, refuse: Function}} mock the mock's list of teams and
 *   its helpers (mock-api.mjs)
 * @returns {Promise<{status: number, payload: object}|null>} null for a route that is not this module's
 */
export async function answerFallen(request, pathname, mock) {
  const { teams, readBody, reply, refuse } = mock;
  const { method } = request;
  const listing = method === "GET" ? LIST.exec(pathname) : null;
  const death = method === "POST" ? DEATH.exec(pathname) : null;
  const undo = method === "DELETE" ? ONE.exec(pathname) : null;
  const [, id, tail] = listing ?? death ?? undo ?? [];
  if (!id) return null;
  const found = teams.find((item) => item.id === id);
  if (!found) return refuse(404, "TEAM_NOT_FOUND");
  if (listing) return reply({ fallen: recordsOf(id) });
  if (death) return markDeath(found, tail, await readBody(request), mock);
  return undoDeath(found, tail, mock);
}
