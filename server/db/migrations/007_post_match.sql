-- Drafts never mutate the live roster. A completed application is an audit receipt.
CREATE TABLE match_post_games (
  pairing_id UUID PRIMARY KEY REFERENCES season_pairings(id) ON DELETE CASCADE,
  state JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE match_post_applications (
  pairing_id UUID NOT NULL REFERENCES season_pairings(id) ON DELETE CASCADE,
  side TEXT NOT NULL CHECK (side IN ('home','away')),
  saved_team_id UUID NOT NULL REFERENCES saved_teams(id) ON DELETE RESTRICT,
  before_roster JSONB NOT NULL,
  after_roster JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (pairing_id,side)
);
CREATE INDEX match_post_applications_team_idx ON match_post_applications(saved_team_id);
