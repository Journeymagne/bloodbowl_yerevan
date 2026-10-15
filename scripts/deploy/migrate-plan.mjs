/**
 * What the deploy's schema step does, decided before it touches anything.
 *
 * A migration is the one deploy step that cannot be undone by putting the old
 * code back, so it never runs without a fresh dump to return to.
 */
export function planDeployMigration({ pending, changed }) {
  if (changed.length) {
    return { action: "refuse", message: `edited after being applied: ${changed.join(", ")}` };
  }
  if (!pending.length) return { action: "skip", message: "no pending migrations, backup skipped" };
  return { action: "backup-then-migrate", message: `pending: ${pending.map((migration) => migration.name).join(", ")}` };
}
