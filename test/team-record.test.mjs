import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { expandCollections } from "../src/data/reference.mjs";
import * as record from "../src/data/team-record.mjs";
import { positionKind } from "../src/domain/roster/players.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const amazon = data.teams.find((team) => team.slug === "teams/amazon");
const SEASON = { season: { id: "s1" }, standings: [] };
/** A game as /api/games sends it; t1 is home unless `away`, the score is t1's first. */
function game(id, { round = 1, td = null, cas = [0, 0], away = false, kind = "league", seasonId = "s1", confirmed = true, at = "2026-10-0" + round + "T10:00:00Z", bye = false,
  race = "teams/dwarf", mvps = null } = {}) {
  const [own, other] = td ?? [null, null];
  const us = { team: { id: "t1", name: "Wardens" } };
  const them = bye ? null : { team: { id: "r1", name: "Raiders", ...(race ? { baseTeamSlug: race } : {}) } };
  // The MVPs as the server's list carries them (`loadGameMvps`): [ours, theirs], each a list of {id, name}.
  const [ownMvps, otherMvps] = mvps ?? [[], []];
  return {
    id, kind, roundNumber: round, season: kind === "league" ? { id: seasonId } : null,
    resultStatus: confirmed && td ? "confirmed" : "pending", confirmedAt: confirmed && td ? at : null, updatedAt: at,
    homeTouchdowns: away ? other : own, awayTouchdowns: away ? own : other,
    homeCasualties: td ? (away ? cas[1] : cas[0]) : null, awayCasualties: td ? (away ? cas[0] : cas[1]) : null,
    ...(mvps ? { homeMvps: away ? otherMvps : ownMvps, awayMvps: away ? ownMvps : otherMvps } : {}),
    home: away ? them : us, away: away ? us : them,
  };
}

test("a win, a draw and a loss are read from the team's side, home or away", () => {
  assert.equal(record.gameOutcome(game("a", { td: [2, 1] }), "t1"), "w");
  assert.equal(record.gameOutcome(game("b", { td: [2, 1], away: true }), "t1"), "w");
  assert.equal(record.gameOutcome(game("c", { td: [1, 1] }), "t1"), "d");
  assert.equal(record.gameOutcome(game("d", { td: [0, 2] }), "t1"), "l");
  assert.equal(record.resultKind(game("e", { td: [3, 0], kind: "friendly" }), "t1"), "t");
});

test("an unconfirmed score is no result, and a bye counts in no record", () => {
  assert.equal(record.gameOutcome(game("a", { td: [2, 1], confirmed: false }), "t1"), null);
  assert.equal(record.gameOutcome(game("b", { td: [1, 0], bye: true }), "t1"), null);
  assert.equal(record.gameSides(game("c", { bye: true }), "t1"), null);
  assert.equal(record.resultKind(game("d", { td: [3, 0], kind: "friendly", confirmed: false }), "t1"), null);
});

test("the sides are the team's own and the other one; a game the team is not in has none", () => {
  assert.deepEqual(record.gameSides(game("a"), "t1"), { own: "home", other: "away" });
  assert.deepEqual(record.gameSides(game("b", { away: true }), "t1"), { own: "away", other: "home" });
  assert.deepEqual(record.gameSides(game("c"), "r1"), { own: "away", other: "home" });
  assert.equal(record.gameSides(game("d"), "t9"), null);
  assert.equal(record.gameSides(game("e", { bye: true }), undefined), null, "no team asked for is nobody's side, not the empty seat's");
  assert.equal(record.gameSides(null, "t1"), null);
});

test("the season's record counts its league games only: not friendlies, not another season", () => {
  const games = [game("a", { td: [2, 1] }), game("b", { round: 2, td: [0, 0] }), game("c", { round: 3, td: [0, 1] }),
    game("f", { td: [5, 0], kind: "friendly" }), game("o", { td: [4, 0], seasonId: "s0" }), game("p", { round: 4, td: [1, 0], confirmed: false })];
  assert.deepEqual(record.seasonRecord(games, "t1", "s1"), { wins: 1, draws: 1, losses: 1 });
  assert.deepEqual(record.seasonRecord([], "t1", "s1"), { wins: 0, draws: 0, losses: 0 });
});

