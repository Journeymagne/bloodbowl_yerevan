import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { collectSourceFiles, fileLineViolations, STYLESHEET_EXTENSIONS } from "../scripts/lib/js-modules.mjs";

/*
 * npm run check's line budget (scripts/check-structure.mjs) counts the stylesheets under src as it counts the modules:
 * 600 lines unless check-budgets.json gives a file or its folder its own figure. A stylesheet has no functions, so only
 * its lines are counted. Stage 13 (Task 25) added them: builder.css had reached 705 lines with nothing to stop it.
 */
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const budgets = JSON.parse(readFileSync(path.join(rootDir, "scripts/check-budgets.json"), "utf8"));

test("a stylesheet over 600 lines fails the check", () => {
  assert.equal(budgets.structure.defaultMaxFileLines, 600);
  assert.deepEqual(fileLineViolations([{ path: "src/x.css", lines: 600 }], budgets), []);
  const over = fileLineViolations([{ path: "src/x.css", lines: 601 }], budgets);
  assert.equal(over.length, 1);
  assert.match(over[0], /^src\/x\.css: 601 lines exceeds the budget of 600$/);
});

test("a file's own budget, or its folder's, is taken before the default; one line per file over it", () => {
  const own = { structure: { defaultMaxFileLines: 600, maxFileLines: { "src/app.js": 110, "scripts/backup": 400 } } };
  const files = [
    { path: "src/app.js", lines: 110 },
    { path: "src/app.json", lines: 600 },
    { path: "scripts/backup/status.mjs", lines: 400 },
    { path: "scripts/backup.css", lines: 600 },
  ];
  assert.deepEqual(fileLineViolations(files, own), []);
  const grown = files.map((file) => ({ ...file, lines: file.lines + 1 }));
  assert.deepEqual(fileLineViolations(grown, own), [
    "src/app.js: 111 lines exceeds the budget of 110",
    "src/app.json: 601 lines exceeds the budget of 600",
    "scripts/backup/status.mjs: 401 lines exceeds the budget of 400",
    "scripts/backup.css: 601 lines exceeds the budget of 600",
  ]);
});

test("npm run check counts every stylesheet under src, and each is within its budget", async () => {
  const sheets = await collectSourceFiles(rootDir, ["src"], STYLESHEET_EXTENSIONS);
  assert.ok(sheets.length > 75 && sheets.every((file) => file.endsWith(".css")));
  assert.deepEqual(budgets.structure.stylesheetRoots, ["src"]);
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/check-structure.mjs"], { cwd: rootDir });
  assert.match(stdout, new RegExp(`^Checked \\d+ source files and ${sheets.length} stylesheets\\.$`, "m"));
  assert.match(stdout, /^check-structure passed\.$/m);
});
