/**
 * The season: reading it, entering it, and running it as an admin.
 *
 * Lifted out of handleApi by step 4.9. The work these routes do lives in
 * server/season/*; what is here is who may ask for it and what comes back.
 *
 * Every one of them requires a session, including the plain `GET /api/season`.
 * Task 10.3 splits that: a league table, a schedule and results are things a
 * visitor should be able to read without an account, and only `myEntry`,
 * `myTeams` and the admin half need one.
 */
import { pool } from "../db/pool.mjs";
import { withTransaction } from "../db/transaction.mjs";
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { errorPayload } from "../http/errors.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicGame, publicSavedTeam } from "../api/serializers.mjs";
import { commitSavedTeamToSeason, ensureActiveSeason, loadSeasonBundle, loadUserGameRows } from "../season/store.mjs";
import { addSeasonPairing, createManualRound, generateSwissRound, startSeasonRound, validateSeasonEntry } from "../season/rounds.mjs";
import { proposeGameResult, setTechnicalReason, updateSeasonPairing } from "../season/games.mjs";
import { deleteSeasonPairing, deleteSeasonRound } from "../season/history.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
}

/** The same, for a refusal the client can translate. */
function sendError(response, status, code, params) {
  return send(response, status, errorPayload(code, params));
}

// How many places of the table go on to the playoff: what 017's CHECK on seasons.playoff_places allows.
const PLAYOFF_PLACES = Object.freeze({ min: 1, max: 64 });

/**
 * The season's playoff places as an admin sends them: a whole number in PLAYOFF_PLACES, or null for no zone.
 *
 * @throws 400 FIELD_INVALID `{field: "playoffPlaces"}` for anything else — a missing field, a string, a fraction
 */
function playoffPlacesOf(body) {
  const places = body.playoffPlaces;
  if (places === null) return null;
  if (Number.isInteger(places) && places >= PLAYOFF_PLACES.min && places <= PLAYOFF_PLACES.max) return places;
  throw httpError(400, "FIELD_INVALID", { field: "playoffPlaces" });
}

/**
 * @returns {Promise<boolean>} true when this module answered the request
 */
export async function handleSeasonRoutes(request, response, url) {
  if (url.pathname === "/api/season" && request.method === "GET") {
    // No session required since step 10.3: the table, the schedule and the
    // results are readable by anyone. What a signed-in coach additionally gets
    // — their own entry, their teams, the admin block, everyone's contact — is
    // decided inside loadSeasonBundle, from whether there is a user at all.
    return send(response, 200, await loadSeasonBundle(await currentUser(request)));
  }

  if (url.pathname === "/api/season/commit" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const body = await readJson(request);
    const teamId = String(body.teamId ?? "").trim();
    if (!teamId) return sendError(response, 400, "TEAM_REQUIRED");
    const season = await ensureActiveSeason();
    await commitSavedTeamToSeason(season.id, teamId, user.id);
    return send(response, 201, await loadSeasonBundle(user));
  }

  return handleSeasonEntryRoutes(request, response, url);
}

/**
 * Who is in the season: adding an entry, removing one. (A coach and his team made for it are the
 * administration's since stage 12: `POST /api/admin/coaches`, server/routes/admin-coaches.mjs.)
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleSeasonEntryRoutes(request, response, url) {
  if (url.pathname === "/api/season/admin/entries" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const body = await readJson(request);
    const teamId = String(body.teamId ?? "").trim();
    if (!teamId) return sendError(response, 400, "TEAM_REQUIRED");
    const season = await ensureActiveSeason();
    await commitSavedTeamToSeason(season.id, teamId);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const seasonEntryMatch = url.pathname.match(/^\/api\/season\/admin\/entries\/([0-9a-f-]+)$/i);
  if (seasonEntryMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await pool.query(
      `UPDATE season_entries SET withdrawn_at = COALESCE(withdrawn_at, now()), updated_at = now()
       WHERE id = $1 AND season_id = $2`,
      [seasonEntryMatch[1], season.id],
    );
    return send(response, 200, await loadSeasonBundle(user));
  }

  return handleSeasonRoundRoutes(request, response, url);
}

/**
 * Rounds, pairings and fixtures — the parts an admin runs the season with.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleSeasonRoundRoutes(request, response, url) {
  // The season's own settings (stage 12): its playoff places, which the league table draws its zone by.
  if (url.pathname === "/api/season/admin/settings" && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const playoffPlaces = playoffPlacesOf(await readJson(request)); // before the season is looked up, or made
    const season = await ensureActiveSeason();
    await pool.query(`UPDATE seasons SET playoff_places = $2, updated_at = now() WHERE id = $1`, [season.id, playoffPlaces]);
    return send(response, 200, await loadSeasonBundle(user));
  }

  if (url.pathname === "/api/season/admin/rounds/generate" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await generateSwissRound(season);
    return send(response, 201, await loadSeasonBundle(user));
  }

  if (url.pathname === "/api/season/admin/rounds" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await createManualRound(season);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const seasonRoundMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)$/i);
  if (seasonRoundMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await deleteSeasonRound(season.id, seasonRoundMatch[1]);
    return send(response, 200, await loadSeasonBundle(user));
  }

  const seasonRoundStartMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/start$/i);
  if (seasonRoundStartMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await startSeasonRound(season.id, seasonRoundStartMatch[1]);
    return send(response, 200, await loadSeasonBundle(user));
  }

  return handleSeasonPairingRoutes(request, response, url);
}

/**
 * Pairings inside a round, and the result a coach proposes for one.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleSeasonPairingRoutes(request, response, url) {
  const seasonRoundPairingsMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/pairings$/i);
  if (seasonRoundPairingsMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const body = await readJson(request);
    const season = await ensureActiveSeason();
    await addSeasonPairing(season.id, seasonRoundPairingsMatch[1], body.homeEntryId, body.awayEntryId);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const fixtureMatch = url.pathname.match(/^\/api\/season\/fixture\/([0-9a-f-]+)$/i);
  if (fixtureMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    const body = await readJson(request);
    await proposeGameResult(fixtureMatch[1], user.id, body, user.is_admin);
    return send(response, 200, { game: publicGame((await loadUserGameRows(user.id, fixtureMatch[1], user.is_admin))[0], user.id) });
  }

  const seasonPairingMatch = url.pathname.match(/^\/api\/season\/admin\/pairings\/([0-9a-f-]+)$/i);
  if (seasonPairingMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const body = await readJson(request);
    const season = await ensureActiveSeason();
    // One transaction: the pairing's lock holds through the post-match's check and the write (decision 29).
    await withTransaction((client) => updateSeasonPairing(season.id, seasonPairingMatch[1], body, true, user.id, client));
    return send(response, 200, await loadSeasonBundle(user));
  }

  // A confirmed technical result's reason (stage 12): the reason and its points, nothing else.
  const technicalReasonMatch = url.pathname.match(/^\/api\/season\/admin\/pairings\/([0-9a-f-]+)\/technical-reason$/i);
  if (technicalReasonMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const body = await readJson(request);
    const season = await ensureActiveSeason();
    await setTechnicalReason(season.id, technicalReasonMatch[1], body.technicalReason);
    return send(response, 200, await loadSeasonBundle(user));
  }

  if (seasonPairingMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return sendError(response, 401, "NOT_AUTHORIZED");
    if (!user.is_admin) return sendError(response, 403, "ADMIN_REQUIRED");
    const season = await ensureActiveSeason();
    await deleteSeasonPairing(season.id, seasonPairingMatch[1]);
    return send(response, 200, await loadSeasonBundle(user));
  }

  return false;
}
