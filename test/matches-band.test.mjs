import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { fireEvent } from "./helpers/fake-dom.mjs";
import { initLocale } from "../src/core/i18n.mjs";
import { formatMoney } from "../src/core/format.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { state } from "../src/core/state.mjs";
import { teamValue } from "../src/data/team-record.mjs";
import { currentMatch } from "../src/shell/current-match.mjs";
import { matchPreview, matchRecords } from "../src/domain/match/preview.mjs";
import { bandActions, bandBoard, bandItems, bandMarkup, wireBand } from "../src/screens/matches/band.mjs";

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
state.data = data;
const race = (slug) => data.teams.find((team) => team.slug === slug);

const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3, createdAt: "2026-09-01T10:00:00Z" },
  standings: [{ team: { id: "r1" }, rank: 1, points: 6 }, { team: { id: "t1" }, rank: 2, points: 4 }, { team: { id: "r2" }, rank: 3, points: 1 }],
};
const side = (id, name, slug) => ({ user: { id: `u-${id}`, login: id }, team: { id, name, baseTeamSlug: slug } });
const OURS = side("t1", "Ashgrove Wardens", "teams/human");
const RIVAL = side("r1", "Rival Team", "teams/dwarf");
const OTHER = side("r2", "Grimtusk Raiders", "teams/orc");

/** A league match of round 3 (the one on), t1 at home, as /api/games sends it. */
const game = (id, over = {}) => ({
  id, kind: "league", roundNumber: 3, roundStatus: "started", season: { id: "s1", name: "Mock Season", currentRound: 3 },
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started",
  homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null, homePoints: null, awayPoints: null,
  confirmedAt: null, updatedAt: "2026-10-06T10:00:00Z", home: OURS, away: RIVAL, viewerIsHome: true, viewerIsProposer: false, ...over,
});
/** A finished match, settled on the given day of October: [home, away] touchdowns and casualties, the points of each. */
const played = (id, round, day, touchdowns, casualties, over = {}) => game(id, {
  roundNumber: round, roundStatus: "completed", resultStatus: "confirmed", confirmedAt: `2026-10-0${day}T10:00:00Z`,
  homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1], homeCasualties: casualties[0], awayCasualties: casualties[1], ...over,
});
const R1 = played("g-r1", 1, 1, [2, 0], [1, 0], { homePoints: 4, awayPoints: 0, homeMvps: [{ id: "p1", name: "Ashby" }] });
const FRIENDLY = played("g-f", 0, 2, [1, 1], [0, 2], { kind: "friendly", season: null, roundStatus: null, home: OTHER, away: OURS });
const R2 = played("g-r2", 2, 3, [2, 1], [0, 1], { home: OTHER, away: OURS, homePoints: 3, awayPoints: 0 });
const NOW = game("g-now");
const GAMES = [R2, NOW, FRIENDLY, R1];

