#!/usr/bin/env node
/**
 * Structural guard rails for the refactor.
 *
 * 1. No source file longer than the per-path budget.
 * 2. No top-level function longer than the budget.
 * 3. Nothing under src/domain/ may touch the DOM, storage, network or globals —
 *    the domain layer has to stay pure so the server can reuse it and tests can
 *    run it in Node.
 *
 * Budgets live in scripts/check-budgets.json and are ratchets: lower them as
 * the refactor progresses, never raise them.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { collectSourceFiles, findTopLevelFunctions, relative } from "./lib/js-modules.mjs";

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

function budgetFor(map, relativePath, fallback) {
  const match = Object.keys(map)
    .filter((prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`))
    .sort((a, b) => b.length - a.length)[0];
  return match ? map[match] : fallback;
}

const files = await collectSourceFiles(rootDir, budgets.structure.roots);

for (const file of files) {
  const relativePath = relative(rootDir, file);
  const source = await fs.readFile(file, "utf8");
  const lines = source.split("\n");

  const fileBudget = budgetFor(budgets.structure.maxFileLines, relativePath, budgets.structure.defaultMaxFileLines);
  if (lines.length > fileBudget) {
    failures.push(`${relativePath}: ${lines.length} lines exceeds the budget of ${fileBudget}`);
  } else if (lines.length < fileBudget && budgets.structure.maxFileLines[relativePath]) {
    notes.push(`${relativePath}: ${lines.length} lines — budget ${fileBudget} can be lowered`);
  }

  const functionBudget = budgetFor(
    budgets.structure.maxFunctionLines,
    relativePath,
    budgets.structure.defaultMaxFunctionLines,
  );
  for (const fn of findTopLevelFunctions(source)) {
    if (fn.lines > functionBudget) {
      failures.push(`${relativePath}:${fn.start + 1} ${fn.name}(): ${fn.lines} lines exceeds the budget of ${functionBudget}`);
    }
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

console.log(`Checked ${files.length} source files.`);
for (const note of notes) console.log(`  note: ${note}`);

if (failures.length) {
  console.error(`\ncheck-structure FAILED with ${failures.length} issue(s):`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}

console.log("check-structure passed.");
