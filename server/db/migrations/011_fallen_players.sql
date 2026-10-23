-- 011_fallen_players.sql — the players who died in a match, kept after they leave the roster.
--
-- A player who died used to be dropped from the roster blob and that was the end of
-- him. 3.0 shows the fallen in a section of their own, so each one gets a row here.
-- The roster blob stays as it is (`saved_teams.roster` is not read or rewritten):
-- the dead player is simply absent from it, as he always was.
--
-- `player` is the player as the roster held him before the match: his name, number,
-- position, skills and SPP at the time. `pairing_id` set means the death came from
-- a finished post-match; the coach cannot undo that one (`FALLEN_FROM_MATCH`,
-- plan stage 03), because the match is already settled. `pairing_id` NULL is a
-- coach's own mark, which the coach can undo. `recorded_by` is who wrote the row:
-- the coach who finished the post-match, or the one who made the mark.
--
-- Rows go in from the server only: the post-match finish writes them in the same
-- transaction that applies the roster (server/season/finance-store.mjs).
-- Deaths from matches finished before this migration are carried over by 015.

CREATE TABLE team_fallen_players (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  player jsonb NOT NULL,              -- the player as the roster held him before the match
  cause text,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE SET NULL,
  recorded_by uuid REFERENCES users(id) ON DELETE SET NULL,
  died_at timestamptz NOT NULL DEFAULT now()
);
