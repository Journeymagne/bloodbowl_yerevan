import assert from "node:assert/strict";
import test from "node:test";

import { seasonPoints, technicalPoints, TECHNICAL_REASONS } from "../src/domain/league-rules.mjs";

test("a technical win when the opponent could not field a team is 4, any other technical win 2, the loser 0", () => {
  assert.equal(technicalPoints({ won: true, reason: "no_team" }), 4);
  assert.equal(technicalPoints({ won: true, reason: "other" }), 2);
  assert.equal(technicalPoints({ won: false, reason: "no_team" }), 0);
  assert.deepEqual(TECHNICAL_REASONS, ["no_team", "other"]);
  assert.deepEqual([seasonPoints.technicalWin, seasonPoints.noTeamBonus], [2, 2], "content: «2 points for a technical win», «+2 points if the opponent could not field a team»");
});
