/**
 * Maintenance mode's flag: where it lives, what it says, who it applies to.
 *
 * Release 2.1.0, ahead of the 3.0 cutover. The version that is live on the day
 * of a migration has to be the one that knows how to say "back soon", so this
 * ships before the migration it exists for.
 *
 * The flag is a file, not a database setting, because the database is the
 * thing being worked on. It is re-read while the server runs: switching the
 * mode is `npm run maintenance:on|off`, never a restart.
 *
 * Requests from the machine itself pass. That is how the owner looks at the new
 * version through an SSH tunnel before opening it to the league. Caddy reaches
 * Node from the docker network, never from loopback, and X-Forwarded-For is not
 * consulted, so a request from outside cannot claim to be local.
 *
 * Kept free of server imports so scripts/maintenance.mjs can use it too.
 */
import { promises as fs } from "node:fs";

export const DEFAULT_MAINTENANCE_FILE = "/etc/bloodbowl-league/maintenance.json";
export const MAINTENANCE_KINDS = Object.freeze(["planned", "unplanned"]);

const LOOPBACK = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);
const PAGE_ASSET_PREFIXES = ["/public/maintenance/", "/assets/fonts/"];
const UNREADABLE = Object.freeze({ kind: "unplanned", startsAt: null, endsAt: null, invalid: true });

export function maintenanceFilePath(env = process.env) {
  return env.MAINTENANCE_FILE || DEFAULT_MAINTENANCE_FILE;
}

function isoOrNull(value) {
  if (typeof value !== "string" || !value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

/**
 * A flag that cannot be read as intended still means maintenance: whoever
 * wrote it wanted the site closed. It reads as unplanned, with no times.
 */
export function parseMaintenanceFlag(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ...UNREADABLE };
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw) || !MAINTENANCE_KINDS.includes(raw.kind)) {
    return { ...UNREADABLE };
  }
  return { kind: raw.kind, startsAt: isoOrNull(raw.startsAt), endsAt: isoOrNull(raw.endsAt) };
}

export function isLoopbackAddress(address) {
  return LOOPBACK.has(String(address ?? ""));
}

/**
 * What one request gets while the flag is up.
 *
 * @returns {"pass"|"api"|"page"}
 */
export function maintenanceAction(pathname, remoteAddress, flag) {
  if (!flag || isLoopbackAddress(remoteAddress)) return "pass";
  if (pathname === "/api/health") return "pass";
  if (pathname.startsWith("/api/")) return "api";
  if (PAGE_ASSET_PREFIXES.some((prefix) => pathname.startsWith(prefix))) return "pass";
  return "page";
}

/**
 * The flag as of now, read at most once per interval: the page alone asks for
 * half a dozen files, and each of them would otherwise touch the disk.
 */
export function createMaintenanceReader({
  filePath,
  readFile = fs.readFile,
  now = Date.now,
  minIntervalMs = 2000,
  warn = console.warn,
}) {
  let checkedAt = -Infinity;
  let flag = null;
  return {
    async current() {
      if (now() - checkedAt < minIntervalMs) return flag;
      checkedAt = now();
      const previous = flag;
      try {
        flag = parseMaintenanceFlag(await readFile(filePath, "utf8"));
      } catch (error) {
        flag = error?.code === "ENOENT" ? null : { ...UNREADABLE, reason: error?.message };
      }
      if (flag?.invalid && !previous?.invalid) {
        warn(`[maintenance] ${filePath} could not be read as a flag (${flag.reason ?? "invalid contents"}); the site stays closed`);
      }
      return flag;
    },
  };
}
