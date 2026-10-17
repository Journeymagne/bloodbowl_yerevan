/**
 * A team's fallen over HTTP: who has died, a death a coach marks by hand, and the undo of one.
 *
 * `GET /api/teams/:id/fallen` lists a team's deaths, newest first. `POST /api/teams/:id/players/:pid/death`
 * is a coach saying that a player died outside a match: the player leaves the roster and is kept, as he
 * was, with the cause, in one transaction, so the roster never loses a player without his record and a
 * record never outlives a player the roster kept. `DELETE /api/teams/:id/fallen/:fid` takes the player
 * back and forgets the death. The deaths a match records (`from_match`) are written by its post-match,
 * in its own transaction (server/season/finance-store.mjs).
 *
 * A team is the owner's. The list may be read by an administrator too, and an administrator may undo
 * any death; marking one is the owner's alone. A death a match recorded is the administrator's to undo
 * (FALLEN_FROM_MATCH for a coach): the match is settled, and the coach's word does not unsettle it. To
 * anybody else the team is not there (`teamForUser`), and neither is a death that belongs to another team.
 *
 * Undoing needs no revision, as it only gives a player back under the team's lock: an editor that was
 * open on the roster is refused on its next save (TEAM_SAVED_ELSEWHERE), as it is after any other write.
 */
import { removeFallenPlayer, returnFallenPlayer } from "../../src/domain/roster/transfers.mjs";
import { publicFallen } from "../api/serializers.mjs";
import { PLAYER_ID_SOURCE, UUID_SOURCE, teamConflict, teamForUser } from "../api/team-access.mjs";
import { readPublicTeam } from "../api/team-queries.mjs";
import { currentUser } from "../auth/session.mjs";
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { blockingViolations, checkRoster, refuseSharedPlayerId, rosterRefusal } from "../domain/roster.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";

const FALLEN = new RegExp(`^/api/teams/(${UUID_SOURCE})/fallen$`, "i");
const ONE_FALLEN = new RegExp(`^/api/teams/(${UUID_SOURCE})/fallen/(${UUID_SOURCE})$`, "i");
const DEATH = new RegExp(`^/api/teams/(${UUID_SOURCE})/players/(${PLAYER_ID_SOURCE})/death$`, "i");
const MAX_CAUSE_LENGTH = 500;

const LIST_SQL = `
  SELECT f.id, f.player, f.cause, f.pairing_id, c.round_number, f.died_at, f.from_match
    FROM team_fallen_players f
    LEFT JOIN match_pairing_context c ON c.id = f.pairing_id
   WHERE f.saved_team_id = $1
   ORDER BY f.died_at DESC, f.id DESC`;

/**
 * The cause a body gives, trimmed: 1 to 500 characters, with no NUL (U+0000, which no text column of
 * Postgres holds: it would be a 500). Anything else is a 400 for `cause`.
 */
function checkCause(body) {
  const { cause } = body ?? {};
  const text = typeof cause === "string" ? cause.trim() : "";
  if (!text || text.length > MAX_CAUSE_LENGTH || text.includes("\u0000")) throw httpError(400, "FIELD_INVALID", { field: "cause" });
  return text;
}

/**
 * The roster as the one write of a death or an undo leaves it. The blob is written as it is, with only
 * its players (and their position counts) changed: `roster` comes from `src/domain/roster/transfers.mjs`.
 */
function saveRoster(client, teamId, roster) {
  return client.query(
    "UPDATE saved_teams SET roster = $2, revision = revision + 1, updated_at = now() WHERE id = $1",
    [teamId, JSON.stringify(roster)],
  );
}

/** How many players of a stored roster its race can read: normalisation (`checkRoster`) drops the rest. */
const readablePlayers = (slug, roster) => checkRoster(slug, roster ?? {}).roster.players.length;

/** `GET /api/teams/:id/fallen` — a team's deaths, newest first. */
async function sendFallen(request, response, teamId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  const team = await teamForUser(pool, teamId, user, { admin: true });
  const { rows } = await pool.query(LIST_SQL, [team.id]);
  sendJson(response, 200, { fallen: rows.map(publicFallen) });
}

/**
 * The transaction of a death. The team is locked first; then, in this order, the revision the client
 * saw, the player — one only: an id two players of a 2.x blob share is refused (`refuseSharedPlayerId`) —
 * the roster without him and the row that keeps him, and the answer read back. A refusal at any point
 * throws, and the whole transaction goes back.
 */
