import { currentUser } from "../auth/session.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { accessPreparation } from "../season/preparation.mjs";

export async function handlePreparationRoutes(request, response, url) {
  const match = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)\/(preparation|start)$/i);
  if (!match) return false;
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  if (match[2] === "preparation" && request.method === "GET") {
    sendJson(response, 200, await accessPreparation(match[1], user));
  } else if (match[2] === "preparation" && request.method === "PATCH") {
    const body = await readJson(request);
    if (!body.action || typeof body.action.type !== "string") throw httpError(400, "MATCH_ACTION");
    sendJson(response, 200, await accessPreparation(match[1], user, body));
  } else if (match[2] === "start" && request.method === "POST") {
    sendJson(response, 200, await accessPreparation(match[1], user, await readJson(request), true));
  } else throw httpError(405, "ROUTE_NOT_FOUND");
  return true;
}
