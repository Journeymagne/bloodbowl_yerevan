import fs from "node:fs";
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
