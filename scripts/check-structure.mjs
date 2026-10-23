#!/usr/bin/env node
/**
 * Structural guard rails for the refactor.
 *
 * 1. No source file longer than the per-path budget: the modules under the
 *    structure roots, and the stylesheets under its stylesheet roots (a
 *    stylesheet is counted by its lines only; it has no functions).
 * 2. No top-level function longer than the budget.
 * 3. Nothing under src/domain/ may touch the DOM, storage, network or globals —
 *    the domain layer has to stay pure so the server can reuse it and tests can
 *    run it in Node.
 *
 * Budgets live in scripts/check-budgets.json and are ratchets: lower them as
 * the refactor progresses, never raise them. A file's own budget above what it
 * measures is printed as a note.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  budgetFor,
  collectSourceFiles,
  fileLineViolations,
  findTopLevelFunctions,
  relative,
  STYLESHEET_EXTENSIONS,
} from "./lib/js-modules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(await fs.readFile(path.join(rootDir, "scripts", "check-budgets.json"), "utf8"));

const BROWSER_GLOBALS = [
  "document",
  "window",
  "localStorage",
  "sessionStorage",
  "navigator",
  "fetch",
  "alert",
  "confirm",
  "location",
];

const failures = [];
const notes = [];
const counted = [];

const files = await collectSourceFiles(rootDir, budgets.structure.roots);
const stylesheets = await collectSourceFiles(rootDir, budgets.structure.stylesheetRoots, STYLESHEET_EXTENSIONS);

for (const file of files) {
  const relativePath = relative(rootDir, file);
  const source = await fs.readFile(file, "utf8");
  const lines = source.split("\n");
  counted.push({ path: relativePath, lines: lines.length });

  const functionBudget = budgetFor(
    budgets.structure.maxFunctionLines,
    relativePath,
    budgets.structure.defaultMaxFunctionLines,
  );
  const functions = findTopLevelFunctions(source);
  for (const fn of functions) {
    if (fn.lines > functionBudget) {
      failures.push(`${relativePath}:${fn.start + 1} ${fn.name}(): ${fn.lines} lines exceeds the budget of ${functionBudget}`);
    }
  }
  const ownFunctionBudget = budgets.structure.maxFunctionLines[relativePath];
  const longest = Math.max(0, ...functions.map((fn) => fn.lines));
  if (ownFunctionBudget && longest < ownFunctionBudget) {
    notes.push(`${relativePath}: longest function ${longest} lines — budget ${ownFunctionBudget} can be lowered`);
  }

  if (relativePath.startsWith("src/domain/")) {
    for (const global of BROWSER_GLOBALS) {
      const pattern = new RegExp(`(?<![.\\w])${global}\\b`);
      for (const [index, line] of lines.entries()) {
        if (line.trimStart().startsWith("//") || line.trimStart().startsWith("*")) continue;
        if (pattern.test(line)) {
          failures.push(`${relativePath}:${index + 1}: domain code must stay pure, found "${global}"`);
          break;
        }
      }
    }
  }
}

for (const file of stylesheets) {
  counted.push({ path: relative(rootDir, file), lines: (await fs.readFile(file, "utf8")).split("\n").length });
}

failures.push(...fileLineViolations(counted, budgets));
for (const { path: relativePath, lines } of counted) {
  const ownBudget = budgets.structure.maxFileLines[relativePath];
  if (ownBudget && lines < ownBudget) notes.push(`${relativePath}: ${lines} lines — budget ${ownBudget} can be lowered`);
}

console.log(`Checked ${files.length} source files and ${stylesheets.length} stylesheets.`);
for (const note of notes) console.log(`  note: ${note}`);

if (failures.length) {
  console.error(`\ncheck-structure FAILED with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("check-structure passed.");
