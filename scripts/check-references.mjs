#!/usr/bin/env node
/**
 * Report a use of something that lives in another module and was not imported.
 *
 * `check-dead-code.mjs` walks reachability, so it finds code nothing calls. It
 * cannot find the opposite — a use of something that is not there — because an
 * unreachable name and an undefined one look identical to it. That gap kept
 * biting, always the same way: something moves to another module and a caller,
 * or one of its own references, is left behind.
 *
 * - task 6.7: `renderSeasonAdmin` called `availableSeasonSavedTeams`, which had
 *   stayed in registration.mjs unexported. Found by opening the page.
 * - step 4.9, four times in one afternoon: `publicSeasonEntry` in scoring.mjs,
 *   `bearerToken` in the logout route, `computeSeasonStandings` in rounds.mjs,
 *   `validateSeasonEntry` in games.mjs. Each found by booting the server and
 *   happening to hit the endpoint that ran it.
 * - and one this check found rather than a boot: step 3.2 took
 *   `makeRosterPlayerId` out of players.mjs' imports while `normalizeRosterPlayer`
 *   still called it — for players saved before ids existed, which no fixture has
 *   and no browser pass went near. It would have thrown on somebody's oldest
 *   team and nowhere else.
 *
 * A browser or a boot finds these, on the one path that runs them. A test suite
 * that never loads the module does not, and neither did `npm run check`.
 *
 * **Scope, deliberately narrow.** It reports a bare use of a name — `name(`,
 * `.map(name)`, `= name` — where that name is exported by some *other* file in
 * the project, is not imported here, and is not declared here. That is exactly
 * the mistake above and almost nothing else: a local parameter or an object
 * method is not a project export, so it cannot trigger this.
 *
 * A general "is this name defined" check needs a parser. The version of it
 * written with regular expressions produced thirty false positives, which is a
 * check people switch off, which finds nothing at all.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  blankCommentsAndStrings,
  collectSourceFiles,
  exportedNames,
  importedNames,
  relative,
} from "./lib/js-modules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(await fs.readFile(path.join(rootDir, "scripts", "check-budgets.json"), "utf8"));

/** Names this file declares itself, at any depth — enough to not report its own. */
function declaredNames(source) {
  const names = new Set();
  const patterns = [
    /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)/g,
    /(?:^|\s)(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g,
    /(?:^|\s)(?:export\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) names.add(match[1]);
  }
  // Parameters and destructured bindings. A parameter named the same as some
  // module's export is common — `relative(rootDir, file)` is one — and reporting
  // it would be pure noise.
  const bindings = [
    /\{([^{}]*)\}/g,
    /function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g,
    /\(([^()]*)\)\s*=>/g,
    /(?:^|\s)(?:export\s+)?(?:async\s+)?function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g,
  ];
  for (const pattern of bindings) {
    for (const match of source.matchAll(pattern)) {
      for (const part of (match[1] ?? "").split(",")) {
        const name = part.trim().split(/[:=\s]/)[0].replace(/^\.\.\./, "");
        if (/^[A-Za-z_$][\w$]*$/.test(name)) names.add(name);
      }
    }
  }
  return names;
}

/**
 * Everything a module exports.
 *
 * exportedNames() in the shared helper only reads `export { a, b }` blocks,
 * which is all its own caller ever needed. Declarations carry most of the
 * exports here, so they are collected too — and from blanked source, or the
 * example inside that helper's own doc comment reads as a real export.
 */
function exportedDeclarations(source) {
  const names = new Set(exportedNames(source));
  const pattern = /(?:^|\s)export\s+(?:default\s+)?(?:async\s+)?(?:function\s*\*?|const|let|var|class)\s+([A-Za-z_$][\w$]*)/g;
  for (const match of source.matchAll(pattern)) names.add(match[1]);
  // `export { default as X }` is a re-export, not a name anything can call.
  names.delete("default");
  return names;
}

/**
 * Bare uses of a name: `name(`, but also `.map(name)` and `x = name`.
 *
 * Calls alone are not enough — the fifth instance of this bug was
 * `rows.map(publicUser)`, a reference with no parentheses of its own, and a
 * call-only check walked straight past it.
 *
 * Never `object.name`, and never `name:` — a property and an object key say
 * nothing about what is in scope. Skipping the key form also skips the middle
 * of a ternary, which is a missed report rather than a false one.
 */
function usedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)(?!\s*:)/g)) names.add(match[2]);
  return names;
}

const files = await collectSourceFiles(rootDir, budgets.deadCode.roots);
const modules = [];
/** @type {Map<string, string[]>} exported name → the files that export it */
const exportedBy = new Map();

for (const file of files) {
  const raw = await fs.readFile(file, "utf8");
  // Prose reads as code otherwise: "the caller (see below)" is a call to caller().
  const source = blankCommentsAndStrings(raw);
  const exported = exportedDeclarations(source);
  modules.push({ file, source, raw, exported });
  for (const name of exported) {
    if (!exportedBy.has(name)) exportedBy.set(name, []);
    exportedBy.get(name).push(relative(rootDir, file));
  }
}

const problems = [];
for (const { file, source, raw, exported } of modules) {
  const here = relative(rootDir, file);
  const declared = declaredNames(source);
  const imported = importedNames(raw);
  for (const name of usedNames(source)) {
    if (declared.has(name) || imported.has(name) || exported.has(name)) continue;
    const homes = (exportedBy.get(name) ?? []).filter((where) => where !== here);
    if (!homes.length) continue;
    const at = source.search(new RegExp(`(^|[^.\\w$])${name}\\s*\\(`));
    const line = source.slice(0, at).split("\n").length;
    problems.push(`${here}:${line} uses ${name}, which is exported by ${homes.join(", ")} but not imported here`);
  }
}

if (problems.length) {
  console.error(`check-references FAILED with ${problems.length} issue(s):`);
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}

console.log(`check-references passed: ${files.length} files, no call reaches across a missing import.`);
