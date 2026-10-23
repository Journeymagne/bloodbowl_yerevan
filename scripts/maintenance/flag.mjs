/**
 * The maintenance commands' arguments and the flag they write.
 *
 * Kept apart from the command so it can be tested without touching /etc: the
 * point of having a command at all is that nobody hand-writes JSON on the
 * server under time pressure.
 *
 * A mistyped argument is refused, never guessed at. These commands run on the
 * production server, and a slip must end in an error, not in a different flag.
 */
import { MAINTENANCE_KINDS } from "../../server/http/maintenance-flag.mjs";

const COMMANDS = ["on", "off", "status"];
const OPTIONS = { "--kind": "kind", "--starts": "starts", "--ends": "ends" };
// A time must say where it is. Without an offset it would be read in the
// server's own timezone, and a bare date would be UTC midnight.
const TIME_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})$/i;

export function parseMaintenanceArgs(argv) {
  const [command, ...rest] = argv;
  if (!COMMANDS.includes(command)) throw new Error("usage: maintenance on|off|status — the command must be on, off or status");
  if (command !== "on" && rest.length) throw new Error(`${command} takes no options`);
  const parsed = { command, kind: undefined, starts: undefined, ends: undefined };
  for (let index = 0; index < rest.length; index += 2) {
    const token = rest[index];
    if (!token.startsWith("--")) throw new Error(`unexpected argument ${token}`);
    const field = OPTIONS[token];
    if (!field) throw new Error(`unknown option ${token}; use --kind, --starts or --ends`);
    const value = rest[index + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`option ${token} needs a value`);
    if (value === "") throw new Error(`${token} must not be empty`);
    if (parsed[field] !== undefined) throw new Error(`option ${token} given twice`);
    parsed[field] = value;
  }
  return parsed;
}

function isoOption(value, name) {
  if (value === "") throw new Error(`${name} must not be empty`);
  if (!TIME_WITH_OFFSET.test(value)) throw new Error(`${name} needs a UTC offset, e.g. 2026-11-02T19:00+04:00`);
  const time = Date.parse(value);
  // Date.parse rolls 2026-11-31 over into December, so the day has to exist.
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  if (Number.isNaN(time) || new Date(Date.UTC(year, month - 1, day)).getUTCDate() !== day) {
    throw new Error(`${name} must be a date and time, e.g. 2026-11-02T19:00+04:00`);
  }
  return new Date(time).toISOString();
}

export function buildMaintenanceFlag({ kind = "planned", starts, ends }, now = new Date()) {
  if (!MAINTENANCE_KINDS.includes(kind)) throw new Error("--kind must be planned or unplanned");
  const startsAt = starts !== undefined ? isoOption(starts, "--starts") : now.toISOString();
  const endsAt = ends !== undefined ? isoOption(ends, "--ends") : null;
  if (endsAt && Date.parse(endsAt) <= Date.parse(startsAt)) throw new Error("--ends must be after the start");
  return { kind, startsAt, endsAt };
}
