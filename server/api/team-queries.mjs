/**
 * Reading a saved team, with the one thing the row itself does not say.
 *
 * Whether a team is playing in the current season lives in season_entries,
 * not in saved_teams — so every screen that has ever needed to know has had to
 * ask separately, or has simply not known. The roster editor is the one that
 * has not known: step 7.7 added a confirmation before changing a team's race,
 * which wipes the squad, but could not refuse it outright for a team already
 * in a season, because it had no way to tell.
 *
 * One fragment rather than three copies of the same EXISTS, so the coach's
 * list, a single team and the admin view cannot start disagreeing about it.
 */

/** Selects every column of saved_teams plus `in_active_season`. */
export const SAVED_TEAM_COLUMNS = `
  saved_teams.*,
  EXISTS (
    SELECT 1
      FROM season_entries
      JOIN seasons ON seasons.id = season_entries.season_id
     WHERE season_entries.saved_team_id = saved_teams.id
       AND seasons.status = 'active'
  ) AS in_active_season
`;

/**
 * Has this team ever played in a season?
 *
 * The question the delete routes ask before refusing, and the same one the
 * RESTRICT constraint behind them enforces. Any season, not just the current
 * one: a finished season's results stop being true the moment a team in them
 * disappears.
 *
 * @param {import("pg").Pool} pool
 * @param {string} teamId
 * @returns {Promise<boolean>}
 */
export async function hasSeasonHistory(pool, teamId) {
  const result = await pool.query(
    "SELECT 1 FROM season_entries WHERE saved_team_id = $1 LIMIT 1",
    [teamId],
  );
  return result.rowCount > 0;
}
