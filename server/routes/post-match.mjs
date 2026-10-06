import { currentUser } from '../auth/session.mjs';
import { httpError, readJson, sendJson } from '../http/responses.mjs';
import { accessPostMatch } from '../season/post-match.mjs';

export async function handlePostMatchRoutes(request, response, url) {
  const match = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)\/(post-match|finish)$/i);
  if (!match) return false;
  const user = await currentUser(request);
  if (!user) throw httpError(401, 'NOT_AUTHORIZED');
  if (match[2] === 'post-match' && request.method === 'GET') sendJson(response, 200, await accessPostMatch(match[1], user));
  else if ((match[2] === 'post-match' && request.method === 'PATCH') || (match[2] === 'finish' && request.method === 'POST')) {
    const body = await readJson(request);
    if (match[2] === 'post-match' && !body.action?.type) throw httpError(400, 'POST_ACTION');
    sendJson(response, 200, await accessPostMatch(match[1], user, body, match[2] === 'finish'));
  } else throw httpError(405, 'ROUTE_NOT_FOUND');
  return true;
}
