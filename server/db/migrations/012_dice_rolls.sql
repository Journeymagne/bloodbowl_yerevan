-- 012_dice_rolls.sql — dice the site rolled for a player, kept until an advancement takes them.
--
-- Rolling on the site is optional (a league table can still roll at the table and tell
-- the coach the result), but when it is used the die is the server's: a coach never sends
-- a result, only asks for a roll. Rows go in from the server only (plan stage 03).
--
-- `purpose` is what the roll is for: a random skill, or a characteristic improvement.
-- `params` is what was rolled — the category and its candidate skills, or the die — and
-- `result` is everything that came up, including the attempts that landed on a skill the
-- player already had and were rolled again, so the record shows the whole roll and not
-- just where it ended. `player_id` is the roster player's id; the roster blob is not read
-- or rewritten here (`saved_teams.roster` stays as it is).
--
-- `used_at` stays NULL until an advancement that references the roll takes it (the
-- advancement's `roll.id` in the roster blob), so one roll cannot be spent twice.

CREATE TABLE dice_rolls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  player_id text NOT NULL,
  purpose text NOT NULL CHECK (purpose IN ('random_skill','stat')),
  params jsonb NOT NULL,
  result jsonb NOT NULL,
  rolled_by uuid REFERENCES users(id) ON DELETE SET NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
