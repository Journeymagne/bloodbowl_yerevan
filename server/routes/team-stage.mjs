/**
 * Where a team is in its life: being put together (`draft`) or playing (`active`).
 *
 * Migration 009 added the column; this is the one move the API makes on it. An admin moves a
 * team from `draft` to `active`; a coach cannot, and there is no way back. The stage decides
 * which re-roll a team may buy (`writeSavedTeam`, `STAGE_PURCHASE_LOCKED`).
 */
import { UUID_SOURCE } from "../api/team-access.mjs";
import { readPublicTeam } from "../api/team-queries.mjs";
import { currentUser } from "../auth/session.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, sendJson } from "../http/responses.mjs";

const ACTIVATE = new RegExp(`^/api/teams/(${UUID_SOURCE})/activate$`, "i");

/**
 * `POST /api/teams/:id/activate` — an admin moves a draft team to active.
 *
 * Safe to repeat and to race. The move is one UPDATE that only matches a team still in `draft`,
 * so a second request — a double click, another admin, a retry after a lost answer — changes
 * nothing and is answered with the team as the first one left it. The revision goes up with the
 * move: an editor that was open on the draft is refused on its next save (TEAM_SAVED_ELSEWHERE)
 * and reads the stage again. `activated_at` is the moment of the move, and stays empty for a
 * team that was already playing before there were stages.
 *
 * Who is asking is settled before the team is looked up: a coach is told "admins only" whether
 * or not the id is a team, so this route cannot be used to find out which ids are.
 *
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleActivateRoute(request, response, url) {
  const match = request.method === "POST" ? ACTIVATE.exec(url.pathname) : null;
  if (!match) return false;
  const [, teamId] = match;
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  if (!user.is_admin) throw httpError(403, "ADMIN_REQUIRED");
  const team = await withTransaction(async (client) => {
    await client.query(
      `UPDATE saved_teams
          SET stage = 'active', activated_at = now(), revision = revision + 1, updated_at = now()
        WHERE id = $1 AND stage = 'draft'`,
      [teamId],
    );
    const read = await readPublicTeam(client, teamId);
    if (!read) throw httpError(404, "TEAM_NOT_FOUND");
    return read;
  });
  sendJson(response, 200, { team });
  return true;
}
