import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { setDictionaries } from "../src/core/i18n.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1", replace() {} };
const { overviewMarkup, overviewModel, renderTeamOverview } = await import("../src/screens/team/overview.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { raceTeamOf, raceTitleOf } = await import("../src/data/teams.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const RACES = data.teams;
// The model names the opponent's race from the reference, as the page has it.
state.data = { teams: RACES };
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

// The table: the rival first, the coach's three teams after it. Round 3 is on.
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3 },
  standings: [
    { team: { id: "r1" }, rank: 1, points: 6 },
    { team: { id: "t1" }, rank: 2, points: 3 },
    { team: { id: "t2" }, rank: 3, points: 1 },
    { team: { id: "t3" }, rank: 4, points: 0 },
  ],
};

const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "3", name: "Ashby", spp: { touchdowns: 2, completions: 1 } },
  { id: "p2", rowIndex: 1, number: "5", name: "Vane", spp: { touchdowns: 1, completions: 4 } },
];
const TEAMS = [
  { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, roster: { treasury: 120, players: PLAYERS } },
  { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", stage: "active", inActiveSeason: true, roster: { treasury: 40 } },
  { id: "t3", name: "Anji Magritta", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, roster: { treasury: 0 } },
  { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false, roster: { treasury: 1000 } },
];

const side = (id, name, slug) => ({ user: { id: `u-${id}`, login: id }, team: { id, name, baseTeamSlug: slug } });
const OURS = { t1: side("t1", "Ashgrove Wardens", "teams/human"), t2: side("t2", "Grimtusk Raiders", "teams/orc"), t3: side("t3", "Anji Magritta", "teams/human") };
const RIVAL = side("r1", "Rival Team", "teams/dwarf");

/** A league match of round 3, the round that is on, as /api/games sends it; t1 at home against the rival. */
const game = (id, over = {}) => ({
  id, kind: "league", roundNumber: 3, roundStatus: "started", season: { id: "s1", name: "Mock Season", currentRound: 3 },
  resultStatus: "pending", preparationStatus: "not_started", postMatchStatus: "not_started",
  homeTouchdowns: null, awayTouchdowns: null, homeCasualties: null, awayCasualties: null,
  proposedHomeTouchdowns: null, proposedAwayTouchdowns: null, proposedHomeCasualties: null, proposedAwayCasualties: null,
  confirmedAt: null, updatedAt: "2026-10-06T10:00:00Z", home: OURS.t1, away: RIVAL, viewerIsHome: true, viewerIsProposer: false, ...over,
});
/** A finished match: the score is [home, away]. */
const played = (id, round, touchdowns, casualties, over = {}) => game(id, {
  roundNumber: round, roundStatus: "completed", resultStatus: "confirmed", confirmedAt: `2026-10-0${round}T10:00:00Z`,
  homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1], homeCasualties: casualties[0], awayCasualties: casualties[1], ...over,
});
const GAMES = [
  played("ga", 1, [2, 1], [1, 0]),
  played("gb", 2, [2, 0], [2, 0], { home: RIVAL, away: OURS.t1 }),
  played("gf", 0, [1, 1], [0, 0], { kind: "friendly", season: null, roundStatus: null, confirmedAt: "2026-10-05T10:00:00Z" }),
  game("g1"),
  game("g2", { home: OURS.t2, away: side("r2", "Rival Raiders", "teams/skaven"), preparationStatus: "in_progress", postMatchStatus: "draft" }),
  game("g3", {
    home: OURS.t3, away: side("r3", "Rival Wardens", "teams/lizardmen"), resultStatus: "awaiting_confirmation", viewerIsProposer: false,
    proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 1, proposedAwayCasualties: 0,
  }),
];
/** The games with some of them changed, by id. */
const gamesWith = (changes) => GAMES.map((item) => (changes[item.id] ? { ...item, ...changes[item.id] } : item));

const raceOf = (team) => RACES.find((race) => race.slug === team.baseTeamSlug) ?? null;
/** What the screen gives the model for a team. */
function input(id, over = {}) {
  const team = TEAMS.find((item) => item.id === id);
  return { team, raceTeam: raceOf(team), seasonData: SEASON, games: GAMES, ...over };
}

