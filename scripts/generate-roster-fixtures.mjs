#!/usr/bin/env node
/**
 * Regenerate test/fixtures/roster-cases.json.
 *
 * The fixtures pin what the roster domain currently computes: costs, migration
 * of the two legacy roster shapes, SPP, advancements and staff purchases. They
 * were first generated from the pre-refactor implementation in src/app.js and
 * verified to match it exactly on all 37 teams, so they are a behavioural
 * baseline, not just a snapshot of whatever the code happens to do today.
 *
 * Only run this when you have *deliberately* changed the rules, and review the
 * diff line by line:
 *
 *   node scripts/generate-roster-fixtures.mjs
 *   git diff test/fixtures/roster-cases.json
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildRosterCases } from "../test/helpers/roster-cases.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataPath = path.join(rootDir, "public", "data.json");
const outPath = path.join(rootDir, "test", "fixtures", "roster-cases.json");

const data = expandCollections(JSON.parse(await fs.readFile(dataPath, "utf8")));
const cases = buildRosterCases(data.teams);

await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, `${JSON.stringify(cases, null, 2)}\n`, "utf8");
console.log(`Wrote ${cases.length} roster cases to ${path.relative(rootDir, outPath)}`);
