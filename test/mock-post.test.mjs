import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { errorPayload } from "../server/http/errors.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { rolledDice } from "../src/domain/roster/dice.mjs";
import { mvpChoices, postPoints, scoreMismatches, sideRecords } from "../src/domain/post-match/score.mjs";
import { answerPost } from "../scripts/mock/post.mjs";
import { humanPlayers } from "../scripts/mock/roster.mjs";

/*
 * The mock API's post-match (scripts/mock/post.mjs, stage 09b Task 12): the post-match of g2 played by the domain as the
 * server plays it, its writes, the site's dice of its Players step, its finish, and the cases the screenshots set. The
 * lists are the ones scripts/mock-api.mjs hands its answerers; g2's sheets come from scripts/mock/matches.mjs, its start.
 */

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));

const playerOf = (idPrefix, number, rowIndex, name, changes = {}) => ({
  id: `${idPrefix}${number}`, rowIndex, number: String(number), name, statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, advancements: [], ...changes,
});
const rosterOf = (teamSlug, teamName, players) => ({
  teamSlug, teamName, players, roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury: 120, coachesSafe: 0, teamRerolls: 1, startingRerolls: 1, purchasedStaff: {},
});
const teamOf = (id, name, baseTeamSlug, players) => ({ id, name, baseTeamSlug, logoData: null, roster: rosterOf(baseTeamSlug, name, players), revision: 1, stage: "active" });

const coach = { id: "u1", login: "coach" };
const rival = { id: "u2", login: "rival" };
const sideOf = (owner, { id, name, baseTeamSlug }) => ({ user: owner, team: { id, name, baseTeamSlug, logoUrl: null } });
const SEASON = { id: "s1", name: "Mock Season", status: "active", currentRound: 3 };
const pairingOf = (id, own, opposing, changes = {}) => ({
  id, kind: "league", season: SEASON, roundNumber: 3, roundStatus: "started", tableNumber: 1, resultStatus: "pending", homeTouchdowns: null,
  awayTouchdowns: null, homePoints: null, awayPoints: null, preparationStatus: "not_started", postMatchStatus: "not_started", homeMvps: [], awayMvps: [],
  ...changes, home: sideOf(coach, own), away: sideOf(rival, opposing), viewerIsHome: true,
});

