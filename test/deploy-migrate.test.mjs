import test from "node:test";
import assert from "node:assert/strict";

import { checkBackupTarget, planDeployMigration } from "../scripts/deploy/migrate-plan.mjs";
import { describeFailure, runDeployMigration } from "../scripts/deploy/run.mjs";

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

// The deploy's one guarantee: the schema is never touched unless the dump
// before it succeeded. These drive the whole step with fakes for the dump, the
// migration and the log.
function rehearse({ status, backup, target = { ok: true } }) {
  const calls = { backup: 0, apply: 0, log: [], error: [] };
  const run = runDeployMigration({
    status,
    verifyBackupTarget: async () => target,
    takeBackup: () => { calls.backup += 1; return backup; },
    apply: async () => { calls.apply += 1; return ["009_team_stage.sql", "010_team_ledger.sql"]; },
    log: (line) => calls.log.push(line),
    error: (line) => calls.error.push(line),
  });
  return { run, calls };
}

const pendingStatus = { pending: [{ name: "009_team_stage.sql" }, { name: "010_team_ledger.sql" }], changed: [] };

test("a failed dump leaves the schema alone", async () => {
  const { run, calls } = rehearse({ status: pendingStatus, backup: { status: 1, signal: null } });
  assert.equal(await run, 1);
  assert.equal(calls.backup, 1);
  assert.equal(calls.apply, 0);
  assert.deepEqual(calls.error, ["deploy:migrate: the pre-migration backup failed (exit 1); the schema was not touched"]);
});

test("a killed dump leaves the schema alone and names the signal", async () => {
  const { run, calls } = rehearse({ status: pendingStatus, backup: { status: null, signal: "SIGKILL" } });
  assert.equal(await run, 1);
  assert.equal(calls.apply, 0);
  assert.match(calls.error[0], /backup failed \(SIGKILL\)/);
});

test("a dump that could not even start leaves the schema alone and says why", async () => {
  const { run, calls } = rehearse({ status: pendingStatus, backup: { status: null, signal: null, error: new Error("spawn node ENOENT") } });
  assert.equal(await run, 1);
  assert.equal(calls.apply, 0);
  assert.match(calls.error[0], /backup failed \(spawn node ENOENT\)/);
});

test("a good dump is followed by the migrations", async () => {
  const { run, calls } = rehearse({ status: pendingStatus, backup: { status: 0, signal: null } });
  assert.equal(await run, 0);
  assert.equal(calls.backup, 1);
  assert.equal(calls.apply, 1);
  assert.deepEqual(calls.log, ["deploy:migrate: pending: 009_team_stage.sql, 010_team_ledger.sql", "deploy:migrate: applied 009_team_stage.sql, 010_team_ledger.sql"]);
  assert.deepEqual(calls.error, []);
});

test("nothing pending: neither a dump nor a migration", async () => {
  const { run, calls } = rehearse({ status: { pending: [], changed: [] }, backup: { status: 0 } });
  assert.equal(await run, 0);
  assert.equal(calls.backup, 0);
  assert.equal(calls.apply, 0);
  assert.deepEqual(calls.log, ["deploy:migrate: no pending migrations, backup skipped"]);
});

test("an edited, applied migration: neither a dump nor a migration, and a failure", async () => {
  const { run, calls } = rehearse({ status: { pending: pendingStatus.pending, changed: ["008_withdraw_season_entries.sql"] }, backup: { status: 0 } });
  assert.equal(await run, 1);
  assert.equal(calls.backup, 0);
  assert.equal(calls.apply, 0);
  assert.match(calls.error[0], /^deploy:migrate: edited after being applied: 008_withdraw_season_entries\.sql$/);
  assert.deepEqual(calls.log, []);
});

test("a failure is one readable line, even from a refused localhost connection", () => {
  assert.equal(describeFailure(new Error("010_team_ledger.sql failed: syntax error")), "010_team_ledger.sql failed: syntax error");
  const refused = new AggregateError([new Error("connect ECONNREFUSED ::1:5437"), new Error("connect ECONNREFUSED 127.0.0.1:5437")], "");
  assert.equal(describeFailure(refused), "connect ECONNREFUSED ::1:5437; connect ECONNREFUSED 127.0.0.1:5437");
  assert.equal(describeFailure(Object.assign(new Error(""), { code: "ECONNREFUSED" })), "ECONNREFUSED");
});

test("a dump of another database does not count: no dump, no migration", async () => {
  const target = { ok: false, message: "DATABASE_URL names gata_league but the backup would dump POSTGRES_DB=other" };
  const { run, calls } = rehearse({ status: pendingStatus, backup: { status: 0 }, target });
  assert.equal(await run, 1);
  assert.equal(calls.backup, 0);
  assert.equal(calls.apply, 0);
  assert.deepEqual(calls.error, [`deploy:migrate: ${target.message}`]);
});

test("nothing pending: the backup target is not even looked at", async () => {
  const { run, calls } = rehearse({ status: { pending: [], changed: [] }, backup: { status: 0 }, target: { ok: false, message: "never shown" } });
  assert.equal(await run, 0);
  assert.deepEqual(calls.error, []);
});

test("the backup must be of the database being migrated", () => {
  assert.deepEqual(checkBackupTarget({ databaseUrl: "postgres://gata_admin:secret@127.0.0.1:5437/gata_league", postgresDb: "gata_league" }), { ok: true });
  const other = checkBackupTarget({ databaseUrl: "postgres://gata_admin:secret@127.0.0.1:5437/gata_league", postgresDb: "gata_league_staging" });
  assert.equal(other.ok, false);
  assert.equal(
    other.message,
    "DATABASE_URL names gata_league but the backup would dump POSTGRES_DB=gata_league_staging; refusing to migrate without a backup of the same database",
  );
});

test("a missing POSTGRES_DB is a refusal that says so", () => {
  for (const postgresDb of [undefined, ""]) {
    const result = checkBackupTarget({ databaseUrl: "postgres://u:p@localhost/gata_league", postgresDb });
    assert.equal(result.ok, false);
    assert.match(result.message, /POSTGRES_DB is not set/);
    assert.match(result.message, /gata_league/);
  }
});

test("the database name is read the way the driver reads it", () => {
  assert.deepEqual(checkBackupTarget({ databaseUrl: "postgres://u:p%40ss@db.internal:5432/gata%5Fleague?sslmode=require", postgresDb: "gata_league" }), { ok: true });
});

test("a DATABASE_URL with no readable database name is a refusal", () => {
  for (const databaseUrl of ["postgres://u:p@localhost:5432", "postgres://u:p@localhost:5432/", "not a url", undefined]) {
    const result = checkBackupTarget({ databaseUrl, postgresDb: "gata_league" });
    assert.equal(result.ok, false, String(databaseUrl));
    assert.match(result.message, /DATABASE_URL does not name a database/);
  }
});
