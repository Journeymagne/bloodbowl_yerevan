/**
 * Every route about one team starts here: whose it is, locked or not, and a refusal that does
 * not tell a stranger the team exists.
 *
 * A team that is not yours answers exactly as a team that is not there — 404 TEAM_NOT_FOUND,
 * the same body — so nobody can find out which ids are teams by asking. That is why the lookup
 * comes before anything else a route does: a bad body, a stale revision or a rule that does not
 * apply would each answer differently for a team that exists.
 *
 * An id that goes into a query is checked as a UUID first. A path that does not look like one
 * never matches a route, and `teamForUser` refuses any other that reaches it: the database
 * would answer both with 22P02, and the API would send that on as a 500.
 */
import { httpError } from "../http/errors.mjs";
import { publicSavedTeam } from "./serializers.mjs";

/** A UUID as regular-expression source, for building a route's path: `` `^/api/teams/(${UUID_SOURCE})/x$` `` with the `i` flag. */
export const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A player's id in a path: what a roster blob holds (`p0`, `home-0`, a UUID), and nothing that could step out of the segment. */
export const PLAYER_ID_SOURCE = "[A-Za-z0-9_.-]{1,200}";

const UUID = new RegExp(`^${UUID_SOURCE}$`, "i");

/** True for a UUID in either case, false for anything else — a value that is not a string too. */
export function isUuid(value) {
  return typeof value === "string" && UUID.test(value);
}

/**
 * The team `teamId` as `user` may use it, or a 404 TEAM_NOT_FOUND.
 *
 * `admin` is for a route an administrator may use on any team, which is a read: only then, and
 * only for a user who is an admin, is the owner check dropped. A coach cannot ask for it, and a
 * route that does not pass it treats an admin like anybody else. A write is its owner's.
 *
 * `lock` is FOR UPDATE, for a route that is about to change the team: call this first in the
 * transaction, so the row is held before anything else is read from it. It means something only
 * on the client of a transaction (`withTransaction`); on a pool the lock ends with the statement.
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 * @param {string} teamId
 * @param {{id: string, is_admin?: boolean}} user as `currentUser` returns it
 * @param {{lock?: boolean, admin?: boolean}} [options]
 * @returns {Promise<object>} the saved_teams row
 */
export async function teamForUser(db, teamId, user, { lock = false, admin = false } = {}) {
  // The query reads a null owner as "any owner", and pg sends a missing id as null: so "any" is
  // said on purpose here, and a user who has no usable id is nobody's.
  const anyOwner = admin && user.is_admin;
  if (isUuid(teamId) && (anyOwner || isUuid(user.id))) {
    const { rows } = await db.query(
      `SELECT * FROM saved_teams WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)${lock ? " FOR UPDATE" : ""}`,
      [teamId, anyOwner ? null : user.id],
    );
    if (rows[0]) return rows[0];
  }
  throw httpError(404, "TEAM_NOT_FOUND");
}

/**
 * The refusal for a save made from a copy of the team that is out of date: 409
 * TEAM_SAVED_ELSEWHERE with the team as it stands now beside it, so the client can show it
 * instead of guessing — the same answer `PATCH` gives. `handleApi` sends `error.team`.
 *
 * @param {object} row the saved_teams row as it is now; `inActiveSeason` is in the answer only
 *   when the query that read the row asked for it
 * @returns {Error}
 */
export function teamConflict(row) {
  const error = httpError(409, "TEAM_SAVED_ELSEWHERE");
  error.team = publicSavedTeam(row);
  return error;
}
