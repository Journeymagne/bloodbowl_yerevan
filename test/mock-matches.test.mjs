import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { errorPayload } from "../server/http/errors.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { preparationStep } from "../src/domain/match/preparation.mjs";
import { calculateMatchCtv, createMatchSide } from "../src/domain/match/roster.mjs";
import { answerMatches } from "../scripts/mock/matches.mjs";

/*
 * The mock API's matches (scripts/mock/matches.mjs, stage 09a Task 13): the opponent's public team, a preparation the
 * domain plays as the server would, its start, and the mock-only routes the screenshots set a state with. The lists are
 * the ones scripts/mock-api.mjs hands its answerers. The cases of «Before the match» are made against Mock Team's CTV as
 * it is when asked, so they hold for the mock's own (670k: scripts/mock/treasury.mjs gives it an apothecary) and for
 * this copy's (620k) alike.
 */

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));

const playerOf = (idPrefix, number, rowIndex, name, changes = {}) => ({
  id: `${idPrefix}${number}`, rowIndex, number: String(number), name, statMods: {}, extraSkills: [], favouredSkills: [], spp: {}, advancements: [], ...changes,
});
// Mock Team's players as scripts/mock-api.mjs has them: eight Amazons, Six and Seven out, Eight a fresh purchase — 620k.
const amazons = [
  playerOf("p", 1, 0, "Linewoman One", { spp: { touchdowns: 1 } }),
  playerOf("p", 2, 1, "Thrower Two", { statMods: { ma: 1 }, extraSkills: [{ name: "Block", access: "primary" }], spp: { completions: 3 } }),
  playerOf("p", 3, 2, "Blitzer Three", { spp: { touchdowns: 7 }, extraSkills: [{ name: "Dodge", access: "primary" }], advancements: [{ type: "random", grants: { skill: "Dodge" }, roll: { id: "mock-roll-p3", via: "site" } }] }),
  playerOf("p", 4, 3, "Blocker Four", { isCaptain: true, spp: { casualties: 2 } }),
  playerOf("p", 5, 0, "Linewoman Five", { spp: { mvps: 1 } }),
  playerOf("p", 6, 0, "Linewoman Six", { skipNextGame: true, absence: { code: "niggling" }, nigglingInjuries: 1, niglingInjury: true, statMods: { ag: -1 }, injuryStatMods: { ag: -1 } }),
  playerOf("p", 7, 2, "Blitzer Seven", { skipNextGame: true, absence: { code: "other", note: "Suspended by the league" } }),
  playerOf("p", 8, 0, "Linewoman Eight", { purchased: true, purchaseRefund: 50 }),
];
const rosterOf = (teamSlug, teamName, players) => ({
  teamSlug, teamName, players, roster: players.reduce((counts, { rowIndex }) => ({ ...counts, [rowIndex]: (counts[rowIndex] ?? 0) + 1 }), {}),
  treasury: 120, coachesSafe: 0, teamRerolls: 1, startingRerolls: 1, purchasedStaff: {},
});
const teamOf = (id, name, baseTeamSlug, players) => ({ id, name, baseTeamSlug, logoData: null, roster: rosterOf(baseTeamSlug, name, players), revision: 1, stage: "active" });