async function writeDeath(client, teamId, user, playerId, cause, revision) {
  const team = await teamForUser(client, teamId, user, { lock: true });
  if (revision !== team.revision) throw await teamConflict(client, team); // no revision at all is a revision that cannot match
  refuseSharedPlayerId(team.roster, playerId);
  const removed = removeFallenPlayer(team.roster, playerId);
  if (!removed) throw httpError(404, "PLAYER_NOT_FOUND");
  await saveRoster(client, team.id, removed.roster);
  const { rows } = await client.query(
    `INSERT INTO team_fallen_players (saved_team_id, player, cause, recorded_by, from_match)
     VALUES ($1, $2, $3, $4, false) RETURNING *`,
    [team.id, JSON.stringify(removed.player), cause, user.id],
  );
  return { team: await readPublicTeam(client, team.id), fallen: publicFallen(rows[0]) };
}

/** `POST /api/teams/:id/players/:pid/death` `{ cause, revision }` — the owner marks a player as dead. */
async function markDeath(request, response, teamId, playerId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // Whose team it is comes before anything else about the request: a stranger is told 404 for a bad
  // body as for a good one. This look takes no lock — the transaction below looks again, locked.
  await teamForUser(pool, teamId, user);
  const body = await readJson(request);
  const cause = checkCause(body); // a bad body costs no transaction
  const answer = await withTransaction((client) => writeDeath(client, teamId, user, playerId, cause, body.revision));
  sendJson(response, 201, answer);
}

/**
 * The transaction of an undo. The team is locked first; then, in this order, the death (of this team
 * and no other), who may undo it, the rules the roster has to keep with him back, that the roster can
 * read him as he was kept, the roster with him, and the death forgotten. Refused at any point, nothing
 * is written.
 *
 * A record the roster cannot read — no place on it (`rowIndex`), or one the race has no row for — is not
 * undone (422 FALLEN_NOT_RESTORABLE): normalisation would drop him, and the death would be forgotten for a
 * player nobody then sees. Who reads him is counted, the roster as it was and with him back.
 */
async function returnPlayer(client, teamId, fallenId, user) {
  const team = await teamForUser(client, teamId, user, { lock: true, admin: true });
  const { rows } = await client.query("SELECT * FROM team_fallen_players WHERE id = $1 AND saved_team_id = $2", [fallenId, team.id]);
  const dead = rows[0];
  if (!dead) throw httpError(404, "FALLEN_NOT_FOUND");
  if (dead.from_match && !user.is_admin) throw httpError(403, "FALLEN_FROM_MATCH");
  const restored = returnFallenPlayer(team.roster, dead.player);
  const { violations, roster: read } = checkRoster(team.base_team_slug, restored);
  const blocking = blockingViolations(violations);
  if (blocking.length) throw rosterRefusal(blocking);
  const returned = restored.players.length - (Array.isArray(team.roster?.players) ? team.roster.players.length : 0);
  if (read.players.length !== readablePlayers(team.base_team_slug, team.roster) + returned) throw httpError(422, "FALLEN_NOT_RESTORABLE");
  await saveRoster(client, team.id, restored);
  await client.query("DELETE FROM team_fallen_players WHERE id = $1", [dead.id]);
  return readPublicTeam(client, team.id);
}

/** `DELETE /api/teams/:id/fallen/:fid` — a death is undone and the player is back on the roster. */
async function undoDeath(request, response, teamId, fallenId) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  const team = await withTransaction((client) => returnPlayer(client, teamId, fallenId, user));
  sendJson(response, 200, { team });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleFallenRoutes(request, response, url) {
  const listPath = request.method === "GET" ? FALLEN.exec(url.pathname) : null;
  if (listPath) {
    await sendFallen(request, response, listPath[1]);
    return true;
  }
  const deathPath = request.method === "POST" ? DEATH.exec(url.pathname) : null;
  if (deathPath) {
    await markDeath(request, response, deathPath[1], deathPath[2]);
    return true;
  }
  const undoPath = request.method === "DELETE" ? ONE_FALLEN.exec(url.pathname) : null;
  if (undoPath) {
    await undoDeath(request, response, undoPath[1], undoPath[2]);
    return true;
  }
  return false;
}
