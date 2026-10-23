import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Shared helpers for the repository's static checks.
 *
 * These use deliberately simple heuristics rather than a real parser: every
 * source file in this project formats top-level declarations at column 0 and
 * closes them with a `}` at column 0, which is enough to locate them without
 * adding a parser dependency. `checkFormatting()` enforces that assumption so
 * the heuristic cannot silently start lying.
 */

const SOURCE_EXTENSIONS = new Set([".js", ".mjs"]);
/** What check-structure counts the lines of besides the modules; a stylesheet has no functions to measure. */
export const STYLESHEET_EXTENSIONS = new Set([".css"]);
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", ".codex_tmp"]);

/** The files under `relativeRoots` with one of `extensions` (the modules by default), sorted. */
export async function collectSourceFiles(rootDir, relativeRoots, extensions = SOURCE_EXTENSIONS) {
  const files = [];
  for (const relativeRoot of relativeRoots) {
    await walk(path.join(rootDir, relativeRoot), files, extensions);
  }
  return files.sort();
}

async function walk(dir, files, extensions) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), files, extensions);
      continue;
    }
    if (entry.isFile() && extensions.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
}

/** A path's budget in a map of check-budgets.json: its own entry, else its longest folder's, else `fallback`. */
export function budgetFor(map, relativePath, fallback) {
  const match = Object.keys(map)
    .filter((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? map[match] : fallback;
}

/**
 * The files longer than their budget in `budgets` (check-budgets.json): `maxFileLines` by path or folder, else
 * `defaultMaxFileLines`. A stylesheet is held to it as a module is.
 *
 * @param {{path: string, lines: number}[]} files  repository-relative paths and their line counts
 * @returns {string[]} one line per file over its budget, naming the file
 */
export function fileLineViolations(files, budgets) {
  const { maxFileLines = {}, defaultMaxFileLines } = budgets.structure;
  return files.flatMap(({ path: file, lines }) => {
    const budget = budgetFor(maxFileLines, file, defaultMaxFileLines);
    return lines > budget ? [`${file}: ${lines} lines exceeds the budget of ${budget}`] : [];
  });
}

/**
 * Locate top-level function declarations and their line ranges.
 *
 * @returns {{name: string, start: number, end: number, exported: boolean, lines: number}[]}
 *   `start`/`end` are 0-based line indexes, inclusive.
 */
export function findTopLevelFunctions(source) {
  const lines = source.split(/\r?\n/);
  const functions = [];
  for (let index = 0; index < lines.length; index += 1) {
    const match = lines[index].match(/^(export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_$]+)\s*\(/);
    if (!match) continue;
    let end = lines.length - 1;
    for (let scan = index + 1; scan < lines.length; scan += 1) {
      if (lines[scan] === "}") {
        end = scan;
        break;
      }
    }
    functions.push({
      name: match[2],
      exported: Boolean(match[1]),
      start: index,
      end,
      lines: end - index + 1,
    });
    index = end;
  }
  return functions;
}

/** Source with every top-level function body blanked out. */
export function moduleScopeSource(source, functions) {
  const lines = source.split("\n");
  for (const fn of functions) {
    for (let index = fn.start; index <= fn.end; index += 1) lines[index] = "";
  }
  return lines.join("\n");
}

export function referencedNames(text, candidateNames, self = null) {
  const found = new Set();
  for (const name of candidateNames) {
    if (name === self) continue;
    if (new RegExp(`\\b${name}\\b`).test(text)) found.add(name);
  }
  return found;
}

/** Names this module re-exports through `export { a, b }` statements. */
export function exportedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/)[0].trim();
      if (name) names.add(name);
    }
  }
  return names;
}

/** Names this module imports from elsewhere. */
export function importedNames(source) {
  const names = new Set();
  for (const match of source.matchAll(/import\s*\{([^}]*)\}\s*from/g)) {
    for (const part of match[1].split(",")) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (name) names.add(name);
    }
  }
  return names;
}

export function relative(rootDir, file) {
  return path.relative(rootDir, file).split(path.sep).join("/");
}

/**
 * Blank out comments and string literals, keeping every line and column.
 *
 * Analysis that works on raw source keeps finding code in prose: a comment
 * saying "the caller (see below)" reads as a call to `caller`, and a message in
 * a string reads as whatever it happens to contain. Replacing them with spaces
 * rather than deleting them means line and column numbers still point at the
 * right place in the real file.
 *
 * With `templateCode`, a template literal's `${…}` stays, nested ones too: it is
 * code (`${escapeHtml(name)}` uses `escapeHtml`), and only the text around it
 * is blanked. Without it the whole template goes, as check-references.mjs has
 * always read it.
 */
/**
 * What can precede a regex literal but never a division: an operator, an
 * opening bracket, a comma, `return`, or the start of the file.
 */
