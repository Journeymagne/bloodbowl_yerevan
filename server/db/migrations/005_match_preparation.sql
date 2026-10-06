-- Preparation is separate from result confirmation and from the live roster.
ALTER TABLE season_pairings ADD COLUMN preparation_status TEXT NOT NULL DEFAULT 'not_started';
CREATE TABLE match_preparations (
  pairing_id UUID PRIMARY KEY REFERENCES season_pairings(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE match_roster_snapshots (
  pairing_id UUID NOT NULL REFERENCES season_pairings(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('home', 'away')),
  saved_team_id UUID NOT NULL REFERENCES saved_teams(id) ON DELETE RESTRICT,
  snapshot JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id, side)
);
CREATE TABLE match_treasury_spends (
  pairing_id UUID NOT NULL REFERENCES season_pairings(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('home', 'away')),
  saved_team_id UUID NOT NULL REFERENCES saved_teams(id) ON DELETE RESTRICT,
  amount INTEGER NOT NULL CHECK (amount >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id, side)
);
