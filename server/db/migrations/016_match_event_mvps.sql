-- 016_match_event_mvps.sql — the MVP becomes a counter of the match events.
--
-- Why. At M1 the owner decided that an MVP corrected by hand in the roster
-- editor must reach the player's history. Until now it changed the blob and left
-- no row, so the history of a player did not add up to his career. With `mvps`
-- among the counters, saving a roster writes the MVP as an ordinary settled row,
-- the way it writes the other counters (sppEdits, src/domain/post-match/events.mjs),
-- and a correction made outside a match while a match is on waits for the finish,
-- like every other.
--
-- What is not here. A match does not tap the MVP: it is chosen in the summary, and
-- a tap that names a match is refused by the endpoint (server/routes/team-events.mjs),
-- not by this table. The summary neither reads nor writes rows of the MVP. The
-- table takes `mvps` with a match as it takes it without one.
--
-- What it does. The CHECK on `counter` was written inline in 014, so Postgres
-- named it match_events_counter_check. A CHECK cannot be widened in place: this
-- drops it and adds it back with the same list plus 'mvps', in the order of
-- EVENT_COUNTERS (src/domain/post-match/events.mjs). Both happen in one ALTER
-- TABLE, in the transaction the runner wraps this file in. No row is read or
-- changed, and every row 014 let in passes the new CHECK. Nothing is filled in
-- after the fact: an MVP corrected before 3.0 left no row, and none is invented.
--
-- Nothing else in match_events changes: the columns, match_events_delta_check,
-- the indexes and the foreign keys stay as 014 made them.

ALTER TABLE match_events
  DROP CONSTRAINT match_events_counter_check,
  ADD CONSTRAINT match_events_counter_check CHECK (counter IN ('touchdowns','casualties','knockouts','completions','catches',
        'interceptions','throws','landings','bonus','mvps','injury'));
