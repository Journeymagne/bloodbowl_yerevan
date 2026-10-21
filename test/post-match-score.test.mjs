import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { expandCollections } from "../src/data/reference.mjs";
import { matchPoints } from "../src/domain/league-rules.mjs";
import { createMatchSide } from "../src/domain/match/roster.mjs";
import { followEvents } from "../src/domain/post-match/events.mjs";
import { postIncome } from "../src/domain/post-match/finance.mjs";
import { projectPostRoster } from "../src/domain/post-match/roster.mjs";
import {
  POINT_PARTS, hasRecords, mvpChoices, nextMatchChanges, postPoints, scoreMismatches, sideRecords,
} from "../src/domain/post-match/score.mjs";
import { applyPostAction, createPostMatch } from "../src/domain/post-match/state.mjs";

const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));

/** A team of eleven Human Linemen as its coach brings it; `players` changes some of them. */
function source(name, gamesPlayed, players = {}) {
  const roster = Array.from({ length: 11 }, (_, at) => {
    const id = `${name[0]}${at + 1}`;
    return { id, rowIndex: 0, number: String(at + 1), name: `Player ${at + 1}`, ...players[id] };
  });
  return { user: { id: name, login: name }, gamesPlayed, events: [],
    team: { id: name, name, revision: 2, baseTeamSlug: "teams/human", roster: { treasury: 150, dedicatedFans: 2, coachesSafe: 0, players: roster } } };
}

/** One step of a match's record: a counter's +1, or an injury put on. */
const tap = (playerId, counter, times = 1) => Array.from({ length: times }, () => ({ playerId, counter, delta: 1 }));
const hurt = (playerId, code) => [{ playerId, counter: "injury", delta: 1, injury: { code } }];

/**
 * A post-match of humans whose score both coaches agreed, reading each side's match records as the server
 * does (`followEvents`). `score` is `[home TD, away TD, home CAS, away CAS]`; a mode other than "played"
 * is won by home; `reason`, when given, is sent with the result.
 */
function agreed({ score = [0, 0, 0, 0], mode = "played", reason, events = {}, gamesPlayed = 4, players = {}, stars = [] } = {}) {
  const sources = { home: source("home", gamesPlayed, players.home), away: source("away", gamesPlayed, players.away) };
  const snapshots = Object.fromEntries(Object.entries(sources).map(([name, item]) => [name, { ...createMatchSide(item, data), fanFactor: 3, effects: {} }]));
  snapshots.home.players.push(...stars);
  let state = createPostMatch("game", sources, snapshots, data);
  const [homeTd, awayTd, homeCas, awayCas] = score;
  state = applyPostAction(state, "home", { type: "result", mode, winner: mode === "played" ? "" : "home", ...(reason === undefined ? {} : { reason }),
    home: { touchdowns: homeTd, casualties: homeCas }, away: { touchdowns: awayTd, casualties: awayCas } }, data);
  state = applyPostAction(state, "away", { type: "agree-result" }, data);
  return followEvents(state, events);
}

const fans = (state, name, roll = 3) => applyPostAction(state, name, { type: "fans", roll, technicalRoll: 2 }, data);
const saveRecords = (state, name, mvps, more = {}) =>
  applyPostAction(state, name, { type: "statistics", statistics: state[name].statistics, injuries: state[name].injuries, mvps, ...more }, data);
const sumOf = (parts) => parts.reduce((total, { points }) => total + points, 0);