const RIVAL_TEAM = { id: "r1", name: "Rival Team", baseTeamSlug: "teams/dwarf", roster: { treasury: 60, players: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((rowIndex, at) => ({ id: `d${at}`, rowIndex, number: String(at + 1), name: `Dwarf ${at + 1}` })) } };
const OUR_TEAM = { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", roster: { treasury: 70, players: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0].map((rowIndex, at) => ({ id: `h${at}`, rowIndex, number: String(at + 1), name: `Human ${at + 1}`, ...(at === 8 ? { name: "J. Corr", skipNextGame: true, absence: { code: "miss" } } : {}) })) } };
// Ours 550k (J. Corr out), theirs 630k with two out: we get the difference; three miss the match.
RIVAL_TEAM.roster.players[3] = { ...RIVAL_TEAM.roster.players[3], skipNextGame: true };
RIVAL_TEAM.roster.players[6] = { ...RIVAL_TEAM.roster.players[6], temporarilyRetired: true };
const PREVIEW = matchPreview({ own: { user: OURS.user, team: OUR_TEAM }, other: { user: RIVAL.user, team: RIVAL_TEAM } }, data);

/** The band's input for t1, as a screen gives it. */
function input(over = {}) {
  const games = over.games ?? GAMES;
  return { items: bandItems(games, "t1", SEASON), index: null, games, team: OUR_TEAM, raceTeam: race("teams/human"), seasonData: SEASON,
    current: currentMatch(games, "t1"), preview: null, opponent: null, records: null, phone: false, ...over };
}

test("the band is the team's played matches in the order they were settled, then the current one", () => {
  const items = bandItems(GAMES, "t1", SEASON);
  assert.deepEqual(items.map((item) => item.label), ["1", "F", "2", "3"]);
  assert.deepEqual(items.map((item) => item.key), ["g-r1", "g-f", "g-r2", "g-now"]);
  assert.deepEqual(items.map((item) => item.current), [false, false, false, true]);
  assert.deepEqual(items.map((item) => item.title), ["Round\u00a01", "Friendly", "Round\u00a02", "Round\u00a03"]);
  assert.deepEqual(items.map((item) => item.result), ["w", "t", "l", null]);
  assert.deepEqual(items.map((item) => item.score), ["2:0", "1:1", "1:2", ""], "from the team's side, the board's way");
  assert.deepEqual(items.map((item) => item.cas), ["1–0", "2–0", "1–0", ""]);
  assert.deepEqual(items[0].mvps, ["Ashby"]);
  assert.deepEqual(items[2].opponent, { name: "Grimtusk Raiders", userId: "u-r2", teamId: "r2", race: "teams/orc" });
  assert.deepEqual([items[0].venue, items[2].venue], ["home", "away"]);
  // In Russian the friendly is a «Т».
  initLocale("ru");
  try {
    assert.deepEqual(bandItems(GAMES, "t1", SEASON).map((item) => item.label), ["1", "Т", "2", "3"]);
  } finally {
    initLocale("en");
  }
});

test("the season's league matches and its friendlies: another season's are not in, nor a friendly before it began (L13)", () => {
  const old = played("g-old", 5, 1, [3, 0], [0, 0], { season: { id: "s0", name: "Old", currentRound: 9 } });
  const oldFriendly = played("g-oldf", 0, 1, [0, 0], [0, 0], { kind: "friendly", season: null, confirmedAt: "2026-08-20T10:00:00Z" });
  assert.deepEqual(bandItems([...GAMES, old, oldFriendly], "t1", SEASON).map((item) => item.key), ["g-r1", "g-f", "g-r2", "g-now"]);
  // A season that does not say when it began takes every friendly; no season, no league matches.
  const undated = { ...SEASON, season: { ...SEASON.season, createdAt: undefined } };
  assert.deepEqual(bandItems([...GAMES, oldFriendly], "t1", undated).map((item) => item.key), ["g-oldf", "g-r1", "g-f", "g-r2", "g-now"]);
  assert.deepEqual(bandItems(GAMES, "t1", null).map((item) => item.key), ["g-f", "g-now"]);
  // A match on whose score is already confirmed (its post-match open) is the current one, once.
  const confirmedLive = played("g-now", 3, 4, [1, 0], [0, 0], { preparationStatus: "in_progress", postMatchStatus: "draft", roundStatus: "started" });
  const items = bandItems([R1, confirmedLive], "t1", SEASON);
  assert.deepEqual(items.map((item) => [item.key, item.current]), [["g-r1", false], ["g-now", true]]);
});

test("no current match: the last item is the opponent to come", () => {
  const items = bandItems([R1, FRIENDLY, R2], "t1", SEASON);
  const last = items.at(-1);
  assert.deepEqual([last.current, last.opponent, last.title, last.label, last.gameId], [true, null, "Round\u00a04", "4", null]);
  const board = bandBoard(input({ games: [R1, FRIENDLY, R2] }));
  assert.equal(board.pendingText, "Opponent — after round 3");
  assert.equal(board.opponent, null);
  assert.deepEqual(board.links.map((link) => [link.label, link.kind]), [["Friendlies", "light"]]);
});

test("a past item's points are the server's, a friendly has none", () => {
  const [win, friendly, loss] = bandItems(GAMES, "t1", SEASON);
  assert.equal(win.points, 4, "a win without conceding is the league's 4");
  assert.equal(friendly.points, null);
  assert.equal(loss.points, 0);
  const unscored = bandItems([played("g-2x", 1, 1, [1, 0], [0, 0])], "t1", SEASON)[0];
  assert.equal(unscored.points, null, "a 2.x pair the server scored none");
  // What the board says of each: the outcome and the points; a friendly's that it does not count.
  const outcome = (index) => bandBoard(input({ index })).outcome;
  assert.deepEqual(outcome(0), { label: "Win", note: "+4 in the table", result: "w" });
  assert.deepEqual(outcome(1), { label: "Friendly · draw", note: "Does not count in the table", result: "d" });
  assert.deepEqual(outcome(2), { label: "Loss", note: "0 in the table", result: "l" });
  assert.deepEqual(bandBoard({ ...input(), items: [unscored, ...input().items.slice(-1)], index: 0 }).outcome, { label: "Win", note: "", result: "w" }, "no points, no «in the table» (L31)");
});

test("a past match on a desk: its opponent with the race and the place, its score in colour, its chips, the way back", () => {
  const board = bandBoard(input({ index: 0 }));
  assert.equal(board.overline, "Round 1 · home");
  assert.deepEqual([board.score, board.scoreResult, board.status, board.toCurrent, board.links], ["2:0", "w", "none", true, []]);
  assert.deepEqual(board.chips, ["CAS 1–0", "MVP Ashby"]);
  assert.deepEqual([board.opponent.name, board.opponent.sub, board.opponent.race.title], ["Rival Team", "#1", "Dwarf"], "no value for a match gone");
  assert.equal(board.own.sub, "Human · #2 · TV 550k");
  const fragment = mount(bandMarkup(input({ index: 2 })));
  assert.equal(fragment.querySelector(".g-board__score").textContent, "1:2");
  assert.equal(fragment.querySelector(".g-board__score").getAttribute("class"), "g-board__score g-board__score--l");
  assert.equal(fragment.querySelector(".g-board__overline").textContent, "Round 2 · away");
  assert.deepEqual(fragment.querySelectorAll(".g-board__chip").map((chip) => chip.textContent), ["CAS 1–0"], "no MVP, no chip for it");
  assert.equal(fragment.querySelector('[aria-selected="true"]').getAttribute("data-board-item"), "2");
  assert.ok(fragment.querySelector("[data-board-current]"));
  assert.equal(fragment.querySelector("[data-before-open]"), null, "a past match has no bubbles");
  assertCspSafe(fragment);
  assertStyled(fragment, "match-board.css", "src/shell/crest.css", "button.css", "status-chip.css");
});

test("in a match the records are an outlined button with their count and the post-match the light one", () => {
  const live = currentMatch([game("g-live", { preparationStatus: "in_progress", postMatchStatus: "draft" })], "t1");
  const events = Array.from({ length: 8 }, (_, at) => ({ pairingId: "g-live", playerId: `p${at}`, counter: "touchdowns", delta: 1, settledAt: null }));
  assert.deepEqual(bandActions(live, "t1", matchRecords(events, "g-live")).links.map((link) => [link.label, link.kind, link.href]),
    [["Match records · 8", "light", "#/t/t1/roster"], ["Post-match", "primary", "#/games/g-live/post-match"]]);
  assert.deepEqual(bandActions(live, "t1", null).links.map((link) => link.label), ["Match records", "Post-match"], "not read yet: no number");
  // Before the match: the preparation, then the friendlies; a score sent its line, and nothing else for our own proposal.
  assert.deepEqual(bandActions(currentMatch([NOW], "t1"), "t1", null).links.map((link) => [link.label, link.kind]), [["Match preparation", "primary"], ["Friendlies", "light"]]);
  const sent = currentMatch([game("g-sent", { resultStatus: "awaiting_confirmation", viewerIsProposer: true, proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 2, proposedAwayCasualties: 1 })], "t1");
  // Our own proposal: who confirms it, in a quiet line (DeskSeason's sentNote, G5); the opponent's: the button alone.
  const rival = sent.game.away.team.name;
  assert.deepEqual(bandActions(sent, "t1", null), { links: [], sentLine: `${rival} confirms the result` });
  const theirs = currentMatch([{ ...sent.game, viewerIsProposer: false }], "t1");
  assert.deepEqual(bandActions(theirs, "t1", null), { links: [{ label: "Confirm the score", href: "#/games/g-sent", kind: "primary" }], sentLine: "" });
  assert.deepEqual(bandActions(null, "t1", null).links.map((link) => link.label), ["Friendlies"]);
  // On the band, a score sent stands as the board writes a score, with its CAS as a chip (L19, L31).
  const board = bandBoard(input({ games: [sent.game], current: sent, items: bandItems([sent.game], "t1", SEASON) }));
  assert.deepEqual([board.score, board.chips, board.status], ["2:1", ["CAS 2–1"], "sent"]);
});

test("a desk's current item carries the bubbles, a phone's none", () => {
  assert.equal(PREVIEW.gets, "own");
  const desk = mount(bandMarkup(input({ preview: PREVIEW })));
  const bubbles = desk.querySelectorAll("[data-before-open]");
  assert.deepEqual(bubbles.map((each) => each.textContent), [`+${formatMoney(PREVIEW.difference)} for inducements`, "missing the match: 3"]);
  assert.ok(desk.querySelectorAll(".g-board__side")[0].querySelector("[data-before-open]"), "ours gets it: under our name");
  assert.equal(desk.querySelector(".g-board__side--away [data-before-open]"), null);
  assert.ok(desk.querySelector('[role="tablist"]'));
  // The opponent's at his side when he gets it.
  const theirs = matchPreview({ own: { user: RIVAL.user, team: RIVAL_TEAM }, other: { user: OURS.user, team: OUR_TEAM } }, data);
  const flipped = mount(bandMarkup(input({ preview: { ...theirs, gets: "other" } })));
  assert.ok(flipped.querySelector(".g-board__side--away [data-before-open]"));
  // No preview (the opponent unread, a race unknown): no bubbles; a score sent: none either.
  assert.equal(mount(bandMarkup(input())).querySelector("[data-before-open]"), null);
  const phone = mount(bandMarkup(input({ preview: PREVIEW, phone: true })));
  assert.equal(phone.querySelector("[data-before-open]"), null);
  assert.equal(phone.querySelector('[role="tablist"]'), null);
  assert.equal(phone.querySelector(".g-board__chip"), null);
  assert.deepEqual(phone.querySelectorAll("ol.g-board__pager li").map((square) => square.textContent), ["1", "2", "3"], "a phone's squares are the season's league matches, as before");
  // A friendly on: the chip that it does not count, and its bubbles too (decision 15).
  const friendlyNow = game("g-fn", { kind: "friendly", season: null, roundStatus: null, roundNumber: 0, home: OURS, away: RIVAL });
  const friendly = bandBoard(input({ games: [friendlyNow], current: currentMatch([friendlyNow], "t1"), items: bandItems([friendlyNow], "t1", SEASON), preview: PREVIEW }));
  assert.deepEqual(friendly.chips, ["Does not count in the league table"]);
  assert.equal(friendly.bubbles.mid, "missing the match: 3");
});

test("the opponent's value is said once he is read", () => {
  const value = formatMoney(teamValue(RIVAL_TEAM, race("teams/dwarf")));
  assert.equal(bandBoard(input()).opponent.sub, "#1");
  assert.equal(bandBoard(input({ opponent: { team: RIVAL_TEAM } })).opponent.sub, `#1 · TV ${value}`);
  assert.equal(bandBoard(input({ opponent: { team: RIVAL_TEAM }, phone: true })).opponent.sub, `Dwarf · #1 · TV ${value}`);
  assert.equal(bandBoard(input({ opponent: { error: "Team not found." } })).opponent.sub, "#1", "a refusal says nothing here");
  assert.equal(bandBoard(input({ opponent: { team: { ...RIVAL_TEAM, id: "r9" } } })).opponent.sub, "#1", "another team's value is not his");
  const fragment = mount(bandMarkup(input({ opponent: { team: RIVAL_TEAM } })));
  assert.match(fragment.querySelector(".g-board__side--away .g-board__sub").textContent, new RegExp(`TV ${value}$`));
});

test("the tabs, the way back and the bubbles are wired", () => {
  const host = mount('<div class="host"></div>').querySelector(".host");
  const picks = [];
  const opened = [];
  let index = 1;
  const draw = () => { host.innerHTML = bandMarkup(input({ index, preview: index === null ? PREVIEW : null })); };
  draw();
  const off = wireBand(host, {
    onPick: (at) => { picks.push(at); index = at === 3 ? null : at; draw(); },
    onBefore: (button) => opened.push(button.textContent),
  });
  fireEvent(host.querySelector("[data-board-current]"), "click");
  assert.deepEqual(picks, [3]);
  assert.equal(document.activeElement, host.querySelector('[data-board-item="3"]'), "the focus on the current square");
  fireEvent(host.querySelector("[data-before-open]"), "click");
  assert.equal(opened.length, 1);
  off();
  fireEvent(host.querySelector("[data-before-open]"), "click");
  assert.equal(opened.length, 1);
});

test("names are text; every key in both dictionaries", () => {
  const hostileRival = side("r1", HOSTILE, "teams/dwarf");
  const games = [played("g-h", 1, 1, [1, 0], [0, 0], { away: hostileRival, homeMvps: [{ id: "p", name: HOSTILE }] }), game("g-now", { away: hostileRival })];
  for (const index of [0, null]) {
    const fragment = mount(bandMarkup(input({ games, items: bandItems(games, "t1", SEASON), current: currentMatch(games, "t1"), index })));
    assert.equal(fragment.querySelector("img"), null);
    assertCspSafe(fragment);
  }
  const past = mount(bandMarkup(input({ games, items: bandItems(games, "t1", SEASON), current: currentMatch(games, "t1"), index: 0 })));
  assert.equal(past.querySelector(".g-board__side--away .g-board__name").textContent, HOSTILE);
  assert.equal(past.querySelectorAll(".g-board__chip").at(-1).textContent, `MVP ${HOSTILE}`);
  assert.ok(past.querySelector('[role="tab"]').getAttribute("aria-label").includes(HOSTILE));
  assertDictionaryCovers("src/screens/matches/band.mjs", "src/ui/match-board.mjs");
});
