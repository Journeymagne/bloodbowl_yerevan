/**
 * The files a rehearsal leaves in output/rehearsal, and the ones a new rehearsal:restore deletes so that nothing
 * the last rehearsal wrote is read as this one's: its snapshots and report, its migration's time, and the record
 * and result of rehearsal:transitions — a record of an old seed would mark rows of a database that is gone and
 * miss this one's, an old finish would say «every state ok» for a rehearsal it never saw.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/** What rehearsal:transitions --seed made (scripts/rehearsal-transitions.mjs): passwords of test coaches, 0600. */
export const TRANSITIONS_RECORD = "transitions.json";
/** What rehearsal:transitions --finish checked. */
export const TRANSITIONS_FINISH = "transitions-finish.json";

export const STALE_OUTPUTS = Object.freeze(["before.json", "after.json", "report.md", "migrate.json", TRANSITIONS_RECORD, TRANSITIONS_FINISH]);

/**
 * Writes `value` as JSON readable by this user only, whether the file is new or was there before (a write keeps
 * an old file's mode, hence the chmod).
 *
 * @param {string} file
 * @param {unknown} value
 */
export async function writePrivate(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600 });
  await fs.chmod(file, 0o600);
}
