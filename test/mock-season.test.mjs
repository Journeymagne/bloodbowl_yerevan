import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { errorPayload } from "../server/http/errors.mjs";
import { computeSeasonStandings } from "../server/season/scoring.mjs";
import { seasonTable } from "../src/data/season-table.mjs";
import { rolledDice } from "../src/domain/roster/dice.mjs";
import { matchPoints } from "../src/domain/league-rules.mjs";
import { answerMatches } from "../scripts/mock/matches.mjs";
import { answerSeason } from "../scripts/mock/season.mjs";

/*
 * The mock API's season (scripts/mock/season.mjs, stage 10 Task 11): a season of ten entries with its rounds, the
 * league's other coaches and their public teams. The lists are the ones scripts/mock-api.mjs hands its answerers;
 * the games are the ones it holds (g1–g6), the coach's team t1 at home in g1 and g4, away in g5.
 */

const user = { id: "u1", login: "coach", telegram: "@coach", isAdmin: false, createdAt: "2026-10-01T00:00:00Z" };
const rival = { id: "u2", login: "rival", telegram: "@rival", isAdmin: false, createdAt: "2026-10-01T00:00:00Z", savedTeamCount: 0, lastTeamUpdatedAt: null };
const SEASON = { id: "s1", name: "Mock Season", status: "active", currentRound: 3 };
const teamOf = (id, name, baseTeamSlug, inActiveSeason = true) => ({ id, name, baseTeamSlug, logoData: null, roster: {}, revision: 1, stage: "active", inActiveSeason });
const TEAMS = [teamOf("t1", "Mock Team", "teams/amazon"), teamOf("t2", "Mock Humans", "teams/human"), teamOf("t3", "Mock Orcs", "teams/orc"),
  teamOf("t4", "Mock Draft", "teams/norse", false), teamOf("t5", "Mock Veterans", "teams/dwarf", false)];
const RIVALS = [{ id: "rt1", name: "Rival Team", baseTeamSlug: "teams/dwarf" }, { id: "rt2", name: "Rival Raiders", baseTeamSlug: "teams/skaven" },
  { id: "rt3", name: "Rival Wardens", baseTeamSlug: "teams/lizardmen" }];
const side = (owner, { id, name, baseTeamSlug }) => ({ user: { id: owner.id, login: owner.login }, team: { id, name, baseTeamSlug, logoUrl: null } });
/** A game as mock-api.mjs's `pairingOf` makes it: round 3, the coach at home unless `viewerIsHome` says otherwise. */
const game = (id, table, own, opposing, changes = {}) => {
  const viewerIsHome = changes.viewerIsHome ?? true;
  const [home, away] = viewerIsHome ? [side(user, own), side(rival, opposing)] : [side(rival, opposing), side(user, own)];
  return { id, roundId: "r3", roundNumber: 3, roundStatus: "started", tableNumber: table, homeEntryId: `e-${home.team.id}`, awayEntryId: `e-${away.team.id}`,
    homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, homePoints: null, awayPoints: null, resultStatus: "pending",
    preparationStatus: "not_started", postMatchStatus: "not_started", proposedByUserId: null, proposedHomeTouchdowns: null, proposedAwayTouchdowns: null,
    proposedHomeCasualties: null, proposedAwayCasualties: null, proposedAt: null, confirmedAt: null, createdAt: "2026-09-21T00:00:00Z",
    updatedAt: "2026-10-21T00:00:00Z", kind: "league", season: SEASON, ...changes, home, away, viewerIsHome };
};
const scored = (proposer, touchdowns, casualties, points, at) => ({ resultStatus: "confirmed", homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1],
  homeCasualties: casualties[0], awayCasualties: casualties[1], homePoints: points[0], awayPoints: points[1], proposedByUserId: proposer.id, confirmedAt: at });
