/**
 * What the API says about a row.
 *
 * Every one of these turns a database row into the shape the client reads, and
 * that is the whole of their job: no queries, no request, no response. They
 * were scattered through server.mjs between the things that do have side
 * effects, which made it hard to see that the boundary is exactly here — a
 * column that never appears in one of these functions never leaves the server.
 *
 * Moved out by step 4.9 so that route modules can import them without importing
 * the server itself.
 */
import { countToNumber } from "../../src/domain/roster/values.mjs";
import { logoReference } from "./logo-reference.mjs";

export function normalizeLogin(value = "") {
  return String(value).toLowerCase().replace(/\s+/g, " ").trim();
}

export function isAdminUser(row) {
  const value = row?.is_admin ?? row?.isAdmin ?? false;
  if (value === true || value === 1) return true;
  if (value === false || value === 0 || value === null || value === undefined) return false;
  return ["1", "true", "t", "yes", "y", "admin"].includes(String(value).trim().toLowerCase());
}

export function publicUser(row) {
  if (!row) return null;
  return {
    id: row.id,
    login: row.login,
    telegram: row.telegram,
    isAdmin: isAdminUser(row),
    createdAt: row.created_at,
  };
}

/**
 * A coach as the administration reads him. What only the admin's queries select comes only from them — a
 * row without the column (a coach's public page, an edit's answer) has no such field, never a guess:
 * `draftTeamCount` (his teams still being built), `lastLoginAt` (his newest live session, or null),
 * `managedByServer` (the account the env file keeps) and `deleteBlock` (why it cannot be deleted, or null).
 */
export function publicAdminUser(row) {
  if (!row) return null;
  const only = (column, field, read = (value) => value) => (row[column] === undefined ? {} : { [field]: read(row[column]) });
  return {
    ...publicUser(row),
    savedTeamCount: Number(row.saved_team_count ?? 0),
    lastTeamUpdatedAt: row.last_team_updated_at ?? null,
    ...only("draft_team_count", "draftTeamCount", Number),
    ...only("last_login_at", "lastLoginAt"),
    ...only("managed_by_server", "managedByServer", Boolean),
    ...only("delete_block", "deleteBlock"),
  };
}

export function publicSavedTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: row.logo_data,
    ...logoReference(row.id, row.has_logo ?? Boolean(row.logo_data), row.updated_at),
    roster: rosterWithoutEmbeddedLogo(row.roster),
    revision: row.revision,
    // Where the team is in its life (migration 009), and when an admin moved it
    // to `active` — null for a team that was already playing before there were
    // stages. Like inActiveSeason below, undefined on a query that does not
    // select them, never a guess.
    stage: row.stage,
    activatedAt: row.activated_at,
    // Only present on the queries that ask for it; undefined elsewhere rather
    // than a confident false, so a screen cannot read "not in a season" out of
    // a query that never looked.
    inActiveSeason: row.in_active_season,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * A `team_fallen_players` row as a client reads it: the player as the roster held him, why he died
 * and when, and whether a match recorded it (`fromMatch`, which a coach cannot undo). Who recorded it
 * and for which team stay on the server. `roundNumber` is the season round of the match's pairing,
 * from `match_pairing_context`: null when there is no pairing, and for a friendly. The row a new
 * death answers with did not come from that join; it is a coach's own mark, which has no pairing,
 * so its null is right.
 */
export function publicFallen(row) {
  if (!row) return null;
  return {
    id: row.id,
    player: row.player,
    cause: row.cause ?? null,
    pairingId: row.pairing_id ?? null,
    roundNumber: row.round_number ?? null,
    diedAt: row.died_at,
    fromMatch: row.from_match,
  };
}

export function stripEmbeddedLogoData(value) {
  if (Array.isArray(value)) {
    return value.map(stripEmbeddedLogoData);
  }
  if (value === null || value === undefined || typeof value !== "object") {
    return value;
  }
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => key !== "logoData" && key !== "logo_data")
      .map(([key, entry]) => [key, stripEmbeddedLogoData(entry)]),
  );
}

export function rosterWithoutEmbeddedLogo(roster = {}) {
  if (!roster || typeof roster !== "object") return {};
  return stripEmbeddedLogoData(roster);
}

export function serializeRosterForStorage(roster = {}) {
  return JSON.stringify(rosterWithoutEmbeddedLogo(roster));
}

export function publicSavedTeamSummary(row) {
  if (!row) return null;
  return {
    ...publicSavedTeam(row),
    logoData: null,
    roster: rosterWithoutEmbeddedLogo(row.roster),
  };
}

