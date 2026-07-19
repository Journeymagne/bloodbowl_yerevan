CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  login TEXT NOT NULL UNIQUE,
  login_key TEXT NOT NULL UNIQUE,
  telegram TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  is_admin BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash TEXT PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

CREATE TABLE IF NOT EXISTS saved_teams (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  base_team_slug TEXT NOT NULL,
  logo_data TEXT,
  roster JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS saved_teams_user_id_idx ON saved_teams(user_id);
CREATE INDEX IF NOT EXISTS saved_teams_updated_at_idx ON saved_teams(updated_at);

CREATE TABLE IF NOT EXISTS seasons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL DEFAULT 'Season 1',
  status TEXT NOT NULL DEFAULT 'active',
  current_round INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS seasons_one_active_idx ON seasons ((status)) WHERE status = 'active';

CREATE TABLE IF NOT EXISTS season_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  saved_team_id UUID NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, user_id),
  UNIQUE (season_id, saved_team_id)
);

CREATE INDEX IF NOT EXISTS season_entries_season_id_idx ON season_entries(season_id);
CREATE INDEX IF NOT EXISTS season_entries_user_id_idx ON season_entries(user_id);
CREATE INDEX IF NOT EXISTS season_entries_saved_team_id_idx ON season_entries(saved_team_id);

CREATE TABLE IF NOT EXISTS season_rounds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  season_id UUID NOT NULL REFERENCES seasons(id) ON DELETE CASCADE,
  round_number INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'draft',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (season_id, round_number)
);

ALTER TABLE season_rounds ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'draft';
ALTER TABLE season_rounds ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS season_rounds_season_id_idx ON season_rounds(season_id);

CREATE TABLE IF NOT EXISTS season_pairings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES season_rounds(id) ON DELETE CASCADE,
  table_number INTEGER NOT NULL,
  home_entry_id UUID REFERENCES season_entries(id) ON DELETE CASCADE,
  away_entry_id UUID REFERENCES season_entries(id) ON DELETE CASCADE,
  home_touchdowns INTEGER,
  away_touchdowns INTEGER,
  home_casualties INTEGER,
  away_casualties INTEGER,
  result_type TEXT NOT NULL DEFAULT 'played',
  home_points INTEGER,
  away_points INTEGER,
  result_status TEXT NOT NULL DEFAULT 'pending',
  proposed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL,
  proposed_home_touchdowns INTEGER,
  proposed_away_touchdowns INTEGER,
  proposed_home_casualties INTEGER,
  proposed_away_casualties INTEGER,
  proposed_at TIMESTAMPTZ,
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (round_id, table_number)
);

ALTER TABLE season_pairings ALTER COLUMN home_entry_id DROP NOT NULL;
ALTER TABLE season_pairings ALTER COLUMN away_entry_id DROP NOT NULL;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS home_touchdowns INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS away_touchdowns INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS home_casualties INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS away_casualties INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS result_type TEXT NOT NULL DEFAULT 'played';
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS home_points INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS away_points INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS result_status TEXT NOT NULL DEFAULT 'pending';
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_by_user_id UUID REFERENCES users(id) ON DELETE SET NULL;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_home_touchdowns INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_away_touchdowns INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_home_casualties INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_away_casualties INTEGER;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS proposed_at TIMESTAMPTZ;
ALTER TABLE season_pairings ADD COLUMN IF NOT EXISTS confirmed_at TIMESTAMPTZ;
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'season_pairings' AND column_name = 'home_opponent_unable'
  ) THEN
    UPDATE season_pairings
    SET home_points = GREATEST(home_points - 2, 0)
    WHERE home_opponent_unable = TRUE AND home_points IS NOT NULL;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'season_pairings' AND column_name = 'away_opponent_unable'
  ) THEN
    UPDATE season_pairings
    SET away_points = GREATEST(away_points - 2, 0)
    WHERE away_opponent_unable = TRUE AND away_points IS NOT NULL;
  END IF;
END $$;
ALTER TABLE season_pairings DROP COLUMN IF EXISTS home_opponent_unable;
ALTER TABLE season_pairings DROP COLUMN IF EXISTS away_opponent_unable;

UPDATE season_pairings
SET result_status = 'confirmed', confirmed_at = COALESCE(confirmed_at, updated_at)
WHERE home_points IS NOT NULL OR away_points IS NOT NULL;

CREATE INDEX IF NOT EXISTS season_pairings_round_id_idx ON season_pairings(round_id);
CREATE INDEX IF NOT EXISTS season_pairings_home_entry_id_idx ON season_pairings(home_entry_id);
CREATE INDEX IF NOT EXISTS season_pairings_away_entry_id_idx ON season_pairings(away_entry_id);

UPDATE season_rounds
SET status = 'started'
WHERE status = 'draft'
  AND EXISTS (
    SELECT 1
    FROM season_pairings
    WHERE season_pairings.round_id = season_rounds.id
      AND (season_pairings.home_points IS NOT NULL OR season_pairings.away_points IS NOT NULL)
  );
