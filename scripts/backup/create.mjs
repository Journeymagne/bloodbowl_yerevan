import { promises as fs } from "node:fs";
import path from "node:path";

import { PARTIAL_SUFFIX, formatDumpName, planRotation } from "./rotation.mjs";

// A custom-format dump of an empty database is already well over this; anything
// smaller means the dump was cut off rather than merely uneventful.
export const MIN_DUMP_BYTES = 512;

/**
 * Take one backup: dump, check, then name it.
 *
 * The dump is written under a .partial name and only renamed once it has been
 * read back, so a run that dies halfway — out of disk, container restarted —
 * cannot leave a file that looks like a usable backup.
 *
 * @param {{
 *   backupDir: string,
 *   runDump: (target: string) => Promise<void>,
 *   verifyDump: (target: string) => Promise<void>,
 *   now?: Date,
 *   keep?: number,
 *   minBytes?: number,
 * }} options
 * @returns {Promise<{path: string, removed: string[], rotationError: Error|null}>}
 */
export async function createBackup(options) {
  const {
    backupDir,
    runDump,
    verifyDump,
    now = new Date(),
    keep,
    minBytes = MIN_DUMP_BYTES,
  } = options;

  await fs.mkdir(backupDir, { recursive: true, mode: 0o700 });

  const finalName = formatDumpName(now);
  const finalPath = path.join(backupDir, finalName);
  const partialPath = `${finalPath}${PARTIAL_SUFFIX}`;

  try {
    await runDump(partialPath);
    const { size } = await fs.stat(partialPath);
    if (size < minBytes) {
      throw new Error(`dump is only ${size} bytes, expected at least ${minBytes}`);
    }
    await verifyDump(partialPath);
    await fs.chmod(partialPath, 0o600);
    await fs.rename(partialPath, finalPath);
  } catch (error) {
    try {
      await fs.rm(partialPath, { force: true });
    } catch {
      // The dump already failed for its own reason; a cleanup error here is
      // secondary and must not displace the diagnostic that explains why the
      // dump was rejected in the first place.
    }
    throw error;
  }

  // The dump is verified and sitting under its final name by this point, so
  // the backup itself has already succeeded — a systemd oneshot caller
  // treats a rejected promise as "no backup happened tonight", which would
  // be false. Rotation is a housekeeping step layered on top of that success:
  // if it fails (bad `keep`, a transient readdir/stat/rm error), report the
  // failure through the resolved value instead of throwing, so dumps piling
  // up is visible without masquerading as a failed backup.
  try {
    const removed = await rotate(backupDir, { keep, now });
    return { path: finalPath, removed, rotationError: null };
  } catch (rotationError) {
    return { path: finalPath, removed: [], rotationError };
  }
}

/**
 * Delete the dumps that fell out of the retention window.
 *
 * @param {string} backupDir
 * @param {{keep?: number, now?: Date}} [options]
 * @returns {Promise<string[]>} names of the files removed
 */
export async function rotate(backupDir, options = {}) {
  const dirEntries = await fs.readdir(backupDir, { withFileTypes: true });
  const entries = [];
  for (const entry of dirEntries) {
    if (!entry.isFile()) continue;
    const { mtimeMs } = await fs.stat(path.join(backupDir, entry.name));
    entries.push({ name: entry.name, mtimeMs });
  }

  const { remove } = planRotation(entries, {
    now: options.now,
    ...(options.keep === undefined ? {} : { keep: options.keep }),
  });
  for (const name of remove) {
    await fs.rm(path.join(backupDir, name), { force: true });
  }
  return remove;
}
