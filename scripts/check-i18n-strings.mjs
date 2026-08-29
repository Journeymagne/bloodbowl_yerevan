/**
 * Find English that reached the page without passing through `t()`.
 *
 * Step 13.5. CLAUDE.md's first rule is that every UI string goes through the
 * translation helper, and the reason it needs a rule is that breaking it costs
 * nothing visible: the app still runs, in English, and only the half of the
 * league reading Russian ever finds out. Screen-reader labels are worse again
 * — nobody sees those at all.
 *
 * The check is deliberately narrow, because a broad one is worse than none: an
 * earlier attempt at "is this string translated" produced thirty false
 * positives and would have been switched off within a week. This looks at two
 * places only, both of which are markup a person reads:
 *
 *   1. text between tags in a template literal, `>Save changes<`
 *   2. the four attributes that speak: title, placeholder, aria-label, alt
 *
 * Terms the glossary keeps in English (docs/i18n-glossary.md) are allowed, as
 * is anything that is plainly not prose — a number, a class name, an operator
 * that happens to sit next to a `>`.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Names that stay in English in both locales, per docs/i18n-glossary.md.
 * A string made only of these is not an untranslated string.
 */
const ENGLISH_BY_CONVENTION = new Set([
  "spp", "ma", "st", "ag", "pa", "av", "ar", "td",
  "star", "player", "players", "skills", "traits", "inducements",
  "apothecary", "mortuary", "assistant", "plague", "doctor",
  "cheerleaders", "coaches", "blood", "bowl", "gata", "league",
  "nuffle", "team", "value", "fan", "factor",
]);

/** Text that is not prose: numbers, punctuation, a lone lowercase token. */
function isNotProse(text) {
  if (!/[A-Za-z]{3}/.test(text)) return true;
  if (/^[a-z][a-z-]*$/.test(text)) return true;
  // A `>` inside an expression, not a tag: `mod > 0 ? "up" : "down"`.
  if (/[?:]|&&|\|\||=>/.test(text)) return true;
  return false;
}

function isEnglishByConvention(text) {
  const words = text.toLowerCase().match(/[a-z]+/g) ?? [];
  return words.length > 0 && words.every((word) => ENGLISH_BY_CONVENTION.has(word));
}

async function jsFiles(dir) {
  const found = [];
  for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...(await jsFiles(full)));
    else if (/\.(mjs|js)$/.test(entry.name)) found.push(full);
  }
  return found;
}

/** @returns {string[]} one line per string that should have been translated */
export async function untranslatedStrings(dir) {
  const problems = [];
  for (const file of await jsFiles(dir)) {
    const source = await fs.readFile(file, "utf8");
    const where = path.relative(rootDir, file).split(path.sep).join("/");

    for (const [index, line] of source.split(/\r?\n/).entries()) {
      const report = (text, kind) => {
        if (isNotProse(text) || isEnglishByConvention(text)) return;
        problems.push(`${where}:${index + 1}: ${kind} "${text}"`);
      };
      for (const match of line.matchAll(/>([^<>{}$`]{2,60})</g)) report(match[1].trim(), "text");
      for (const match of line.matchAll(/\b(title|placeholder|aria-label|alt)="([^"`]{2,80})"/g)) {
        // An attribute built from an expression is fine as long as the English
        // words in it come from t(); one that mixes literal words with an
        // interpolation is exactly the case this is here to catch.
        const value = match[2];
        if (value.includes("t(")) continue;
        report(value.replace(/\$\{[^}]*\}/g, " ").trim(), `${match[1]}=`);
      }
    }
  }
  return problems;
}

const problems = await untranslatedStrings(path.join(rootDir, "src"));
if (problems.length) {
  console.error(`check-i18n-strings FAILED with ${problems.length} string(s) that never reach t():`);
  for (const problem of problems) console.error(`  - ${problem}`);
  console.error("\nAdd the key to src/i18n/en.json and src/i18n/ru.json, then render it with t().");
  process.exit(1);
}
console.log("check-i18n-strings passed: every string a reader sees goes through t().");
