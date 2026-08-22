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
 * Parse the timer's NextElapseUSecRealtime property into one of three
 * outcomes, deliberately without betting on a single format.
 *
 * Two shapes are tolerated because this codebase has not yet confirmed
 * which one a real deployment prints: a human-readable timestamp - the same
 * shape `ExecMainExitTimestamp` uses (e.g. "Sat 2026-08-22 04:00:01 UTC"),
 * which is believed to be the real one - and a raw microseconds-since-epoch
 * integer, which an earlier, unverified round of this code assumed was the
 * *only* format. Whichever a real `systemctl show` emits, this then works;
 * a wrong guess here previously turned a healthy, scheduled timer into a
 * false "NOT OK" because `Number(rawTimestamp)` is NaN.
 *
 * "n/a", an empty string, and "0" all mean the same thing: systemd is
 * explicitly saying there is no future run - a real problem for a timer that
 * is supposed to be active.
 *
 * Anything else - including the property being absent from the requested
 * output altogether - is not guessed at. It is reported as unknown, the same
 * way this file already treats `systemctl` itself being unavailable: unknown
 * is never silently healthy, but it does not by itself fail the check either.
 *
 * @param {string | undefined} raw
 * @returns {{kind: "future", date: Date} | {kind: "none"} | {kind: "unknown", raw: string | undefined}}
 */
export function parseTimerNextElapse(raw) {
  if (raw === undefined) {
    return { kind: "unknown", raw: undefined };
  }

  const trimmed = raw.trim();
  if (trimmed === "" || trimmed === "n/a" || trimmed === "0") {
    return { kind: "none" };
  }

  // All-digits: the tolerated microseconds-since-epoch alternative form.
  if (/^\d+$/.test(trimmed)) {
    const usec = Number(trimmed);
    if (Number.isFinite(usec) && usec > 0) {
      return { kind: "future", date: new Date(usec / 1000) };
    }
    return { kind: "none" };
  }

  // Otherwise, try the believed-real human-readable timestamp shape.
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return { kind: "future", date: parsed };
  }

  return { kind: "unknown", raw: trimmed };
}

/**
 * @typedef {{available: false} | {available: true, service: Map<string,string>|null, timer: Map<string,string>|null}} SystemdSnapshot
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
      timerNextRunUnknown: null,
    };
  }

  const { service, timer } = state;
  const problems = [];
  const notes = [];

  // The service and timer queries are read independently (see
  // readSystemdState in scripts/backup-status.mjs), so one of them can be
  // `null` - that query failed - while the other succeeded. A failure on one
  // side must not erase a real finding on the other, so each is evaluated in
  // its own branch rather than both being required for any judgement at all.
  let hasRun = null;
  let result = null;
  if (service === null) {
    notes.push(`${unit}.service state unknown (systemctl query failed)`);
  } else {
    // Only "loaded" means systemd actually has a usable unit. Every other
    // LoadState - "not-found" (never installed), "masked" (symlinked to
    // /dev/null, the common slip when `disable` was meant), "error",
    // "bad-setting", and whatever systemd adds in a later release - is a
    // broken unit. This is the same call this repository already made for
    // the same reason: see the comment on `staticFileAllowList` in
    // server/http/static-path.mjs ("a deny-list would leak the next file
    // someone adds") - a deny-list of just "not-found" would just as surely
    // leak the next LoadState someone hits.
    const serviceLoadState = service.get("LoadState");
    if (serviceLoadState !== "loaded") {
      problems.push(`${unit}.service is not loaded (LoadState=${serviceLoadState})`);
    }

    const execTimestamp = (service.get("ExecMainExitTimestamp") || "").trim();
    hasRun = execTimestamp.length > 0;
    result = service.get("Result");
    if (hasRun) {
      if (result !== "success") {
        problems.push(`${unit}.service last run result: ${result}`);
      }
    } else {
      // Not a problem by itself - this is exactly what a freshly installed,
      // not-yet-triggered timer looks like. Staleness of the dumps
      // themselves is judged separately and will catch a timer that is
      // scheduled but never actually produces anything.
      notes.push(`${unit}.service has not run yet`);
    }
  }

  let timerNextRun = null;
  let timerNextRunUnknown = null;
  if (timer === null) {
    notes.push(`${unit}.timer state unknown (systemctl query failed)`);
  } else {
    const timerLoadState = timer.get("LoadState");
    const timerActiveState = timer.get("ActiveState");
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
      // answer to "when next" for a calendar timer; parseTimerNextElapse
      // handles the format uncertainty (see its own doc comment) and gives
      // back one of three outcomes: a real future run, an explicit "none",
      // or "unknown" for a shape (or absence) this code does not recognise.
      const rawNextElapse = timer.get("NextElapseUSecRealtime");
      const nextElapse = parseTimerNextElapse(rawNextElapse);
      if (nextElapse.kind === "future") {
        timerNextRun = nextElapse.date;
      } else if (nextElapse.kind === "none") {
        problems.push(
          `${unit}.timer is active but has no future run scheduled ` +
            `(NextElapseUSecRealtime=${rawNextElapse ?? "not reported"})`,
        );
      } else {
        // Unknown shape (or the property missing entirely) - same reasoning
        // as `systemctl` being unavailable entirely, above: report plainly,
        // do not fail the check on it.
        timerNextRunUnknown = nextElapse.raw ?? "not reported";
        notes.push(
          `${unit}.timer next run is unknown (NextElapseUSecRealtime=${timerNextRunUnknown})`,
        );
      }
    }
  }

  return { available: true, problems, notes, hasRun, result, timerNextRun, timerNextRunUnknown };
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
