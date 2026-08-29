-- 003_keep_season_history.sql — deleting a team stops deleting other people's
-- match results.
--
-- The chain today is three cascades deep:
--
--   saved_teams  --ON DELETE CASCADE-->  season_entries
--   season_entries  --ON DELETE CASCADE-->  season_pairings (home and away)
--
-- So one coach removing an old team from "My teams" silently takes with it
-- every match that team ever played — including the score their opponent
-- recorded, the points that opponent earned, and the row the league table is
-- computed from. Nobody is told, and nothing can be recovered short of a
-- backup. Section 7.6 of the design spec calls it a P0 and it is one.
--
-- RESTRICT instead: a team that has ever entered a season cannot be deleted at
-- all. The API refuses first, with an explanation; this is the guarantee behind
-- it, for anything that reaches the database another way.
--
-- Not limited to the *active* season on purpose. A finished season's results
-- are the league's history, and they stop being true the moment one of the
-- teams in them disappears.
--
-- The pairings cascade below it is left alone. Removing an entry is an
-- administrator's deliberate act through an endpoint that exists for it, which
-- is a different question from a coach tidying up their own list.

ALTER TABLE season_entries
  DROP CONSTRAINT IF EXISTS season_entries_saved_team_id_fkey;

ALTER TABLE season_entries
  ADD CONSTRAINT season_entries_saved_team_id_fkey
  FOREIGN KEY (saved_team_id) REFERENCES saved_teams(id) ON DELETE RESTRICT;
