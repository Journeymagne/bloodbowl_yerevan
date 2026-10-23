-- 009_team_stage.sql — where a team is in its life: being built, or playing.
--
-- `draft` is a team put together by the builder's rules; `active` is a team that
-- plays in a season. The stage decides which re-roll can be bought: Start
-- Re-rolls (60k) while building, Team Re-rolls (120k) once playing — the rule is
-- in content/Gata/Rules/3. Team Management.md.
--
-- Existing teams are sorted by what they have done (rollout spec §0.9). A team
-- is `active` if it has a standing entry in a season that is running, or has
-- played a match (a league or a friendly, with a confirmed score or an applied
-- post-match). Every other team — a reserve, a roster someone never finished —
-- becomes `draft`. Moving a team from `draft` to `active` is an admin's call
-- (plan stage 12); there is no way back.
--
-- `activated_at` stays NULL for the teams this migration leaves `active`: they
-- were playing before stages existed. Until the admin panel exists a new team
-- takes the column default, `active`, as it does today.
--
-- scripts/rehearsal/snapshot.mjs (`stages`) reads the same rule to check the
-- result on a copy of production. Change both places together.

ALTER TABLE saved_teams ADD COLUMN stage TEXT NOT NULL DEFAULT 'active'
  CHECK (stage IN ('draft','active'));
ALTER TABLE saved_teams ADD COLUMN activated_at TIMESTAMPTZ;

UPDATE saved_teams t SET stage = 'draft'
WHERE NOT EXISTS (
        SELECT 1 FROM season_entries e JOIN seasons s ON s.id = e.season_id
        WHERE e.saved_team_id = t.id AND e.withdrawn_at IS NULL AND s.status = 'active')
  AND NOT EXISTS (SELECT 1 FROM match_post_applications a WHERE a.saved_team_id = t.id)
  AND NOT EXISTS (
        SELECT 1 FROM season_pairings p
        LEFT JOIN season_entries he ON he.id = p.home_entry_id
        LEFT JOIN season_entries ae ON ae.id = p.away_entry_id
        WHERE p.result_status = 'confirmed'
          AND t.id IN (he.saved_team_id, ae.saved_team_id, p.friendly_home_team_id, p.friendly_away_team_id));
