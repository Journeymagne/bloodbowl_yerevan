import test from "node:test";
import assert from "node:assert/strict";
import { checkChallengeAction, challengeId } from "../server/friendly/challenges.mjs";
import { scoreLeagueResult, computeSeasonStandings } from "../server/season/scoring.mjs";
import { ensurePlayerCanSubmitGame } from "../server/season/games.mjs";
import { checkPreparationWrite } from "../server/season/preparation-store.mjs";
import { publicGame } from "../server/api/serializers.mjs";

const invitation = { sender_id: "sender", recipient_id: "recipient", status: "pending", pairing_id: null };

test("only the recipient accepts or declines; only the sender cancels", () => {
  assert.equal(checkChallengeAction(invitation, "recipient", "accept"), null);
  assert.equal(checkChallengeAction(invitation, "recipient", "decline"), null);
  assert.equal(checkChallengeAction(invitation, "sender", "cancel"), null);
  for (const [user, action] of [["sender", "accept"], ["sender", "decline"], ["recipient", "cancel"], ["stranger", "accept"]]) {
    assert.throws(() => checkChallengeAction(invitation, user, action), { code: "CHALLENGE_NOT_YOURS" });
  }
});

test("repeat acceptance returns the existing pairing and closed challenges cannot change", () => {
  const accepted = { ...invitation, status: "accepted", pairing_id: "pairing" };
  assert.equal(checkChallengeAction(accepted, "recipient", "accept"), "pairing");
  assert.throws(() => checkChallengeAction(accepted, "sender", "accept"), { code: "CHALLENGE_NOT_YOURS" });
  for (const status of ["declined", "cancelled"]) assert.throws(() => checkChallengeAction({ ...invitation, status }, "recipient", "accept"), { code: "CHALLENGE_CLOSED" });
});

test("missing or malformed selections are refused before a database UUID cast", () => {
  assert.throws(() => challengeId("not-an-id"), { code: "CHALLENGE_SELECTION_REQUIRED" });
  assert.throws(() => challengeId(null), { code: "CHALLENGE_SELECTION_REQUIRED" });
  assert.equal(challengeId("aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa"), "aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa");
});

test("friendly results keep scores and casualties but never award LP, including bonuses", () => {
  for (const [home, away] of [[4, 0], [1, 1], [0, 4]]) {
    const result = scoreLeagueResult({ homeTouchdowns: home, awayTouchdowns: away, homeCasualties: 3, awayCasualties: 5, kind: "friendly" });
    assert.equal(result.homePoints, 0); assert.equal(result.awayPoints, 0);
    assert.equal(result.homeTouchdowns, home); assert.equal(result.awayCasualties, 5);
  }
  assert.notEqual(scoreLeagueResult({ homeTouchdowns: 4, awayTouchdowns: 0, homeCasualties: 3, awayCasualties: 0 }).homePoints, 0);
});

test("a friendly pairing does not enter season standings or tiebreak statistics", () => {
  const entry = { id: "entry", user_id: "sender", user_login: "Sender", saved_team_id: "team", team_name: "Team" };
  const rows = computeSeasonStandings([entry], [{ match_kind: "friendly", round_status: "started", home_entry_id: "entry", away_entry_id: null, home_points: 6, home_touchdowns: 4 }]);
  assert.equal(rows[0].points, 0); assert.equal(rows[0].games, 0); assert.equal(rows[0].touchdowns, 0);
});

test("friendly preparation and result submission work independently of the current league round", () => {
  const fixture = { match_kind: "friendly", home_user_id: "sender", away_user_id: "recipient", round_status: "started", round_number: null, current_round: null, result_status: "pending" };
  assert.doesNotThrow(() => ensurePlayerCanSubmitGame(fixture));
  assert.equal(checkPreparationWrite(fixture, { revision: 1 }, { revision: 1 }, { id: "sender" }), "home");
  assert.throws(() => checkPreparationWrite(fixture, { revision: 1 }, { revision: 1, side: "away" }, { id: "sender" }), { code: "FIXTURE_NOT_YOURS" });
  assert.throws(() => checkPreparationWrite({ ...fixture, result_status: "confirmed" }, { revision: 1 }, { revision: 1 }, { id: "sender" }), { code: "RESULT_ALREADY_CONFIRMED" });
  assert.throws(() => ensurePlayerCanSubmitGame({ ...fixture, match_kind: "league", round_status: "completed" }), { code: "GAME_NOT_STARTED" });
});

test("friendly games expose a type and participants without inventing a season", () => {
  const game = publicGame({ match_kind: "friendly", home_user_id: "sender", home_team_id: "home", away_user_id: "recipient", away_team_id: "away", home_points: 0, away_points: 0 }, "sender");
  assert.equal(game.kind, "friendly"); assert.equal(game.season, null);
  assert.equal(game.viewerIsHome, true); assert.equal(game.homePoints, 0);
});
