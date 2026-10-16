/**
 * What output/rehearsal/migrate.json keeps of the migrate runs of one rehearsal.
 *
 * A second `rehearsal:migrate` usually applies nothing, and a record written over
 * the first one lost the time of the real run, which is the one the cutover's
 * maintenance window has to allow for. So every run is kept in `runs`, and the
 * top level adds them up: `at` is when the first run started, `applied` names
 * what every run applied, and `ms` is the sum of the runs that applied something
 * (the sum of all of them when none did, so an empty rehearsal still says how
 * long it took).
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
