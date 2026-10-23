/**
 * Reading a season out of the database.
 *
 * The queries behind every season screen: the active season, its entries,
 * rounds and pairings, a coach's games, and the one bundle the client asks for
 * when it opens the season tab. Lifted out of server.mjs by step 4.9 so the
 * season routes could follow.
 *
 * `loadSeasonBundle` answers with everything at once, which is what makes the
 * season screen a single request — and also what task 10.3 has to take apart,
 * because half of it is public and half is not.
 */
import { pool } from "../db/pool.mjs";
import { httpError } from "../http/responses.mjs";
import {
  publicAdminSavedTeamSlim,
  publicGame,
  publicSavedTeamSlim,
  publicSeason,
  publicSeasonEntry,
  publicSeasonPairing,
  publicUser,
} from "../api/serializers.mjs";
import { computeSeasonStandings } from "./scoring.mjs";

export async function ensureActiveSeason() {
  const existing = await pool.query(
    `SELECT * FROM seasons WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  if (existing.rows[0]) return existing.rows[0];

  const created = await pool.query(
    `INSERT INTO seasons (name, status)
     VALUES ('Season 1', 'active')
     RETURNING *`,
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (created?.rows[0]) return created.rows[0];

  const raced = await pool.query(
    `SELECT * FROM seasons WHERE status = 'active' ORDER BY created_at ASC LIMIT 1`,
  );
  return raced.rows[0];
}

export async function loadSeasonEntryRows(seasonId) {
  const result = await pool.query(
    `SELECT
       se.*,
       users.login AS user_login,
       users.telegram AS user_telegram,
       users.is_admin AS user_is_admin,
       saved_teams.name AS team_name,
       saved_teams.base_team_slug,
       saved_teams.created_at AS team_created_at,
       saved_teams.updated_at AS team_updated_at
     FROM season_entries se
     JOIN users ON users.id = se.user_id
     JOIN saved_teams ON saved_teams.id = se.saved_team_id
     WHERE se.season_id = $1
     ORDER BY se.created_at ASC, users.login_key ASC`,
    [seasonId],
  );
  return result.rows;
}

export async function loadSeasonRoundRows(seasonId) {
  const result = await pool.query(
    `SELECT * FROM season_rounds WHERE season_id = $1 ORDER BY round_number ASC`,
    [seasonId],
  );
  return result.rows;
}

// Where a pairing's post-match stands, as one column of a query over `table`: `not_started` when it has none.
const postMatchStatus = (table) => `COALESCE((SELECT state->>'status' FROM match_post_games
       WHERE pairing_id = ${table}.id), 'not_started') AS post_match_status`;

// The post-match's status too (stage 12): the admin's result sheet sends a pairing with an open
// post-match to it instead of offering a result the server refuses (POST_RESULT_LOCKED).
export async function loadSeasonPairingRows(seasonId) {
  const result = await pool.query(
    `SELECT season_pairings.*, season_rounds.round_number, season_rounds.status AS round_status,
       ${postMatchStatus("season_pairings")}
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     WHERE season_rounds.season_id = $1
     ORDER BY season_rounds.round_number ASC, season_pairings.table_number ASC`,
    [seasonId],
  );
  return result.rows;
}

/**
 * Every score a coach proposed and the other side has not answered, for the admin (stage 12): the active
 * season's league games of any round — a closed round's too, which the 2.x list of current games left out —
 * and the friendlies. Another season's games are not in it. The earliest proposal first.
 *
 * @returns {Promise<object[]>} rows of match_pairing_context, with `post_match_status`
 */
export async function loadAwaitingGameRows() {
  const result = await pool.query(
    `SELECT match_pairing_context.*, ${postMatchStatus("match_pairing_context")}
     FROM match_pairing_context
     WHERE result_status = 'awaiting_confirmation' AND (match_kind = 'friendly' OR season_status = 'active')
     ORDER BY proposed_at ASC NULLS LAST, created_at ASC, table_number ASC`,
  );
  return result.rows;
}

export async function loadUserGameRows(userId, pairingId = null, includeAll = false) {
  let pairingFilter = `($1 = home_user_id OR $1 = away_user_id)`;
  let params = [userId];
  if (pairingId && includeAll) {
    pairingFilter = `id = $1`;
    params = [pairingId];
  } else if (pairingId) {
    pairingFilter = `id = $2 AND ($1 = home_user_id OR $1 = away_user_id)`;
    params = [userId, pairingId];
  } else if (includeAll) {
    pairingFilter = `round_status = 'started' AND COALESCE(result_status,'pending') <> 'confirmed'
      AND (match_kind='friendly' OR round_number=(SELECT MAX(latest_round.round_number)
        FROM season_rounds latest_round WHERE latest_round.season_id=match_pairing_context.season_id
          AND latest_round.status='started'))`;
    params = [];
  }
  const result = await pool.query(
    `SELECT match_pairing_context.*, ${postMatchStatus("match_pairing_context")} FROM match_pairing_context
     WHERE ${pairingFilter}
     ORDER BY COALESCE(season_created_at,created_at) DESC, round_number DESC NULLS LAST, table_number ASC`,
    params,
  );
  return result.rows;
}

// Each MVP a completed post-match names, side by side in the order picked, with the name the side's match roster
// (its snapshot in the state) gives the player. The stored state, large and compressed, is read once per row:
// `done` is the whole state as one value in memory when it is a completed post-match (the strict jsonpath gives
// null for anything else, an array or a string included: an error inside a filter is only "unknown"), and
// everything after walks that value. A member is walked only once `jsonb_typeof` says it is an array.
const SELECT_MVPS = `
  SELECT g.pairing_id, sides.side, mvp.player_id,
         (SELECT player ->> 'name' FROM jsonb_array_elements(CASE WHEN jsonb_typeof(sides.state -> 'snapshot' -> 'players') = 'array'
             THEN sides.state -> 'snapshot' -> 'players' ELSE '[]'::jsonb END) AS roster(player)
           WHERE player ->> 'id' = mvp.player_id LIMIT 1) AS name
    FROM match_post_games g
   CROSS JOIN LATERAL jsonb_path_query_first(g.state, 'strict $ ? (@.status == "completed")') AS done(state)
   CROSS JOIN LATERAL (VALUES ('home', done.state -> 'home'), ('away', done.state -> 'away')) AS sides(side, state)
   CROSS JOIN LATERAL jsonb_array_elements_text(CASE WHEN jsonb_typeof(sides.state -> 'mvps') = 'array'
       THEN sides.state -> 'mvps' ELSE '[]'::jsonb END) WITH ORDINALITY AS mvp(player_id, at)
   WHERE g.pairing_id = ANY($1::uuid[]) AND done.state IS NOT NULL AND mvp.player_id IS NOT NULL
   ORDER BY g.pairing_id, sides.side, mvp.at`;

/**
 * The MVPs of each of `pairingIds`, for the coach's list of games: `homeMvps` and `awayMvps`, each `{id, name}`
 * in the order the post-match picked them (a player picked twice is there twice; `name` is "" when the match's
 * roster does not hold him). Only a match finished through the post-match has any: one whose score was confirmed
 * without it, or whose post-match is still open, has two empty lists.
 *
 * @param {string[]} pairingIds
 * @returns {Promise<Map<string, {homeMvps: {id: string, name: string}[], awayMvps: {id: string, name: string}[]}>>}
 */
export async function loadGameMvps(pairingIds) {
  const mvps = new Map(pairingIds.map((pairingId) => [pairingId, { homeMvps: [], awayMvps: [] }]));
  if (!pairingIds.length) return mvps;
  const { rows } = await pool.query(SELECT_MVPS, [pairingIds]);
  for (const row of rows) mvps.get(row.pairing_id)?.[`${row.side}Mvps`].push({ id: row.player_id, name: row.name ?? "" });
  return mvps;
}

/**
 * Everything the season screen shows, in one answer.
 *
 * `user` may be null: a league table, a schedule and the results are what a
 * league is *for*, and requiring an account to look at them meant a coach could
 * not send anyone a link to the standings. Step 10.3.
 *
 * What a signed-out visitor does not get: `myEntry` and `currentFixture`
 * (there is no "my"), `myTeams`, the admin block, and every coach's Telegram
 * handle. The handle is how opponents arrange a match, which is a reason for
 * coaches to see it and not a reason to publish it.
 */
export async function loadSeasonBundle(user = null) {
  const seasonRow = await ensureActiveSeason();
  const [entryRows, roundRows, pairingRows, myTeamsResult] = await Promise.all([
    loadSeasonEntryRows(seasonRow.id),
    loadSeasonRoundRows(seasonRow.id),
    loadSeasonPairingRows(seasonRow.id),
    user
      ? pool.query(
        `SELECT id, user_id, name, base_team_slug, created_at, updated_at
         FROM saved_teams
         WHERE user_id = $1
         ORDER BY updated_at DESC`,
        [user.id],
      )
      : { rows: [] },
  ]);
  const includeContacts = Boolean(user);
  const allEntries = entryRows.map((row) => publicSeasonEntry(row, { includeContacts }));
  const entries = allEntries.filter((entry) => !entry.withdrawnAt);
  const pairings = pairingRows.map(publicSeasonPairing);
  const rounds = roundRows.map((round) => ({
    id: round.id,
    seasonId: round.season_id,
    roundNumber: round.round_number,
    status: round.status,
    createdAt: round.created_at,
    updatedAt: round.updated_at,
    pairings: pairings.filter((pairing) => pairing.roundId === round.id),
  }));
  const standings = computeSeasonStandings(entryRows, pairingRows, { includeContacts });
  const myEntry = user ? entries.find((entry) => entry.user.id === user.id) ?? null : null;
  const latestStartedRound = Math.max(0, ...rounds
    .filter((round) => round.status === "started")
    .map((round) => Number(round.roundNumber ?? 0)));
  const startedRounds = rounds
    .filter((round) => round.status === "started" && round.roundNumber === latestStartedRound)
    .sort((a, b) => b.roundNumber - a.roundNumber);
  const currentFixture = myEntry
    ? (startedRounds.flatMap((round) => round.pairings)
      .find((pairing) => pairing.homeEntryId === myEntry.id || pairing.awayEntryId === myEntry.id) ?? null)
    : null;
  const payload = {
    season: publicSeason(seasonRow),
    entries,
    historicalEntries: allEntries.filter((entry) => entry.withdrawnAt),
    standings,
    rounds,
    myEntry,
    currentFixture,
    myTeams: myTeamsResult.rows.map(publicSavedTeamSlim),
  };

  if (user?.is_admin) payload.admin = await loadAdminSeasonBlock();

  return payload;
}

/**
 * The admin's half of the season: every account, and every team with its owner, its stage and its treasury
 * (stage 12: a team in the draft is named by what it has spent). The roster itself stays on the server.
 */
async function loadAdminSeasonBlock() {
  const [usersResult, teamsResult] = await Promise.all([
    pool.query(`SELECT * FROM users ORDER BY login_key ASC`),
    pool.query(
      `SELECT saved_teams.id,
              saved_teams.user_id,
              saved_teams.name,
              saved_teams.base_team_slug,
              saved_teams.stage,
              saved_teams.roster -> 'treasury' AS treasury,
              saved_teams.created_at,
              saved_teams.updated_at,
              users.login AS user_login,
              users.telegram AS user_telegram,
              users.is_admin AS user_is_admin
       FROM saved_teams
       JOIN users ON users.id = saved_teams.user_id
       ORDER BY users.login_key ASC, saved_teams.updated_at DESC`,
    ),
  ]);
  return {
    users: usersResult.rows.map(publicUser),
    savedTeams: teamsResult.rows.map(publicAdminSavedTeamSlim),
  };
}

export async function commitSavedTeamToSeason(seasonId, savedTeamId, ownerId = "") {
  const params = ownerId ? [savedTeamId, ownerId] : [savedTeamId];
  const ownerSql = ownerId ? "AND user_id = $2" : "";
  const savedTeam = await pool.query(
    `SELECT * FROM saved_teams WHERE id = $1 ${ownerSql}`,
    params,
  );
  if (!savedTeam.rows[0]) throw httpError(404, "SAVED_TEAM_NOT_FOUND");

  const result = await pool.query(
    `INSERT INTO season_entries (season_id, user_id, saved_team_id)
     VALUES ($1, $2, $3)
     ON CONFLICT (season_id, saved_team_id) DO UPDATE
       SET withdrawn_at = NULL, updated_at = now()
       WHERE season_entries.withdrawn_at IS NOT NULL
     RETURNING *`,
    [seasonId, savedTeam.rows[0].user_id, savedTeam.rows[0].id],
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (!result?.rows[0]) throw httpError(409, "ENTRY_ALREADY_COMMITTED");
  return result.rows[0];
}
