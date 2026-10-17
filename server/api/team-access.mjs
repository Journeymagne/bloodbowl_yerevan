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
import { readPublicTeam } from "./team-queries.mjs";

/** A UUID as regular-expression source, for building a route's path: `` `^/api/teams/(${UUID_SOURCE})/x$` `` with the `i` flag. */
export const UUID_SOURCE = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";

/** A player's id in a path: what a roster blob holds (`p0`, `home-0`, a UUID), and nothing that could step out of the segment. */
export const PLAYER_ID_SOURCE = "[A-Za-z0-9_.-]{1,200}";

const UUID = new RegExp(`^${UUID_SOURCE}$`, "i");

/** What the team's routes read of the row `teamForUser` returns. */
const TEAM_COLUMNS = "id, base_team_slug, roster, revision";

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
 * The row has the columns the team's routes read (`TEAM_COLUMNS`) and no others: not the logo, a data
 * URL of up to megabytes, which a ledger page or a tap would otherwise carry for nothing, each time.
 * An answer that shows the team reads it again (`readPublicTeam`).
 *
 * @param {{query: Function}} db a pg pool, or the client of a transaction
 * @param {string} teamId
 * @param {{id: string, is_admin?: boolean}|null|undefined} user as `currentUser` returns it; no user at all is
 *   nobody's, not an error of its own
 * @param {{lock?: boolean, admin?: boolean}} [options]
 * @returns {Promise<{id: string, base_team_slug: string, roster: object, revision: number}>} the saved_teams row
 */
export async function teamForUser(db, teamId, user, { lock = false, admin = false } = {}) {
  // The query reads a null owner as "any owner", and pg sends a missing id as null: so "any" is
  // said on purpose here, and a user who has no usable id, or no user at all, is nobody's.
  const anyOwner = admin && user?.is_admin;
  if (isUuid(teamId) && (anyOwner || isUuid(user?.id))) {
    const { rows } = await db.query(
      `SELECT ${TEAM_COLUMNS} FROM saved_teams WHERE id = $1 AND ($2::uuid IS NULL OR user_id = $2::uuid)${lock ? " FOR UPDATE" : ""}`,
      [teamId, anyOwner ? null : user.id],
    );
    if (rows[0]) return rows[0];
  }
  throw httpError(404, "TEAM_NOT_FOUND");
}

/**
 * The refusal for a save made from a copy of the team that is out of date: 409 TEAM_SAVED_ELSEWHERE
 * with the team as it stands now beside it, so the client can show it instead of guessing. It is the
 * answer `PATCH` gives, and the team is read the way `PATCH` reads it for that answer
 * (`readPublicTeam`, `inActiveSeason` included), so the client handles one shape however a save
 * was refused. `handleApi` sends `error.team`.
 *
 * Call it inside the transaction that holds the team, with the row `teamForUser` returned, and
 * throw what it returns: `throw await teamConflict(client, row)`. The team is read again; only the
 * row's id is used. It takes the row and not an id so that the id from
 * a path, which may be anything, cannot be passed by mistake — and anything but a row with a UUID id
 * is such a mistake, thrown as one rather than answered as a 409 with no team in it.
 *
 * @param {{query: Function}} db the client of the transaction
 * @param {{id: string}} row the saved_teams row `teamForUser` returned
 * @returns {Promise<Error>}
 * @throws {TypeError} when `row` is not a row with a UUID id
 */
export async function teamConflict(db, row) {
  if (!isUuid(row?.id)) throw new TypeError("teamConflict takes the row teamForUser returned");
  const error = httpError(409, "TEAM_SAVED_ELSEWHERE");
  error.team = await readPublicTeam(db, row.id);
  return error;
}
