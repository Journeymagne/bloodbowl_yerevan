-- Entry withdrawal is a soft operation (008). A physical delete must not
-- cascade into opponents' results, even if a caller bypasses the routes.
ALTER TABLE season_pairings
  DROP CONSTRAINT season_pairings_home_entry_id_fkey,
  DROP CONSTRAINT season_pairings_away_entry_id_fkey;

ALTER TABLE season_pairings
  ADD CONSTRAINT season_pairings_home_entry_id_fkey
    FOREIGN KEY (home_entry_id) REFERENCES season_entries(id) ON DELETE RESTRICT,
  ADD CONSTRAINT season_pairings_away_entry_id_fkey
    FOREIGN KEY (away_entry_id) REFERENCES season_entries(id) ON DELETE RESTRICT;