test("a side's records are its statistics: TD, CAS, the scorers and how many steps", () => {
  const events = { home: [...tap("h1", "touchdowns"), ...tap("h2", "touchdowns"), ...tap("h3", "casualties", 2), ...tap("h4", "casualties"), ...hurt("h5", "miss")] };
  const state = agreed({ score: [2, 0, 3, 0], events });
  assert.equal(hasRecords(state.home), true);
  assert.deepEqual(sideRecords(state.home), { touchdowns: 2, casualties: 3, count: 6, scorers: [
    { id: "h1", number: "1", name: "Player 1", touchdowns: 1, casualties: 0 },
    { id: "h2", number: "2", name: "Player 2", touchdowns: 1, casualties: 0 },
    { id: "h3", number: "3", name: "Player 3", touchdowns: 0, casualties: 2 },
    { id: "h4", number: "4", name: "Player 4", touchdowns: 0, casualties: 1 },
  ] });
  assert.deepEqual(sideRecords(state.away), { touchdowns: 0, casualties: 0, count: 0, scorers: [] });
  const saved = saveRecords(fans(state, "home"), "home", ["h1"], { injuries: { ...state.home.injuries, h6: { code: "none", retire: false } } });
  assert.equal(saved.home.followsEvents, false);
  assert.equal(hasRecords(saved.home), true, "a side whose Players step is saved was begun in 3.0 all the same");
  assert.equal(sideRecords(saved.home).count, 6, "the MVP is no step of the match, and «no injury» no injury");
});

test("a side begun before 3.0 has no records", () => {
  const state = agreed({ score: [3, 0, 0, 0], events: { home: tap("h1", "touchdowns", 2) } });
  assert.equal(scoreMismatches(state).length, 1);
  delete state.home.followsEvents;
  assert.equal(hasRecords(state.home), false);
  assert.equal(sideRecords(state.home), null);
  assert.deepEqual(scoreMismatches(state), []);
});

test("a mismatch is what lock-players would refuse: a side, a counter, the score and the records", () => {
  const events = { home: [...tap("h1", "touchdowns", 2), ...tap("h2", "casualties", 3)], away: tap("a1", "touchdowns") };
  const off = fans(agreed({ score: [3, 1, 3, 0], events }), "home");
  assert.deepEqual(scoreMismatches(off), [{ side: "home", counter: "touchdowns", score: 3, records: 2 }]);
  const saved = saveRecords(off, "home", ["h1"]);
  assert.deepEqual(scoreMismatches(saved), [{ side: "home", counter: "touchdowns", score: 3, records: 2 }]);
  assert.throws(() => applyPostAction(saved, "home", { type: "lock-players" }, data), { code: "POST_STATISTICS", params: { counter: "touchdowns" } });
  const even = saveRecords(fans(agreed({ score: [2, 1, 3, 0], events }), "home"), "home", ["h1"]);
  assert.deepEqual(scoreMismatches(even), []);
  assert.equal(applyPostAction(even, "home", { type: "lock-players" }, data).home.stage, 3);
  assert.deepEqual(scoreMismatches(agreed()), [], "nothing recorded, nothing scored");
  assert.deepEqual(scoreMismatches({ ...even, result: null }), [], "no score yet");

  const technical = agreed({ mode: "technical", events: { home: tap("h1", "touchdowns") } });
  assert.deepEqual(scoreMismatches(technical), [{ side: "home", counter: "touchdowns", score: 0, records: 1 }]);
  for (const mode of ["conceded", "conceded-safe"]) {
    const conceded = agreed({ score: [2, 0, 0, 0], mode, events: { home: tap("h1", "touchdowns", 2), away: [...tap("a1", "touchdowns"), ...tap("a2", "casualties")] } });
    assert.deepEqual(scoreMismatches(conceded), [{ side: "away", counter: "casualties", score: 0, records: 1 }], `${mode}: the loser's TD are not checked`);
  }
});

