import { createRoomHandler, readPlayBody, playJson } from "./rooms.mjs";

/** Auth follows the league's existing saved-roster access policy. Practice remains anonymous. */
export function createPlayHandler({ teams, currentUser }) {
  const requireCoach = async request => {
    if (!await currentUser(request)) throw Object.assign(new Error("Sign in to the league to use database teams."), { status: 401 });
  };
  const start = async (request, body) => {
    if (!body.teams) return undefined;
    await requireCoach(request);
    return teams.start(body);
  };
  const rooms = createRoomHandler({ start, requireCoach });
  return async function handlePlay(request, response, url) {
    if (!url.pathname.startsWith("/api/play/")) return false;
    try {
      const origin = request.headers.origin;
      if (origin && new URL(origin).host !== request.headers.host) {
        playJson(response, 403, { error: "Cross-origin requests are not allowed." });
        return true;
      }
      if (url.pathname === "/api/play/teams" && request.method === "GET") {
        await requireCoach(request);
        playJson(response, 200, { teams: await teams.catalog() });
      } else if (url.pathname === "/api/play/matches" && request.method === "POST") {
        await requireCoach(request);
        playJson(response, 201, { state: await teams.start(await readPlayBody(request)) });
      } else return rooms(request, response, url);
    } catch (error) {
      const status = error.status || 500;
      if (status >= 500) console.error("Tabletop database request failed:", error.code || error.name);
      playJson(response, status, { error: status >= 500 ? "Could not load league teams. Please try again." : error.message });
    }
    return true;
  };
}