test("the season's TD and CAS difference: the league's confirmed matches of the season, from the team's side; a friendly, another season, a bye and an unconfirmed score add nothing", () => {
  const games = [game("h", { td: [2, 1], cas: [1, 0] }), game("a", { round: 2, td: [0, 2], cas: [0, 2], away: true }),
    game("f", { round: 3, td: [3, 0], kind: "friendly" }), game("o", { round: 4, td: [5, 0], seasonId: "s0" }),
    game("b", { round: 5, td: [1, 0], bye: true }), game("p", { round: 6, td: [4, 0], cas: [2, 0], confirmed: false })];
  assert.deepEqual(record.seasonDifference(games, "t1", "s1"), { touchdowns: -1, casualties: -1 });
  assert.deepEqual(record.seasonDifference([], "t1", "s1"), { touchdowns: 0, casualties: 0 });
  assert.deepEqual(record.seasonDifference(games, "r1", "s1"), { touchdowns: 1, casualties: 1 }, "the opponent's side of the same matches");
});

test("the place and the points come from the table; a team outside it, or withdrawn, has none", () => {
  const seasonData = { season: { id: "s1" }, standings: [
    { team: { id: "r1" }, rank: 1, points: 6 }, { team: { id: "t1" }, rank: 2, points: 3 }, { team: { id: "w" }, rank: 3, points: 0, withdrawnAt: "2026-10-01" }] };
  assert.deepEqual(record.standingOf(seasonData, "t1"), { rank: 2, points: 3, of: 3 });
  assert.equal(record.standingOf(seasonData, "w"), null);
  assert.equal(record.standingOf(seasonData, "t9"), null);
  assert.equal(record.standingOf(null, "t1"), null);
  assert.equal(record.standingOf({ season: { id: "s1" } }, "t1"), null);
});

test("the table's size counts its withdrawn rows, as the rank does: below a withdrawn team the place is 3 of 3 (K2b)", () => {
  const seasonData = { season: { id: "s1" }, standings: [
    { team: { id: "w" }, rank: 1, points: 9, withdrawnAt: "2026-10-01" }, { team: { id: "r1" }, rank: 2, points: 6 }, { team: { id: "t1" }, rank: 3, points: 3 }] };
  assert.deepEqual(record.standingOf(seasonData, "t1"), { rank: 3, points: 3, of: 3 });
});

test("the season's squares go round by round, the current one marked, a match not played yet without a result", () => {
  const games = [game("b", { round: 2, td: [0, 2] }), game("a", { round: 1, td: [2, 1] }), game("c", { round: 3 }), game("f", { td: [1, 1], kind: "friendly" })];
  assert.deepEqual(record.seasonPager(games, "t1", SEASON, "c"),
    [{ gameId: "a", round: 1, result: "w", current: false }, { gameId: "b", round: 2, result: "l", current: false }, { gameId: "c", round: 3, result: null, current: true }]);
});

test("the squares leave out a bye, another season and a season that is not loaded; with no current match none is marked", () => {
  const games = [game("a", { round: 1, td: [2, 1] }), game("b", { round: 2, bye: true }), game("o", { round: 3, seasonId: "s0", td: [1, 0] })];
  assert.deepEqual(record.seasonPager(games, "t1", SEASON), [{ gameId: "a", round: 1, result: "w", current: false }]);
  assert.deepEqual(record.seasonPager(games, "t1", null), []);
});

test("recent results are the newest finished first, a friendly marked, cut at the limit", () => {
  const games = [game("a", { round: 1, td: [2, 1], cas: [3, 1] }), game("b", { round: 2, td: [0, 2], away: true }), game("f", { round: 3, td: [1, 1], kind: "friendly" }), game("c", { round: 4 })];
  const results = record.recentResults(games, "t1", 2);
  assert.deepEqual(results.map(({ gameId, result, friendly, score }) => [gameId, result, friendly, score]), [["f", "t", true, "1–1"], ["b", "l", false, "0–2"]]);
  assert.equal(record.recentResults(games, "t1", 5)[2].cas, "3–1");
});

test("a recent result names the opponent and the round; a friendly has no round", () => {
  const games = [game("a", { round: 2, td: [2, 1] }), game("f", { round: 3, td: [1, 1], kind: "friendly" })];
  assert.deepEqual(record.recentResults(games, "t1", 5).map(({ gameId, opponent, opponentRace, round, mvps }) => [gameId, opponent, opponentRace, round, mvps]),
    [["f", "Raiders", "teams/dwarf", null, []], ["a", "Raiders", "teams/dwarf", 2, []]]);
});

