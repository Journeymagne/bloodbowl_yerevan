import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { assertDataIsUsable, dataProblems } from "../scripts/lib/validate-data.mjs";

const rootDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const team = (id, overrides = {}) => ({
  id,
  title: id,
  kind: "team",
  team: {
    meta: { rerolls: "60K", league: "Tier 1", apothecary: "Available", apothecaryAccess: ["apothecary"] },
    roster: [{ position: "Lineman", price: "50K", qty: "0-16" }],
    ...overrides,
  },
});

test("usable data has nothing to report", () => {
  assert.deepEqual(dataProblems({ pages: [team("teams/amazon")] }, "en"), []);
});

test("a team with no roster is reported", () => {
  const problems = dataProblems({ pages: [team("teams/amazon", { roster: [] })] }, "en");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /teams\/amazon has no roster rows/);
});

test("a position with no price is reported, by row", () => {
  const broken = team("teams/orc", { roster: [{ position: "Lineman", qty: "0-16" }, { price: "80K", qty: "0-4" }] });
  const problems = dataProblems({ pages: [broken] }, "ru");
  assert.equal(problems.length, 2);
  assert.match(problems[0], /ru: teams\/orc roster row 1 \(Lineman\) has no price/);
  assert.match(problems[1], /roster row 2 has no position/);
});

test("missing medical access tokens are reported — the rules read those", () => {
  const broken = team("teams/khorne");
  delete broken.team.meta.apothecaryAccess;
  const problems = dataProblems({ pages: [broken] }, "ru");
  assert.equal(problems.length, 1);
  assert.match(problems[0], /has no medical access tokens/);
});

test("a duplicate identifier is reported once", () => {
  const problems = dataProblems({ pages: [team("teams/orc"), team("teams/orc")] }, "en");
  assert.deepEqual(problems, ["en: teams/orc appears twice"]);
});

test("the build stops, and says everything at once", () => {
  const data = { pages: [team("teams/a", { roster: [] }), team("teams/b", { roster: [] })] };
  assert.throws(() => assertDataIsUsable(data, "en"), (error) => {
    assert.match(error.message, /teams\/a has no roster rows/);
    assert.match(error.message, /teams\/b has no roster rows/);
    return true;
  });
});

test("the data this repository ships passes", async () => {
  for (const locale of ["en", "ru"]) {
    const file = path.join(rootDir, "public", `data.${locale}.json`);
    const data = JSON.parse(await fs.readFile(file, "utf8"));
    assert.deepEqual(dataProblems(data, locale), [], `${file} must be usable`);
  }
});
