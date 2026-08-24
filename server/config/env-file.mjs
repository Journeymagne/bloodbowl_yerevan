import fs from "node:fs";
import { promises as fsPromises } from "node:fs";
import path from "node:path";

// The deploy directory is served over HTTP, so the file holding the database and
// admin passwords must not live there: a routing change would expose it again,
// as one already did. Production keeps it in /etc; the repository-root path
// stays as a fallback so local development keeps working on machines that have
// no /etc/bloodbowl-league.
export const SYSTEM_ENV_PATH = "/etc/bloodbowl-league/.env";

export function resolveEnvFilePath(rootDir, options = {}) {
  const {
    override = process.env.BLOODBOWL_ENV_FILE,
    systemPath = SYSTEM_ENV_PATH,
    exists = (candidate) => fs.existsSync(candidate),
  } = options;

  // An override naming a file that is not there is an error, not a reason to
  // quietly load a different set of passwords.
  if (override) {
    const resolved = path.resolve(override);
    if (!exists(resolved)) {
      throw new Error(`BLOODBOWL_ENV_FILE points at ${resolved}, which does not exist`);
    }
    return resolved;
  }

  for (const candidate of [systemPath, path.join(rootDir, ".env")]) {
    if (exists(candidate)) return candidate;
  }

  return null;
}

/**
 * Parse the contents of an env file.
 *
 * A repeated key keeps its first value: the server used to assign straight into
 * process.env and skip keys that were already set, so the first line won.
 * Anything else would silently change which password the app loads.
 *
 * @param {string} body
 * @returns {Map<string, string>}
 */
export function parseEnvFile(body) {
  const values = new Map();
  for (const line of String(body ?? "").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue;
    const index = trimmed.indexOf("=");
    const key = trimmed.slice(0, index).trim();
    const value = trimmed.slice(index + 1).trim().replace(/^['"]|['"]$/g, "");
    if (key && !values.has(key)) values.set(key, value);
  }
  return values;
}

/**
 * Locate the env file and read the values out of it.
 *
 * A missing or unreadable file is not an error here: local development runs
 * without one, and the caller decides which keys it cannot do without.
 *
 * @param {string} rootDir
 * @param {object} [options] Passed through to resolveEnvFilePath.
 * @returns {Promise<Map<string, string>>}
 */
export async function readEnvValues(rootDir, options = {}) {
  const envPath = resolveEnvFilePath(rootDir, options);
  if (!envPath) return new Map();
  try {
    return parseEnvFile(await fsPromises.readFile(envPath, "utf8"));
  } catch {
    return new Map();
  }
}

/**
 * Fill in the keys the target does not already have.
 *
 * A variable already present in the real environment wins over the file: that
 * is how systemd and docker overrides have always been able to win. Only
 * `undefined` counts as absent, so exporting a key as an empty string still
 * beats whatever the file says.
 *
 * @param {Map<string, string>} values
 * @param {Record<string, string|undefined>} [target]
 * @returns {Record<string, string|undefined>} The target, filled in.
 */
export function applyEnvValues(values, target = process.env) {
  for (const [key, value] of values) {
    if (target[key] === undefined) target[key] = value;
  }
  return target;
}

/**
 * Locate the env file and compose it into the environment.
 *
 * The one call every entry point needs, so they agree on where the file lives
 * and on what outranks it. scripts/apply-sql.mjs was the second caller until
 * the roster import it served was removed.
 *
 * @param {string} rootDir
 * @param {object} [options] `target` overrides process.env; the rest goes to
 *   resolveEnvFilePath.
 * @returns {Promise<Record<string, string|undefined>>}
 */
export async function loadEnvFile(rootDir, options = {}) {
  const { target = process.env, ...resolveOptions } = options;
  return applyEnvValues(await readEnvValues(rootDir, resolveOptions), target);
}