test("a recent result names the opponent's race by its slug; an opponent without one has \"\"", () => {
  const games = [game("a", { round: 1, td: [2, 1], race: "teams/skaven" }), game("b", { round: 2, td: [0, 0], away: true, race: null })];
  assert.deepEqual(record.recentResults(games, "t1", 5).map(({ gameId, opponentRace }) => [gameId, opponentRace]), [["b", ""], ["a", "teams/skaven"]]);
});

test("a recent result names the opponent's coach and team by id, the way to its page; \"\" for one the server does not name", () => {
  const coached = game("a", { round: 1, td: [2, 1] });
  coached.away.user = { id: "u9", login: "rival" };
  const games = [coached, game("b", { round: 2, td: [0, 0], away: true })];
  assert.deepEqual(record.recentResults(games, "t1", 5).map(({ gameId, opponentUserId, opponentTeamId }) => [gameId, opponentUserId, opponentTeamId]),
    [["b", "", "r1"], ["a", "u9", "r1"]]);
});

test("a recent result names the team's own MVPs from the server's list, home or away, a player picked twice once; none, or an answer without the field, is []", () => {
  const gruk = { id: "p7", name: "Gruk" }, vane = { id: "p5", name: "H. Vane" }, theirs = { id: "x1", name: "Their Star" };
  const games = [game("h", { round: 1, td: [2, 1], mvps: [[gruk], [theirs]] }), game("a", { round: 2, td: [3, 0], away: true, mvps: [[gruk, gruk, vane], []] }),
    game("l", { round: 3, td: [0, 2], mvps: [[], [theirs, theirs]] }), game("n", { round: 4, td: [1, 1] }), game("u", { round: 5, td: [1, 0], mvps: [[{ id: "p9", name: "" }], []] })];
  assert.deepEqual(record.recentResults(games, "t1", 5).map(({ gameId, mvps }) => [gameId, mvps]),
    [["u", []], ["n", []], ["l", []], ["a", ["Gruk", "H. Vane"]], ["h", ["Gruk"]]], "a name the server did not know is left out");
  assert.deepEqual(record.recentResults(games, "r1", 5).find((result) => result.gameId === "l").mvps, ["Their Star"], "the other side reads its own");
});

test("team value is the roster's cost without fans; an unknown race has none", () => {
  const withFans = { roster: { players: [{ id: "p1", rowIndex: 0 }], dedicatedFans: 3 } };
  const withoutFans = { roster: { players: [{ id: "p1", rowIndex: 0 }], dedicatedFans: 0 } };
  const linemanCost = Number.parseInt(amazon.team.roster[0].price, 10); // "50K": the one player is the first row's
  assert.ok(linemanCost > 0);
  assert.equal(record.teamValue(withoutFans, amazon), linemanCost, "a roster of one player is worth that player");
  assert.equal(record.teamValue(withFans, amazon), record.teamValue(withoutFans, amazon), "dedicated fans are not part of the value");
  assert.equal(record.teamValue(withFans, null), null);
  assert.deepEqual(withFans.roster, { players: [{ id: "p1", rowIndex: 0 }], dedicatedFans: 3 }, "the blob is not rewritten");
});

test("leaders are the best of each counter, the first on a tie, and a counter nobody scored is left out", () => {
  // Amazon: a touchdown is 3 SPP, a completion 1 (sppCounterWeights): Ashby 7, Vane 10.
  const players = [
    { id: "p1", rowIndex: 0, number: "3", name: "Ashby", spp: { touchdowns: 2, completions: 1 } },
    { id: "p2", rowIndex: 0, number: "5", name: "Vane", spp: { touchdowns: 2, completions: 4 } },
  ];
  const leaders = record.teamLeaders({ roster: { players } }, amazon);
  assert.deepEqual(leaders.map(({ key, id, name, value }) => [key, id, name, value]), [["spp", "p2", "Vane", 10], ["td", "p1", "Ashby", 2], ["comp", "p2", "Vane", 4]]);
  assert.equal(leaders.find((leader) => leader.key === "cas"), undefined);
  assert.equal(leaders[1].number, "3", "a tie goes to the first in the roster");
  assert.deepEqual(record.teamLeaders({ roster: { players } }, null), []);
});