const GAMES = [
  game("g6", 1, TEAMS[0], RIVALS[0], { kind: "friendly", season: null, roundId: null, roundNumber: 0, homeEntryId: null, awayEntryId: null,
    ...scored(rival, [1, 1], [0, 0], [0, 0], "2026-10-19T00:00:00Z") }),
  game("g1", 1, TEAMS[0], RIVALS[0]),
  game("g2", 2, TEAMS[1], RIVALS[1], { preparationStatus: "in_progress", postMatchStatus: "draft" }),
  game("g3", 3, TEAMS[2], RIVALS[2], { resultStatus: "awaiting_confirmation", proposedByUserId: "u2", proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1,
    proposedHomeCasualties: 1, proposedAwayCasualties: 0, proposedAt: "2026-10-21T00:00:00Z" }),
  game("g5", 1, TEAMS[0], RIVALS[2], { roundId: "r2", roundNumber: 2, roundStatus: "completed", viewerIsHome: false, ...scored(rival, [2, 0], [1, 0], [4, 0], "2026-10-15T00:00:00Z") }),
  game("g4", 1, TEAMS[0], RIVALS[1], { roundId: "r1", roundNumber: 1, roundStatus: "completed", ...scored(user, [2, 1], [1, 0], [3, 0], "2026-10-08T00:00:00Z") }),
];

const reply = (payload, status = 200) => ({ status, payload });
const refuse = (status, code, params = {}) => reply(errorPayload(code, params), status);
/** A fresh copy of the mock's lists and helpers, as mock-api.mjs hands them to an answerer; `empty` is MOCK_EMPTY=1's. */
const freshMock = ({ empty = false } = {}) => ({ teams: empty ? [] : structuredClone(TEAMS), games: empty ? [] : structuredClone(GAMES), user, rival, reply, refuse,
  readBody: async () => ({}) });
const GET = { method: "GET" };
const ask = async (pathname, mock = freshMock()) => answerSeason(GET, pathname, mock);

/** The payload back as the rows the server reads: what `computeSeasonStandings` takes. */
function rowsOf(payload) {
  const entryRows = [...payload.entries, ...payload.historicalEntries].map((entry) => ({
    id: entry.id, season_id: entry.seasonId, withdrawn_at: entry.withdrawnAt, created_at: entry.createdAt, updated_at: entry.updatedAt,
    user_id: entry.user.id, user_login: entry.user.login, user_telegram: entry.user.telegram, user_is_admin: entry.user.isAdmin,
    saved_team_id: entry.team.id, team_name: entry.team.name, base_team_slug: entry.team.baseTeamSlug, team_created_at: entry.team.createdAt, team_updated_at: entry.team.updatedAt,
  }));
  const pairingRows = payload.rounds.flatMap((round) => round.pairings.map((pairing) => ({
    id: pairing.id, round_status: pairing.roundStatus, match_kind: "league", home_entry_id: pairing.homeEntryId, away_entry_id: pairing.awayEntryId,
    home_points: pairing.homePoints, away_points: pairing.awayPoints, home_touchdowns: pairing.homeTouchdowns, away_touchdowns: pairing.awayTouchdowns,
    home_casualties: pairing.homeCasualties, away_casualties: pairing.awayCasualties,
  })));
  return { entryRows, pairingRows };
}

const rowOf = (payload, teamId) => payload.standings.find((row) => row.team.id === teamId);

