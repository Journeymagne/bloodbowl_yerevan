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
import { httpError, readJson, sendJson } from "../http/responses.mjs";
import { currentUser } from "../auth/session.mjs";
import { publicGame, publicSavedTeam, serializeRosterForStorage } from "../api/serializers.mjs";
import { commitSavedTeamToSeason, ensureActiveSeason, loadSeasonBundle, loadUserGameRows } from "../season/store.mjs";
import { addSeasonPairing, createManualRound, generateSwissRound, startSeasonRound, validateSeasonEntry } from "../season/rounds.mjs";
import { proposeGameResult, updateSeasonPairing } from "../season/games.mjs";

/** Answer, and say the request is handled — the chain stops at the first true. */
function send(response, status, payload) {
  sendJson(response, status, payload);
  return true;
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
    if (!user) return send(response, 401, { error: "Not authorized." });
    const body = await readJson(request);
    const teamId = String(body.teamId ?? "").trim();
    if (!teamId) return send(response, 400, { error: "Team is required." });
    const season = await ensureActiveSeason();
    await commitSavedTeamToSeason(season.id, teamId, user.id);
    return send(response, 201, await loadSeasonBundle(user));
  }

  return handleSeasonEntryRoutes(request, response, url);
}

/**
 * Who is in the season: adding an entry, removing one, creating a team for it.
 *
 * Its own function because the check limits one to eighty lines, and the
 * split falls where the subject changes rather than where the line count did.
 */
async function handleSeasonEntryRoutes(request, response, url) {
  if (url.pathname === "/api/season/admin/entries" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const body = await readJson(request);
    const teamId = String(body.teamId ?? "").trim();
    if (!teamId) return send(response, 400, { error: "Team is required." });
    const season = await ensureActiveSeason();
    await commitSavedTeamToSeason(season.id, teamId);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const seasonEntryMatch = url.pathname.match(/^\/api\/season\/admin\/entries\/([0-9a-f-]+)$/i);
  if (seasonEntryMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const season = await ensureActiveSeason();
    await pool.query(
      `DELETE FROM season_entries WHERE id = $1 AND season_id = $2`,
      [seasonEntryMatch[1], season.id],
    );
    return send(response, 200, await loadSeasonBundle(user));
  }

  if (url.pathname === "/api/season/admin/create-team" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const body = await readJson(request);
    const userId = String(body.userId ?? "").trim();
    const name = String(body.name ?? "").trim();
    const baseTeamSlug = String(body.baseTeamSlug ?? "").trim();
    const logoData = body.logoData ? String(body.logoData) : null;
    const roster = body.roster ?? {};

    if (!userId) return send(response, 400, { error: "Coach is required." });
    if (!name) return send(response, 400, { error: "Team name is required." });
    if (!baseTeamSlug) return send(response, 400, { error: "Base team is required." });
    if (logoData && Buffer.byteLength(logoData, "utf8") > 2_900_000) {
      return send(response, 400, { error: "Logo is too large." });
    }

    const coach = await pool.query(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!coach.rows[0]) return send(response, 404, { error: "Coach not found." });

    const season = await ensureActiveSeason();
    const existingEntry = await pool.query(
      `SELECT id FROM season_entries WHERE season_id = $1 AND user_id = $2`,
      [season.id, userId],
    );
    if (existingEntry.rows[0]) {
      return send(response, 409, { error: "This coach already has a committed team." });
    }

    const savedTeam = await pool.query(
      `INSERT INTO saved_teams (user_id, name, base_team_slug, logo_data, roster)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      [userId, name, baseTeamSlug, logoData, serializeRosterForStorage(roster)],
    );
    await commitSavedTeamToSeason(season.id, savedTeam.rows[0].id);
    return send(response, 201, await loadSeasonBundle(user));
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
  if (url.pathname === "/api/season/admin/rounds/generate" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const season = await ensureActiveSeason();
    await generateSwissRound(season);
    return send(response, 201, await loadSeasonBundle(user));
  }

  if (url.pathname === "/api/season/admin/rounds" && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const season = await ensureActiveSeason();
    await createManualRound(season);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const seasonRoundMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)$/i);
  if (seasonRoundMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const season = await ensureActiveSeason();
    await pool.query(`DELETE FROM season_rounds WHERE id = $1 AND season_id = $2`, [seasonRoundMatch[1], season.id]);
    return send(response, 200, await loadSeasonBundle(user));
  }

  const seasonRoundStartMatch = url.pathname.match(/^\/api\/season\/admin\/rounds\/([0-9a-f-]+)\/start$/i);
  if (seasonRoundStartMatch && request.method === "POST") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
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
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const body = await readJson(request);
    const season = await ensureActiveSeason();
    await addSeasonPairing(season.id, seasonRoundPairingsMatch[1], body.homeEntryId, body.awayEntryId);
    return send(response, 201, await loadSeasonBundle(user));
  }

  const fixtureMatch = url.pathname.match(/^\/api\/season\/fixture\/([0-9a-f-]+)$/i);
  if (fixtureMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    const body = await readJson(request);
    await proposeGameResult(fixtureMatch[1], user.id, body, user.is_admin);
    return send(response, 200, { game: publicGame((await loadUserGameRows(user.id, fixtureMatch[1], user.is_admin))[0], user.id) });
  }

  const seasonPairingMatch = url.pathname.match(/^\/api\/season\/admin\/pairings\/([0-9a-f-]+)$/i);
  if (seasonPairingMatch && request.method === "PATCH") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const body = await readJson(request);
    const season = await ensureActiveSeason();
    await updateSeasonPairing(season.id, seasonPairingMatch[1], body, true, user.id);
    return send(response, 200, await loadSeasonBundle(user));
  }

  if (seasonPairingMatch && request.method === "DELETE") {
    const user = await currentUser(request);
    if (!user) return send(response, 401, { error: "Not authorized." });
    if (!user.is_admin) return send(response, 403, { error: "Admin access required." });
    const season = await ensureActiveSeason();
    await pool.query(
      `DELETE FROM season_pairings
       USING season_rounds
       WHERE season_pairings.id = $1
         AND season_pairings.round_id = season_rounds.id
         AND season_rounds.season_id = $2`,
      [seasonPairingMatch[1], season.id],
    );
    return send(response, 200, await loadSeasonBundle(user));
  }

  return false;
}
