import assert from "node:assert/strict";
import test from "node:test";

import { seasonPoints, technicalPoints, TECHNICAL_REASONS } from "../src/domain/league-rules.mjs";
import { postPoints } from "../src/domain/post-match/score.mjs";
import { scoreLeagueResult } from "../server/season/scoring.mjs";
import { act, begin } from "./helpers/post-cases.mjs";

const SIDES = ["home", "away"];
const other = (name) => (name === "home" ? "away" : "home");

/** A technical result `winner` won, sent by home with `reason` and agreed by away: the post-match's way. */
const agreedTechnical = (winner, reason) =>
  act(act(begin(), "home", { type: "result", mode: "technical", winner, reason }), "away", { type: "agree-result" });

test("a technical win when the opponent could not field a team is 4, any other technical win 2, the loser 0", () => {
  assert.equal(technicalPoints({ won: true, reason: "no_team" }), 4);
  assert.equal(technicalPoints({ won: true, reason: "other" }), 2);
  assert.equal(technicalPoints({ won: false, reason: "no_team" }), 0);
  assert.deepEqual(TECHNICAL_REASONS, ["no_team", "other"]);
  assert.deepEqual([seasonPoints.technicalWin, seasonPoints.noTeamBonus], [2, 2], "content: «2 points for a technical win», «+2 points if the opponent could not field a team»");
});

test("a technical win when the opponent could not field a team is 4, any other technical win 2, the loser 0 — the same in the post-match and in the admin's result", () => {
  for (const reason of TECHNICAL_REASONS) {
    for (const winner of SIDES) {
      const label = `${reason}, ${winner} won`, loser = other(winner), won = reason === "no_team" ? 4 : 2;
      const post = agreedTechnical(winner, reason);
      const admin = scoreLeagueResult({ resultType: "technical", winner, technicalReason: reason });
      assert.deepEqual([postPoints(post, winner, "league").total, postPoints(post, loser, "league").total], [won, 0], `the post-match: ${label}`);
      assert.deepEqual([admin[`${winner}Points`], admin[`${loser}Points`]], [won, 0], `the admin's result: ${label}`);
      assert.deepEqual(SIDES.map((name) => [post.result[name].touchdowns, post.result[name].casualties]),
        SIDES.map((name) => [admin[`${name}Touchdowns`], admin[`${name}Casualties`]]), `the same 2–0, CAS 0–0: ${label}`);
      assert.deepEqual([admin[`${winner}Touchdowns`], admin[`${loser}Touchdowns`]], [2, 0]);
      assert.deepEqual([admin.resultType, admin.technicalReason, post.result.reason], ["technical", reason, reason]);
    }
  }
  const friendly = scoreLeagueResult({ resultType: "technical", winner: "away", technicalReason: "no_team", kind: "friendly" });
  assert.deepEqual([friendly.homePoints, friendly.awayPoints, friendly.awayTouchdowns, friendly.technicalReason], [0, 0, 2, "no_team"], "a friendly gives no points");
});

test("the admin's played result is the table's points as before, and carries no reason", () => {
  const played = scoreLeagueResult({ homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 3, awayCasualties: 1 });
  assert.deepEqual(played, { homePoints: 6, awayPoints: 0, homeTouchdowns: 3, awayTouchdowns: 0, homeCasualties: 3, awayCasualties: 1,
    resultType: "played", technicalReason: null });
  const open = scoreLeagueResult({ homeTouchdowns: 1, awayTouchdowns: null, homeCasualties: 0, awayCasualties: 0 });
  assert.deepEqual([open.homePoints, open.awayPoints, open.resultType, open.technicalReason], [null, null, "played", null], "no score yet, no points");
});
