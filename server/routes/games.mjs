/**
 * A coach's matches: the list, one match, and answering a proposed result.
 *
 * Lifted out of handleApi by step 4.9.
 *
 * `/api/team-logos/:id` sits here because it is the one thing a match page
 * needs that no other route serves — the opponent's badge, fetched separately
 * so the game list does not carry a data URL per team.
 *
 * Task 14.1 is about the propose/confirm/reject route: today the coach who
 * proposed a result can accept it themselves.
 */
import { pool } from "../db/pool.mjs";
import { httpError, readJson, sendJson, writeResponse } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicGame } from "../api/serializers.mjs";
import { loadUserGameRows } from "../season/store.mjs";
import { proposeGameResult, respondToGameProposal, updateSeasonPairing } from "../season/games.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/** The same, for a refusal the client can translate. */
function sendError(response, status, code, params) {
  return send(response, status, errorPayload(code, params));
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleGameRoutes(request, response, url) {
  if (url.pathname === "/api/games" && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const [rows, currentRows] = await Promise.all([
      loadUserGameRows(user.id),
      user.is_admin ? loadUserGameRows(user.id, null, true) : Promise.resolve([]),
    ]);
    return send(response, 200, {
      games: rows.map((row) => publicGame(row, user.id)),
      currentGames: currentRows.map((row) => publicGame(row, user.id)),
    });
  }

  const teamLogoMatch = url.pathname.match(/^\/api\/team-logos\/([0-9a-f-]+)$/i);
  if (teamLogoMatch && request.method === "GET") {
    const result = await pool.query(
      `SELECT logo_data, updated_at FROM saved_teams WHERE id = $1`,
      [teamLogoMatch[1]],
    );
    const logoData = String(result.rows[0]?.logo_data || "");
    const match = logoData.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([a-z0-9+/=]+)$/i);
    if (!match) return writeResponse(request, response, 404, "", { "Cache-Control": "public, max-age=300" });
    const body = Buffer.from(match[2], "base64");
    const etag = `"${crypto.createHash("sha256").update(body).digest("hex")}"`;
    if (request.headers["if-none-match"] === etag) {
      return writeResponse(request, response, 304, "", { ETag: etag, "Cache-Control": "public, max-age=86400" });
    }
    return writeResponse(request, response, 200, body, {
      "Content-Type": match[1].toLowerCase(),
      "Cache-Control": "public, max-age=86400",
      ETag: etag,
    });
  }

  const gameMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)$/i);
  if (gameMatch && request.method === "GET") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const row = (await loadUserGameRows(user.id, gameMatch[1], user.is_admin))[0];
    if (!row) return sendError(response, 404, "GAME_NOT_FOUND");
    return send(response, 200, { game: publicGame(row, user.id) });
  }

  if (gameMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const row = (await loadUserGameRows(user.id, gameMatch[1], true))[0];
    if (!row) return sendError(response, 404, "GAME_NOT_FOUND");
    await updateSeasonPairing(row.season_id, gameMatch[1], await readJson(request), true, user.id);
    const updated = (await loadUserGameRows(user.id, gameMatch[1], true))[0];
    return send(response, 200, { game: publicGame(updated, user.id) });
  }

  const gameActionMatch = url.pathname.match(/^\/api\/games\/([0-9a-f-]+)\/(propose|confirm|reject)$/i);
  if (gameActionMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (gameActionMatch[2] === "propose") await proposeGameResult(gameActionMatch[1], user.id, await readJson(request), user.is_admin);
    if (gameActionMatch[2] === "confirm") await respondToGameProposal(gameActionMatch[1], user.id, true, user.is_admin);
    if (gameActionMatch[2] === "reject") await respondToGameProposal(gameActionMatch[1], user.id, false, user.is_admin);
    const row = (await loadUserGameRows(user.id, gameActionMatch[1], user.is_admin))[0];
    return send(response, 200, { game: publicGame(row, user.id) });
  }

  return false;
}
