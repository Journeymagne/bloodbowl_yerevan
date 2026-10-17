/**
 * A player's career over HTTP: `GET /api/teams/:id/players/:pid/history?season=` — `{ history }`, the team's
 * matches with what the player did in each (a finished one as its post-match applied it, a live one from his
 * taps, an old one without details) and the edits made outside any match, as sums (`playerHistory`,
 * src/domain/post-match/history.mjs, where the rows are explained).
 *
 * `season` narrows the matches to that season's league matches; the edits outside a match are not a season's
 * and stay. A season that is left out or empty is none; one that is no UUID is a 400 for `season`, said only
 * to somebody who may read the team. The player need not be on the roster — one who died has a career — and a
 * player id the team never had is an answer too: its matches, without details, and nothing outside.
 *
 * Every read is one snapshot, with the team in it, and nothing is locked or written. A team is the owner's,
 * and an administrator may read it too; to anybody else the team is not there (`teamForUser`), whatever the
 * query says.
 */
import { PLAYER_ID_SOURCE, UUID_SOURCE, isUuid, teamForUser } from "../api/team-access.mjs";
import { currentUser } from "../auth/session.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, sendJson } from "../http/responses.mjs";
import { loadPlayerHistory } from "../season/player-history.mjs";

const HISTORY = new RegExp(`^/api/teams/(${UUID_SOURCE})/players/(${PLAYER_ID_SOURCE})/history$`, "i");

/** `?season=` as the season it names: none when it is left out or empty, and a 400 for `season` when it is no UUID. */
function seasonOf(params) {
  const season = params.get("season") || null;
  if (season !== null && !isUuid(season)) throw httpError(400, "FIELD_INVALID", { field: "season" });
  return season;
}

/** `GET /api/teams/:id/players/:pid/history?season=` — `{ history: { playerId, matches, outside } }`. */
async function sendHistory(request, response, teamId, playerId, params) {
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  // One snapshot: the team and everything read of it are the same moment. The team comes first, so a stranger
  // is told 404 whatever the season says.
  const history = await withTransaction(async (client) => {
    const team = await teamForUser(client, teamId, user, { admin: true });
    return loadPlayerHistory(client, { teamId: team.id, playerId, seasonId: seasonOf(params) });
  }, { readOnly: true });
  sendJson(response, 200, { history });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleHistoryRoutes(request, response, url) {
  const path = request.method === "GET" ? HISTORY.exec(url.pathname) : null;
  if (!path) return false;
  await sendHistory(request, response, path[1], path[2], url.searchParams);
  return true;
}
