// Dump file names carry a fixed-width UTC timestamp, so sorting the names
// lexicographically sorts them by age. That is deliberate: mtime is rewritten
// by copying a file around, and rotation must not depend on it.
const DUMP_NAME = /^gata_league-(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})\.dump$/;

export const DEFAULT_KEEP = 7;
export const PARTIAL_SUFFIX = ".partial";
export const PARTIAL_MAX_AGE_MS = 24 * 60 * 60 * 1000;

const pad = (value, width) => String(value).padStart(width, "0");

/**
 * @param {Date} date
 * @returns {string}
 */
export function formatDumpName(date) {
  const stamp = [
    pad(date.getUTCFullYear(), 4),
    pad(date.getUTCMonth() + 1, 2),
    pad(date.getUTCDate(), 2),
    "-",
    pad(date.getUTCHours(), 2),
    pad(date.getUTCMinutes(), 2),
    pad(date.getUTCSeconds(), 2),
  ].join("");
  return `gata_league-${stamp}.dump`;
}

/**
 * @param {string} name
 * @returns {Date|null} null when the name was not produced by formatDumpName.
 */
export function parseDumpTimestamp(name) {
  const match = DUMP_NAME.exec(String(name ?? ""));
  if (!match) return null;
  const [, year, month, day, hours, minutes, seconds] = match.map(Number);
  return new Date(Date.UTC(year, month - 1, day, hours, minutes, seconds));
}

/**
 * @param {string} name
 * @returns {boolean}
 */
export function isDumpName(name) {
  return parseDumpTimestamp(name) !== null;
}

function isPartialName(name) {
  return String(name ?? "").endsWith(PARTIAL_SUFFIX)
    && isDumpName(String(name).slice(0, -PARTIAL_SUFFIX.length));
}

/**
 * Decide which files in the backup directory may go.
 *
 * Anything the naming scheme does not recognise is left alone: this function
 * deletes data, and a stray file is not reason enough to guess.
 *
 * @param {Array<{name: string, mtimeMs: number}>} entries
 * @param {{keep?: number, now?: Date, partialMaxAgeMs?: number}} [options]
 * @returns {{keep: string[], remove: string[]}}
 */
export function planRotation(entries, options = {}) {
  const { keep = DEFAULT_KEEP, now = new Date(), partialMaxAgeMs = PARTIAL_MAX_AGE_MS } = options;
  if (!Number.isInteger(keep) || keep < 1) {
    throw new RangeError(`keep must be an integer of at least 1, got ${String(keep)}`);
  }

  const dumps = entries
    .map((entry) => entry.name)
    .filter(isDumpName)
    .sort();
  const cut = Math.max(0, dumps.length - keep);

  // A dump that never finished is not a backup, but it is also not garbage
  // until it is clearly abandoned — a run still in flight owns a fresh one.
  const abandonedPartials = entries
    .filter((entry) => isPartialName(entry.name))
    .filter((entry) => now.getTime() - entry.mtimeMs >= partialMaxAgeMs)
    .map((entry) => entry.name);

  return {
    keep: dumps.slice(cut),
    remove: [...dumps.slice(0, cut), ...abandonedPartials],
  };
}
