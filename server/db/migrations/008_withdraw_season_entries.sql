-- Withdrawal removes a participant from future draws, preserving their entry
-- and all matches so their results and their opponents' statistics stay intact.
ALTER TABLE season_entries ADD COLUMN IF NOT EXISTS withdrawn_at TIMESTAMPTZ;

-- A coach may enter a different team after withdrawing. A team's original
-- entry remains unique so rejoining with it restores the same match history.
ALTER TABLE season_entries
  DROP CONSTRAINT IF EXISTS season_entries_season_id_user_id_key;

CREATE UNIQUE INDEX IF NOT EXISTS season_entries_active_user_idx
  ON season_entries (season_id, user_id) WHERE withdrawn_at IS NULL;
