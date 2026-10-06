-- Friendly games share match preparation/results, without a season round or LP.
ALTER TABLE season_pairings ALTER COLUMN round_id DROP NOT NULL;
ALTER TABLE season_pairings ADD COLUMN match_kind TEXT NOT NULL DEFAULT 'league' CHECK (match_kind IN ('league','friendly'));
ALTER TABLE season_pairings ADD COLUMN friendly_home_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE season_pairings ADD COLUMN friendly_away_user_id UUID REFERENCES users(id) ON DELETE RESTRICT;
ALTER TABLE season_pairings ADD COLUMN friendly_home_team_id UUID REFERENCES saved_teams(id) ON DELETE RESTRICT;
ALTER TABLE season_pairings ADD COLUMN friendly_away_team_id UUID REFERENCES saved_teams(id) ON DELETE RESTRICT;
ALTER TABLE season_pairings ADD CONSTRAINT pairing_match_context CHECK (
  (match_kind='league' AND round_id IS NOT NULL AND friendly_home_user_id IS NULL AND friendly_away_user_id IS NULL
    AND friendly_home_team_id IS NULL AND friendly_away_team_id IS NULL)
  OR (match_kind='friendly' AND round_id IS NULL AND home_entry_id IS NULL AND away_entry_id IS NULL
    AND friendly_home_user_id IS NOT NULL AND friendly_away_user_id IS NOT NULL
    AND friendly_home_team_id IS NOT NULL AND friendly_away_team_id IS NOT NULL
    AND friendly_home_user_id <> friendly_away_user_id AND friendly_home_team_id <> friendly_away_team_id)
);
ALTER TABLE season_pairings ADD CONSTRAINT friendly_no_league_points CHECK (
  match_kind <> 'friendly' OR ((home_points IS NULL OR home_points=0) AND (away_points IS NULL OR away_points=0))
);
CREATE INDEX friendly_pairings_home_idx ON season_pairings(friendly_home_user_id) WHERE match_kind='friendly';
CREATE INDEX friendly_pairings_away_idx ON season_pairings(friendly_away_user_id) WHERE match_kind='friendly';

CREATE TABLE friendly_challenges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sender_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  recipient_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  sender_team_id UUID NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','declined','cancelled')),
  pairing_id UUID UNIQUE REFERENCES season_pairings(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (sender_id <> recipient_id),
  CHECK ((status='accepted' AND pairing_id IS NOT NULL) OR (status<>'accepted' AND pairing_id IS NULL))
);
CREATE UNIQUE INDEX pending_challenge_unique ON friendly_challenges(sender_id,recipient_id,sender_team_id) WHERE status='pending';
CREATE INDEX friendly_challenges_recipient_idx ON friendly_challenges(recipient_id,created_at DESC);
CREATE INDEX friendly_challenges_sender_idx ON friendly_challenges(sender_id,created_at DESC);

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
