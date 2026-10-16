/**
 * The deploy's schema step, from the plan to the exit code.
 *
 * Everything that touches the world comes in as an argument, so the guarantee
 * this step exists for can be tested without a database or a docker: the
 * migrations are applied only after the dump in front of them has succeeded.
 */
import { planDeployMigration } from "./migrate-plan.mjs";

/**
 * @param {object} deps
 * @param {{pending: object[], changed: string[]}} deps.status from migrationStatus
 * @param {() => Promise<{ok: boolean, message?: string}>} deps.verifyBackupTarget
 *   whether the dump would be of the database being migrated (checkBackupTarget)
 * @param {() => {status: number|null, signal?: string|null, error?: Error}|Promise<object>} deps.takeBackup
 *   runs the dump and reports how the child ended, as spawnSync does
 * @param {() => Promise<string[]>} deps.apply applies the migrations, returns their names
 * @param {(line: string) => void} deps.log
 * @param {(line: string) => void} deps.error
 * @returns {Promise<number>} the process exit code
 */
export async function runDeployMigration({ status, verifyBackupTarget, takeBackup, apply, log, error }) {
  const plan = planDeployMigration(status);
  if (plan.action === "refuse") {
    error(`deploy:migrate: ${plan.message}`);
    return 1;
  }
  log(`deploy:migrate: ${plan.message}`);
  if (plan.action === "skip") return 0;

  const target = await verifyBackupTarget();
  if (!target.ok) {
    error(`deploy:migrate: ${target.message}`);
    return 1;
  }
  const backup = await takeBackup();
  // Anything but a clean exit (a non-zero status, a signal, a dump that never
  // started) means there is nothing to return to, so the schema stays as it is.
  if (backup.status !== 0) {
    const why = backup.error?.message ?? backup.signal ?? `exit ${backup.status}`;
    error(`deploy:migrate: the pre-migration backup failed (${why}); the schema was not touched`);
    return 1;
  }
  const applied = await apply();
  log(`deploy:migrate: applied ${applied.join(", ")}`);
  return 0;
}

/**
 * One line for the CI log. A refused connection to `localhost` arrives as an
 * AggregateError (one failure per address tried) with an empty message.
 *
 * @param {unknown} error
 * @returns {string}
 */
export function describeFailure(error) {
  if (error?.message) return error.message;
  const parts = Array.isArray(error?.errors) ? error.errors.map((inner) => inner?.message).filter(Boolean) : [];
  return [...new Set(parts)].join("; ") || error?.code || String(error);
}
