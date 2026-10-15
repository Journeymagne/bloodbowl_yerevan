import test from "node:test";
import assert from "node:assert/strict";

import { planDeployMigration } from "../scripts/deploy/migrate-plan.mjs";

test("nothing pending: no dump, nothing applied", () => {
  assert.deepEqual(planDeployMigration({ pending: [], changed: [] }), { action: "skip", message: "no pending migrations, backup skipped" });
});

test("pending migrations: a dump first", () => {
  const plan = planDeployMigration({ pending: [{ name: "009_team_stage.sql" }, { name: "010_team_ledger.sql" }], changed: [] });
  assert.equal(plan.action, "backup-then-migrate");
  assert.equal(plan.message, "pending: 009_team_stage.sql, 010_team_ledger.sql");
});

test("an edited, already applied migration stops the deploy", () => {
  const plan = planDeployMigration({ pending: [{ name: "009_team_stage.sql" }], changed: ["008_withdraw_season_entries.sql"] });
  assert.equal(plan.action, "refuse");
  assert.match(plan.message, /008_withdraw_season_entries\.sql/);
});