test("the season: ten entries, rounds 1 and 2 over and 3 on, the coach's and the first rival's rows as before", async () => {
  const { status, payload } = await ask("/api/season");
  assert.equal(status, 200);
  assert.equal(payload.season.name, "Mock Season");
  assert.equal(payload.standings.length, 10);
  assert.equal(payload.entries.length, 9);
  assert.equal(payload.historicalEntries.length, 1, "one entry withdrawn");
  assert.equal(payload.historicalEntries[0].user.id, "u4");
  assert.deepEqual(payload.rounds.map(({ roundNumber, status: state }) => [roundNumber, state]), [[1, "completed"], [2, "completed"], [3, "started"]]);
  // The first rival leads with two wins of 3, TD 4 and CAS 2; t1 has 3 points from g4 and g5, its place what the table makes of it (pre-flight L1).
  assert.deepEqual([rowOf(payload, "rt1").rank, rowOf(payload, "rt1").points, rowOf(payload, "rt1").games, rowOf(payload, "rt1").touchdowns, rowOf(payload, "rt1").casualties],
    [1, 6, 2, 4, 2]);
  assert.deepEqual([rowOf(payload, "t1").points, rowOf(payload, "t1").games, rowOf(payload, "t1").touchdowns, rowOf(payload, "t1").casualties], [3, 2, 2, 1]);
  assert.equal(rowOf(payload, "t1").rank, 4);
  const t1 = seasonTable(payload).find((row) => row.team.id === "t1");
  assert.deepEqual([t1.wins, t1.draws, t1.losses, t1.touchdowns, t1.conceded], [1, 0, 1, 2, 3]);
  assert.deepEqual(t1.form, ["w", "l"]);
  // The coach's three teams in the season and the rivals of the list; the coaches of the league besides.
  assert.deepEqual(payload.standings.map((row) => row.team.id).sort(), ["l1", "l2", "n1", "n2", "rt1", "rt2", "rt3", "t1", "t2", "t3"]);
  assert.deepEqual([...new Set(payload.standings.map((row) => row.user.id))].sort(), ["u1", "u2", "u3", "u4"]);
  // Round 3's pairings are g1–g3 as the games have them; round 2 and round 3 have a bye each.
  const [first, second, third] = payload.rounds;
  assert.deepEqual(third.pairings.filter((pairing) => /^g/.test(pairing.id)).map(({ id }) => id), ["g1", "g2", "g3"]);
  assert.equal(third.pairings.find(({ id }) => id === "g3").resultStatus, "awaiting_confirmation");
  assert.equal(third.pairings.find(({ id }) => id === "g3").proposedHomeTouchdowns, 2);
  for (const round of [second, third]) assert.equal(round.pairings.filter((pairing) => !pairing.awayEntryId).length, 1, `round ${round.roundNumber}'s bye`);
  assert.equal(first.pairings.find(({ id }) => id === "g4").homeTouchdowns, 2);
  assert.deepEqual(second.pairings.find(({ id }) => id === "g5").homePoints, 4);
  // t2 and t3 entered late: no pairing in rounds 1 and 2, so their overviews read as their games say.
  for (const id of ["e-t2", "e-t3"]) assert.ok(![...first.pairings, ...second.pairings].some((pairing) => pairing.homeEntryId === id || pairing.awayEntryId === id), id);
  // Every score is the league's points.
  for (const pairing of [...first.pairings, ...second.pairings].filter((item) => item.awayEntryId)) {
    assert.equal(pairing.homePoints, matchPoints({ touchdownsFor: pairing.homeTouchdowns, touchdownsAgainst: pairing.awayTouchdowns, casualtiesFor: pairing.homeCasualties }), pairing.id);
    assert.equal(pairing.awayPoints, matchPoints({ touchdownsFor: pairing.awayTouchdowns, touchdownsAgainst: pairing.homeTouchdowns, casualtiesFor: pairing.awayCasualties }), pairing.id);
  }
});

test("the table is the server's own: its standings are computeSeasonStandings over the pairings sent", async () => {
  const { payload } = await ask("/api/season");
  const { entryRows, pairingRows } = rowsOf(payload);
  const again = computeSeasonStandings(entryRows, pairingRows);
  assert.deepEqual(payload.standings.map(({ entryId, rank, points, games, touchdowns, casualties, withdrawnAt }) => ({ entryId, rank, points, games, touchdowns, casualties, withdrawnAt })),
    again.map(({ entryId, rank, points, games, touchdowns, casualties, withdrawnAt }) => ({ entryId, rank, points, games, touchdowns, casualties, withdrawnAt })));
  // A score the games change is the table's at the next read.
  const mock = freshMock();
  Object.assign(mock.games.find(({ id }) => id === "g4"), { homeTouchdowns: 1, awayTouchdowns: 1, homePoints: 1, awayPoints: 1 });
  assert.equal(rowOf((await ask("/api/season", mock)).payload, "t1").points, 1);
});

test("MOCK_EMPTY: the season has the league's entries and none of the coach's", async () => {
  const { payload } = await ask("/api/season", freshMock({ empty: true }));
  assert.equal(payload.standings.length, 7);
  assert.ok(!payload.standings.some((row) => row.user.id === "u1"));
  assert.ok(!payload.rounds.flatMap((round) => round.pairings).some(({ id }) => /^g/.test(id)), "no pairing of the coach's games");
  assert.equal(rowOf(payload, "rt1").rank, 1);
});

