-- Rolls may precede saving an injury. A single unbound decision per player is
-- reused after a lost answer or a closed sheet; binding it preserves its D6.
CREATE TABLE match_getting_even (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pairing_id uuid NOT NULL REFERENCES season_pairings(id) ON DELETE RESTRICT,
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE RESTRICT,
  player_id text NOT NULL,
  injury_event_id uuid UNIQUE REFERENCES match_events(id) ON DELETE RESTRICT,
  injury jsonb NOT NULL,
  roll smallint CHECK (roll BETWEEN 1 AND 6),
  source text CHECK (source IN ('site', 'table')),
  attacker jsonb,
  keyword text,
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  CHECK ((roll IS NULL) = (source IS NULL))
);
CREATE UNIQUE INDEX getting_even_draft ON match_getting_even(pairing_id, saved_team_id, player_id) WHERE injury_event_id IS NULL;
CREATE INDEX getting_even_match ON match_getting_even(pairing_id, saved_team_id);
