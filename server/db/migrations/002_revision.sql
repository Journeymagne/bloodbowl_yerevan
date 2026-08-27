-- 002_revision.sql — a version number on every saved team.
--
-- Two tabs open on the same roster used to be a race the loser never heard
-- about: both PATCH, the second overwrites the first, and nothing says so.
-- The client sends the revision it last saw; the server only writes when it
-- still matches, and answers 409 with the current team when it does not.
--
-- Existing rows start at 1, which is what a client that has never seen a
-- revision sends, so nothing in flight during the deploy is refused.

ALTER TABLE saved_teams ADD COLUMN IF NOT EXISTS revision INTEGER NOT NULL DEFAULT 1;
