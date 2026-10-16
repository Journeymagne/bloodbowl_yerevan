-- 014_match_events.sql — the taps made during a match, one row per tap.
--
-- Why a table. A counter in the roster blob is one number per player: it cannot
-- tell this match from the ones before. The post-match (src/domain/post-match)
-- starts its statistics from zero and adds them to `player.spp` when it
-- finishes, and finishPost refuses a team whose revision moved since the
-- post-match began. So a tap written into the blob during a match is either
-- counted twice or fails the finish with POST_TEAM_CHANGED. Journeymen and star
-- players, too, exist only in the match snapshot and have no place in the blob.
--
-- A row is one step of +1 or -1 on one counter of one player: `player_id` is an
-- id from the blob or from the match snapshot, `counter` is one of the ten the
-- post-match knows, and an injury is `counter = 'injury'` with `{code, stat?}`
-- in `injury`.
--
-- Who reads and writes. The post-match takes its statistics and injuries from
-- the rows of the match (src/domain/post-match/events.mjs); the "Players" step
-- appends the difference between the rows and what the coach entered; finishPost
-- sets `settled_at` in the same transaction that applies the roster to the blob.
-- A career is the blob plus the rows not yet settled.
--
-- `pairing_id` NULL is an edit outside a match (plan stage 03). A deleted
-- pairing takes its rows with it (ON DELETE CASCADE, as match_post_games and
-- match_post_applications do in 007): were they kept with the pairing set NULL,
-- the unsettled rows of a deleted match would read as pending edits outside a
-- match, be counted in the career and be carried into the blob by finishPost.
--
-- Nothing is filled in after the fact: matches played before 3.0 are covered by
-- match_post_applications. scripts/rehearsal requires the table to be empty right
-- after the migrations. This file only creates; it reads no existing table.
--
-- 015 is numbered after this file but was written before it. The runner applies
-- whatever is missing in name order, and neither file reads what the other
-- writes, so 014 then 015 (production) and 015 then 014 (the dev database) leave
-- the same schema and the same rows.

CREATE TABLE match_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE CASCADE,   -- NULL: an edit outside a match
  player_id text NOT NULL,           -- an id from the blob or from the match snapshot (journeyman, star)
  counter text NOT NULL CHECK (counter IN ('touchdowns','casualties','knockouts','completions','catches',
        'interceptions','throws','landings','bonus','injury')),
  delta smallint NOT NULL CHECK (delta IN (-1, 1)),
  injury jsonb,                      -- counter = 'injury': {code, stat?}
  settled_at timestamptz,            -- when the blob took it in; NULL: not yet
  created_by uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX match_events_team_idx ON match_events (saved_team_id, pairing_id, created_at);
CREATE INDEX match_events_open_idx ON match_events (saved_team_id) WHERE settled_at IS NULL;
