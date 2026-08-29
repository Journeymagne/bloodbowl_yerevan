/**
 * Write a generated data file, and the compressed copies the server hands out.
 *
 * The server used to brotli the same 0.6 MB again for every visitor,
 * synchronously, on the one thread it has. Compressing once at build time
 * costs a second here and nothing afterwards. Step 17.1.
 *
 * Written together with the source, so a compressed copy cannot describe an
 * older file. The server checks the timestamps anyway and falls back to
 * compressing on the spot if they disagree.
 */
import { promises as fs } from "node:fs";
import { brotliCompressSync, constants as zlibConstants, gzipSync } from "node:zlib";

/**
 * @param {string} file absolute path of the file to write
 * @param {string} json its contents
 */
export async function writeDataFile(file, json) {
  await fs.writeFile(file, json, "utf8");
  const raw = Buffer.from(json, "utf8");
  await Promise.all([
    fs.writeFile(`${file}.br`, brotliCompressSync(raw, {
      params: { [zlibConstants.BROTLI_PARAM_QUALITY]: 11 },
    })),
    fs.writeFile(`${file}.gz`, gzipSync(raw, { level: 9 })),
  ]);
}
