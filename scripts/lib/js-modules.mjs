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
const IGNORED_DIRECTORIES = new Set(["node_modules", ".git", "dist", ".codex_tmp"]);

export async function collectSourceFiles(rootDir, relativeRoots) {
  const files = [];
  for (const relativeRoot of relativeRoots) {
    await walk(path.join(rootDir, relativeRoot), files);
  }
  return files.sort();
}

async function walk(dir, files) {
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      await walk(path.join(dir, entry.name), files);
      continue;
    }
    if (entry.isFile() && SOURCE_EXTENSIONS.has(path.extname(entry.name))) {
      files.push(path.join(dir, entry.name));
    }
  }
}

/**
 * Locate top-level function declarations and their line ranges.
 *
 * @returns {{name: string, start: number, end: number, exported: boolean, lines: number}[]}
 *   `start`/`end` are 0-based line indexes, inclusive.
 */
export function findTopLevelFunctions(source) {
  const lines = source.split("\n");
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
 */
/**
 * What can precede a regex literal but never a division: an operator, an
 * opening bracket, a comma, `return`, or the start of the file.
 */
const REGEX_MAY_FOLLOW = /(^|[(,=:[!&|?{};+\-*%~^]|\breturn|\btypeof|\bcase|\bin|\bof)\s*$/;

export function blankCommentsAndStrings(source) {
  const out = source.split("");
  const blank = (from, to) => {
    for (let i = from; i < to && i < out.length; i += 1) {
      if (out[i] !== "\n" && out[i] !== "\r") out[i] = " ";
    }
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
      let cursor = index + 1;
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
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    const quote = source[index];
    if (quote === '"' || quote === "'" || quote === "`") {
      let cursor = index + 1;
      while (cursor < source.length) {
        if (source[cursor] === "\\") { cursor += 2; continue; }
        if (source[cursor] === quote) break;
        cursor += 1;
      }
      blank(index + 1, cursor);
      index = cursor + 1;
      continue;
    }
    index += 1;
  }
  return out.join("");
}