test("a coach's page and a team's with its site roll", async () => {
  const page = await ask("/api/players/u3");
  assert.equal(page.status, 200);
  assert.deepEqual([page.payload.user.login, page.payload.user.telegram, page.payload.user.savedTeamCount], ["narek", "@narek_bb", 2]);
  assert.equal(page.payload.teams.length, 2);
  const [teamId] = page.payload.teams.map(({ id }) => id);
  const { status, payload } = await ask(`/api/players/u3/teams/${teamId}`);
  assert.equal(status, 200);
  assert.deepEqual(Object.keys(payload).sort(), ["rolls", "team", "user"]);
  assert.equal(payload.user.id, "u3");
  assert.equal(payload.user.savedTeamCount, undefined, "the public user, without the counts");
  const [roll] = payload.rolls;
  assert.deepEqual(Object.keys(roll).sort(), ["id", "playerId", "purpose", "result"], "the public roll: no attempts, faces or stamps");
  assert.equal(roll.purpose, "random_skill");
  assert.equal(rolledDice(roll).length, 2);
  const players = payload.team.roster.players;
  const rolled = players.find((player) => player.advancements?.some((advancement) => advancement.roll?.id === roll.id));
  assert.ok(rolled, "a player's advancement names the roll");
  assert.equal(String(roll.playerId), rolled.id);
  assert.ok(rolled.extraSkills.some(({ name }) => name === rolled.advancements[0].grants.skill), "the skill taken is his");
  assert.ok(rolledDice(roll).some(({ skill }) => skill === rolled.advancements[0].grants.skill), "one of the dice showed it");
  assert.ok(players.some((player) => player.isCaptain), "a captain");
  assert.ok(players.some((player) => player.skipNextGame), "one who misses the match");
  // Lilit's: no rolls; her withdrawn team is still hers. Another coach's team under her is not.
  const lilit = await ask("/api/players/u4");
  assert.deepEqual([lilit.payload.user.telegram, lilit.payload.teams.length], ["@lilit_leaps", 2]);
  for (const { id } of lilit.payload.teams) assert.deepEqual((await ask(`/api/players/u4/teams/${id}`)).payload.rolls, []);
  const wrong = await ask(`/api/players/u4/teams/${teamId}`);
  assert.deepEqual([wrong.status, wrong.payload.error.code], [404, "TEAM_NOT_FOUND"]);
  // The rival's page lists his three teams, with their count.
  const theirs = await ask("/api/players/u2");
  assert.deepEqual(theirs.payload.teams.map(({ id }) => id), ["rt1", "rt2", "rt3"]);
  assert.equal(theirs.payload.user.savedTeamCount, 3);
  // The coach's own page and anything else are not this module's.
  assert.equal(await ask("/api/players/u1"), null);
  assert.equal(await ask("/api/players/u9"), null);
  assert.equal(await answerSeason({ method: "POST" }, "/api/season", freshMock()), null);
});

test("the first rival's team is still the matches' mock's, and every rival's", async () => {
  const mock = freshMock();
  for (const id of ["rt1", "rt2", "rt3"]) assert.equal(await answerSeason(GET, `/api/players/u2/teams/${id}`, mock), null, `${id}: the season leaves it to the matches`);
  // (The first rival's roster is made against Mock Team's CTV, which this copy's empty roster has none of: the second stands for it.)
  const { status, payload } = await answerMatches(GET, "/api/players/u2/teams/rt2", mock);
  assert.equal(status, 200);
  assert.equal(payload.team.id, "rt2");
  assert.equal(payload.rolls, undefined, "the 09a rivals carry no rolls (pre-flight L27): the client reads none");
  // mock-api.mjs asks the season after the matches, before the league's other answers.
  const api = readFileSync(new URL("../scripts/mock-api.mjs", import.meta.url), "utf8");
  assert.match(api, /answerMatches, answerSeason, answerLeague/);
  assert.doesNotMatch(api, /seasonBundle|standingRow/);
});
