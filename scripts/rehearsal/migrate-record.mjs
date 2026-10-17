/**
 * What output/rehearsal/migrate.json keeps of the migrate runs of one rehearsal.
 *
 * A second `rehearsal:migrate` usually applies nothing, and a record written over
 * the first one lost the time of the real run, which is the one the cutover's
 * maintenance window has to allow for. So every run is kept in `runs`, and the
 * top level adds them up: `at` is when the first run ended (a run takes it after
 * the migrations are applied), `applied` names what every run applied, and `ms`
 * is the sum of the runs that applied something (the sum of all of them when
 * none did, so an empty rehearsal still says how long it took).
 *
 * A record written before runs were kept ({ at, applied, ms }) counts as one run.
 *
 * @param previous the record already on disk, or null when there is none
 * @param run what this run did: { at, applied, ms }
 */
export function mergeMigrateRecord(previous, run) {
  const runs = [...(previous ? (previous.runs ?? [previous]) : []), run];
  const working = runs.filter((item) => item.applied.length > 0);
  const timed = working.length ? working : runs;
  return {
    at: runs[0].at,
    applied: runs.flatMap((item) => item.applied),
    ms: timed.reduce((sum, item) => sum + item.ms, 0),
    runs,
  };
}

const isObject = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const isRun = (run) => isObject(run) && Array.isArray(run.applied)
  && run.applied.every((name) => typeof name === "string") && Number.isFinite(run.ms);

/**
 * The record read back from disk, or an error saying to start over when its shape is not one
 * mergeMigrateRecord can add to. Checked before the migrations are applied: a record found
 * wrong afterwards would cost the time of a real run, which cannot be had twice.
 *
 * @param value what JSON.parse made of the file: null, a record with `runs`, or a legacy single run
 * @returns the same value
 */
export function assertMigrateRecord(value) {
  if (value === null) return value;
  const runs = isObject(value) ? (value.runs ?? [value]) : null;
  if (Array.isArray(runs) && runs.length > 0 && runs.every(isRun)) return value;
  throw new Error("output/rehearsal/migrate.json has the wrong shape — run npm run rehearsal:check -- --before to start over");
}