/** A coach signed in on a page that has read the list, the table and the games; the screen before is left. */
function coach({ games = GAMES, season = SEASON, gamesLoaded = true, seasonLoaded = true, gamesError = "" } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items: TEAMS, loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = { teams: RACES };
  state.season = { data: season, loaded: seasonLoaded, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: gamesLoaded, loading: false, error: gamesError };
}

/** The server answering the list again: the games as they are now. */
async function notifyGames(games) {
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  await invalidateGames();
}

test("a team in the season: its place, its points with the record, its value and treasury, in one row on a desk", () => {
  const model = overviewModel(input("t1"));
  assert.deepEqual(model.tiles.map(({ label, value }) => [label, value]), [
    ["Place in the league", "2 / 4"], ["Points · W/D/L", "3 · 1/0/1"], ["Team value", model.tiles[2].value], ["Treasury", "120k"]]);
  assert.match(model.tiles[2].value, /^\d[\d,]*k$/);
  assert.equal(model.tiles[3].href, "#/t/t1/team", "the treasury is managed on the team page (06 → 08)");
  assert.deepEqual(model.tiles.slice(0, 3).map((tile) => tile.href), [undefined, undefined, undefined]);
  const fragment = mount(overviewMarkup(model));
  assert.ok(fragment.querySelector(".g-kpis.g-kpis--row"));
  assert.equal(fragment.querySelector('a.g-kpi[href="#/t/t1/team"] .g-kpi__k').textContent, "Treasury");
  assert.equal(fragment.querySelectorAll("a.g-kpi").length, 1);
  assert.equal(fragment.querySelector("h1").textContent, "Overview");
  assert.equal(fragment.querySelector(".g-pagehead__sub").textContent, "Mock Season · round 3");
  assert.equal(fragment.querySelector(".g-overview__stage"), null, "an active team has no stage to say");
});

test("the board shows the next match with «Match preparation» and «Friendlies», the season's squares as its form", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__name").textContent, "Rival Team");
  assert.deepEqual(fragment.querySelectorAll(".g-board__actions a").map((link) => link.getAttribute("href")), ["#/games/g1/pre-match", "#/t/t1/challenges"]);
  assert.deepEqual(fragment.querySelectorAll(".g-board__square").map((square) => square.textContent), ["1", "2", "3"]);
});

test("the board names both teams by race, our place and value, the round and the venue, and the match not begun", () => {
  const model = overviewModel(input("t1"));
  assert.equal(model.board.status, "idle");
  assert.equal(model.board.overline, "Round 3 · home");
  assert.match(model.board.own.sub, /^Human · #2 · TV \d[\d,]*k$/);
  assert.deepEqual(model.board.opponent, { name: "Rival Team", sub: "Dwarf · #1 in the league" });
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector(".g-board__mid .g-status").textContent, "Not started");
  assert.equal(fragment.querySelector(".g-board__score").textContent, "–:–");
  assert.equal(fragment.querySelector(".g-board__square--current").textContent, "3", "the match the board is about is the current square");
  assert.equal(fragment.querySelector(".g-board--live"), null);
});

test("a live match offers its records and the post-match; a score the opponent sent waits to be confirmed", () => {
  assert.deepEqual(overviewModel(input("t2")).board.links.map(({ kind }) => kind), ["text", "light"]);
  const sent = overviewModel(input("t3")).board;
  assert.equal(sent.status, "sent");
  assert.equal(sent.score, "2–1");
  assert.equal(sent.links[0].href, "#/games/g3");
  const live = mount(overviewMarkup(overviewModel(input("t2"))));
  assert.ok(live.querySelector(".g-board--live"));
  assert.equal(live.querySelector(".g-board__mid .g-status--live").textContent, "Match in play");
  const awaiting = mount(overviewMarkup(overviewModel(input("t3"))));
  assert.equal(awaiting.querySelector(".g-board__mid .g-status--wait").textContent, "Awaiting confirmation");
  assert.equal(awaiting.querySelector(".g-board__score").textContent, "2–1");
  assert.equal(awaiting.querySelector(".g-board__note").textContent, "Win 2–1 · CAS 1–0");
});

