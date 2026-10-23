import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { errorPayload } from "../server/http/errors.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { answerChallenges } from "../scripts/mock/challenges.mjs";
import { answerSeason } from "../scripts/mock/season.mjs";

/*
 * The mock API's friendly challenges (scripts/mock/challenges.mjs, stage 09c Task 8): every kind of challenge, a long
 * list of coaches with their teams, and the writes as server/friendly/challenges.mjs makes them. The lists are the ones
 * scripts/mock-api.mjs hands its answerers; the games are the coach's friendlies g6 (played) and g7 (in preparation)
 * and a league match, g1.
 */

const RACES = new Set(expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8"))).teams.map(({ slug }) => slug));

const user = { id: "u1", login: "coach", telegram: "@coach", isAdmin: false, createdAt: "2026-10-01T00:00:00Z" };
const rival = { id: "u2", login: "rival", telegram: "@rival", isAdmin: false, createdAt: "2026-10-01T00:00:00Z", savedTeamCount: 0, lastTeamUpdatedAt: null };
const STAMP = "2026-10-01T00:00:00.000Z";
const teamOf = (id, name, baseTeamSlug) => ({ id, name, baseTeamSlug, logoData: null, roster: {}, revision: 1, stage: "active", inActiveSeason: true,
  createdAt: STAMP, updatedAt: STAMP });
const TEAMS = [teamOf("t1", "Mock Team", "teams/amazon"), teamOf("t2", "Mock Humans", "teams/human"), teamOf("t3", "Mock Orcs", "teams/orc"),
  teamOf("t5", "Mock Veterans", "teams/dwarf")];
const RIVALS = [{ id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" }, { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" }];
const side = (owner, { id, name, baseTeamSlug }) => ({ user: { id: owner.id, login: owner.login }, team: { id, name, baseTeamSlug, logoUrl: null } });
/** As mock-api.mjs's `pairingOf`: `(id, tableNumber, own, opposing, changes)`, a match of round 3, the coach at home unless `viewerIsHome` says otherwise. */
const pairingOf = (id, tableNumber, own, opposing, changes = {}) => {
  const viewerIsHome = changes.viewerIsHome ?? true;
  const [home, away] = viewerIsHome ? [side(user, own), side(rival, opposing)] : [side(rival, opposing), side(user, own)];
  return { id, roundId: "r3", roundNumber: 3, roundStatus: "started", tableNumber, homeEntryId: `e-${home.team.id}`, awayEntryId: `e-${away.team.id}`,
    resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started", createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z", kind: "league", season: { id: "s1" }, ...changes, home, away, viewerIsHome };
};
const FRIENDLY = { kind: "friendly", season: null, roundId: null, roundNumber: 0, homeEntryId: null, awayEntryId: null };
const GAMES = [
  pairingOf("g7", 1, TEAMS[3], RIVALS[0], { ...FRIENDLY, preparationStatus: "preparing" }),
  pairingOf("g6", 1, TEAMS[0], RIVALS[0], { ...FRIENDLY, resultStatus: "confirmed" }),
  pairingOf("g1", 1, TEAMS[0], RIVALS[0]),
];

const reply = (payload, status = 200) => ({ status, payload });
const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
/** A fresh copy of the mock's lists and helpers, as mock-api.mjs hands them to an answerer; `empty` is MOCK_EMPTY=1's. */
const freshMock = ({ empty = false } = {}) => ({ teams: empty ? [] : structuredClone(TEAMS), games: empty ? [] : structuredClone(GAMES), user, rival,
  pairingOf, empty, readBody: async (request) => request.body ?? {}, reply, refuse });

/** Ask the mock: `{status, payload}`, or null when the route is not the module's. */
const ask = (mock, method, path, body) => answerChallenges({ method, body }, path, mock);
const list = async (mock) => (await ask(mock, "GET", "/api/challenges")).payload;
const codeOf = (answer) => [answer.status, answer.payload.error?.code];
/** A challenge as a line: who sent it, to whom, with which team, how it stands and its match. */
const shape = ({ sender, recipient, team, status, gameId }) => [sender.login, recipient.login, team.id, status, gameId];
const DAY = 86_400_000;
const idOf = async (mock, login) => (await list(mock)).opponents.find((opponent) => opponent.login === login).id;

test("the list has every kind of challenge and a long list of coaches with their teams", async () => {
  const mock = freshMock();
  const answer = await ask(mock, "GET", "/api/challenges");
  assert.equal(answer.status, 200);
  const { challenges, teams, opponents } = answer.payload;
  assert.deepEqual(Object.keys(answer.payload).sort(), ["challenges", "opponents", "teams"]);
  const byId = Object.fromEntries(challenges.map((challenge) => [challenge.id, challenge]));
  assert.deepEqual(Object.keys(byId).sort(), ["c1", "c2", "c3", "c4", "c5", "c6"]);
  for (const challenge of challenges) {
    assert.deepEqual(Object.keys(challenge).sort(), ["createdAt", "gameId", "id", "recipient", "sender", "status", "team", "updatedAt"], challenge.id);
    assert.deepEqual(Object.keys(challenge.team).sort(), ["baseTeamSlug", "id", "name"], `${challenge.id}: the challenging team's race too (Task 1)`);
  }
  const created = challenges.map(({ createdAt }) => Date.parse(createdAt));
  assert.deepEqual(created, [...created].sort((a, b) => b - a), "the newest first, as the server sends them");
  assert.deepEqual(shape(byId.c1), ["rival", "coach", "rt2", "pending", null]);
  assert.deepEqual(byId.c1.team, { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" });
  assert.deepEqual(shape(byId.c2), ["coach", "lilit", "t1", "pending", null]);
  assert.deepEqual(shape(byId.c3), ["rival", "coach", "rt1", "accepted", "g7"]);
  assert.deepEqual(shape(byId.c4), ["coach", "amazona", "t2", "declined", null]);
  assert.deepEqual(shape(byId.c5), ["coach", "frostulf", "t1", "cancelled", null]);
  assert.deepEqual(shape(byId.c6), ["coach", "rival", "t1", "accepted", "g6"]);
  // When: the incoming one yesterday, the outgoing one two days ago, the accepted one today.
  assert.equal(Math.round((Date.now() - Date.parse(byId.c1.createdAt)) / DAY), 1);
  assert.equal(Math.round((Date.now() - Date.parse(byId.c2.createdAt)) / DAY), 2);
  assert.ok(Date.now() - Date.parse(byId.c3.updatedAt) < 60_000, "c3 was accepted when the mock started");
  for (const id of ["c3", "c6"]) assert.equal(mock.games.find((game) => game.id === byId[id].gameId)?.kind, "friendly", `${id}'s match is a friendly of the coach's`);

  assert.deepEqual(opponents.map(({ login }) => login),
    ["amazona", "frostulf", "gutbag", "howler", "lilit", "lizardking", "narek", "pharaoh_k", "rival", "rotfather", "snotty", "squeak"], "twelve, by login");
  assert.equal(new Set(opponents.map(({ id }) => id)).size, 12);
  assert.ok(!opponents.some(({ id }) => id === user.id), "not the coach himself");
  const teamIds = opponents.flatMap((opponent) => opponent.teams.map(({ id }) => id));
  assert.equal(new Set(teamIds).size, teamIds.length, "no team id twice");
  for (const opponent of opponents) {
    assert.deepEqual(Object.keys(opponent).sort(), ["id", "login", "teams"], opponent.login);
    assert.ok(opponent.teams.length > 0, `${opponent.login} has a team`);
    for (const team of opponent.teams) {
      assert.deepEqual(Object.keys(team).sort(), ["baseTeamSlug", "id", "name"], `${team.name}: nothing else of another coach's team`);
      assert.ok(RACES.has(team.baseTeamSlug), `${team.name}: ${team.baseTeamSlug} is a race of the data`);
    }
  }
  const teamsOf = (login) => opponents.find((opponent) => opponent.login === login).teams.map(({ name }) => name);
  assert.deepEqual(teamsOf("rival"), ["Rival Team", "Rival Raiders", "Rival Wardens"]);
  assert.deepEqual(teamsOf("rotfather"), ["Mirefen Rotters", "Plaguebearers"], "a coach of the prototype with two teams");
  // The league's coaches are the season's: the same ids, teams and races as their pages (scripts/mock/season.mjs).
  for (const [id, login] of [["u2", "rival"], ["u3", "narek"], ["u4", "lilit"]]) {
    const page = (await answerSeason({ method: "GET" }, `/api/players/${id}`, mock))?.payload;
    const found = opponents.find((opponent) => opponent.id === id);
    assert.equal(found?.login, login);
    assert.deepEqual(found.teams, page.teams.map(({ id: teamId, name, baseTeamSlug }) => ({ id: teamId, name, baseTeamSlug })), `${login}'s teams`);
  }

  assert.deepEqual(teams.map(({ id }) => id), mock.teams.map(({ id }) => id), "the coach's own teams");
  assert.deepEqual(teams[0], { id: "t1", name: "Mock Team", baseTeamSlug: "teams/amazon", logoData: null, roster: {}, createdAt: STAMP, updatedAt: STAMP },
    "in the slim shape (`publicSavedTeamSlim`)");
});

test("a challenge is sent once; again it is CHALLENGE_ALREADY_SENT; oneself, nobody and another's team are refused as the server refuses", async () => {
  const mock = freshMock();
  const narek = await idOf(mock, "narek");
  const sent = await ask(mock, "POST", "/api/challenges", { opponentId: narek, teamId: "t1" });
  assert.equal(sent.status, 201);
  assert.deepEqual(Object.keys(sent.payload), ["id"]);
  assert.match(sent.payload.id, /^c\d+$/);
  const after = await list(mock);
  assert.equal(after.challenges[0].id, sent.payload.id, "the newest first");
  assert.deepEqual(shape(after.challenges[0]), ["coach", "narek", "t1", "pending", null]);
  assert.deepEqual(after.challenges[0].team, { id: "t1", name: "Mock Team", baseTeamSlug: "teams/amazon" });
  assert.ok(Date.now() - Date.parse(after.challenges[0].createdAt) < 60_000);

  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges", { opponentId: narek, teamId: "t1" })), [409, "CHALLENGE_ALREADY_SENT"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges", { opponentId: "u4", teamId: "t1" })), [409, "CHALLENGE_ALREADY_SENT"], "c2 waits from Mock Team to lilit");
  assert.equal((await ask(mock, "POST", "/api/challenges", { opponentId: narek, teamId: "t2" })).status, 201, "another team of the coach's may");
  // A challenge answered or cancelled is no longer waiting: amazona declined Mock Humans' (c4), frostulf's was cancelled (c5).
  assert.equal((await ask(mock, "POST", "/api/challenges", { opponentId: await idOf(mock, "amazona"), teamId: "t2" })).status, 201);
  assert.equal((await ask(mock, "POST", "/api/challenges", { opponentId: await idOf(mock, "frostulf"), teamId: "t1" })).status, 201);

  const refusals = [
    [{ teamId: "t1" }, [400, "CHALLENGE_SELECTION_REQUIRED"], "nobody chosen"],
    [{ opponentId: narek }, [400, "CHALLENGE_SELECTION_REQUIRED"], "no team chosen"],
    [{ opponentId: user.id, teamId: "t1" }, [400, "CHALLENGE_SELF"], "oneself"],
    [{ opponentId: "u99", teamId: "t1" }, [404, "CHALLENGE_OPPONENT_UNAVAILABLE"], "nobody the mock knows"],
    [{ opponentId: narek, teamId: "rt1" }, [404, "TEAM_NOT_FOUND"], "another coach's team"],
    [{ opponentId: "u99", teamId: "rt1" }, [404, "TEAM_NOT_FOUND"], "the team is checked first, as the server checks it"],
  ];
  for (const [body, code, why] of refusals) assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges", body)), code, why);
  assert.equal((await list(mock)).challenges.length, 6 + 4, "nothing refused was written");
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/challenges")), [405, "ROUTE_NOT_FOUND"]);
});

