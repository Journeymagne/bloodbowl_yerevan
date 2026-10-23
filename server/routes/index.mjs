/**
 * The API: the route modules in the order they are tried, and the function that
 * runs a request through them.
 *
 * Both lived in server.mjs, which starts listening the moment it is imported, so
 * the only way to put a request through the real chain was a real HTTP request to
 * a real server. They are here so that a test can call `handleApi` directly
 * (test/helpers/api-db.mjs) and exercise the chain the site runs, not a copy.
 * They moved unchanged; `handleApi` has since learnt to answer with what an error
 * carries besides its code (`violations`, `team`, `retryAfterSeconds`).
 */
import { sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { handleAuthRoutes } from "./auth.mjs";
import { handleTeamRoutes } from "./teams.mjs";
import { handleAdminRoutes } from "./admin.mjs";
import { handlePlayerRoutes } from "./players.mjs";
import { handleGameRoutes } from "./games.mjs";
import { handleSeasonRoutes } from "./season.mjs";

/**
 * Every route module, in the order the API is tried.
 *
 * This was one function of 672 lines: every endpoint the site has, in one
 * chain of `if`s, in the order they were written. Step 4.9 turned it into six
 * modules and this list.
 */
export const API_ROUTES = [
  handleAuthRoutes,
  handleTeamRoutes,
  handleAdminRoutes,
  handlePlayerRoutes,
  handleGameRoutes,
  handleSeasonRoutes,
];

/**
 * Runs a request through the route modules, and answers what they throw.
 *
 * An error is answered with its status, its code and its values (`errorPayload`), and with what else it
 * was given to say: `violations` (what a roster breaks), `team` (the team as it stands, `teamConflict`)
 * and `retryAfterSeconds` (when to try again, `httpError`; also sent as the `Retry-After` header).
 * Anything from 500 up is answered as `SERVER_ERROR` and nothing else, whatever it was given: its
 * detail stays in the log.
 */
export async function handleApi(request, response, url) {
  try {
    // Each module answers and says so; the first that does ends the chain.
    // The paths do not overlap, so the order is the order somebody would look
    // for a route in, not the order the old if-chain happened to grow.
    for (const route of API_ROUTES) {
      if (await route(request, response, url)) return;
    }
    return sendJson(response, 404, errorPayload("ROUTE_NOT_FOUND"));
  } catch (error) {
    const status = Number(error.status) || 500;
    if (status >= 500) {
      console.error(error);
    }
    // A 500 says nothing about itself: that belongs in the log, not in a
    // stranger's browser. Anything else carries its code.
    const payload = status >= 500
      ? errorPayload("SERVER_ERROR")
      : errorPayload(error.code ?? "SERVER_ERROR", error.params ?? {}, error.message);
    if (status < 500) {
      if (Array.isArray(error.violations)) payload.violations = error.violations;
      // A refusal that says how things stand now (teamConflict): the team travels beside the error.
      if (error.team) payload.team = error.team;
      // A refusal that says when to come back (a password guessed too often): the header and the body
      // field the login's own 429 carries, so a client reads one answer wherever it meets it.
      if (Number.isFinite(error.retryAfterSeconds)) {
        response.setHeader?.("Retry-After", String(error.retryAfterSeconds));
        payload.retryAfterSeconds = error.retryAfterSeconds;
      }
    }
    return sendJson(response, status, payload);
  }
}