const coach = { id: "u1", login: "coach" };
const rival = { id: "u2", login: "rival" };
const sideOf = (owner, { id, name, baseTeamSlug }) => ({ user: owner, team: { id, name, baseTeamSlug, logoUrl: null } });
const RIVALS = [
  { id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" },
  { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" },
];
const SEASON = { id: "s1", name: "Mock Season", status: "active", currentRound: 3 };
/** A match of round 3 as /api/games has it, the coach at home unless `viewerIsHome` says otherwise. */
const pairingOf = (id, own, opposing, changes = {}) => {
  const viewerIsHome = changes.viewerIsHome ?? true;
  const [home, away] = viewerIsHome ? [sideOf(coach, own), sideOf(rival, opposing)] : [sideOf(rival, opposing), sideOf(coach, own)];
  return { id, kind: "league", season: SEASON, roundNumber: 3, roundStatus: "started", tableNumber: 1, resultStatus: "pending",
    preparationStatus: "not_started", postMatchStatus: "not_started", updatedAt: "2026-10-20T10:00:00Z", ...changes, home, away, viewerIsHome };
};

/** A fresh copy of the mock's lists and helpers, as mock-api.mjs hands them to an answerer. */
function freshMock() {
  const teams = [
    teamOf("t1", "Mock Team", "teams/amazon", amazons),
    teamOf("t2", "Mock Humans", "teams/human", [0, 0, 0, 3, 2, 1, 5].map((row, at) => playerOf("q", at + 1, row, `Human ${at + 1}`))),
    teamOf("t5", "Mock Veterans", "teams/dwarf", [playerOf("v", 1, 0, "Veteran One"), playerOf("v", 2, 1, "Veteran Two")]),
  ];
  const games = [
    pairingOf("g7", teams[2], RIVALS[0], { kind: "friendly", season: null, roundNumber: 0, preparationStatus: "preparing" }),
    pairingOf("g1", teams[0], RIVALS[0]),
    pairingOf("g2", teams[1], RIVALS[1], { tableNumber: 2, preparationStatus: "in_progress", postMatchStatus: "draft" }),
    pairingOf("g4", teams[0], RIVALS[1], { roundNumber: 1, roundStatus: "completed", resultStatus: "confirmed" }),
  ];
  const reply = (payload, status = 200) => ({ status, payload });
  const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
  return { teams, games, readBody: async (request) => request.body ?? {}, reply, refuse };
}

/** Ask the mock: `{status, payload}`, or null when the route is not the module's. */
const ask = (mock, method, path, body) => answerMatches({ method, url: path, body }, path, mock);
const ctvOf = (team) => calculateMatchCtv(createMatchSide({ user: rival, team }, data)).total;
const codeOf = (answer) => [answer.status, answer.payload.error?.code];

test("the opponent's page: g1's rival dearer than Mock Team with two out, the others whole; a coach's own team is not answered here", async () => {
  const mock = freshMock();
  const first = await ask(mock, "GET", "/api/players/u2/teams/rt1");
  assert.equal(first.status, 200);
  assert.deepEqual([first.payload.user.id, first.payload.user.login], ["u2", "rival"]);
  const { team } = first.payload;
  assert.deepEqual([team.id, team.name, team.baseTeamSlug], ["rt1", "Rival Team", "teams/dwarf"]);
  const out = team.roster.players.filter((player) => player.skipNextGame);
  assert.deepEqual(out.map((player) => player.absence), [{ code: "niggling" }, { code: "other", note: "Disqualified" }]);
  assert.equal(ctvOf(mock.teams[0]), 620);
  assert.equal(ctvOf(team), 710, "90k dearer: we get the inducements");
  assert.equal(team.roster.players.filter((player) => !player.skipNextGame).length, 7);
  const second = await ask(mock, "GET", "/api/players/u2/teams/rt2");
  assert.equal(second.payload.team.roster.players.filter((player) => player.skipNextGame).length, 0);
  assert.equal(second.payload.team.roster.players.length, 7);
  assert.equal(await ask(mock, "GET", "/api/players/u1/teams/t1"), null, "the coach's own team stays answerPeople's");
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/players/u1/teams/rt1")), [404, "TEAM_NOT_FOUND"]);
  assert.equal(await ask(mock, "GET", "/api/players/u2"), null);
});

test("a preparation is read as the server reads it: made from the teams, the pair's status set, a match in play with its sheets", async () => {
  const mock = freshMock();
  const g1 = mock.games.find((game) => game.id === "g1");
  const read = await ask(mock, "GET", "/api/games/g1/preparation");
  assert.equal(read.status, 200);
  const { preparation, snapshots, viewerSide, isAdmin, fixture } = read.payload;
  assert.deepEqual([preparation.status, preparation.revision, preparationStep(preparation)], ["preparing", 1, 0]);
  assert.deepEqual([preparation.home.team.id, preparation.away.team.id], ["t1", "rt1"]);
  assert.deepEqual([snapshots, viewerSide, isAdmin], [{}, "home", false]);
  assert.deepEqual(fixture, { id: "g1", kind: "league", seasonName: "Mock Season", roundNumber: 3, tableNumber: 1, closed: false });
  assert.equal(g1.preparationStatus, "preparing", "the pair reads as its preparation, as savePreparationState leaves it");
  const live = (await ask(mock, "GET", "/api/games/g2/preparation")).payload;
  assert.equal(live.preparation.status, "in_progress");
  assert.deepEqual(Object.keys(live.snapshots).sort(), ["away", "home"]);
  assert.equal(live.snapshots.home.team.id, "t2");
  const friendly = (await ask(mock, "GET", "/api/games/g7/preparation")).payload;
  assert.deepEqual([friendly.preparation.status, friendly.fixture.kind, friendly.fixture.closed], ["preparing", "friendly", false]);
  assert.equal((await ask(mock, "GET", "/api/games/g4/preparation")).payload.fixture.closed, true);
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/games/g9/preparation")), [404, "GAME_NOT_FOUND"]);
  assert.deepEqual(codeOf(await ask(mock, "DELETE", "/api/games/g1/preparation")), [405, "ROUTE_NOT_FOUND"]);
});

test("a write is the domain's, on the revision read: a stale one, another side, a closed round and the domain's refusals are the server's", async () => {
  const mock = freshMock();
  await ask(mock, "GET", "/api/games/g1/preparation");
  const path = "/api/games/g1/preparation";
  const fans = await ask(mock, "PATCH", path, { revision: 1, side: "home", action: { type: "fans", value: 2 } });
  assert.equal(fans.status, 200);
  assert.deepEqual([fans.payload.preparation.revision, fans.payload.preparation.home.fansRoll], [2, 2]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 1, action: { type: "fans", value: 3 } })), [409, "MATCH_REVISION"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 2 })), [400, "MATCH_ACTION"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 2, side: "away", action: { type: "fans", value: 1 } })), [403, "FIXTURE_NOT_YOURS"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 2, action: { type: "basket", id: "bloodweiser-keg", quantity: 1 } })), [409, "MATCH_WAIT"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 2, action: { type: "fans", value: 9 } })), [409, "MATCH_DICE"]);
  assert.deepEqual(codeOf(await ask(mock, "PATCH", "/api/games/g4/preparation", { revision: 1, action: { type: "fans", value: 1 } })), [409, "ROUND_CLOSED_FOR_PLAYERS"]);
  // What was refused wrote nothing: the next write goes out on revision 2.
  const next = await ask(mock, "PATCH", path, { revision: 2, action: { type: "fans", value: 3 } });
  assert.equal(next.payload.preparation.revision, 3);
  // A saved roster under the preparation: a write hears MATCH_ROSTER_CHANGED, a read takes the new roster and keeps the dice.
  mock.teams[0].revision += 1;
  assert.deepEqual(codeOf(await ask(mock, "PATCH", path, { revision: 3, action: { type: "fans", value: 1 } })), [409, "MATCH_ROSTER_CHANGED"]);
  const again = (await ask(mock, "GET", path)).payload.preparation;
  assert.deepEqual([again.revision, again.home.team.revision, again.home.fansRoll], [4, 2, 3]);
});

