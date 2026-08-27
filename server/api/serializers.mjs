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

export function publicAdminUser(row) {
  if (!row) return null;
  return {
    ...publicUser(row),
    savedTeamCount: Number(row.saved_team_count ?? 0),
    lastTeamUpdatedAt: row.last_team_updated_at ?? null,
  };
}

export function publicSavedTeam(row) {
  if (!row) return null;
  return {
    id: row.id,
    name: row.name,
    baseTeamSlug: row.base_team_slug,
    logoData: row.logo_data,
    roster: rosterWithoutEmbeddedLogo(row.roster),
    revision: row.revision,
    // Only present on the queries that ask for it; undefined elsewhere rather
    // than a confident false, so a screen cannot read "not in a season" out of
    // a query that never looked.
    inActiveSeason: row.in_active_season,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
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
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function publicSeasonEntry(row) {
  if (!row) return null;
  return {
    id: row.id,
    seasonId: row.season_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    user: {
      id: row.user_id,
      login: row.user_login,
      telegram: row.user_telegram,
      isAdmin: isAdminUser({ is_admin: row.user_is_admin }),
    },
    team: {
      id: row.saved_team_id,
      name: row.team_name,
      baseTeamSlug: row.base_team_slug,
      logoData: null,
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
    resultStatus,
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
    season: { id: row.season_id, name: row.season_name, status: row.season_status, currentRound: Number(row.season_current_round ?? 0) },
    home: row.home_user_id ? { user: { id: row.home_user_id, login: row.home_user_login }, team: { id: row.home_team_id, name: row.home_team_name, baseTeamSlug: row.home_team_slug, logoUrl: row.home_team_id ? `/api/team-logos/${row.home_team_id}` : null } } : null,
    away: row.away_user_id ? { user: { id: row.away_user_id, login: row.away_user_login }, team: { id: row.away_team_id, name: row.away_team_name, baseTeamSlug: row.away_team_slug, logoUrl: row.away_team_id ? `/api/team-logos/${row.away_team_id}` : null } } : null,
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
