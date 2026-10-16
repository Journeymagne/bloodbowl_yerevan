-- 015_backfill_fallen_players.sql — players who died in a match finished
-- through the post-match checklist before 3.0.
--
-- 2.x dropped a dead player from the roster and kept no other trace of them,
-- except in the post-match itself: the side's injuries in match_post_games.state
-- (keyed by player id), and the roster before and after in
-- match_post_applications. A player counts as fallen when their injury there is
-- `dead`, the side's gamesPlayed in the state is at least three, they were on
-- the roster before the match, and they are not on it after. gamesPlayed is
-- rookie protection, as in effectiveInjury (src/domain/post-match/rules.mjs): a
-- team with fewer than three games turns any injury into Badly Hurt and keeps
-- the player, though the state still stores `dead`; a gamesPlayed that is
-- missing or not a whole number of at most 18 digits carries nobody (stored
-- states hold count(*)::integer, far shorter). The CASE tests it before the
-- cast, because Postgres does not promise the order of AND, and 18 digits
-- always fit numeric, so a bad state never stops the migration. The
-- after_roster clause additionally skips anyone still on the roster.
-- Journeymen and star players were never on the roster, so they are never
-- carried over.
--
-- The snapshot is the player as before_roster holds them; died_at is when the
-- post-match was applied. 2.x states record no cause, so cause is NULL, and
-- recorded_by is NULL because the match recorded it, not a person. A row the
-- 3.0 post-match already wrote for the same team, match and player is not
-- repeated, so a second run adds nothing.
--
-- from_match is true for a death a match recorded: every row carried over here,
-- and every row the post-match finish writes (server/season/finance-store.mjs).
-- pairing_id cannot tell, because an admin who deletes a pairing sets it NULL
-- (ON DELETE SET NULL in 011) and the death would pass for a coach's own mark,
-- which the coach can undo. On production 011 and 015 run in the same deploy,
-- before the server starts, so the table is still empty when the column is added.
-- IF NOT EXISTS lets a second run of this file pass the column by.
--
-- scripts/rehearsal/snapshot.mjs (fallenCheck) applies the same rule to check
-- this migration: change both together. 014 (match_events, stage 02b) is
-- numbered before this file but written after it; the runner applies whatever
-- is missing in name order, and neither file reads what the other writes.
ALTER TABLE team_fallen_players ADD COLUMN IF NOT EXISTS from_match boolean NOT NULL DEFAULT false;

INSERT INTO team_fallen_players (saved_team_id, player, cause, pairing_id, recorded_by, died_at, from_match)
SELECT a.saved_team_id, p.player, NULL, a.pairing_id, NULL, a.created_at, true
  FROM match_post_applications a
  JOIN match_post_games g ON g.pairing_id = a.pairing_id
 CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(a.before_roster->'players') = 'array'
                                              THEN a.before_roster->'players' ELSE '[]'::jsonb END) AS p(player)
 WHERE g.state->a.side->'injuries'->(p.player->>'id')->>'code' = 'dead'
   AND CASE WHEN (g.state->a.side->>'gamesPlayed') ~ '^[0-9]{1,18}$'
            THEN (g.state->a.side->>'gamesPlayed')::numeric >= 3 ELSE false END
   AND NOT EXISTS (
         SELECT 1 FROM jsonb_array_elements(CASE WHEN jsonb_typeof(a.after_roster->'players') = 'array'
                                                 THEN a.after_roster->'players' ELSE '[]'::jsonb END) AS q(player)
          WHERE q.player->>'id' = p.player->>'id')
   AND NOT EXISTS (
         SELECT 1 FROM team_fallen_players f
          WHERE f.saved_team_id = a.saved_team_id AND f.pairing_id = a.pairing_id
            AND f.player->>'id' = p.player->>'id');