/** A fresh copy of the mock's lists and helpers, as mock-api.mjs hands them to an answerer; `admin` signs the coach in as one. */
function freshMock({ admin = false } = {}) {
  const teams = [
    teamOf("t1", "Mock Team", "teams/amazon", [playerOf("p", 1, 0, "Linewoman One"), playerOf("p", 2, 1, "Thrower Two")]),
    teamOf("t2", "Mock Humans", "teams/human", humanPlayers(playerOf)),
  ];
  const games = [
    pairingOf("g1", teams[0], { id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" }),
    pairingOf("g2", teams[1], { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" }, { tableNumber: 2, preparationStatus: "in_progress", postMatchStatus: "draft" }),
  ];
  const reply = (payload, status = 200) => ({ status, payload });
  const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
  return { teams, games, user: { ...coach, isAdmin: admin }, rival, readBody: async (request) => request.body ?? {}, reply, refuse };
}

/** Ask the mock: `{status, payload}`, or null when the route is not the module's. */
const ask = (mock, method, path, body) => answerPost({ method, url: path, body }, path, mock);
const codeOf = (answer) => [answer.status, answer.payload.error?.code];
const POST = "/api/games/g2/post-match";
const read = async (mock) => (await ask(mock, "GET", POST)).payload;
const setCase = async (mock, word) => (await ask(mock, "POST", `/api/mock/post/g2/${word}`)).payload;
/** One write of `side`, on the revision last read. */
async function press(mock, action, side = "home") {
  const { postMatch } = await read(mock);
  return ask(mock, "PATCH", POST, { revision: postMatch.revision, side, action });
}

// Each case: the coach's side (home in g2) and the rival's — the stage, confirmed or not — and the post-match's status.
const CASES = {
  result: [[0, false], [0, false], "draft"],
  sent: [[0, false], [0, false], "draft"],
  mismatch: [[0, false], [0, false], "draft"],
  agreed: [[1, false], [1, false], "draft"],
  fans: [[1, false], [2, false], "draft"],
  players: [[2, false], [2, false], "draft"],
  "players-two": [[2, false], [2, false], "draft"],
  conceded: [[2, false], [2, false], "draft"],
  roster: [[3, false], [2, false], "draft"],
  finance: [[4, false], [3, false], "draft"],
  next: [[5, false], [4, false], "draft"],
  review: [[6, true], [6, false], "draft"],
  ready: [[6, true], [6, true], "ready"],
  completed: [[6, true], [6, true], "completed"],
};

test("the mock plays the post-match to each case and answers its writes as the domain does", async () => {
  const mock = freshMock();
  const g2 = mock.games.find((game) => game.id === "g2");
  const first = await read(mock);
  assert.deepEqual([first.viewerSide, first.isAdmin, first.rosterChanged], ["home", false, { home: false, away: false }]);
  assert.deepEqual(first.fixture, { id: "g2", kind: "league", seasonName: "Mock Season", roundNumber: 3 });
  assert.deepEqual([first.postMatch.gameId, first.postMatch.home.team.id, first.postMatch.away.team.id], ["g2", "t2", "rt2"]);
  for (const [word, [home, away, status]] of Object.entries(CASES)) {
    const set = await setCase(mock, word);
    const { postMatch } = await read(mock);
    assert.deepEqual([[postMatch.home.stage, postMatch.home.confirmed], [postMatch.away.stage, postMatch.away.confirmed], postMatch.status], [home, away, status], word);
    assert.equal(postMatch.revision, set.postMatch.revision, `${word}: a read changes nothing`);
    assert.equal(g2.postMatchStatus, status, `${word}: the match of the list says so`);
    assert.equal(g2.resultStatus, word === "completed" ? "confirmed" : "pending", word);
  }
  // The records: ours TD 1 + COMP 1, TD 1, CAS 2, CAS 1 + KO 1, a Lasting Injury (AG), in the sheet's order; theirs TD 1 + COMP 1, CAS 1.
  const fresh = (await setCase(mock, "result")).postMatch;
  assert.equal(fresh.result, null);
  const ours = sideRecords(fresh.home);
  assert.deepEqual([ours.touchdowns, ours.casualties, ours.count, sideRecords(fresh.away).count], [2, 3, 8, 3]);
  assert.deepEqual(ours.scorers.map(({ id, touchdowns, casualties }) => [id, touchdowns, casualties]), [["q1", 1, 0], ["q3", 1, 0], ["q4", 0, 2], ["q5", 0, 1]]);
  assert.deepEqual([fresh.home.statistics.q1.completions, fresh.home.statistics.q5.knockouts, fresh.home.injuries.q6], [1, 1, { code: "lasting", stat: "ag", retire: false }]);
  const sent = (await setCase(mock, "sent")).postMatch;
  assert.deepEqual([sent.result.home, sent.result.away, sent.result.accepted], [{ touchdowns: 2, casualties: 3 }, { touchdowns: 1, casualties: 1 }, { home: true, away: false }]);
  assert.deepEqual(scoreMismatches(sent), []);
  assert.deepEqual(scoreMismatches((await setCase(mock, "mismatch")).postMatch), [{ side: "home", counter: "touchdowns", score: 3, records: 2 }]);
  const two = (await setCase(mock, "players-two")).postMatch;
  assert.deepEqual([two.result.mode, two.result.winner, mvpChoices(two, "home").count, scoreMismatches(two)], ["technical", "home", 2, []]);
  const conceded = (await setCase(mock, "conceded")).postMatch;
  assert.deepEqual([conceded.result.mode, conceded.result.winner, scoreMismatches(conceded)], ["conceded", "away", []]);
  assert.deepEqual(conceded.home.baseRoster.players.filter((player) => player.advancements.length >= 3).map((player) => player.id), ["q4"]);
  const roster = (await setCase(mock, "roster")).postMatch;
  assert.deepEqual([roster.home.mvps, roster.home.advancements.q1.map((choice) => choice.type), roster.home.operations.map((item) => item.key)],
    [["q1"], ["primary"], ["assistantCoaches", "cheerleaders"]]);
  const done = (await setCase(mock, "completed")).postMatch;
  assert.deepEqual([g2.homeTouchdowns, g2.awayTouchdowns, g2.homeCasualties, g2.awayCasualties], [2, 1, 3, 1]);
  assert.deepEqual([g2.homePoints, g2.awayPoints], [postPoints(done, "home", "league").total, postPoints(done, "away", "league").total]);
  assert.deepEqual(g2.homeMvps, [{ id: "q1", name: "Lineman One" }]);
  assert.ok(done.home.settlement && done.away.settlement, "the finish keeps what each side came to");
  await setCase(mock, "players");
  assert.deepEqual([g2.resultStatus, g2.homeTouchdowns, g2.homeMvps, g2.postMatchStatus], ["pending", null, [], "draft"], "a case sets the match back");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/post/g2/kickoff")), [400, "FIELD_INVALID"]);
});

test("a write is the domain's on the revision read: a stale one, another side, a team saved since and the domain's refusals are the server's", async () => {
  const mock = freshMock();
  const { postMatch } = await setCase(mock, "players");
  const revision = postMatch.revision;
  assert.deepEqual(codeOf(await ask(mock, "PATCH", POST, { revision: revision - 1, action: { type: "lock-players" } })), [409, "POST_REVISION"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", POST, { revision })), [400, "POST_ACTION"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", POST, { revision, side: "away", action: { type: "lock-players" } })), [403, "FIXTURE_NOT_YOURS"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", POST, { revision, action: { type: "lock-players" } })), [409, "POST_MVP"]);
  const saved = await press(mock, { type: "statistics", statistics: postMatch.home.statistics, injuries: postMatch.home.injuries, mvps: ["q4"] });
  assert.equal(saved.status, 200);
  assert.deepEqual([saved.payload.postMatch.revision, saved.payload.postMatch.home.mvps, saved.payload.postMatch.home.followsEvents], [revision + 1, ["q4"], false]);
  assert.equal((await press(mock, { type: "lock-players" })).payload.postMatch.home.stage, 3);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/games/g2/finish", { revision: revision + 2 })), [409, "POST_INCOMPLETE"]);
  // A team saved under the post-match: said, every write but a new start refused, and the new start takes the team as it is.
  mock.teams[1].revision += 1;
  assert.deepEqual((await read(mock)).rosterChanged, { home: true, away: false });
  assert.deepEqual(codeOf(await press(mock, { type: "lock-roster" })), [409, "POST_TEAM_CHANGED"]);
  const again = (await press(mock, { type: "reset-side" })).payload;
  assert.deepEqual([again.postMatch.home.stage, again.postMatch.home.baseRevision, again.postMatch.home.mvps, again.rosterChanged.home], [1, 2, [], false]);
  // An administrator writes for either side.
  const admin = freshMock({ admin: true });
  await setCase(admin, "agreed");
  const theirs = await press(admin, { type: "fans", roll: 4 }, "away");
  assert.deepEqual([theirs.status, theirs.payload.isAdmin, theirs.payload.postMatch.away.stage], [200, true, 2]);
});

test("the finish: only once both confirmed, the match of the list finished, a second finish answered as the first", async () => {
  const mock = freshMock();
  const g2 = mock.games.find((game) => game.id === "g2");
  const { postMatch } = await setCase(mock, "ready");
  const finished = await ask(mock, "POST", "/api/games/g2/finish", { revision: postMatch.revision });
  assert.equal(finished.status, 200);
  assert.deepEqual([finished.payload.postMatch.status, finished.payload.postMatch.revision, finished.payload.rosterChanged], ["completed", postMatch.revision + 1, { home: false, away: false }]);
  assert.deepEqual([g2.postMatchStatus, g2.resultStatus, g2.homeTouchdowns, g2.awayTouchdowns], ["completed", "confirmed", 2, 1]);
  const twice = await ask(mock, "POST", "/api/games/g2/finish", { revision: 0 });
  assert.deepEqual(twice.payload, finished.payload, "a finished post-match is answered as it stands");
  assert.deepEqual(codeOf(await press(mock, { type: "reopen" })), [409, "POST_CLOSED"]);
  assert.deepEqual(await read(mock), finished.payload);
});

test("the site's roll of the Players step: the coach's, by the roster the post-match holds, the same when asked again", async () => {
  const mock = freshMock();
  const rolls = "/api/games/g2/post-match/rolls";
  const general = { playerId: "q1", purpose: "random_skill", category: "General" };
  await setCase(mock, "agreed");
  assert.deepEqual(codeOf(await ask(mock, "POST", rolls, general)), [409, "POST_ACTION"]);
  await setCase(mock, "players");
  assert.deepEqual(codeOf(await ask(mock, "POST", rolls, { playerId: "q1", purpose: "dice" })), [400, "FIELD_INVALID"]);
  assert.deepEqual((await ask(mock, "POST", rolls, { playerId: "q1", purpose: "random_skill" })).payload.error.params, { field: "category" });
  assert.deepEqual(codeOf(await ask(mock, "POST", rolls, { ...general, side: "away" })), [403, "FIXTURE_NOT_YOURS"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", rolls, { ...general, playerId: "rt2-1" })), [404, "PLAYER_NOT_FOUND"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", rolls, { ...general, category: "Strength" })), [422, "DICE_CATEGORY"]);
  const asked = await ask(mock, "POST", rolls, general);
  assert.equal(asked.status, 200);
  const { roll } = asked.payload;
  assert.deepEqual([roll.playerId, roll.purpose, roll.usedAt, roll.params.category, roll.params.captain], ["q1", "random_skill", null, "General", false]);
  const dice = rolledDice(roll);
  assert.equal(dice.length, 2, "a random skill is two dice");
  assert.deepEqual((await ask(mock, "POST", rolls, general)).payload.roll, roll, "asked again it is the same roll");
  assert.deepEqual((await ask(mock, "POST", rolls, { playerId: "q1", purpose: "stat" })).payload.error, errorPayload("DICE_ROLL_WAITING", { purpose: "random_skill" }).error);
  const revision = (await read(mock)).postMatch.revision;
  assert.equal(revision, (await read(mock)).postMatch.revision, "a roll writes nothing into the post-match");
  // Taken: a roll of another player, or a skill no die came up, is refused; the roll it names is not handed out again.
  const advance = (grant, id = roll.id, playerId = "q1") => press(mock, { type: "advance", playerId, advancementType: "random", grant, roll: { id, via: "site" } });
  assert.deepEqual(codeOf(await advance({ skill: dice[0].skill }, roll.id, "q3")), [422, "DICE_ROLL_MISMATCH"]);
  const unrolled = data.skillGroups.find((group) => group.category === "General").skills.find((skill) => dice.every((die) => die.skill !== skill));
  assert.deepEqual(codeOf(await advance({ skill: unrolled })), [422, "DICE_ROLL_MISMATCH"]);
  assert.deepEqual(codeOf(await advance({ skill: dice[0].skill }, "mock-post-roll-none")), [422, "DICE_ROLL_MISMATCH"]);
  const taken = await advance({ skill: dice[0].skill });
  assert.equal(taken.status, 200);
  assert.deepEqual(taken.payload.postMatch.home.advancements.q1, [{ type: "random", grant: { skill: dice[0].skill }, roll: { id: roll.id, via: "site" } }]);
  const next = (await ask(mock, "POST", rolls, general)).payload.roll;
  assert.notEqual(next.id, roll.id, "a second advancement takes a fresh roll");
  assert.ok(rolledDice(next).every((die) => die.skill !== dice[0].skill), "by the roster the post-match holds: the skill taken is not rolled");
  // Undone, the first roll waits again and comes back first.
  await press(mock, { type: "undo-advance", playerId: "q1" });
  assert.equal((await ask(mock, "POST", rolls, general)).payload.roll.id, roll.id);
  const stat = await ask(mock, "POST", rolls, { playerId: "q3", purpose: "stat" });
  assert.deepEqual([stat.status, stat.payload.roll.result.roll], [200, 6]);
  // A case makes the rolls afresh.
  await setCase(mock, "players");
  assert.notEqual((await ask(mock, "POST", rolls, general)).payload.roll.id, roll.id);
});

test("what it does not answer: another route, a match not begun, a match the list has not", async () => {
  const mock = freshMock();
  const g1 = mock.games.find((game) => game.id === "g1");
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/games/g1/post-match")), [409, "POST_NOT_STARTED"]);
  assert.equal(g1.preparationStatus, "not_started", "a read of the post-match makes no preparation");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/post/g1/players")), [409, "POST_NOT_STARTED"]);
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/games/g9/post-match")), [404, "GAME_NOT_FOUND"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", POST)), [405, "ROUTE_NOT_FOUND"]);
  assert.equal(await ask(mock, "GET", "/api/games/g2"), null);
  assert.equal(await ask(mock, "GET", "/api/games/g2/preparation"), null);
  assert.equal(await ask(mock, "GET", "/api/teams/t2/rolls"), null);
});