export function publicSavedTeamSlim(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: null,
    ...logoReference(row.id, row.has_logo ?? Boolean(row.logo_data), row.updated_at),
    roster: {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicSeason(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    status: row.status,
    currentRound: row.current_round,
    // How many places of the table go on to the playoff (stage 12, 017): the admin's setting, null for no zone.
    playoffPlaces: row.playoff_places ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * @param {object} row
 * @param {{includeContacts?: boolean}} [options] a coach's Telegram handle is
 *   how opponents arrange a match, so signed-in coaches see it — but the
 *   season is readable without an account since step 10.3, and a league table
 *   is not a reason to publish everyone's contact to the open internet.
 */
export function publicSeasonEntry(row, { includeContacts = true } = {}) {
  if (!row) return null;
  return {
    id: row.id,
    seasonId: row.season_id,
    withdrawnAt: row.withdrawn_at ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id,
      login: row.user_login,
      ...(includeContacts ? { telegram: row.user_telegram } : {}),
      isAdmin: isAdminUser({ is_admin: row.user_is_admin }),
    },
    team: {
      id: row.saved_team_id,
      name: row.team_name,
      baseTeamSlug: row.base_team_slug,
      logoData: null,
      ...logoReference(row.saved_team_id, row.team_has_logo, row.team_updated_at),
      roster: {},
      createdAt: row.team_created_at,
      updatedAt: row.team_updated_at,
    },
  };
}

export function publicSeasonPairing(row) {
  if (!row) return null;
  const resultStatus = storedGameResultComplete(row)
    ? "confirmed"
    : row.result_status === "confirmed"
      ? "pending"
      : row.result_status ?? "pending";
  return {
    id: row.id,
    roundId: row.round_id,
    roundNumber: Number(row.round_number ?? 0),
    roundStatus: row.round_status ?? "draft",
    tableNumber: Number(row.table_number ?? 0),
    homeEntryId: row.home_entry_id ?? null,
    awayEntryId: row.away_entry_id ?? null,
    homeTouchdowns: row.home_touchdowns ?? null,
    awayTouchdowns: row.away_touchdowns ?? null,
    homeCasualties: row.home_casualties ?? null,
    awayCasualties: row.away_casualties ?? null,
    homePoints: row.home_points ?? null,
    awayPoints: row.away_points ?? null,
    // How the result came about, and a technical one's reason (stage 12; none before it, read as "other").
    resultType: row.result_type ?? "played",
    technicalReason: row.technical_reason ?? null,
    resultStatus,
    preparationStatus: row.preparation_status ?? "not_started",
    postMatchStatus: row.post_match_status ?? "not_started",
    proposedByUserId: row.proposed_by_user_id ?? null,
    proposedHomeTouchdowns: row.proposed_home_touchdowns ?? null,
    proposedAwayTouchdowns: row.proposed_away_touchdowns ?? null,
    proposedHomeCasualties: row.proposed_home_casualties ?? null,
    proposedAwayCasualties: row.proposed_away_casualties ?? null,
    proposedAt: row.proposed_at ?? null,
    confirmedAt: resultStatus === "confirmed" ? row.confirmed_at ?? null : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicAdminSavedTeamSlim(row) {
  if (!row) return null;
  return {
    ...publicSavedTeamSlim(row),
    // Where the team is in its life and what its treasury holds (stage 12): the admin's season names a team in
    // the draft by what it has spent. The roster itself stays out of the list.
    stage: row.stage,
    treasury: countToNumber(row.treasury),
    owner: {
      id: row.user_id,
      login: row.user_login,
      telegram: row.user_telegram,
      isAdmin: isAdminUser({ is_admin: row.user_is_admin }),
    },
  };
}

export function publicGame(row, viewerId) {
  if (!row) return null;
  const pairing = publicSeasonPairing(row);
  return {
    ...pairing,
    kind: row.match_kind || "league",
    season: row.match_kind === "friendly" ? null : { id: row.season_id, name: row.season_name, status: row.season_status, currentRound: Number(row.season_current_round ?? 0) },
    home: row.home_user_id ? { user: { id: row.home_user_id, login: row.home_user_login }, team: { id: row.home_team_id, name: row.home_team_name, baseTeamSlug: row.home_team_slug, logoUrl: row.home_team_id && row.home_team_has_logo ? `/api/team-logos/${row.home_team_id}` : null } } : null,
    away: row.away_user_id ? { user: { id: row.away_user_id, login: row.away_user_login }, team: { id: row.away_team_id, name: row.away_team_name, baseTeamSlug: row.away_team_slug, logoUrl: row.away_team_id && row.away_team_has_logo ? `/api/team-logos/${row.away_team_id}` : null } } : null,
    viewerIsHome: row.home_user_id === viewerId,
    viewerIsProposer: row.proposed_by_user_id === viewerId,
  };
}

export function storedGameResultComplete(row) {
  return row?.result_status === "confirmed"
    && row.home_touchdowns !== null
    && row.home_touchdowns !== undefined
    && row.away_touchdowns !== null
    && row.away_touchdowns !== undefined
    && row.home_casualties !== null
    && row.home_casualties !== undefined
    && row.away_casualties !== null
    && row.away_casualties !== undefined;
}
