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

/**
 * Parse the text `systemctl show --property=... unit` prints on stdout into
 * its key/value pairs.
 *
 * Pure and independent of how the text was obtained, so it can be tested
 * against recorded output rather than a real systemd on a machine that may
 * not have one.
 *
 * @param {string} output
 * @returns {Map<string, string>}
 */
export function parseSystemctlProperties(output) {
  const properties = new Map();
  for (const line of output.split("\n")) {
    const index = line.indexOf("=");
    // A line with no "=" is not a property (a blank trailing line from
    // stdout, most commonly) - skip it rather than recording an empty key.
    if (index === -1) continue;
    properties.set(line.slice(0, index), line.slice(index + 1));
  }
  return properties;
}

/**
 * @typedef {{available: false} | {available: true, service: Map<string,string>, timer: Map<string,string>}} SystemdSnapshot
 */

/**
 * Judge the health of the backup service/timer pair from already-collected
 * systemd state.
 *
 * `systemctl show` on a unit that was never installed does not fail - it
 * exits 0 and prints defaulted properties (`Result=success` among them), so
 * a non-empty `Result` is never, on its own, evidence a backup ever ran.
 * `LoadState` is what actually distinguishes an installed unit from a
 * missing one, and "has the service ever run" has to come from an execution
 * timestamp being non-empty, not from `Result` being present.
 *
 * @param {SystemdSnapshot} state
 * @param {string} unit base unit name, e.g. "bloodbowl-backup"
 */
export function evaluateSystemdState(state, unit) {
  if (!state.available) {
    // systemd itself being unreachable (no `systemctl` binary, most likely a
    // development machine) is not evidence the backups are unhealthy - it
    // just means this command cannot see systemd's opinion on them. Report
    // that plainly rather than either hiding it or treating it as a failure.
    return {
      available: false,
      problems: [],
      notes: [`${unit}: systemd state unknown (systemctl unavailable)`],
      hasRun: null,
      result: null,
      timerNextRun: null,
    };
  }

  const { service, timer } = state;
  const problems = [];
  const notes = [];

  // Only "loaded" means systemd actually has a usable unit. Every other
  // LoadState - "not-found" (never installed), "masked" (symlinked to
  // /dev/null, the common slip when `disable` was meant), "error",
  // "bad-setting", and whatever systemd adds in a later release - is a
  // broken unit. This is the same call this repository already made for the
  // same reason: see the comment on `staticFileAllowList` in
  // server/http/static-path.mjs ("a deny-list would leak the next file
  // someone adds") - a deny-list of just "not-found" would just as surely
  // leak the next LoadState someone hits.
  const serviceLoadState = service.get("LoadState");
  if (serviceLoadState !== "loaded") {
    problems.push(`${unit}.service is not loaded (LoadState=${serviceLoadState})`);
  }

  const timerLoadState = timer.get("LoadState");
  const timerActiveState = timer.get("ActiveState");
  let timerNextRun = null;
  if (timerLoadState !== "loaded") {
    // Same allow-list as the service, applied to the timer.
    problems.push(`${unit}.timer is not loaded (LoadState=${timerLoadState})`);
  } else if (timerActiveState !== "active") {
    problems.push(
      `${unit}.timer is not scheduled (LoadState=${timerLoadState}, ActiveState=${timerActiveState})`,
    );
  } else {
    // ActiveState=active only means the timer unit is loaded and running -
    // it says nothing about whether it will ever fire again. A timer that
    // already consumed its last trigger, or whose calendar expression
    // yields no further occurrence, stays "active" forever while never
    // invoking the service again. NextElapseUSecRealtime is systemd's own
    // answer to "when next" for a calendar timer: it reports "0" when there
    // is none, and a microsecond-since-epoch value otherwise. The property
    // can also be absent from the requested output altogether - that must
    // read the same as "0", not be assumed to mean anything reassuring.
    const rawNextElapse = timer.get("NextElapseUSecRealtime");
    const nextElapseUsec = rawNextElapse === undefined ? NaN : Number(rawNextElapse.trim());
    if (Number.isFinite(nextElapseUsec) && nextElapseUsec > 0) {
      timerNextRun = new Date(nextElapseUsec / 1000);
    } else {
      problems.push(
        `${unit}.timer is active but has no future run scheduled ` +
          `(NextElapseUSecRealtime=${rawNextElapse ?? "not reported"})`,
      );
    }
  }

  const execTimestamp = (service.get("ExecMainExitTimestamp") || "").trim();
  const hasRun = execTimestamp.length > 0;
  const result = service.get("Result");
  if (hasRun) {
    if (result !== "success") {
      problems.push(`${unit}.service last run result: ${result}`);
    }
  } else {
    // Not a problem by itself - this is exactly what a freshly installed,
    // not-yet-triggered timer looks like. Staleness of the dumps themselves
    // is judged separately and will catch a timer that is scheduled but
    // never actually produces anything.
    notes.push(`${unit}.service has not run yet`);
  }

  return { available: true, problems, notes, hasRun, result, timerNextRun };
}

/**
 * Combine the dump summary with the systemd judgement into the final
 * pass/fail decision the CLI reports.
 *
 * @param {{summary: ReturnType<typeof summarizeBackups>, keep: number, systemd: ReturnType<typeof evaluateSystemdState>, unreadableCount?: number}} input
 */
export function evaluateBackupStatus({ summary, keep, systemd, unreadableCount = 0 }) {
  const problems = [];
  if (summary.stale) {
    const age = summary.ageHours === null ? "there are none" : `${summary.ageHours.toFixed(1)} h`;
    problems.push(`newest dump is older than allowed (${age})`);
  }
  if (summary.overKeep) {
    problems.push(`${summary.count} dumps kept, expected at most ${keep}`);
  }
  if (unreadableCount > 0) {
    // A single file lost to a genuine readdir()/stat() race is rare enough
    // that surfacing it (and failing the check) is an acceptable cost.
    // Silently discarding an unknown number of unreadable files - which is
    // what a permissions regression or filesystem trouble would produce -
    // is not: the operator would see a healthy-looking count and learn
    // nothing.
    const noun = unreadableCount === 1 ? "entry" : "entries";
    problems.push(`${unreadableCount} unreadable ${noun} in the backup directory`);
  }
  problems.push(...systemd.problems);

  return { problems, ok: problems.length === 0 };
}