test("points as the table counts them, in parts that add up", () => {
  assert.deepEqual(POINT_PARTS, ["win", "draw", "loss", "bigWin", "shutout", "casualties", "technical", "noTeam"]);
  const big = agreed({ score: [3, 0, 3, 1] });
  const won = postPoints(big, "home", "league");
  assert.equal(won.total, matchPoints({ touchdownsFor: 3, touchdownsAgainst: 0, casualtiesFor: 3 }));
  assert.deepEqual(won.parts, [{ key: "win", points: 3 }, { key: "bigWin", points: 1 }, { key: "shutout", points: 1 }, { key: "casualties", points: 1 }]);
  assert.equal(sumOf(won.parts), won.total);
  assert.deepEqual(postPoints(big, "away", "league"), { total: 0, parts: [{ key: "loss", points: 0 }] });
  const draw = postPoints(agreed({ score: [1, 1, 0, 3] }), "away", "league");
  assert.deepEqual(draw, { total: 2, parts: [{ key: "draw", points: 1 }, { key: "casualties", points: 1 }] });
  assert.equal(draw.total, matchPoints({ touchdownsFor: 1, touchdownsAgainst: 1, casualtiesFor: 3 }));
  const close = postPoints(agreed({ score: [2, 1, 0, 0] }), "home", "league");
  assert.deepEqual(close, { total: 3, parts: [{ key: "win", points: 3 }] });
  const conceded = agreed({ score: [2, 0, 0, 0], mode: "conceded" });
  assert.deepEqual(postPoints(conceded, "home", "league"), { total: 4, parts: [{ key: "win", points: 3 }, { key: "shutout", points: 1 }] });
  const technical = agreed({ mode: "technical" });
  assert.deepEqual(postPoints(technical, "home", "league"), { total: 2, parts: [{ key: "technical", points: 2 }] });
  assert.deepEqual(postPoints(technical, "away", "league"), { total: 0, parts: [{ key: "loss", points: 0 }] });
  for (const name of ["home", "away"]) assert.deepEqual(postPoints(big, name, "friendly"), { total: 0, parts: [] });
});

test("the post-match's points are the same: 2 + 2 in two parts for a win when the opponent could not field a team, one part otherwise", () => {
  const noTeam = agreed({ mode: "technical", reason: "no_team" });
  assert.deepEqual(postPoints(noTeam, "home", "league"), { total: 4, parts: [{ key: "technical", points: 2 }, { key: "noTeam", points: 2 }] });
  assert.deepEqual(postPoints(noTeam, "away", "league"), { total: 0, parts: [{ key: "loss", points: 0 }] });
  assert.deepEqual(postPoints(agreed({ mode: "technical", reason: "other" }), "home", "league"), { total: 2, parts: [{ key: "technical", points: 2 }] });
  const begunBefore12 = structuredClone(agreed({ mode: "technical" }));
  delete begunBefore12.result.reason;
  assert.deepEqual(postPoints(begunBefore12, "home", "league"), { total: 2, parts: [{ key: "technical", points: 2 }] }, "a technical result with no reason is the other kind");
  assert.deepEqual(postPoints(noTeam, "home", "friendly"), { total: 0, parts: [] });
  for (const name of ["home", "away"]) assert.equal(sumOf(postPoints(noTeam, name, "league").parts), postPoints(noTeam, name, "league").total);
});

test("a technical result in the post-match carries its reason — the other kind when it is sent none, a reason outside the two refused; another mode has none", () => {
  assert.equal(agreed({ mode: "technical", reason: "no_team" }).result.reason, "no_team");
  assert.equal(agreed({ mode: "technical", reason: "other" }).result.reason, "other");
  for (const reason of [undefined, null]) assert.equal(agreed({ mode: "technical", reason }).result.reason, "other", `sent ${reason}`);
  for (const reason of ["late", "", "No_team", 2, ["no_team"]]) {
    assert.throws(() => agreed({ mode: "technical", reason }), { code: "POST_VALUE" }, `sent ${JSON.stringify(reason)}`);
  }
  for (const mode of ["played", "conceded", "conceded-safe"]) {
    const result = agreed({ score: [2, 0, 1, 0], mode, reason: "no_team" }).result;
    assert.equal(Object.hasOwn(result, "reason"), false, mode);
  }
});