test("accepting makes a friendly in the games and answers its id; again the same id; declining and cancelling close it", async () => {
  const mock = freshMock();
  const before = mock.games.length;
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c1/accept", {})), [400, "CHALLENGE_SELECTION_REQUIRED"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c1/accept", { teamId: "rt1" })), [404, "TEAM_NOT_FOUND"]);
  assert.equal((await list(mock)).challenges.find(({ id }) => id === "c1").status, "pending", "a refused accept changes nothing");
  assert.equal(mock.games.length, before);

  const accepted = await ask(mock, "POST", "/api/challenges/c1/accept", { teamId: "t2" });
  assert.equal(accepted.status, 200);
  const { gameId } = accepted.payload;
  assert.deepEqual(Object.keys(accepted.payload), ["gameId"]);
  assert.match(gameId, /^g\d+$/);
  assert.ok(!GAMES.some(({ id }) => id === gameId), "a new id");
  assert.equal(mock.games.length, before + 1);
  const [game] = mock.games;
  assert.equal(game.id, gameId, "first in the games");
  assert.deepEqual([game.kind, game.season, game.roundId, game.roundNumber, game.homeEntryId, game.awayEntryId], ["friendly", null, null, 0, null, null]);
  assert.deepEqual([game.home.user.id, game.home.team.id, game.away.user.id, game.away.team.id, game.viewerIsHome], ["u2", "rt2", "u1", "t2", false],
    "the challenger at home, as `acceptChallenge` makes it");
  assert.deepEqual([game.resultStatus, game.preparationStatus], ["pending", "not_started"]);
  assert.ok(Date.now() - Date.parse(game.createdAt) < 60_000);

  const again = await ask(mock, "POST", "/api/challenges/c1/accept", { teamId: "t2" });
  assert.deepEqual([again.status, again.payload], [200, { gameId }], "an accept again is answered with the same match");
  assert.equal(mock.games.length, before + 1, "and makes no second one");
  const c1 = (await list(mock)).challenges.find(({ id }) => id === "c1");
  assert.deepEqual([c1.status, c1.gameId], ["accepted", gameId]);
  assert.ok(Date.now() - Date.parse(c1.updatedAt) < 60_000);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c1/decline", {})), [409, "CHALLENGE_CLOSED"]);

  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c2/accept", { teamId: "t1" })), [403, "CHALLENGE_NOT_YOURS"], "c2 is the coach's own");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c2/decline", {})), [403, "CHALLENGE_NOT_YOURS"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c3/cancel", {})), [403, "CHALLENGE_NOT_YOURS"], "only the sender cancels");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c99/accept", { teamId: "t1" })), [404, "CHALLENGE_NOT_FOUND"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c4/decline", {})), [403, "CHALLENGE_NOT_YOURS"], "c4 was the coach's");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c5/cancel", {})), [409, "CHALLENGE_CLOSED"], "c5 is cancelled already");

  const cancelled = await ask(mock, "POST", "/api/challenges/c2/cancel", {});
  assert.deepEqual([cancelled.status, cancelled.payload], [200, { gameId: null }]);
  assert.equal((await list(mock)).challenges.find(({ id }) => id === "c2").status, "cancelled");
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/challenges/c2/cancel", {})), [409, "CHALLENGE_CLOSED"]);

  const other = freshMock();
  const declined = await ask(other, "POST", "/api/challenges/c1/decline", {});
  assert.deepEqual([declined.status, declined.payload], [200, { gameId: null }]);
  const c1declined = (await list(other)).challenges.find(({ id }) => id === "c1");
  assert.deepEqual([c1declined.status, c1declined.gameId], ["declined", null]);
  assert.deepEqual(codeOf(await ask(other, "POST", "/api/challenges/c1/accept", { teamId: "t1" })), [409, "CHALLENGE_CLOSED"]);
  assert.equal(other.games.length, GAMES.length, "a decline makes no match");
  assert.deepEqual(codeOf(await ask(other, "GET", "/api/challenges/c1/accept")), [405, "ROUTE_NOT_FOUND"]);
});