const REGEX_MAY_FOLLOW = /(^|[(,=:[!&|?{};+\-*%~^]|\breturn|\btypeof|\bcase|\bin|\bof)\s*$/;

export function blankCommentsAndStrings(source, { templateCode = false } = {}) {
  const out = source.split("");
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== "\n" && out[i] !== "\r") out[i] = " ";
    }
  };
  // For each `${` the scan is inside, how many of its own `{` are open.
  const holes = [];
  /** Blank a template's text up to its closing backtick or its next `${`; where the scan goes on. */
  const templateText = (from) => {
    let cursor = from;
    while (cursor < source.length && source[cursor] !== "`" && source.slice(cursor, cursor + 2) !== "${") {
      cursor += source[cursor] === "\\" ? 2 : 1;
    }
    blank(from, cursor);
    if (source[cursor] !== "$") return cursor + 1;
    holes.push(0);
    return cursor + 2;
  };
  let index = 0;
  while (index < source.length) {
    const two = source.slice(index, index + 2);
    if (two === "//") {
      const end = source.indexOf("\n", index);
      blank(index, end === -1 ? source.length : end);
      index = end === -1 ? source.length : end;
      continue;
    }
    if (two === "/*") {
      const end = source.indexOf("*/", index + 2);
      const stop = end === -1 ? source.length : end + 2;
      blank(index, stop);
      index = stop;
      continue;
    }
    // A regular expression literal has to be recognised before its contents
    // are read as anything else: /[&<>"']/ contains a quote, and treating that
    // quote as the start of a string swallows the code after it until the next
    // one. Which is exactly what happened — this blanker ate forty lines of
    // src/core/dom.mjs, and the check built on it then reported a variable
    // declared inside them as undefined.
    if (source[index] === "/" && REGEX_MAY_FOLLOW.test(source.slice(0, index))) {
      const cursor = regexEnd(source, index);
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    const character = source[index];
    if (character === "`" && templateCode) {
      index = templateText(index + 1);
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      const cursor = quoteEnd(source, index);
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    if (holes.length && character === "{") holes[holes.length - 1] += 1;
    if (holes.length && character === "}") {
      if (holes.at(-1) === 0) {
        holes.pop();
        index = templateText(index + 1);
        continue;
      }
      holes[holes.length - 1] -= 1;
    }
    index += 1;
  }
  return out.join("");
}

/** Where the regular expression literal opened at `start` ends: its closing `/`, or the end of its line. */
function regexEnd(source, start) {
  let cursor = start + 1;
  let inClass = false;
  while (cursor < source.length) {
    const character = source[cursor];
    if (character === "\\") { cursor += 2; continue; }
    if (character === "\n") break;
    if (character === "[") inClass = true;
    else if (character === "]") inClass = false;
    else if (character === "/" && !inClass) break;
    cursor += 1;
  }
  return cursor;
}

/** Where the string opened by the quote at `start` ends: its closing quote. */
function quoteEnd(source, start) {
  let cursor = start + 1;
  while (cursor < source.length && source[cursor] !== source[start]) cursor += source[cursor] === "\\" ? 2 : 1;
  return cursor;
}

/** An `import { … } from "…"` statement at the start of a line, after a default import or not. */
const NAMED_IMPORT = /^import\s+(?:[\w$]+\s*,\s*)?\{([^}]*)\}\s*from\s*(["'])[^"'\n]*\2\s*;?/gm;

/**
 * The names a module imports by name and never says again: what an edit
 * leaves behind when it takes out the last use of something and not its
 * import (stage 09b's fix wave, A7: `closedMarkup` in advance-sheet.mjs).
 * check-dead-code.mjs counts them.
 *
 * A use is the name in code: a call, an argument, a spread, a shorthand
 * property, a template's `${…}`. A comment, a plain string, the text of a
 * template and a property of something else (`row.name`) are not uses. A
 * default import (`import x from`) and a namespace (`import * as x`) are not
 * read.
 *
 * @returns {string[]} the local names (`b` of `a as b`), in the order imported
 */
export function unusedImports(source) {
  const code = blankCommentsAndStrings(source, { templateCode: true });
  const statements = [...code.matchAll(NAMED_IMPORT)];
  let rest = code;
  for (const { 0: text, index } of statements) {
    rest = rest.slice(0, index) + text.replace(/[^\n]/g, " ") + rest.slice(index + text.length);
  }
  const names = statements.flatMap((statement) => statement[1].split(",").map((part) => part.trim().split(/\s+as\s+/).pop().trim()));
  return names.filter((name) => name && !new RegExp(`(?<![\\w$])(?<![^.]\\.)${name.replaceAll("$", "\\$")}(?![\\w$])`).test(rest));
}
