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

export async function loadSeasonPairingRows(seasonId) {
  const result = await pool.query(
    `SELECT season_pairings.*, season_rounds.round_number, season_rounds.status AS round_status
     FROM season_pairings
     JOIN season_rounds ON season_rounds.id = season_pairings.round_id
     WHERE season_rounds.season_id = $1
     ORDER BY season_rounds.round_number ASC, season_pairings.table_number ASC`,
    [seasonId],
  );
  return result.rows;
}

export async function loadUserGameRows(userId, pairingId = null, includeAll = false) {
  let pairingFilter = `($1 = he.user_id OR $1 = ae.user_id)`;
  let params = [userId];
  if (pairingId && includeAll) {
    pairingFilter = `p.id = $1`;
    params = [pairingId];
  } else if (pairingId) {
    pairingFilter = `p.id = $2 AND ($1 = he.user_id OR $1 = ae.user_id)`;
    params = [userId, pairingId];
  } else if (includeAll) {
    pairingFilter = `r.status = 'started'
      AND COALESCE(p.result_status, 'pending') <> 'confirmed'
      AND r.round_number = (
        SELECT MAX(latest_round.round_number)
        FROM season_rounds latest_round
        WHERE latest_round.season_id = s.id
          AND latest_round.status = 'started'
      )`;
    params = [];
  }
  const result = await pool.query(
    `SELECT p.*, r.round_number, r.status AS round_status,
            s.id AS season_id, s.name AS season_name, s.status AS season_status, s.current_round AS season_current_round,
            he.user_id AS home_user_id, hu.login AS home_user_login,
            ht.id AS home_team_id, ht.name AS home_team_name, ht.base_team_slug AS home_team_slug,
            ae.user_id AS away_user_id, au.login AS away_user_login,
            at.id AS away_team_id, at.name AS away_team_name, at.base_team_slug AS away_team_slug
     FROM season_pairings p
     JOIN season_rounds r ON r.id = p.round_id
     JOIN seasons s ON s.id = r.season_id
     LEFT JOIN season_entries he ON he.id = p.home_entry_id
     LEFT JOIN users hu ON hu.id = he.user_id
     LEFT JOIN saved_teams ht ON ht.id = he.saved_team_id
     LEFT JOIN season_entries ae ON ae.id = p.away_entry_id
     LEFT JOIN users au ON au.id = ae.user_id
     LEFT JOIN saved_teams at ON at.id = ae.saved_team_id
     WHERE ${pairingFilter}
     ORDER BY s.created_at DESC, r.round_number DESC, p.table_number ASC`,
    params,
  );
  return result.rows;
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
  const entries = entryRows.map((row) => publicSeasonEntry(row, { includeContacts }));
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
    standings,
    rounds,
    myEntry,
    currentFixture,
    myTeams: myTeamsResult.rows.map(publicSavedTeamSlim),
  };

  if (user?.is_admin) {
    const [usersResult, teamsResult] = await Promise.all([
      pool.query(`SELECT * FROM users ORDER BY login_key ASC`),
      pool.query(
        `SELECT saved_teams.id,
                saved_teams.user_id,
                saved_teams.name,
                saved_teams.base_team_slug,
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
    payload.admin = {
      users: usersResult.rows.map(publicUser),
      savedTeams: teamsResult.rows.map(publicAdminSavedTeamSlim),
    };
  }

  return payload;
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
     RETURNING *`,
    [seasonId, savedTeam.rows[0].user_id, savedTeam.rows[0].id],
  ).catch((error) => {
    if (error.code === "23505") return null;
    throw error;
  });
  if (!result) throw httpError(409, "ENTRY_ALREADY_COMMITTED");
  return result.rows[0];
}
