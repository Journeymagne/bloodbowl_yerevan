import { DEFAULT_KEEP, isDumpName, parseDumpTimestamp } from "./rotation.mjs";

// A nightly job may be delayed by a reboot or a randomised start, but two
// missed nights in a row means something is broken rather than late.
export const STALE_AFTER_HOURS = 48;

/**
 * @param {Array<{name: string, size: number}>} entries
 * @param {{now?: Date, staleAfterHours?: number, keep?: number}} [options]
 */
export function summarizeBackups(entries, options = {}) {
  const { now = new Date(), staleAfterHours = STALE_AFTER_HOURS, keep = DEFAULT_KEEP } = options;

  const dumps = entries
    .filter((entry) => isDumpName(entry.name))
    .sort((left, right) => (left.name < right.name ? -1 : 1));

  const newest = dumps.at(-1) ?? null;
  const ageHours = newest
    ? (now.getTime() - parseDumpTimestamp(newest.name).getTime()) / 3_600_000
    : null;

  return {
    count: dumps.length,
    totalBytes: dumps.reduce((total, entry) => total + entry.size, 0),
    newest,
    ageHours,
    stale: ageHours === null || ageHours > staleAfterHours,
    overKeep: dumps.length > keep,
  };
}
