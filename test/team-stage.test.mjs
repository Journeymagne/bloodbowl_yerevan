import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { TEAM_STAGES, canBuy, stageViolations } from "../src/domain/roster/stage.mjs";

test("Starting rerolls are bought only in draft, Team rerolls only once active, everything else in both", () => {
  assert.equal(canBuy("draft", "startingRerolls"), true);
  assert.equal(canBuy("draft", "teamRerolls"), false);
  assert.equal(canBuy("active", "teamRerolls"), true);
  assert.equal(canBuy("active", "startingRerolls"), false);
  for (const stage of TEAM_STAGES) {
    for (const key of ["bribes", "assistantCoaches", "cheerleaders", "apothecary", "dedicatedFans"]) assert.equal(canBuy(stage, key), true);
  }
});

test("a stage the domain does not know buys neither kind of reroll", () => {
  assert.equal(canBuy("archived", "startingRerolls"), false);
  assert.equal(canBuy("archived", "teamRerolls"), false);
  assert.equal(canBuy(undefined, "bribes"), true);
});

test("growth of a locked counter is a violation; a fall, or growth the stage allows, is not", () => {
  assert.deepEqual(stageViolations({ startingRerolls: 1 }, { startingRerolls: 2 }, "active"),
    [{ code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" } }]);
  assert.deepEqual(stageViolations({ teamRerolls: 0 }, { teamRerolls: 1 }, "draft"),
    [{ code: "STAGE_PURCHASE_LOCKED", params: { key: "teamRerolls", stage: "draft" } }]);
  assert.deepEqual(stageViolations({ startingRerolls: 2 }, { startingRerolls: 1 }, "active"), []);
  assert.deepEqual(stageViolations({ teamRerolls: 1 }, { teamRerolls: 3 }, "active"), []);
  assert.deepEqual(stageViolations({ startingRerolls: 0 }, { startingRerolls: 3 }, "draft"), []);
});

test("a roster stored before startingRerolls had that name is compared under its old key", () => {
  assert.deepEqual(stageViolations({ rerolls: 2 }, { startingRerolls: 2 }, "active"), []);
  assert.equal(stageViolations({ rerolls: 2 }, { startingRerolls: 3 }, "active").length, 1);
});

test("the stages are the ones migration 009 allows", () => {
  const sql = readFileSync(new URL("../server/db/migrations/009_team_stage.sql", import.meta.url), "utf8");
  const allowed = sql.match(/CHECK \(stage IN \(([^)]*)\)\)/)[1].split(",").map((value) => value.trim().replace(/'/g, ""));
  assert.deepEqual(allowed, [...TEAM_STAGES]);
});
