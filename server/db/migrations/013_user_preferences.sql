-- 013_user_preferences.sql — a user's settings, kept on the server.
--
-- What a reader chose for the look of the site (light, dark or the system's, and the palette
-- of each), which of their teams is the active one, and the language live with the account
-- instead of in one browser. localStorage stays what it is today, a cache: theme-boot.js reads
-- `gata-league-palette` before any module loads, so the first frame needs no request.
--
-- `preferences` is a jsonb object. Which keys it may hold, and which values, is decided by
-- server/api/preferences.mjs on the way in; the column itself only guarantees it is there.
-- Every existing user gets `{}`, the column default, and no row is rewritten with anything
-- else; a setting is written later, when a user sets one.

ALTER TABLE users ADD COLUMN preferences jsonb NOT NULL DEFAULT '{}'::jsonb;