test("the cases empty, reset and fail; MOCK_EMPTY has no challenge and nobody to challenge", async () => {
  const mock = freshMock();
  const first = (await ask(mock, "POST", "/api/challenges/c1/accept", { teamId: "t1" })).payload.gameId;
  await ask(mock, "POST", "/api/challenges", { opponentId: "u3", teamId: "t1" });

  const emptied = await ask(mock, "POST", "/api/mock/challenges/empty");
  assert.deepEqual([emptied.status, emptied.payload], [200, { case: "empty" }]);
  const empty = await list(mock);
  assert.deepEqual(empty.challenges, []);
  assert.equal(empty.opponents.length, 12, "the coaches stay: the sheet still has whom to challenge");
  assert.ok(!mock.games.some(({ id }) => id === first), "the friendly an accept made is gone");

  assert.deepEqual((await ask(mock, "POST", "/api/mock/challenges/reset")).payload, { case: "reset" });
  const reset = await list(mock);
  assert.deepEqual(reset.challenges.map(shape), (await list(freshMock())).challenges.map(shape), "as when the mock started");
  assert.deepEqual(mock.games.map(({ id }) => id), GAMES.map(({ id }) => id));
  const second = (await ask(mock, "POST", "/api/challenges/c1/accept", { teamId: "t1" })).payload.gameId;
  assert.notEqual(second, first, "an id is not given twice");
  const sent = (await ask(mock, "POST", "/api/challenges", { opponentId: "u3", teamId: "t1" })).payload.id;
  assert.ok(!["c1", "c2", "c3", "c4", "c5", "c6", "c7"].includes(sent), `${sent}: a challenge's id is not given twice either`);

  assert.deepEqual((await ask(mock, "POST", "/api/mock/challenges/fail")).payload, { case: "fail" });
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/challenges")), [500, "SERVER_ERROR"], "the list cannot be read");
  await ask(mock, "POST", "/api/mock/challenges/reset");
  assert.equal((await ask(mock, "GET", "/api/challenges")).status, 200, "until another case");

  const unknown = await ask(mock, "POST", "/api/mock/challenges/limit");
  assert.deepEqual([unknown.status, unknown.payload], [400, errorPayload("FIELD_INVALID", { field: "case" })]);
  assert.equal(await ask(mock, "GET", "/api/mock/challenges/reset"), null, "a case is set by a POST");
  assert.equal(await ask(mock, "GET", "/api/games"), null, "the games are not this module's");

  const nobody = freshMock({ empty: true });
  assert.deepEqual(await list(nobody), { challenges: [], teams: [], opponents: [] });
  await ask(nobody, "POST", "/api/mock/challenges/reset");
  assert.deepEqual(await list(nobody), { challenges: [], teams: [], opponents: [] }, "reset is as it started: empty");
});

test("mock-api.mjs asks this module and answers no challenge of its own", () => {
  const api = readFileSync(new URL("../scripts/mock-api.mjs", import.meta.url), "utf8");
  const lines = api.split("\n").filter((line) => /challenges/i.test(line));
  assert.equal(lines.length, 2, lines.join("\n"));
  assert.equal(lines[0], 'import { answerChallenges } from "./mock/challenges.mjs";');
  assert.match(lines[1], /for \(const answer of \[.*\banswerChallenges\b.*\]\)/);
  assert.match(api, /const mock = \{[^}]*\bpairingOf\b[^}]*\}/, "an accept makes its friendly with the mock's own `pairingOf`");
  assert.match(api, /const mock = \{[^}]*\bempty\b[^}]*\}/, "MOCK_EMPTY=1 is the module's to know");
});
