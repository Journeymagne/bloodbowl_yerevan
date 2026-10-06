import { currentUser } from "../auth/session.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { listChallenges, createChallenge, respondToChallenge } from "../friendly/challenges.mjs";

export async function handleChallengeRoutes(request, response, url) {
  const action = url.pathname.match(/^\/api\/challenges\/([0-9a-f-]+)\/(accept|decline|cancel)$/i);
  if (url.pathname !== "/api/challenges" && !action) return false;
  const user = await currentUser(request);
  if (!user) throw httpError(401, "NOT_AUTHORIZED");
  if (request.method === "GET" && !action) sendJson(response, 200, await listChallenges(user.id));
  else if (request.method === "POST" && !action) sendJson(response, 201, await createChallenge(user.id, await readJson(request)));
  else if (request.method === "POST") sendJson(response, 200, await respondToChallenge(action[1], user.id, action[2], await readJson(request)));
  else throw httpError(405, "ROUTE_NOT_FOUND");
  return true;
}