test("a team in the table with nothing to play says when the opponent comes, and offers the friendlies alone", () => {
  const model = overviewModel(input("t1", { games: GAMES.filter((item) => item.id !== "g1") }));
  assert.equal(model.board.status, "none");
  assert.equal(model.board.opponent, null);
  assert.equal(model.board.pendingText, "Opponent — after round 3");
  assert.deepEqual(model.board.links, []);
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector(".g-board__pending").textContent, "Opponent — after round 3");
  assert.deepEqual(fragment.querySelectorAll(".g-board__actions a").map((link) => link.textContent.trim()), ["Friendlies"]);
  assert.equal(fragment.querySelector(".g-board__mid .g-status"), null);
});

test("a team outside the season: two tiles, and a way to enter it instead of a board; a draft team says it is building", () => {
  const model = overviewModel(input("t4"));
  assert.equal(model.tiles.length, 2);
  assert.equal(model.board, null);
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector("a.g-callout").getAttribute("href"), "#/season/registration");
  assert.equal(fragment.querySelector(".g-pagehead__meta .g-status").textContent, "Draft");
  assert.equal(fragment.querySelector(".g-board"), null);
  assert.deepEqual(fragment.querySelectorAll(".g-kpi__k").map((label) => label.textContent), ["Team value", "Treasury"]);
  assert.equal(fragment.querySelector("a.g-kpi").getAttribute("href"), "#/t/t4/team");
});

test("a team in its build says so on a phone too: the chip is the page's first line there, and the desk's head has it (R4)", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t4"))));
  const stage = fragment.querySelector(".g-overview .g-overview__stage");
  assert.equal(stage.querySelector(".g-status").textContent, "Draft");
  assert.equal(stage.getAttribute("aria-hidden"), "true", "a screen reader hears the head's chip, not this one too");
  assert.equal(fragment.querySelector(".g-overview").childNodes[0], stage, "the first line of the page");
  assert.equal(fragment.querySelectorAll(".g-status").length, 2, "one for each width");
  const css = "src/screens/team/overview.css";
  assert.deepEqual(valuesOf(css, ".g-overview__stage", "display"), ["flex", "none"]);
  const source = text(css).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.match(source, /@media \(min-width: 901px\)\s*\{\s*\.g-overview__stage \{ display: none; \}/, "never twice on a desk");
  assert.match(text("src/ui/page-head.css"), /@media \(max-width: 900px\)\s*\{\s*\.g-pagehead:not\(\.g-pagehead--phone\)/, "the head a phone does not show");
  for (const id of ["t1", "t2", "t3"]) assert.equal(mount(overviewMarkup(overviewModel(input(id)))).querySelector(".g-overview__stage"), null, id);
});

test("an unknown race leaves a dash, not a crash", () => {
  const model = overviewModel({ ...input("t1"), raceTeam: null });
  assert.equal(model.tiles[2].value, "—");
  assert.deepEqual(model.leaders, []);
  assert.doesNotThrow(() => overviewMarkup(model));
  assert.equal(model.board.own.sub, "", "no race, no line of race, place and value to leave a stray dot in front");
});

test("leaders and recent results; a friendly is marked, and «Whole season» leads to the team's matches", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assert.ok(fragment.querySelectorAll(".g-overview__leaders .g-ranked").length >= 1);
  const results = fragment.querySelectorAll(".g-overview__results .g-overview__result");
  assert.equal(results[0].querySelector(".g-result--t") !== null, true, "the friendly is the newest");
  assert.equal(fragment.querySelector('.g-overview__results a[href="#/t/t1/matches"]').textContent.trim(), "Whole season →");
});

test("the leaders are the four counters in order, the player's number and position under the name, the figure at the right", () => {
  const model = overviewModel(input("t1"));
  assert.deepEqual(model.leaders.map(({ key, name, value }) => [key, name, value]), [["spp", "Ashby", 7], ["td", "Ashby", 2], ["comp", "Vane", 4]]);
  const rows = mount(overviewMarkup(model)).querySelectorAll(".g-overview__leaders .g-ranked");
  assert.deepEqual(rows.map((row) => [row.querySelector(".g-ranked__lead").textContent, row.querySelector(".g-ranked__title").textContent, row.querySelector(".g-ranked__caption").textContent, row.querySelector(".g-ranked__value").textContent]),
    [["SPP", "Ashby", "#3 Human Lineman", "7"], ["TD", "Ashby", "#3 Human Lineman", "2"], ["COMP", "Vane", "#5 Thrower", "4"]]);
  assert.equal(mount(overviewMarkup(overviewModel(input("t2")))).querySelector(".g-overview__leaders"), null, "a team nobody has scored for has no leaders");
});

