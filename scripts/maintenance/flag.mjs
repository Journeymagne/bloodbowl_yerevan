/**
 * The maintenance commands' arguments and the flag they write.
 *
 * Kept apart from the command so it can be tested without touching /etc: the
 * point of having a command at all is that nobody hand-writes JSON on the
 * server under time pressure.
 */
import { MAINTENANCE_KINDS } from "../../server/http/maintenance-flag.mjs";

const COMMANDS = ["on", "off", "status"];
const OPTIONS = { "--kind": "kind", "--starts": "starts", "--ends": "ends" };

export function parseMaintenanceArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new Error("usage: maintenance on|off|status — the command must be on, off or status");
  const parsed = { command, kind: undefined, starts: undefined, ends: undefined };
  for (let index = 0; index < rest.length; index += 2) {
    const field = OPTIONS[rest[index]];
    if (!field) throw new Error(`unknown option ${rest[index]}; use --kind, --starts or --ends`);
    parsed[field] = rest[index + 1];
  }
  return parsed;
}

function isoOption(value, name) {
  const time = Date.parse(value);
  if (Number.isNaN(time)) throw new Error(`${name} must be a date and time, e.g. 2026-11-02T19:00+04:00`);
  return new Date(time).toISOString();
}

export function buildMaintenanceFlag({ kind = "planned", starts, ends }, now = new Date()) {
  if (!MAINTENANCE_KINDS.includes(kind)) throw new Error("--kind must be planned or unplanned");
  const startsAt = starts ? isoOption(starts, "--starts") : now.toISOString();
  const endsAt = ends ? isoOption(ends, "--ends") : null;
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("--ends must be after the start");
  return { kind, startsAt, endsAt };
}
