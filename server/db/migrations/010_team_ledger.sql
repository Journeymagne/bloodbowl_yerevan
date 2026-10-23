-- 010_team_ledger.sql — what moved a team's money, line by line.
--
-- The treasury itself stays in the roster blob (`saved_teams.roster.treasury`):
-- that is the source of truth, and the ledger only explains it. Nothing here
-- reads or rewrites the blob.
--
-- The ledger is not backfilled. It starts empty, and its history begins at the
-- `applied_at` of this migration in `schema_migrations` (rollout spec §5.1) —
-- a team's earlier treasury changes were never recorded and are not guessed.
--
-- Money is thousands with a sign, as everywhere in the code, but kept to the
-- gold: a half-price sale leaves 500 gold (src/domain/money.mjs), which an
-- integer column could not hold. `numeric(12,3)` is thousands to the gold, and
-- `pg` returns it as a string, so a reader converts it to a number itself.
--
-- Lines are written only by the server, in the transaction that changes the
-- treasury (server/api/team-ledger.mjs). `kind` is the list in
-- src/domain/roster/ledger.mjs (LEDGER_KINDS); a test keeps the two in step.

CREATE TABLE team_ledger (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_team_id uuid NOT NULL REFERENCES saved_teams(id) ON DELETE CASCADE,
  delta numeric(12,3) NOT NULL,          -- thousands, signed; a half-price sale leaves 500 gold
  balance_after numeric(12,3) NOT NULL,
  kind text NOT NULL CHECK (kind IN ('manual','hire','sale','cancel_purchase','staff','staff_refund',
        'match_spend','match_income','safe','mistake','admin')),
  reason text,                           -- manual: friendly|sponsor|fine|purchase|other
  note text,
  pairing_id uuid REFERENCES season_pairings(id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX team_ledger_team_idx ON team_ledger (saved_team_id, created_at DESC);