test("a recent result: the pill, the opponent, the round and the casualties, the score from our side, and the way to the match", () => {
  const rows = mount(overviewMarkup(overviewModel(input("t1")))).querySelectorAll(".g-overview__results .g-overview__result");
  assert.deepEqual(rows.map((row) => [
    row.querySelector(".g-sr-only").textContent, row.querySelector(".g-overview__opponent").textContent,
    row.querySelector(".g-overview__line").textContent, row.querySelector(".g-overview__score").textContent, row.querySelector("a").getAttribute("href")]),
  [["Friendly", "Rival Team", "Friendly · CAS 0–0", "1–1", "#/games/gf"],
    ["Loss", "Rival Team", "Round 2 · CAS 0–2", "0–2", "#/games/gb"],
    ["Win", "Rival Team", "Round 1 · CAS 1–0", "2–1", "#/games/ga"]]);
  assert.ok(rows[0].querySelector(".g-result--compact"), "the small pill of a dense list");
});

test("the recent matches are five at most, the newest first", () => {
  const many = Array.from({ length: 7 }, (_, index) => played(`m${index}`, 1, [1, 0], [0, 0], { confirmedAt: `2026-09-0${index + 1}T10:00:00Z` }));
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { games: many }))));
  assert.deepEqual(fragment.querySelectorAll(".g-overview__result a").map((link) => link.getAttribute("href")), ["#/games/m6", "#/games/m5", "#/games/m4", "#/games/m3", "#/games/m2"]);
});

test("a team with no finished match has no results, and a team with no leader no leaders: no empty headings", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t3", { games: [] }))));
  assert.equal(fragment.querySelector(".g-overview__results"), null);
  assert.equal(fragment.querySelector(".g-overview__leaders"), null);
  assert.equal(fragment.querySelector(".g-overview__cols"), null);
});

test("games that failed to load leave the figures and say so where the board was", () => {
  const fragment = mount(overviewMarkup(overviewModel({ ...input("t1"), games: [], gamesError: "No connection" })));
  assert.equal(fragment.querySelector(".g-board"), null);
  assert.match(fragment.querySelector(".g-overview__failed").textContent, /No connection/);
  assert.match(fragment.querySelector(".g-overview__failed").textContent, /^The matches did not load/);
  assert.equal(fragment.querySelectorAll(".g-kpi").length, 4, "the table still gives the place and the points");
  assert.equal(fragment.querySelectorAll(".g-kpi__v")[1].textContent, "3", "the points without a record that was not read");
});

test("a table that failed to load says so where the board would stand; the team's own figures stay", () => {
  const model = overviewModel({ ...input("t1"), seasonData: null, seasonError: "No connection" });
  assert.equal(model.tiles.length, 2, "no place without a table");
  const fragment = mount(overviewMarkup(model));
  assert.deepEqual(fragment.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent), ["The league table did not load: No connection"]);
  assert.equal(fragment.querySelector("a.g-callout"), null, "a team in the season is not told it is not entered");
  assert.equal(fragment.querySelector(".g-board"), null);
  assert.ok(fragment.querySelector(".g-overview__leaders"), "the leaders come from the team itself");
});

test("when the table and the games both failed, both are said: the games' line is not lost", () => {
  const model = overviewModel({ ...input("t1"), seasonData: null, seasonError: "No table", games: [], gamesError: "No games" });
  const fragment = mount(overviewMarkup(model));
  assert.deepEqual(fragment.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent),
    ["The league table did not load: No table", "The matches did not load: No games"]);
  assert.equal(fragment.querySelectorAll(".g-overview__failed").length, 1, "one alert holds both");
  const gamesOnly = mount(overviewMarkup(overviewModel({ ...input("t1"), seasonData: null, games: [], gamesError: "No games" })));
  assert.deepEqual(gamesOnly.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent), ["The matches did not load: No games"], "while the table is still on its way");
});

test("a table read again that failed leaves the table the page had: nothing is said of it", () => {
  const model = overviewModel({ ...input("t1"), seasonError: "No connection" });
  assert.equal(model.seasonError, "");
  assert.equal(model.board.status, "idle");
  assert.equal(mount(overviewMarkup(model)).querySelector(".g-overview__failed"), null);
});

