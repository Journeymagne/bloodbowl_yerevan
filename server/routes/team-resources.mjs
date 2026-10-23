/**
 * What hangs off one team: the routes under `/api/teams/:id/...`.
 *
 * `handleTeamRoutes` answers the team itself — the list, create, read, save, delete — and offers
 * every request to this chain first. Each resource is a module with its own handler, and their
 * paths do not overlap, so the order below is the order somebody would look for one in. A
 * resource added later adds its handler to the list and nothing else here.
 */
import { handleHistoryRoutes } from "./player-history.mjs";
import { handleEventRoutes } from "./team-events.mjs";
import { handleFallenRoutes } from "./team-fallen.mjs";
import { handleLedgerRoutes } from "./team-ledger.mjs";
import { handleRollRoutes } from "./team-rolls.mjs";
import { handleActivateRoute } from "./team-stage.mjs";

/** One handler per resource: it answers its own paths, and says so by returning true. */
const TEAM_RESOURCE_ROUTES = [
  handleActivateRoute,
  handleLedgerRoutes,
  handleFallenRoutes,
  handleRollRoutes,
  handleEventRoutes,
  handleHistoryRoutes,
];

/**
 * @returns {Promise<boolean>} true when one of the resources answered the request
 */
export async function handleTeamResourceRoutes(request, response, url) {
  for (const route of TEAM_RESOURCE_ROUTES) {
    if (await route(request, response, url)) return true;
  }
  return false;
}
