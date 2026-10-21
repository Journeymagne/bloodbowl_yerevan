import { promises as fs } from "node:fs";
import path from "node:path";

const IMPORT = /@import url\("([^"]+)"\);/g;
const COMMENT = /\/\*[\s\S]*?\*\//g;

/**
 * Fold a stylesheet's @import lines into one stylesheet.
 *
 * The source is many files so a person can find things in it; the site should
 * still fetch one. Inlining also keeps the parts covered by the version on the
 * index's link - an @import would ask for styles/roster.css with no ?v= on it
 * and get a day-old copy after a deploy.
 *
 * scripts/build-site.mjs writes this, minified, to dist/src/styles.css, and
 * test/minify-css.test.mjs minifies the same, so the test reads the bundle the
 * site serves rather than a copy of the fold that could drift from it.
 *
 * Only the entry's own `@import url("…");` lines are folded, in their order,
 * each sheet whole and resolved beside the entry. Whatever else the entry held
 * would be lost from the bundle, so a rule or an import in another form there
 * throws, and so does an @import inside a sheet: dist would ask for it at a
 * path relative to one file it no longer has. An entry with no import comes
 * back as written.
 */
export async function inlineCssImports(file) {
  const source = await fs.readFile(file, "utf8");
  const sheets = [...source.matchAll(IMPORT)].map((match) => match[1]);
  if (!sheets.length) return source;
  const rest = source.replace(COMMENT, "").replace(IMPORT, "").trim();
  if (rest) {
    throw new Error(`inline-css: ${file} holds more than its @import url("…"); lines, and the rest would not reach the bundle: ${rest.slice(0, 80)}`);
  }
  const parts = [];
  for (const sheet of sheets) {
    const text = await fs.readFile(path.join(path.dirname(file), sheet), "utf8");
    if (/@import\b/.test(text.replace(COMMENT, ""))) {
      throw new Error(`inline-css: ${sheet} has an @import of its own; only ${path.basename(file)}'s are inlined`);
    }
    parts.push(text);
  }
  return parts.join("\n");
}