test("the mock plays the domain for both sides up to the step asked; the opponent who buys first has bought", async () => {
  const mock = freshMock();
  const expected = { fans: 0, weather: 1, roster: 2, inducements: 3, review: 4, ready: 4 };
  for (const [step, index] of Object.entries(expected)) {
    const set = await ask(mock, "POST", `/api/mock/prep/g1/${step}`);
    assert.equal(set.status, 200, step);
    const read = (await ask(mock, "GET", "/api/games/g1/preparation")).payload.preparation;
    assert.equal(preparationStep(read), index, step);
    assert.deepEqual(read, set.payload.preparation, `${step}: what the route set is what is read`);
  }
  const at = async (step) => (await ask(mock, "POST", `/api/mock/prep/g1/${step}`)).payload.preparation;
  const inducements = await at("inducements");
  assert.deepEqual([inducements.home.basketLocked, inducements.away.basketLocked], [false, true], "the rival is dearer and bought first");
  const review = await at("review");
  assert.deepEqual([review.home.basketLocked, review.away.basketLocked, review.home.confirmed, review.away.confirmed], [true, true, false, false]);
  assert.equal(review.status, "preparing");
  const ready = await at("ready");
  assert.deepEqual([ready.status, ready.home.confirmed, ready.away.confirmed], ["ready", true, true]);
  assert.equal(mock.games.find((game) => game.id === "g1").preparationStatus, "ready");
  // A match in play is set back to a step like any other.
  assert.equal((await ask(mock, "POST", "/api/mock/prep/g2/weather")).payload.preparation.status, "preparing");
  assert.deepEqual((await ask(mock, "GET", "/api/games/g2/preparation")).payload.snapshots, {});
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/prep/g1/kickoff")), [400, "FIELD_INVALID"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/prep/g9/fans")), [404, "GAME_NOT_FOUND"]);
});