test("a team outside the season whose games failed still offers to enter it", () => {
  const fragment = mount(overviewMarkup(overviewModel({ ...input("t4"), games: [], gamesError: "No connection" })));
  assert.ok(fragment.querySelector("a.g-callout"));
  assert.equal(fragment.querySelector(".g-overview__failed"), null);
});

test("before the table and the games are read nothing is said that they may contradict (a cold page opens on the team)", () => {
  const model = overviewModel(input("t1", { seasonData: null, games: null }));
  assert.equal(model.tiles.length, 2, "no place without a table");
  assert.equal(model.board, null);
  assert.equal(model.seasonLine, "");
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector("a.g-callout"), null, "a team in the season is not told it is not entered");
  assert.equal(fragment.querySelector(".g-overview__failed"), null);
  const read = overviewModel(input("t1", { games: null }));
  assert.equal(read.tiles[1].value, "3", "the table is in, the record is not");
  assert.equal(read.board.pendingText, "", "and no opponent is said to come later while the games are not read");
  assert.equal(read.board.status, "none");
});

test("a treasury an administrator stored as text is the treasury (T2)", () => {
  const team = { ...TEAMS[0], roster: { ...TEAMS[0].roster, treasury: "120" } };
  assert.equal(overviewModel({ ...input("t1"), team }).tiles[3].value, "120k");
});

test("names from other coaches are text: the opponent, the leader's name and the position", () => {
  const rival = side("r1", HOSTILE, "teams/dwarf");
  const hostile = [played("ga", 1, [2, 1], [1, 0], { away: rival }), game("g1", { away: rival })];
  const team = { ...TEAMS[0], roster: { treasury: 1, players: [{ id: "p1", rowIndex: 0, number: HOSTILE, name: HOSTILE, spp: { touchdowns: 1 } }] } };
  const fragment = mount(overviewMarkup(overviewModel({ ...input("t1"), team, games: hostile })));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__name").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__opponent").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__leaders .g-ranked__title").textContent, HOSTILE);
  assertCspSafe(fragment);
});

test("the leaders' tag is escaped text, whatever the dictionary holds (K7c)", () => {
  const real = { en: dictionary("en"), ru: dictionary("ru") };
  setDictionaries({ ...real, en: { ...real.en, "teamOverview.leader.spp": HOSTILE } });
  try {
    const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
    assert.equal(fragment.querySelector("img"), null);
    assert.equal(fragment.querySelector(".g-overview__leaders .g-ranked__lead").textContent, HOSTILE);
    assertCspSafe(fragment);
  } finally {
    setDictionaries(real);
  }
});

test("the overview follows the games while it is on screen, and nothing after it is left", async () => {
  coach();
  await renderTeamOverview("t1");
  await notifyGames(gamesWith({ g1: { preparationStatus: "in_progress", postMatchStatus: "draft" } }));
  await settle();
  assert.ok(view.querySelector(".g-board--live"));
  releaseCurrentScreen();
  view.innerHTML = "<p>next</p>";
  await notifyGames(GAMES);
  await settle();
  assert.equal(view.querySelector("p").textContent, "next");
});

test("it draws at once from what the page has, takes the title for the focus, and draws again when the table and the games come", async () => {
  coach({ season: null, seasonLoaded: false, games: [], gamesLoaded: false });
  api.reply("GET /api/season", 200, SEASON);
  api.reply("GET /api/games", 200, { games: GAMES, currentGames: [] });
  const seasonHold = api.hold("GET /api/season");
  const drawing = renderTeamOverview("t1");
  assert.ok(view.querySelector(".g-pagehead h1"), "drawn before anything is awaited");
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(view.querySelectorAll(".g-kpi").length, 2);
  assert.equal(view.querySelector("a.g-callout"), null);
  seasonHold.release();
  await drawing;
  assert.equal(view.querySelectorAll(".g-kpi").length, 4);
  assert.equal(view.querySelector(".g-board__side--away .g-board__name").textContent, "Rival Team");
  assert.equal(document.activeElement, view.querySelector("h1"), "the title is not given the focus again");
  api.assertAnswered();
});

