-- 017_season_admin.sql — a season's playoff places and a technical result's reason.
--
-- Why. The owner's answers before M3: the playoff zone is a setting of the season,
-- set by the admin — the league table draws its line after that many places, and
-- with no number there is no zone. A technical win when the opponent could not
-- field a team is worth 2 + 2 points (content/Gata/Rules/3. Team Management.md:71
-- and :81), any other technical win 2: a technical result now carries its reason,
-- and the points follow from it (technicalPoints, src/domain/league-rules.mjs).
--
-- What it does. seasons.playoff_places: how many places of the table go on to the
-- playoff, 1 to 64, or NULL for none. season_pairings.technical_reason: why a
-- technical result was decided, one of TECHNICAL_REASONS (src/domain/league-rules.mjs);
-- only a technical result has one, so the write that makes a result played clears
-- it in the same UPDATE. Each column and its CHECK come in one ALTER TABLE, in the
-- transaction the runner wraps this file in. The columns have no default, so adding
-- them rewrites no row; adding a CHECK scans the table once under the ALTER's lock,
-- and every row passes it, the new column being NULL everywhere.
--
-- The view. match_pairing_context (006) selects p.*, and Postgres expands p.* into
-- the columns season_pairings had when the view was created: technical_reason would
-- never reach it. CREATE OR REPLACE VIEW cannot help — it only appends columns, and
-- p.* puts the new one in the middle, before round_status. So the view is dropped
-- and created again with 006's text word for word; nothing else depends on it.
--
-- What is not here. A technical result stored before 017 gets no reason — 2.x never
-- asked for one, and none is invented: it reads as 'other', 2 points, as it counted
-- until now. The admin sets the reason afterwards and the points are recounted
-- (stage 12, Task 2). No row is read, written or deleted.

ALTER TABLE seasons
  ADD COLUMN playoff_places INTEGER,
  ADD CONSTRAINT seasons_playoff_places_check CHECK (playoff_places IS NULL OR playoff_places BETWEEN 1 AND 64);

ALTER TABLE season_pairings
  ADD COLUMN technical_reason TEXT,
  ADD CONSTRAINT season_pairings_technical_reason_check CHECK (technical_reason IS NULL
    OR (result_type = 'technical' AND technical_reason IN ('no_team', 'other')));

DROP VIEW match_pairing_context;

-- One context for league and friendly games; individual match state stays in p.*.
CREATE VIEW match_pairing_context AS
SELECT p.*, CASE WHEN p.match_kind='friendly' THEN 'started' ELSE r.status END AS round_status,
  r.round_number, s.id AS season_id, s.name AS season_name, s.status AS season_status,
  s.current_round AS season_current_round, s.created_at AS season_created_at,
  COALESCE(he.user_id,p.friendly_home_user_id) AS home_user_id, hu.login AS home_user_login,
  COALESCE(ae.user_id,p.friendly_away_user_id) AS away_user_id, au.login AS away_user_login,
  ht.id AS home_team_id, ht.name AS home_team_name, ht.base_team_slug AS home_team_slug,
  at.id AS away_team_id, at.name AS away_team_name, at.base_team_slug AS away_team_slug,
  (ht.logo_data IS NOT NULL AND ht.logo_data <> '') AS home_team_has_logo,
  (at.logo_data IS NOT NULL AND at.logo_data <> '') AS away_team_has_logo
FROM season_pairings p
LEFT JOIN season_rounds r ON r.id=p.round_id
LEFT JOIN seasons s ON s.id=r.season_id
LEFT JOIN season_entries he ON he.id=p.home_entry_id
LEFT JOIN season_entries ae ON ae.id=p.away_entry_id
LEFT JOIN users hu ON hu.id=COALESCE(he.user_id,p.friendly_home_user_id)
LEFT JOIN users au ON au.id=COALESCE(ae.user_id,p.friendly_away_user_id)
LEFT JOIN saved_teams ht ON ht.id=COALESCE(he.saved_team_id,p.friendly_home_team_id)
LEFT JOIN saved_teams at ON at.id=COALESCE(ae.saved_team_id,p.friendly_away_team_id);