test("the start: only once both confirmed, then in play with both sheets, and the same answer to a second start", async () => {
  const mock = freshMock();
  const start = "/api/games/g1/start";
  const review = (await ask(mock, "POST", "/api/mock/prep/g1/review")).payload.preparation;
  assert.deepEqual(codeOf(await ask(mock, "POST", start, { revision: review.revision })), [409, "MATCH_WAIT"]);
  const ready = (await ask(mock, "POST", "/api/mock/prep/g1/ready")).payload.preparation;
  assert.deepEqual(codeOf(await ask(mock, "POST", start, { revision: ready.revision - 1 })), [409, "MATCH_REVISION"]);
  const started = await ask(mock, "POST", start, { revision: ready.revision, side: "home" });
  assert.equal(started.status, 200);
  assert.deepEqual([started.payload.preparation.status, started.payload.preparation.revision], ["in_progress", ready.revision + 1]);
  assert.ok(started.payload.preparation.startedAt);
  assert.deepEqual([started.payload.snapshots.home.team.id, started.payload.snapshots.away.team.id], ["t1", "rt1"]);
  assert.equal(mock.games.find((game) => game.id === "g1").preparationStatus, "in_progress");
  const twice = await ask(mock, "POST", start, { revision: ready.revision });
  assert.deepEqual(twice.payload, started.payload, "a second start is answered as the first");
  assert.deepEqual(codeOf(await ask(mock, "PATCH", "/api/games/g1/preparation", { revision: ready.revision + 1, action: { type: "fans", value: 1 } })), [409, "MATCH_STARTED"]);
});

test("«Before the match»: the first rival's roster dearer, cheaper or level with Mock Team's, each a new revision of it", async () => {
  const mock = freshMock();
  const page = async () => (await ask(mock, "GET", "/api/players/u2/teams/rt1")).payload.team;
  for (const [name, total] of [["minus", 530], ["even", 620], ["plus", 710]]) {
    const before = (await page()).revision;
    const set = await ask(mock, "POST", `/api/mock/before/${name}`);
    assert.equal(set.status, 200, name);
    assert.deepEqual(set.payload.ctv, { own: 620, rival: total }, name);
    const team = await page();
    assert.equal(ctvOf(team), total, name);
    assert.equal(team.revision, before + 1, name);
    assert.equal(team.roster.players.filter((player) => player.skipNextGame).length, 2, `${name}: the two out stay`);
  }
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/before/odd")), [400, "FIELD_INVALID"]);
  // The case is made against Mock Team as it is now: with the mock's own apothecary, 670k.
  mock.teams[0].roster.apothecary = 1;
  for (const [name, total] of [["plus", 760], ["even", 670], ["minus", 580]]) {
    assert.deepEqual((await ask(mock, "POST", `/api/mock/before/${name}`)).payload.ctv, { own: 670, rival: total }, name);
    assert.equal(ctvOf(await page()), total, name);
  }
  // Level, with a Tier 2 rival: his tier bonus stands at equal CTVs (decision 12; the final review, m-7).
  const bonus = await ask(mock, "POST", "/api/mock/before/even-bonus");
  assert.deepEqual(bonus.payload.ctv, { own: 670, rival: 670 });
  const tzeentch = await page();
  assert.equal(tzeentch.baseTeamSlug, "teams/tzeentch");
  assert.equal(mock.games.find((game) => game.id === "g1").away.team.baseTeamSlug, "teams/tzeentch", "the list's game says so too");
  const { matchPreview } = await import("../src/domain/match/preview.mjs");
  const ours = mock.teams[0];
  const preview = matchPreview({ own: { user: { id: "u1", login: "coach" }, team: ours }, other: { user: { id: "u2", login: "rival" }, team: tzeentch } }, data);
  assert.deepEqual([preview.gets, preview.bonus], ["even", { own: 0, other: 200 }]);
  assert.equal(tzeentch.roster.players.filter((player) => player.skipNextGame).length, 2);
  await ask(mock, "POST", "/api/mock/before/even");
  assert.equal((await page()).baseTeamSlug, "teams/dwarf", "another case gives him back his Dwarfs");
  assert.equal(mock.games.find((game) => game.id === "g1").away.team.baseTeamSlug, "teams/dwarf");
  delete mock.teams[0].roster.apothecary;
  // The g1 preparation follows the rival's new roster on its next read, as the server's does.
  await ask(mock, "POST", "/api/mock/prep/g1/roster");
  await ask(mock, "POST", "/api/mock/before/even");
  const read = (await ask(mock, "GET", "/api/games/g1/preparation")).payload.preparation;
  assert.equal(calculateMatchCtv(read.away).total, 620);
  assert.deepEqual([read.home.fansRoll, read.weather.home], [2, 3], "the dice are kept");
});

test("an empty mock has no rival and no match", async () => {
  const mock = { ...freshMock(), teams: [], games: [] };
  assert.deepEqual(codeOf(await ask(mock, "GET", "/api/games/g1/preparation")), [404, "GAME_NOT_FOUND"]);
  assert.deepEqual(codeOf(await ask(mock, "POST", "/api/mock/before/plus")), [404, "TEAM_NOT_FOUND"]);
  assert.equal(await ask(mock, "GET", "/api/players/u2/teams/rt1"), null);
});