test("a read that failed is made again when the coach comes back to the overview", async () => {
  coach({ gamesError: "No connection", season: null, seasonLoaded: true });
  state.season.error = "No connection";
  api.reply("GET /api/season", 200, SEASON);
  api.reply("GET /api/games", 200, { games: GAMES, currentGames: [] });
  const drawing = renderTeamOverview("t1");
  assert.ok(view.querySelector(".g-pagehead h1"));
  await drawing;
  assert.deepEqual(api.calls.map((call) => call.key).sort(), ["GET /api/games", "GET /api/season"]);
  assert.equal(view.querySelector(".g-overview__failed"), null);
  assert.equal(view.querySelector(".g-board__side--away .g-board__name").textContent, "Rival Team");
  api.assertAnswered();
});

test("a failure an earlier read left is not drawn while the read that repeats it is on its way; its answer decides", async () => {
  coach({ gamesError: "No connection (before)", season: null, seasonLoaded: true });
  state.season.error = "No connection (before)";
  api.reply("GET /api/season", 200, SEASON);
  const gamesHold = api.hold("GET /api/games");
  const drawing = renderTeamOverview("t1");
  assert.equal(view.querySelector(".g-overview__failed"), null, "neither the games' nor the table's old failure is drawn");
  await settle();
  gamesHold.release({ error: new TypeError("Failed to fetch") });
  await drawing;
  assert.deepEqual(view.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent.replace(/:.*/, "")), ["The matches did not load"], "the games failed again; the table came");
  assert.equal(view.querySelectorAll(".g-kpi").length, 4);
  assert.equal(view.querySelectorAll(".g-kpi__v")[1].textContent, "3", "the points without a record that was not read");
});

test("a table that fails on the page is said, and a team in the season sees why it has no place", async () => {
  coach({ season: null, seasonLoaded: false, games: [], gamesLoaded: false });
  api.fail("GET /api/season");
  api.reply("GET /api/games", 200, { games: GAMES, currentGames: [] });
  await renderTeamOverview("t1");
  assert.deepEqual(view.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent.replace(/:.*/, "")), ["The league table did not load"]);
  assert.equal(view.querySelectorAll(".g-kpi").length, 2);
});

test("a team A left for a team B: A's answer, late, does not draw over B", async () => {
  coach({ gamesError: "No connection" });
  const gamesHold = api.hold("GET /api/games");
  const a = renderTeamOverview("t1");
  await settle();
  // The router's move: the screen of A is released, then B is drawn; both read the games again, and A's answer is dropped for B's.
  releaseCurrentScreen();
  const b = renderTeamOverview("t2");
  gamesHold.release({ status: 200, body: { games: GAMES, currentGames: [] } });
  await b;
  const drawn = view.textContent;
  assert.equal(view.querySelector(".g-board__name").textContent, "Grimtusk Raiders");
  await a;
  assert.equal(view.textContent, drawn);
  assert.equal(view.querySelector(".g-board__name").textContent, "Grimtusk Raiders");
});

test("a team that has left the list while the games were on their way leaves the screen as it was", async () => {
  coach({ games: [], gamesLoaded: false });
  const gamesHold = api.hold("GET /api/games");
  const drawing = renderTeamOverview("t1");
  const drawn = view.querySelector(".g-overview").textContent;
  state.myTeams = { ...state.myTeams, items: [] };
  await settle();
  gamesHold.release({ status: 200, body: { games: GAMES, currentGames: [] } });
  await drawing;
  assert.equal(view.querySelector(".g-overview").textContent, drawn);
});

test("a screen left before its games came draws nothing", async () => {
  coach({ games: [], gamesLoaded: false });
  api.reply("GET /api/season", 200, SEASON);
  const gamesHold = api.hold("GET /api/games");
  const drawing = renderTeamOverview("t1");
  await settle();
  releaseCurrentScreen();
  view.innerHTML = "<p>next</p>";
  gamesHold.release({ status: 200, body: { games: GAMES, currentGames: [] } });
  await drawing;
  assert.equal(view.querySelector("p").textContent, "next");
});

test("the race of a team is looked up in one place, and is empty while the data has not come", () => {
  state.data = { teams: RACES };
  assert.equal(raceTitleOf("teams/human"), "Human");
  assert.equal(raceTeamOf("teams/human").slug, "teams/human");
  assert.equal(raceTitleOf("teams/nobody"), "");
  assert.equal(raceTeamOf("teams/nobody"), null);
  state.data = null;
  assert.equal(raceTitleOf("teams/human"), "");
  assert.equal(raceTeamOf("teams/human"), null);
  state.data = { teams: RACES };
  for (const file of ["src/shell/shell.mjs", "src/screens/teams/index.mjs"]) {
    assert.ok(!/(function|const) raceTitleOf\b/.test(text(file)), `${file} has a copy of raceTitleOf`);
  }
});

