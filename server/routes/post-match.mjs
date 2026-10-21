import { currentUser } from '../auth/session.mjs';
import { httpError, readJson, sendJson } from '../http/responses.mjs';
import { publicRoll } from '../api/dice-rolls.mjs';
import { accessPostMatch, rollInPostMatch } from '../season/post-match.mjs';
import { checkRoll } from './team-rolls.mjs';

// `POST …/post-match/rolls` `{ side?, playerId, purpose, category? }`: the post-match's own dice (rollInPostMatch).
const ROLLS = /^\/api\/games\/([0-9a-f-]+)\/post-match\/rolls$/i;

export async function handlePostMatchRoutes(request, response, url) {
  const rolls = url.pathname.match(ROLLS), match = rolls ? null : url.pathname.match(/^\/api\/games\/([0-9a-f-]+)\/(post-match|finish)$/i);
  if (!rolls && !match) return false;
  const user = await currentUser(request);
  if (!user) throw httpError(401, 'NOT_AUTHORIZED');
  if (rolls) {
    if (request.method !== 'POST') throw httpError(405, 'ROUTE_NOT_FOUND');
    const body = await readJson(request);
    sendJson(response, 200, { roll: publicRoll(await rollInPostMatch(rolls[1], user, checkRoll(body), body)) });
  } else if (match[2] === 'post-match' && request.method === 'GET') sendJson(response, 200, await accessPostMatch(match[1], user));
  else if ((match[2] === 'post-match' && request.method === 'PATCH') || (match[2] === 'finish' && request.method === 'POST')) {
    const body = await readJson(request);
    if (match[2] === 'post-match' && !body.action?.type) throw httpError(400, 'POST_ACTION');
    sendJson(response, 200, await accessPostMatch(match[1], user, body, match[2] === 'finish'));
  } else throw httpError(405, 'ROUTE_NOT_FOUND');
  return true;
}