test("a leader carries the player's position, and a team nobody has scored for has none", () => {
  const players = [{ id: "p1", rowIndex: 0, number: "7", name: "Ashby", spp: { casualties: 1 } }, { id: "p2", rowIndex: 0, name: "Vane" }];
  const [leader] = record.teamLeaders({ roster: { players } }, amazon);
  assert.deepEqual([leader.key, leader.value, leader.position, leader.kind], ["spp", 2, amazon.team.roster[0].position, "lineman"]);
  assert.deepEqual(record.teamLeaders({ roster: { players: [{ id: "p1", rowIndex: 0 }] } }, amazon), []);
  assert.deepEqual(record.teamLeaders({ roster: {} }, amazon), []);
});

test("a leader carries the player's id and the kind of the position: the badge's colour and the way to the player", () => {
  const players = [
    { id: "p1", rowIndex: 2, number: "4", name: "Blitz", spp: { touchdowns: 3 } },
    { rowIndex: 1, number: "9", name: "Nameless", spp: { completions: 5 } },
  ];
  const leaders = record.teamLeaders({ roster: { players } }, amazon);
  assert.deepEqual(leaders.map(({ key, id, kind }) => [key, id, kind]), [["spp", "p1", "blitzer"], ["td", "p1", "blitzer"], ["comp", "", "thrower"]],
    "a player the roster stores no id for has none: no address leads to him");
  assert.equal(leaders[0].kind, positionKind(amazon.team.roster[2]));
  assert.equal(leaders[2].kind, positionKind(amazon.team.roster[1]));
});

// Stage 07e, decision 13: the leaders are the career, as the roster counts it (`careerCounters`) — the blob and the
// records not settled yet; a settled record is in the blob already.
test("the leaders count what the records not settled add: a tap of the match on puts a player ahead; a settled one is in the blob already", () => {
  const players = [
    { id: "pa", rowIndex: 0, number: "1", name: "Ashby", spp: { touchdowns: 2 } },
    { id: "pb", rowIndex: 0, number: "2", name: "Vane", spp: { touchdowns: 1 } },
    { rowIndex: 0, number: "3", name: "Nameless", spp: { completions: 1 } },
  ];
  const tap = (playerId, counter, settledAt = null) => ({ id: `e-${playerId}-${counter}-${settledAt ?? "open"}`, pairingId: "g2", playerId, counter, delta: 1, injury: null, settledAt });
  const events = [tap("pb", "touchdowns"), { ...tap("pb", "touchdowns"), id: "e2" }, tap("pa", "touchdowns", "2026-10-20T10:00:00Z")];
  const leaders = record.teamLeaders({ roster: { players } }, amazon, events);
  // Vane: TD 1 on the roster and two taps not settled, TD 3 (9 SPP by the Amazon's weights); Ashby's settled tap is his blob's TD 2.
  assert.deepEqual(leaders.map(({ key, id, name, value }) => [key, id, name, value]), [["spp", "pb", "Vane", 9], ["td", "pb", "Vane", 3], ["comp", "", "Nameless", 1]]);
  // A record names a player by his stored id: one stored with none has the blob alone.
  const nameless = record.teamLeaders({ roster: { players } }, amazon, [{ ...tap("", "completions"), playerId: "" }, tap("p3", "completions")]);
  assert.equal(nameless.find(({ key }) => key === "comp").value, 1);
  // Without the records, as before: the roster's numbers.
  assert.deepEqual(record.teamLeaders({ roster: { players } }, amazon).map(({ key, name, value }) => [key, name, value]),
    [["spp", "Ashby", 6], ["td", "Ashby", 2], ["comp", "Nameless", 1]]);
  // A tap that takes one back is counted too, never below nought: three off Ashby's TD 2.
  const back = record.teamLeaders({ roster: { players } }, amazon, ["e7", "e8", "e9"].map((id) => ({ ...tap("pa", "touchdowns"), id, delta: -1 })));
  assert.deepEqual(back.map(({ key, name, value }) => [key, name, value]), [["spp", "Vane", 3], ["td", "Vane", 1], ["comp", "Nameless", 1]]);
});

test("initials are the first letters of the first two words", () => {
  assert.equal(record.teamInitials("Ashgrove Wardens"), "AW");
  assert.equal(record.teamInitials("приморец"), "П");
  assert.equal(record.teamInitials("  "), "?");
  assert.equal(record.teamInitials("Grak the Mighty"), "GT");
  assert.equal(record.teamInitials(undefined), "?");
});