test("every word on the overview is in both dictionaries, the leaders' labels too", () => {
  assertDictionaryCovers("src/screens/team/overview.mjs");
  for (const key of ["spp", "td", "cas", "comp"]) assert.ok(dictionary("en")[`teamOverview.leader.${key}`] && dictionary("ru")[`teamOverview.leader.${key}`], key);
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assertCspSafe(fragment);
  assertStyled(fragment, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "match-board.css", "list-row.css", "result-pill.css", "button.css", "status-chip.css", "callout.css");
  const outside = mount(overviewMarkup(overviewModel(input("t4"))));
  assertStyled(outside, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "status-chip.css", "callout.css");
});

test("the Russian overview has the words of a Russian page, and every leader's label", () => {
  const ru = dictionary("ru");
  const en = dictionary("en");
  const keys = Object.keys(en).filter((key) => key.startsWith("teamOverview."));
  assert.ok(keys.length >= 20);
  for (const key of keys) {
    assert.ok(ru[key], `ru ${key}`);
    assert.deepEqual([...en[key].matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort(), [...ru[key].matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort(), `${key} takes the same names`);
  }
});

test("the stylesheet reaches the page, and the result rows keep their size and their number", () => {
  const css = "src/screens/team/overview.css";
  assert.ok(text("src/styles.css").includes('@import url("screens/team/overview.css");'));
  assert.deepEqual(valuesOf(css, ".g-overview", "gap"), ["var(--space-20)"]);
  assert.ok(valuesOf(css, ".g-overview__result", "min-height").includes("56px"));
  assert.match(text(css), /@media \(max-width: 900px\)\s*\{[^@]*\.g-overview__result:nth-child\(n\+4\)\s*\{[^}]*display: none/, "the fourth and fifth result wait for a desk");
  assert.match(text(css), /@media \(min-width: 901px\)\s*\{[^@]*\.g-overview__cols\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.ok(valuesOf(css, ".g-overview__score", "font").includes("700 22px/1.1 var(--font-display)"));
  assert.ok(valuesOf(css, ".g-overview__score", "font-variant-numeric").includes("tabular-nums"));
  assert.deepEqual(valuesOf(css, ".g-overview .g-kpi__v", "font-size"), ["clamp(24px, calc(10.8vw - 10px), 30px)", "clamp(24px, calc(5.4vw - 24px), 30px)"], "«33 · 10/3/0» keeps to one line at 320px, and from 901px beside the SideNav, with no breakpoint of its own");
  // The figure is 4.6 times its font size wide, in a tile whose content is a quarter of the screen less 106px from 901px.
  for (const width of [901, 930, 960, 990, 1024, 1440]) {
    const size = Math.min(30, Math.max(24, 5.4 * (width / 100) - 24));
    assert.ok(4.62 * size <= width / 4 - 106.25, `${width}px: «33 · 10/3/0» at ${size.toFixed(1)}px is ${(4.62 * size).toFixed(0)}px wide in ${(width / 4 - 106.25).toFixed(0)}px`);
  }
  assert.ok(valuesOf(css, ".g-overview__leaderlist", "grid-template-columns").includes("repeat(auto-fit, minmax(120px, 1fr))"), "the cards wrap as the column narrows");
  assert.doesNotMatch(text(css), /1360px|359px/, "the sheet has the 900/901 breakpoints only");
  assertReadable(css, ".g-overview__line", "color", ["--page", "--desk", "--surface"], 4.5);
  assertReadable(css, ".g-overview__leaders .g-ranked__value", "color", ["--surface", "--page"], 4.5);
});

test("at 320px a word of a team or a race keeps whole in the board's side column (T10 carry)", () => {
  const board = text("src/ui/match-board.css");
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__main\s*\{[^}]*gap: var\(--space-4\)[^}]*padding-right: var\(--space-10\)[^}]*padding-left: var\(--space-10\)/);
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__name \{ font-size: 16px; \}/);
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__sub \{ font-size: 12px; \}/);
  assert.match(board, /@media \(max-width: 900px\)\s*\{\s*\.g-board__mid \{ max-width: 124px; \}/, "the middle column is still wide enough for a Russian status");
});
