/**
 * What a build no longer writes leaves the built folder (stage 13; 09c's hand-off «очистка dist/ при сборке»).
 *
 * scripts/build-site.mjs copies src/, public/ and assets/ over whatever dist/ already holds, and the server serves dist/
 * whenever dist/index.html is there: a module, a stylesheet, a font or an image deleted from the repository would stay
 * on the server for good. The build therefore names every file it wrote, and once it is done everything else under
 * dist/ goes, with the folders left empty. Nothing is removed before the new files are in place, so a deploy that
 * rebuilds while the old server still runs answers no 404 for a file both versions have.
 */
import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Remove every file under `dir` that is not in `kept`, then every folder left empty (never `dir` itself).
 * @param {string} dir the built folder
 * @param {Set<string>} kept the absolute paths the build wrote
 * @returns {Promise<string[]>} the removed files, relative to `dir` with "/" between folders, sorted
 */
export async function pruneStale(dir, kept) {
  const removed = [];
  async function walk(folder) {
    let empty = true;
    for (const entry of await fs.readdir(folder, { withFileTypes: true })) {
      const full = path.join(folder, entry.name);
      if (entry.isDirectory()) {
        if (await walk(full)) await fs.rmdir(full);
        else empty = false;
      } else if (kept.has(full)) {
        empty = false;
      } else {
        await fs.rm(full, { force: true });
        removed.push(path.relative(dir, full).split(path.sep).join("/"));
      }
    }
    return empty;
  }
  await walk(dir);
  return removed.sort();
}