test("MVP choices leave out stars and the dead; rookie protection makes Dead Badly Hurt", () => {
  const star = { id: "star-1", kind: "star", number: "20", name: "Star" };
  const events = { home: [...tap("h3", "touchdowns"), ...tap("h9", "touchdowns"), ...tap("h5", "casualties"), ...tap("h7", "completions"),
    ...tap("star-1", "touchdowns"), ...hurt("h2", "dead")] };
  const players = { home: { h4: { number: "15" } } };
  const state = agreed({ score: [3, 0, 1, 0], events, gamesPlayed: 3, stars: [star], players });
  const choices = mvpChoices(state, "home");
  assert.equal(choices.count, 1);
  assert.deepEqual(choices.top, [
    { id: "h3", number: "3", name: "Player 3", spp: 3 }, { id: "h9", number: "9", name: "Player 9", spp: 3 },
    { id: "h5", number: "5", name: "Player 5", spp: 2 }, { id: "h7", number: "7", name: "Player 7", spp: 1 },
  ]);
  assert.deepEqual(choices.rest.map(({ id }) => id), ["h1", "h6", "h8", "h10", "h11", "h4"], "by number: no star, no one dead");
  const chosen = saveRecords(fans(state, "home"), "home", ["h7"]);
  assert.deepEqual(mvpChoices(chosen, "home").top.map(({ id, spp }) => [id, spp]), [["h3", 3], ["h9", 3], ["h5", 2], ["h7", 1]], "SPP without the MVP");
  const rookies = agreed({ score: [3, 0, 1, 0], events, gamesPlayed: 1, stars: [star], players });
  assert.deepEqual(mvpChoices(rookies, "home").rest.map(({ id }) => id), ["h1", "h2", "h6", "h8", "h10", "h11", "h4"], "Dead counts as Badly Hurt");
  const technical = agreed({ mode: "technical", events: { home: tap("h1", "touchdowns") } });
  assert.deepEqual([mvpChoices(technical, "home").count, mvpChoices(technical, "away").count], [2, 0]);
  assert.deepEqual(mvpChoices(technical, "home").top, [], "a technical result earns no SPP but the MVPs");
});

test("a conceded-safe loser is not a conceded one: D6, income, SPP, one MVP, no veterans", () => {
  const veteran = { a1: { advancements: [{ type: "primary" }, { type: "primary" }, { type: "primary" }], spp: { touchdowns: 20 } } };
  const events = { home: tap("h1", "touchdowns", 2), away: tap("a2", "completions") };
  const safe = agreed({ score: [2, 0, 0, 0], mode: "conceded-safe", events, players: { away: veteran } });
  const conceded = agreed({ score: [2, 0, 0, 0], mode: "conceded", events, players: { away: veteran } });
  assert.deepEqual([mvpChoices(safe, "away").count, mvpChoices(conceded, "away").count], [1, 0]);
  assert.deepEqual(mvpChoices(safe, "away").top.map(({ id, spp }) => [id, spp]), [["a2", 1]]);
  assert.deepEqual(mvpChoices(conceded, "away").top, []);
  assert.equal(fans(safe, "away", 5).away.stage, 2, "a D6 for fans");
  assert.throws(() => fans(conceded, "away", 5), { code: "POST_VALUE" });
  assert.ok(postIncome(safe, "away").total > 0);
  assert.equal(postIncome(conceded, "away").total, 0);
  const locked = applyPostAction(saveRecords(fans(safe, "away", 5), "away", ["a2"]), "away", { type: "lock-players" }, data);
  assert.equal(locked.away.stage, 3, "no veteran rolls to leave");
  assert.throws(() => applyPostAction(saveRecords(fans(conceded, "away", 2), "away", []), "away", { type: "lock-players" }, data), { code: "POST_DICE" });
});

test("who comes back and who misses the next match", () => {
  const players = { home: { h6: { skipNextGame: true }, h8: { skipNextGame: true, temporarilyRetired: true }, h9: { skipNextGame: true } } };
  const events = { home: [...hurt("h7", "miss"), ...hurt("h9", "dead"), ...hurt("h10", "badly-hurt")] };
  const state = agreed({ events, players });
  const changes = nextMatchChanges(state, "home", projectPostRoster(state, "home", data).roster);
  assert.deepEqual(changes.returning, [{ id: "h6", number: "6", name: "Player 6" }]);
  assert.deepEqual(changes.missing, [
    { id: "h7", number: "7", name: "Player 7", injury: { code: "miss", retire: false }, retired: false },
    { id: "h8", number: "8", name: "Player 8", injury: null, retired: true },
  ]);
  const rookies = agreed({ events, players, gamesPlayed: 2 });
  const protectedChanges = nextMatchChanges(rookies, "home", projectPostRoster(rookies, "home", data).roster);
  assert.deepEqual(protectedChanges.returning.map(({ id }) => id), ["h6", "h9"], "Dead read as Badly Hurt: back next match");
  assert.deepEqual(protectedChanges.missing.map(({ id, injury }) => [id, injury]), [["h8", null]]);
});
