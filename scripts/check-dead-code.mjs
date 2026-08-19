#!/usr/bin/env node
/**
 * Report top-level functions that nothing can reach.
 *
 * A function is reachable when it is exported, referenced at module scope, or
 * referenced (directly or transitively) by a reachable function. Cross-file
 * usage counts: a function exported from one module and imported by another is
 * a root everywhere.
 *
 * The budget in scripts/check-budgets.json is a ratchet — it may only go down.
 * Lower it whenever dead code is removed so it cannot creep back.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  collectSourceFiles,
  exportedNames,
  findTopLevelFunctions,
  importedNames,
  moduleScopeSource,
  referencedNames,
  relative,
} from "./lib/js-modules.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(await fs.readFile(path.join(rootDir, "scripts", "check-budgets.json"), "utf8"));

const files = await collectSourceFiles(rootDir, budgets.deadCode.roots);
const modules = [];
const importedAnywhere = new Set();

for (const file of files) {
  const source = await fs.readFile(file, "utf8");
  const functions = findTopLevelFunctions(source);
  const scope = moduleScopeSource(source, functions);
  const names = new Set(functions.map((fn) => fn.name));
  const exported = exportedNames(source);
  for (const name of importedNames(source)) importedAnywhere.add(name);
  modules.push({ file, source, functions, scope, names, exported });
}

const dead = [];
for (const module of modules) {
  const calls = new Map(
    module.functions.map((fn) => [
      fn.name,
      referencedNames(module.source.split("\n").slice(fn.start, fn.end + 1).join("\n"), module.names, fn.name),
    ]),
  );

  const roots = referencedNames(module.scope, module.names);
  for (const fn of module.functions) {
    if (fn.exported || module.exported.has(fn.name) || importedAnywhere.has(fn.name)) roots.add(fn.name);
  }

  const live = new Set();
  const stack = [...roots];
  while (stack.length) {
    const name = stack.pop();
    if (live.has(name)) continue;
    live.add(name);
    for (const callee of calls.get(name) ?? []) stack.push(callee);
  }

  for (const fn of module.functions) {
    if (!live.has(fn.name)) {
      dead.push({ file: relative(rootDir, module.file), ...fn });
    }
  }
}

const deadLines = dead.reduce((sum, fn) => sum + fn.lines, 0);
const budget = budgets.deadCode.maxFunctions;

if (dead.length) {
  console.log(`Unreachable top-level functions: ${dead.length} (${deadLines} lines)`);
  const byFile = new Map();
  for (const fn of dead) {
    if (!byFile.has(fn.file)) byFile.set(fn.file, []);
    byFile.get(fn.file).push(fn);
  }
  for (const [file, functions] of byFile) {
    console.log(`\n  ${file}`);
    for (const fn of functions) {
      console.log(`    ${fn.name} — line ${fn.start + 1}, ${fn.lines} lines`);
    }
  }
} else {
  console.log("Unreachable top-level functions: none");
}

console.log(`\nBudget: ${budget} (ratchet — lower it in scripts/check-budgets.json when you delete dead code)`);

if (dead.length > budget) {
  console.error(`\ncheck-dead-code FAILED: ${dead.length} unreachable functions exceeds the budget of ${budget}.`);
  process.exit(1);
}
if (dead.length < budget) {
  console.log(`Budget can be lowered to ${dead.length}.`);
}
