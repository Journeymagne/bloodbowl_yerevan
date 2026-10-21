import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertContrast, assertReadable, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale, setDictionaries } from "../src/core/i18n.mjs";
import { renderCrest } from "../src/shell/crest.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1", replace() {} };
const { overviewMarkup, overviewModel, renderTeamOverview } = await import("../src/screens/team/overview.mjs");
const { teamPlayerUrl } = await import("../src/core/routes.mjs");
const { rosterLines } = await import("../src/screens/team/roster/model.mjs");
const { normalizeDraft } = await import("../src/domain/roster/schema.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { raceTeamOf, raceTitleOf } = await import("../src/data/teams.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { refQuery, setRefQuery, takeSearchFocus } = await import("../src/screens/ref/memory.mjs");
const { teamValue } = await import("../src/data/team-record.mjs");
const { formatMoney } = await import("../src/core/format.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const RACES = data.teams;
// The model names the opponent's race from the reference, as the page has it.
state.data = { teams: RACES };
const settle = () => new Promise((resolve) => { setImmediate(resolve); });

// The table: the rival first, the coach's three teams after it. Round 3 is on.
/** A row of the server's standings, as `/api/season` sends it (the mini table reads the coach and the team, stage 10): the coach's own teams are u1's. */
const standingRow = (id, name, slug, user, rank, points) => ({
  entryId: `e-${id}`, withdrawnAt: null, user: { id: user, login: user }, team: { id, name, baseTeamSlug: slug }, rank, points, games: 2, byes: 0, touchdowns: 0, casualties: 0,
});
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3 },
  standings: [
    standingRow("r1", "Rival Team", "teams/dwarf", "u-r1", 1, 6),
    standingRow("t1", "Ashgrove Wardens", "teams/human", "u1", 2, 3),
    standingRow("t2", "Grimtusk Raiders", "teams/orc", "u1", 3, 1),
    standingRow("t3", "Anji Magritta", "teams/human", "u1", 4, 0),
  ],
};

const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "3", name: "Ashby", spp: { touchdowns: 2, completions: 1 } },
  { id: "p2", rowIndex: 1, number: "5", name: "Vane", spp: { touchdowns: 1, completions: 4 } },
];
// Each at its revision: the records of a match on are taken with the revision of the team in the list (stage 07e).
const TEAMS = [
  { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, revision: 4, roster: { treasury: 120, players: PLAYERS } },
  { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", stage: "active", inActiveSeason: true, revision: 7, roster: { treasury: 40 } },
  { id: "t3", name: "Anji Magritta", baseTeamSlug: "teams/human", stage: "active", inActiveSeason: true, revision: 2, roster: { treasury: 0 } },
  { id: "t4", name: "Fresh Meat", baseTeamSlug: "teams/orc", stage: "draft", inActiveSeason: false, revision: 1, roster: { treasury: 1000 } },
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
/** The league's points of a side for its touchdowns against the other's: 3 a win, 1 a draw (stage 09a: the band says them). */
const pointsOf = (own, other) => (own > other ? 3 : own === other ? 1 : 0);
/** A finished match: the score is [home, away], and the points each side took. */
const played = (id, round, touchdowns, casualties, over = {}) => game(id, {
  roundNumber: round, roundStatus: "completed", resultStatus: "confirmed", confirmedAt: `2026-10-0${round}T10:00:00Z`,
  homeTouchdowns: touchdowns[0], awayTouchdowns: touchdowns[1], homeCasualties: casualties[0], awayCasualties: casualties[1],
  homePoints: pointsOf(touchdowns[0], touchdowns[1]), awayPoints: pointsOf(touchdowns[1], touchdowns[0]), ...over,
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

/** A rival's team as his public page has it (stage 09a): `count` players of the race's first position, the `out`th missing the match. */
const rivalTeam = (id, slug, count, out = -1) => ({ id, name: `Rival ${id}`, baseTeamSlug: slug, revision: 1, roster: { treasury: 40,
  players: Array.from({ length: count }, (_, at) => ({ id: `${id}-${at}`, rowIndex: 0, number: String(at + 1), name: `${id} ${at + 1}`, ...(at === out ? { skipNextGame: true, absence: { code: "miss" } } : {}) })) } });
// The rival of t1's g1: seven Dwarf Blocker Linemen, one of them out — 420k against our 130k.
const RIVAL_TEAM = rivalTeam("r1", "teams/dwarf", 7, 2);
const RIVAL_PAGES = { "u-r1/teams/r1": RIVAL_TEAM, "u-r2/teams/r2": rivalTeam("r2", "teams/skaven", 7), "u-r3/teams/r3": rivalTeam("r3", "teams/lizardmen", 7) };
const RIVAL_PAGE = "GET /api/players/u-r1/teams/r1";

// The players who can advance: the first random skill costs 3 SPP, so Cade (9 touchdowns, 27 SPP) is ahead of Ashby and Vane (7 each),
// who stand in the roster's order; Dunn (2 SPP) has not enough and Moss (3 SPP, a skill taken) has spent it.
const CREW = [
  { id: "p1", rowIndex: 0, number: "3", name: "Ashby", spp: { touchdowns: 2, completions: 1 } },
  { id: "p2", rowIndex: 1, number: "5", name: "Vane", spp: { touchdowns: 1, completions: 4 } },
  { id: "p3", rowIndex: 2, number: "7", name: "Cade", spp: { touchdowns: 9 } },
  { id: "p4", rowIndex: 3, number: "9", name: "Dunn", spp: { completions: 2 } },
  { id: "p5", rowIndex: 0, number: "11", name: "Moss", spp: { touchdowns: 1 }, advancements: [{ type: "random", grants: { skill: "Dodge" } }] },
];
/** The saved team t1 with other players. */
const crew = (players) => ({ ...TEAMS[0], roster: { treasury: 120, players } });

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
  // The whole reference, as a page that has read it holds it: «Before the match» needs its catalogue (pre-flight L4).
  state.data = data;
  state.season = { data: season, loaded: seasonLoaded, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: gamesLoaded, loading: false, error: gamesError };
  // The leaders read the records not settled (stage 07e): none, at the team's revision.
  for (const { id, revision } of TEAMS) api.reply(`GET /api/teams/${id}/events`, 200, { events: [], revision });
  // The board reads the opponent of the match on from his public page (stage 09a): each of the three rivals answers.
  for (const [page, team] of Object.entries(RIVAL_PAGES)) api.reply(`GET /api/players/${page}`, 200, { user: { id: page.split("/")[0], login: team.id }, team });
}

/** The server answering the list again: the games as they are now. */
async function notifyGames(games) {
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  await invalidateGames();
}

/** The tiles as the page draws them: each label, figure and quieter second part, in order. */
const tilesOf = (fragment) => fragment.querySelectorAll(".g-kpi").map((tile) => [
  tile.querySelector(".g-kpi__k").textContent, tile.querySelector(".g-kpi__v").textContent, tile.querySelector(".g-kpi__rest")?.textContent ?? ""]);

/** The phone's media query, which the test answers and changes: what the overview listens to when the width crosses 900px. */
function crossingWindow(phone = false) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { listeners, cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

test("a desk's tiles are DeskOverview's five: the place «2» with «/ 4», the points «3» with «· 1/0/1», the value, the treasury leading to the team page, «TD ± / CAS ±» «−1 / −1»", () => {
  const model = overviewModel(input("t1"));
  assert.equal(model.phone, false, "a desk unless the screen says otherwise");
  const worth = model.tiles[2].value;
  assert.match(worth, /^\d[\d,]*k$/);
  // ga 2–1 and CAS 1–0 at home, gb 0–2 and CAS 0–2 away: one win, one loss, a touchdown and a casualty behind; the friendly is not the season's.
  assert.deepEqual(model.tiles.map(({ label, value, rest = "" }) => [label, value, rest]), [
    ["Place in the league", "2", "/ 4"], ["Points · W/D/L", "3", "· 1/0/1"], ["Team value", worth, ""], ["Treasury", "120k", ""], ["TD ± / CAS ±", "−1 / −1", ""]]);
  assert.equal(model.tiles[3].href, "#/t/t1/team", "the treasury is managed on the team page (06 → 08)");
  assert.deepEqual(model.tiles.map((tile) => Boolean(tile.href)), [false, false, false, true, false]);
  assert.deepEqual(model.tiles.map((tile) => Boolean(tile.accent)), [false, false, false, false, false], "a difference below zero is no good news");
  const fragment = mount(overviewMarkup(model));
  assert.ok(fragment.querySelector(".g-kpis.g-kpis--row"));
  assert.deepEqual(tilesOf(fragment), [
    ["Place in the league", "2 / 4", "/ 4"], ["Points · W/D/L", "3 · 1/0/1", "· 1/0/1"], ["Team value", worth, ""], ["Treasury", "120k", ""], ["TD ± / CAS ±", "−1 / −1", ""]]);
  assert.equal(fragment.querySelector('a.g-kpi[href="#/t/t1/team"] .g-kpi__k').textContent, "Treasury");
  assert.equal(fragment.querySelectorAll("a.g-kpi").length, 1);
  assert.equal(fragment.querySelector(".g-kpi--accent"), null);
  assert.deepEqual([...model.tiles[4].value].map((sign) => sign.codePointAt(0).toString(16)), ["2212", "31", "20", "2f", "20", "2212", "31"], "a real minus sign (U+2212), not a hyphen");
  assert.equal(fragment.querySelector("h1").textContent, "Overview");
  assert.equal(fragment.querySelector(".g-pagehead__sub").textContent, "Mock Season · round 3");
  assert.equal(fragment.querySelector(".g-overview__stage"), null, "an active team has no stage to say");
  initLocale("ru");
  try {
    assert.deepEqual(tilesOf(mount(overviewMarkup(overviewModel(input("t1"))))).map(([label]) => label), ["Место в лиге", "Очки · В/Н/П", "Стоимость команды", "Казна", "TD ± / CAS ±"]);
  } finally {
    initLocale("en");
  }
});

test("a phone's tiles are Team.html's four: the value, the treasury, «W · D · L» «1 · 0 · 1», «TD / CAS difference» «−1 / −1»", () => {
  const model = overviewModel(input("t1", { phone: true }));
  assert.equal(model.phone, true);
  const worth = model.tiles[0].value;
  assert.deepEqual(model.tiles.map(({ label, value }) => [label, value]), [["Team value", worth], ["Treasury", "120k"], ["W · D · L", "1 · 0 · 1"], ["TD / CAS difference", "−1 / −1"]]);
  assert.equal(model.tiles[1].href, "#/t/t1/team");
  const fragment = mount(overviewMarkup(model));
  assert.deepEqual(tilesOf(fragment), [["Team value", worth, ""], ["Treasury", "120k", ""], ["W · D · L", "1 · 0 · 1", ""], ["TD / CAS difference", "−1 / −1", ""]],
    "no second parts: the place is in the phone's header (Team.html)");
  assert.equal(fragment.querySelector("a.g-kpi").getAttribute("href"), "#/t/t1/team");
  assert.equal(fragment.querySelectorAll("a.g-kpi").length, 1);
  initLocale("ru");
  try {
    assert.deepEqual(tilesOf(mount(overviewMarkup(overviewModel(input("t1", { phone: true }))))).map(([label]) => label), ["Стоимость команды", "Казна", "В · Н · П", "TD / CAS разница"]);
  } finally {
    initLocale("en");
  }
  const words = { en: dictionary("en"), ru: dictionary("ru") };
  assert.deepEqual(["record", "diff", "diffDesk"].map((key) => [words.en[`teamOverview.tile.${key}`], words.ru[`teamOverview.tile.${key}`]]),
    [["W · D · L", "В · Н · П"], ["TD / CAS difference", "TD / CAS разница"], ["TD ± / CAS ±", "TD ± / CAS ±"]]);
});

test("the difference is in the accent on a desk only when neither is below zero and one is above; never on a phone", () => {
  const cases = [
    { games: [played("ga", 1, [2, 1], [0, 0])], value: "+1 / 0", good: true },
    { games: [played("ga", 1, [1, 1], [2, 0])], value: "0 / +2", good: true },
    { games: [played("ga", 1, [3, 1], [0, 1])], value: "+2 / −1", good: false },
    { games: [played("ga", 1, [1, 1], [1, 1])], value: "0 / 0", good: false },
    { games: [], value: "0 / 0", good: false },
    { games: GAMES, value: "−1 / −1", good: false },
  ];
  for (const { games, value, good } of cases) {
    const desk = overviewModel(input("t1", { games }));
    assert.deepEqual([desk.tiles[4].value, Boolean(desk.tiles[4].accent)], [value, good], value);
    assert.equal(Boolean(mount(overviewMarkup(desk)).querySelector(".g-kpi--accent")), good, `${value} on a desk`);
    const phone = overviewModel(input("t1", { games, phone: true }));
    assert.deepEqual([phone.tiles[3].value, Boolean(phone.tiles[3].accent)], [value, false], `${value} on a phone`);
    assert.equal(mount(overviewMarkup(phone)).querySelector(".g-kpi--accent"), null, `${value} is the ink on a phone (Team.html)`);
  }
  // Only the difference ever is: the place, the points, the value and the treasury never.
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { games: cases[0].games }))));
  assert.deepEqual(fragment.querySelectorAll(".g-kpi").map((tile) => tile.classList.contains("g-kpi--accent")), [false, false, false, false, true]);
});

test("before the games are read the record and the difference say «–»; outside the season two tiles on both widths", () => {
  for (const games of [null, []]) {
    const gamesError = games ? "No connection" : "";
    const desk = overviewModel(input("t1", { games, gamesError }));
    assert.deepEqual(desk.tiles.map(({ value, rest = "", accent = false }) => [value, rest, accent]).filter((_, index) => index !== 2),
      [["2", "/ 4", false], ["3", "", false], ["120k", "", false], ["–", "", false]], `${gamesError || "not read"}: the points alone, the difference a dash`);
    assert.deepEqual(tilesOf(mount(overviewMarkup(desk)))[1], ["Points · W/D/L", "3", ""], "no «·» left hanging after the points");
    const phone = overviewModel(input("t1", { games, gamesError, phone: true }));
    assert.deepEqual(phone.tiles.slice(2).map(({ label, value }) => [label, value]), [["W · D · L", "–"], ["TD / CAS difference", "–"]], `${gamesError || "not read"} on a phone`);
  }
  assert.equal(overviewModel(input("t1", { games: null })).tiles[4].value.codePointAt(0), 0x2013, "the dash is an en dash (U+2013), not a hyphen or a minus");
  // Outside the table — a team not entered, a table not read or that failed — the value and the treasury alone, on both widths.
  const outside = [input("t4"), input("t1", { seasonData: null }), input("t1", { seasonData: null, seasonError: "No connection" }), input("t1", { seasonData: null, games: null })];
  for (const over of outside) {
    for (const phone of [false, true]) {
      const model = overviewModel({ ...over, phone });
      assert.deepEqual(model.tiles.map(({ label }) => label), ["Team value", "Treasury"], `${over.team.id} ${phone ? "phone" : "desk"}`);
      assert.deepEqual(tilesOf(mount(overviewMarkup(model))).map(([label]) => label), ["Team value", "Treasury"]);
    }
  }
});

test("a desk's head has the reference's search at its right; typing takes the coach to #/ref with the query and the caret asked for; a phone has no field", async () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  const field = fragment.querySelector(".g-pagehead__meta .g-overview__search .g-search #overview-query");
  assert.ok(field, "in the head's slot at the right of the band (DeskOverview.html)");
  assert.equal(field.getAttribute("type"), "search");
  assert.ok(field.hasAttribute("data-search-all"), "the reference's own hand-over (stage 11)");
  assert.equal(fragment.querySelector('label[for="overview-query"]').textContent, "Search the reference");
  assert.equal(field.getAttribute("placeholder"), dictionary("en")["search.placeholder"]);
  assert.equal(field.getAttribute("value"), "", "an empty field: the reference keeps what is typed");
  assert.equal(fragment.querySelector(".g-overview__search svg").getAttribute("width"), "18", "the prototype's 18px magnifier");
  // A team in its build: the chip, then the field.
  const draft = mount(overviewMarkup(overviewModel(input("t4"))));
  assert.deepEqual(draft.querySelector(".g-pagehead__meta").childNodes.map((node) => node.getAttribute("class").split(" ")[0]), ["g-status", "g-overview__search"]);
  // A phone's head is a screen reader's: no field, the chip alone.
  for (const id of ["t1", "t4"]) {
    const phone = mount(overviewMarkup(overviewModel(input(id, { phone: true }))));
    assert.equal(phone.querySelector("#overview-query"), null, id);
    assert.equal(phone.querySelector(".g-overview__search"), null, id);
  }
  assert.equal(mount(overviewMarkup(overviewModel(input("t1", { phone: true })))).querySelector(".g-pagehead__meta"), null, "nothing at all for an active team");
  // On the page: typing hands the query to the reference and goes there, the caret asked for in its field.
  coach();
  setRefQuery("");
  takeSearchFocus();
  await renderTeamOverview("t1");
  globalThis.location.hash = "#/t/t1";
  const live = view.querySelector("#overview-query");
  live.value = "block";
  fireEvent(live, "input");
  assert.equal(location.hash, "#/ref");
  assert.equal(refQuery(), "block");
  assert.equal(takeSearchFocus(), true);
  // Blanks go nowhere, as in the reference's own head.
  globalThis.location.hash = "#/t/t1";
  live.value = "  ";
  fireEvent(live, "input");
  assert.equal(location.hash, "#/t/t1");
  assert.equal(takeSearchFocus(), false);
  // Left, the field is heard no more.
  releaseCurrentScreen();
  live.value = "dodge";
  fireEvent(live, "input");
  assert.equal(location.hash, "#/t/t1");
  assert.equal(refQuery(), "  ");
  setRefQuery("");
});

test("the overview follows the width: a desk turned phone draws Team.html's tiles, and back", async () => {
  const { listeners, cross } = crossingWindow(false);
  const labels = () => view.querySelectorAll(".g-kpi__k").map((label) => label.textContent);
  const DESK = ["Place in the league", "Points · W/D/L", "Team value", "Treasury", "TD ± / CAS ±"];
  const PHONE = ["Team value", "Treasury", "W · D · L", "TD / CAS difference"];
  try {
    coach();
    await renderTeamOverview("t1");
    assert.deepEqual(labels(), DESK);
    assert.ok(view.querySelector("#overview-query"));
    // The field the coach is in goes with the desk: the focus is not lost on the body (Review Focus 2), it is the title's.
    view.querySelector("#overview-query").focus();
    cross(true);
    assert.deepEqual(labels(), PHONE);
    assert.equal(view.querySelector("#overview-query"), null);
    assert.ok(document.activeElement === view.querySelector("h1"), "the page's title, a place the keyboard goes on from");
    // The treasury the coach is on is another tile on a desk: the title again.
    view.querySelector("a.g-kpi").focus();
    cross(false);
    assert.deepEqual(labels(), DESK);
    assert.ok(view.querySelector("#overview-query"), "the field is back");
    assert.ok(document.activeElement === view.querySelector("h1"));
    // A focus on a node the redraw keeps but the width's stylesheet hides is lost as well (fix round 1, I1): the desk's
    // «Advance» stays in the page on a phone, hidden (overview.css), and a browser would drop the focus to the body.
    const advance = view.querySelector("a.g-overview__advance");
    advance.focus();
    advance.getClientRects = () => [];
    cross(true);
    assert.ok(advance.isConnected && view.querySelector("a.g-overview__advance") === advance, "the same link, still in the page");
    assert.ok(document.activeElement === view.querySelector("h1"), "a hidden link is no place to leave the focus");
    // And back: the phone's card, hidden on a desk.
    const card = view.querySelector("a.g-overview__ready");
    card.focus();
    card.getClientRects = () => [];
    cross(false);
    assert.ok(card.isConnected && document.activeElement === view.querySelector("h1"));
    // A focus the redraw keeps, and the width shows, stays where it is: the board's link, and anything outside the page.
    const outside = el(document, "button", { id: "outside" });
    document.body.appendChild(outside);
    outside.focus();
    cross(true);
    assert.ok(document.activeElement === outside, "the shell's focus is not taken");
    document.body.removeChild(outside);
    view.querySelector(".g-board__actions a").focus();
    const link = document.activeElement;
    link.getClientRects = () => [{ width: 120, height: 44 }];
    cross(false);
    assert.ok(document.activeElement === link && link.isConnected, "the board's link is the same link on both widths");
    // The leaders follow the width too: a desk's cards, a phone's rows; a focus on a card is never lost on the body.
    assert.ok(view.querySelector(".g-overview__leadercards") && !view.querySelector(".g-overview__leaderrows"));
    const leader = view.querySelector("a.g-overview__leader");
    leader.focus();
    cross(true);
    assert.equal(view.querySelector(".g-overview__leadercards"), null);
    assert.equal(view.querySelectorAll("a.g-overview__leaderline").length, 3);
    assert.ok(document.activeElement === view.querySelector("a.g-overview__leaderline"), "the same leader's link, now a phone's row: the patch keeps it, and the width shows it");
    assert.equal(document.activeElement.getAttribute("href"), "#/t/t1/roster/p1");
    cross(false);
    assert.ok(view.querySelector(".g-overview__leadercards"));
    // Left, the width is heard no more.
    releaseCurrentScreen();
    assert.equal(listeners.size, 0, "a visit left listens no more");
    view.innerHTML = "<p>next</p>";
    cross(true);
    assert.equal(view.querySelector("p").textContent, "next");
  } finally {
    delete globalThis.matchMedia;
  }
});

test("the figures and the head's field as DeskOverview.html and Team.html draw them: styled; readable; breakpoints only 900/901", () => {
  const css = "src/screens/team/overview.css";
  const own = (selector, property) => valuesOf(css, selector, property);
  const bare = text(css).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = mediaText(css, "min-width: 901px");
  // A desk's cards: white in the ring, 14 16 in; the figure Oswald 34 at the font's own line height, the place's second part 20px.
  assert.deepEqual(own(".g-overview .g-kpi", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(own(".g-overview .g-kpi", "background"), ["var(--surface)"]);
  assert.deepEqual(own(".g-overview .g-kpi", "padding"), ["var(--space-14) var(--space-16)"]);
  assert.match(desk, /\.g-overview \.g-kpi \{[^}]*padding: var\(--space-14\) var\(--space-16\);[^}]*background: var\(--surface\);[^}]*box-shadow: var\(--ring\);/, "from 901px: a phone's tile is kpi-tile.css's own");
  assert.match(desk, /\.g-overview \.g-kpi__v \{ font-size: 34px; \}/);
  // On both widths the label sits straight over the figure, each at its font's own line height, as the prototypes draw them: 85px on a phone, 95px on a desk.
  assert.deepEqual(own(".g-overview .g-kpi__v", "line-height"), ["normal"]);
  assert.deepEqual(own(".g-overview .g-kpi__k", "line-height"), ["normal"]);
  assert.deepEqual(own(".g-overview .g-kpi", "gap"), ["0"]);
  const gapless = ".g-overview .g-kpi { gap: 0; }";
  assert.ok(bare.includes(gapless) && !["max-width: 900px", "min-width: 901px"].some((query) => mediaText(css, query).includes(gapless)), "for both widths");
  assert.deepEqual(own(".g-overview .g-kpi:first-child .g-kpi__rest", "font-size"), ["20px"], "«/ 10» is 20px, «· 4/1/1» the tile's 22px");
  assert.match(desk, /\.g-overview \.g-kpi:first-child \.g-kpi__rest \{ font-size: 20px; \}/);
  // A phone's tile (Team.html) is kpi-tile.css's: --surface-2, 14 round, 12 14 in, two columns 8 apart, Oswald 700 30px.
  const tile = "src/ui/kpi-tile.css";
  assert.deepEqual(valuesOf(tile, ".g-kpi", "background"), ["var(--surface-2)"]);
  assert.deepEqual(valuesOf(tile, ".g-kpi", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(valuesOf(tile, ".g-kpi", "padding"), ["var(--space-12) var(--space-14)"]);
  assert.deepEqual(valuesOf(tile, ".g-kpis", "grid-template-columns"), ["repeat(2, minmax(0, 1fr))"]);
  assert.deepEqual(valuesOf(tile, ".g-kpis", "gap"), ["var(--space-8)"]);
  assert.deepEqual(valuesOf(tile, ".g-kpi__v", "font"), ["700 30px/1.1 var(--font-display)"]);
  // The link card's hover is a shade of the ink over white, in every palette.
  const [hover] = own(".g-overview a.g-kpi--link:hover", "background");
  assert.equal(hover, "color-mix(in srgb, var(--ink) 4%, var(--surface))");
  assertContrast(hover, ["--surface"], 1.05, { what: "the hover of a desk's link card" });
  assert.match(desk, /\.g-overview a\.g-kpi--link:hover \{/);
  // The field (DeskOverview.html): 320px and never wider than the band, 44px, its words 15px.
  assert.deepEqual(own(".g-overview__search", "width"), ["320px"]);
  assert.deepEqual(own(".g-overview__search", "max-width"), ["100%"]);
  assert.deepEqual(own(".g-overview__search .g-search", "width"), ["100%"]);
  assert.deepEqual(own(".g-overview__search .g-search__input", "height"), ["44px"]);
  assert.deepEqual(own(".g-overview__search .g-search__input", "font-size"), ["15px"]);
  assert.match(desk, /\.g-overview__search \{/);
  // Readable: the grey second part on a desk's card and on a phone's tile, the accent on the card.
  assertReadable(tile, ".g-kpi__rest", "color", ["--surface", "--surface-2"], 4.5);
  assertReadable(tile, ".g-kpi--accent .g-kpi__v", "color", ["--surface"], 4.5);
  for (const file of [css, tile]) for (const [, query] of text(file).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), `${file}: ${query}`);
  assert.doesNotMatch(bare, /--focus-ring/);
});

test("the board shows the next match with «Match preparation» and «Friendlies», the season's squares as its form", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__name").textContent, "Rival Team");
  assert.deepEqual(fragment.querySelectorAll(".g-board__actions a").map((link) => link.getAttribute("href")), ["#/games/g1/pre-match", "#/t/t1/challenges"]);
  // A desk's squares are the band's (stage 09a): the matches played in the order they were settled, the friendly an «F», then the current one.
  assert.deepEqual(fragment.querySelectorAll(".g-board__square").map((square) => square.textContent), ["1", "2", "F", "3"]);
  // A phone's are the season's league matches, as before (the owner: the phone's board stays).
  const phone = mount(overviewMarkup(overviewModel(input("t1", { phone: true }))));
  assert.deepEqual(phone.querySelectorAll("ol .g-board__square").map((square) => square.textContent), ["1", "2", "3"]);
});

test("the board names both teams by race, our place and value, the round and the venue, and the match not begun", () => {
  const model = overviewModel(input("t1"));
  assert.equal(model.board.status, "idle");
  assert.equal(model.board.overline, "Round 3 · home");
  assert.match(model.board.own.sub, /^Human · #2 · TV \d[\d,]*k$/);
  assert.equal(model.board.opponent.sub, "#1", "the opponent's place short, after the race (DeskOverview.html's «5-е»)");
  assert.equal(overviewModel(input("t1", { phone: true })).board.opponent.sub, "Dwarf · #1", "a phone's line: the race and the place short");
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector(".g-board__mid .g-status").textContent, "Not started");
  assert.equal(fragment.querySelector(".g-board__score").textContent, "–:–");
  assert.equal(fragment.querySelector(".g-board__square--current").textContent, "3", "the match the board is about is the current square");
  assert.equal(fragment.querySelector(".g-board--live"), null);
});

test("on a desk the board draws the league's crest by our name, the opponent's initial by theirs, the race as a link to its rules and the place short", () => {
  const model = overviewModel(input("t1"));
  assert.equal(model.board.own.crestHtml, renderCrest({ size: "md" }));
  // The opponent's name leads to the team's page (DeskOverview.html, L7), the race to its rules in the reference.
  // Each with the prototype's tooltip: «Обзор команды», «Правила команды в справочнике».
  assert.deepEqual(model.board.opponent, { name: "Rival Team", href: "#/coaches/u-r1/teams/r1", hint: "Team overview", sub: "#1", initial: "R",
    race: { title: "Dwarf", href: "#/teams/dwarf", hint: "The team's rules in the reference" } });
  const fragment = mount(overviewMarkup(model));
  const [ours, theirs] = fragment.querySelectorAll(".g-board__side");
  assert.ok(ours.querySelector(".g-board__crest svg.g-crest--md"));
  assert.equal(ours.querySelector(".g-board__name").tagName, "SPAN");
  assert.equal(theirs.querySelector(".g-board__initial").textContent, "R");
  assert.equal(theirs.querySelector('a.g-board__name[href="#/coaches/u-r1/teams/r1"]').textContent, "Rival Team");
  assert.equal(theirs.querySelector('a.g-board__race[href="#/teams/dwarf"]').textContent, "Dwarf");
  assert.deepEqual([theirs.querySelector("a.g-board__name").getAttribute("title"), theirs.querySelector("a.g-board__race").getAttribute("title")],
    ["Team overview", "The team's rules in the reference"]);
  assert.equal(theirs.querySelector(".g-board__sub").textContent, "Dwarf · #1");
  // In Russian the place is «1-е», as the prototype's «5-е».
  initLocale("ru");
  try {
    assert.equal(overviewModel(input("t1")).board.opponent.sub, "1-е");
    const { hint, race } = overviewModel(input("t1")).board.opponent;
    assert.deepEqual([hint, race.hint], ["Обзор команды", "Правила команды в справочнике"], "DeskOverview.html's own words");
    assert.equal(overviewModel(input("t1", { phone: true })).board.opponent.sub, "Dwarf · 1-е", "the race is the reference's word: the test reads the English one");
  } finally {
    initLocale("en");
  }
});

test("the opponent's letter is the first of the name, upper case, «?» for a name of nothing; no race known, no link to one; no place, no rest", () => {
  const rival = (name, slug = "teams/dwarf", over = {}) => overviewModel(input("t1", { games: gamesWith({ g1: { away: { ...side("r1", name, slug), ...over } } }) })).board.opponent;
  assert.equal(rival("  émigrés").initial, "É", "after the blanks, upper case");
  assert.equal(rival("𝔊rimtusk").initial, "𝔊", "a letter outside the basic plane is one letter, not half of one");
  for (const name of ["", "   "]) assert.equal(rival(name).initial, "?", JSON.stringify(name));
  // A race the reference does not know is neither a title nor a link: the line is the place alone.
  const unknown = rival("Rival Team", "teams/nowhere");
  assert.equal(unknown.race, undefined);
  assert.equal(unknown.sub, "#1");
  const drawn = mount(overviewMarkup(overviewModel(input("t1", { games: gamesWith({ g1: { away: side("r1", "Rival Team", "teams/nowhere") } }) }))));
  assert.equal(drawn.querySelector(".g-board__race"), null);
  assert.equal(drawn.querySelector(".g-board__side--away .g-board__sub").textContent, "#1");
  // An opponent outside the table: the race alone, and no « · » after it.
  const outside = overviewModel(input("t1", { games: gamesWith({ g1: { away: side("r9", "Late Entry", "teams/dwarf") } }) }));
  assert.equal(outside.board.opponent.sub, "");
  assert.equal(mount(overviewMarkup(outside)).querySelector(".g-board__side--away .g-board__sub").textContent, "Dwarf");
  // With no coach or no team to lead to, the name is text.
  assert.equal(rival("Rival Team", "teams/dwarf", { user: null }).href, undefined);
  assert.equal(rival("Rival Team", "teams/dwarf", { user: { id: "u-r1" }, team: { name: "Rival Team", baseTeamSlug: "teams/dwarf" } }).href, undefined);
});

test("the state under the score is the dark band's chip on both widths, as DeskOverview.html's: an eighth of the ink, the dot the state's", () => {
  for (const phone of [false, true]) {
    const chips = ["t1", "t2", "t3"].map((id) => mount(overviewMarkup(overviewModel(input(id, { phone })))).querySelector(".g-board__mid .g-status").getAttribute("class"));
    assert.deepEqual(chips, ["g-status g-status--on-dark", "g-status g-status--live g-status--on-dark", "g-status g-status--wait g-status--on-dark"], `phone: ${phone}`);
  }
  assertReadable("src/ui/status-chip.css", ".g-status--on-dark", "color", ["color-mix(in srgb, var(--header-ink) 12%, var(--header))"], 4.5);
});

test("a phone's board draws neither the crest nor the initial, and the race as text", () => {
  const model = overviewModel(input("t1", { phone: true }));
  assert.equal(model.board.own.crestHtml, undefined);
  assert.deepEqual(model.board.opponent, { name: "Rival Team", sub: "Dwarf · #1" });
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector(".g-board__crest"), null);
  assert.equal(fragment.querySelector(".g-board__initial"), null);
  assert.equal(fragment.querySelector(".g-board__texts"), null);
  assert.ok(fragment.querySelectorAll(".g-board a").every((link) => link.closest(".g-board__actions")), "the only links are the actions");
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__sub").textContent, "Dwarf · #1");
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__name").tagName, "SPAN");
});

test("a focus on the board's links of a desk is not lost on a phone, where they are text: it goes to the title", async () => {
  const { cross } = crossingWindow(false);
  try {
    coach();
    await renderTeamOverview("t1");
    for (const selector of ["a.g-board__name", "a.g-board__race"]) {
      view.querySelector(selector).focus();
      cross(true);
      assert.equal(view.querySelector(selector), null, `${selector} is text on a phone`);
      assert.ok(document.activeElement === view.querySelector("h1"), selector);
      cross(false);
      assert.ok(view.querySelector(selector), `${selector} is a link again on a desk`);
    }
    releaseCurrentScreen();
  } finally {
    delete globalThis.matchMedia;
  }
});

test("a live match offers its records and the post-match; a score the opponent sent waits to be confirmed", () => {
  // The band's looks (DeskSeasonLive.html, stage 09a): the records outlined, the post-match white.
  assert.deepEqual(overviewModel(input("t2")).board.links.map(({ kind }) => kind), ["light", "primary"]);
  const sent = overviewModel(input("t3")).board;
  assert.equal(sent.status, "sent");
  assert.equal(sent.score, "2:1", "one way of writing a score on the board (pre-flight L31)");
  assert.equal(sent.links[0].href, "#/games/g3");
  const live = mount(overviewMarkup(overviewModel(input("t2"))));
  assert.ok(live.querySelector(".g-board--live"));
  assert.equal(live.querySelector(".g-board__mid .g-status--live").textContent, "Match in play");
  const awaiting = mount(overviewMarkup(overviewModel(input("t3"))));
  assert.equal(awaiting.querySelector(".g-board__mid .g-status--wait").textContent, "Awaiting confirmation");
  assert.equal(awaiting.querySelector(".g-board__score").textContent, "2:1");
  // The opponent sent it: «Confirm the score» alone, no line repeating the score and the CAS (G5).
  assert.ok(!awaiting.querySelector(".g-board__note"), "no line");
});

test("a team in the table with nothing to play says when the opponent comes, and offers the friendlies alone", () => {
  const model = overviewModel(input("t1", { games: GAMES.filter((item) => item.id !== "g1") }));
  assert.equal(model.board.status, "none");
  assert.equal(model.board.opponent, null);
  assert.equal(model.board.pendingText, "Opponent — after round 3");
  assert.deepEqual(model.board.links.map(({ label, kind }) => [label, kind]), [["Friendlies", "light"]], "the friendlies, as the band offers them with no match on");
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
  // The call carries its own button since stage 12 (decision 22): no link to a 2.x season screen.
  assert.equal(fragment.querySelector("a.g-callout"), null);
  assert.equal(fragment.querySelector(".g-callout [data-season-enter]").textContent.trim(), "Enter the season");
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
  assert.ok(fragment.querySelectorAll(".g-overview__leaders .g-overview__leader").length >= 1);
  const results = fragment.querySelectorAll(".g-overview__results .g-overview__result");
  assert.equal(results[0].querySelector(".g-result--t") !== null, true, "the friendly is the newest");
  assert.equal(fragment.querySelector('.g-overview__results a[href="#/t/t1/matches"]').textContent.trim(), "Whole season →");
});

// A leader in each of the four counters: Ashby the SPP (7) and the touchdowns, Gruk the casualties, Vane the completions.
const LEADERS = [
  { id: "p1", rowIndex: 0, number: "3", name: "Ashby", spp: { touchdowns: 2, completions: 1 } },
  { id: "p2", rowIndex: 1, number: "5", name: "Vane", spp: { touchdowns: 1, completions: 4 } },
  { id: "p3", rowIndex: 2, number: "12", name: "Gruk", spp: { casualties: 3 } },
];
/** The element children of a node, by their first class. */
const classesOf = (node) => node.childNodes.filter((child) => child.nodeType === 1).map((child) => child.getAttribute("class").split(" ")[0]);
const LISTS_CSS = "src/screens/team/overview-lists.css";
/** The mini table's sheet (stage 10): a desk's right column holds the table under who can advance. */
const TABLE_CSS = "src/screens/season/table.css";
/** A sheet without its comments. */
const bareOf = (file) => text(file).replace(/\/\*[\s\S]*?\*\//g, "");
/** What a sheet says from 901px, and up to 900px: its rules inside the query of the width. */
const deskOf = (file) => mediaText(file, "min-width: 901px");
const phoneOf = (file) => mediaText(file, "max-width: 900px");
/** The body of the first rule in `source` whose selector is `selector` alone, or ends a list with it; "" when there is none. */
const ruleOf = (source, selector) => source.match(new RegExp(`(?:^|[{}\\s])${selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\{([^}]*)\\}`))?.[1] ?? "";

test("on a desk the leaders are DeskOverview's cards: the tag over the player's number on his position's colour, the name and the position, the figure at the right; each card leads to the player", () => {
  const model = overviewModel(input("t1", { team: crew(LEADERS) }));
  assert.deepEqual(model.leaders.map(({ key, id, name, kind, value }) => [key, id, name, kind, value]),
    [["spp", "p1", "Ashby", "lineman", 7], ["td", "p1", "Ashby", "lineman", 2], ["cas", "p3", "Gruk", "catcher", 3], ["comp", "p2", "Vane", "thrower", 4]]);
  const section = mount(overviewMarkup(model)).querySelector("section.g-overview__leaders");
  assert.equal(section.getAttribute("aria-labelledby"), "overview-leaders-title");
  assert.deepEqual(classesOf(section), ["g-overview__title", "g-overview__leadercards"]);
  const title = section.querySelector("h2.g-overview__title");
  assert.equal(title.getAttribute("id"), "overview-leaders-title");
  assert.equal(title.textContent, "Team leaders");
  const cards = section.querySelectorAll(".g-overview__leadercards a.g-overview__leader");
  assert.deepEqual(cards.map((card) => [
    card.querySelector(".g-overview__leadertag").textContent, card.querySelector(".g-num__n").textContent, card.querySelector(".g-overview__leadername").textContent,
    card.querySelector(".g-overview__leaderpos").textContent, card.querySelector(".g-overview__leadervalue").textContent, card.getAttribute("href")]),
  [["SPP", "3", "Ashby", "Human Lineman", "7", teamPlayerUrl("t1", "p1")], ["TD", "3", "Ashby", "Human Lineman", "2", teamPlayerUrl("t1", "p1")],
    ["CAS", "12", "Gruk", "Catcher", "3", teamPlayerUrl("t1", "p3")], ["COMP", "5", "Vane", "Thrower", "4", teamPlayerUrl("t1", "p2")]]);
  assert.equal(cards[0].getAttribute("href"), "#/t/t1/roster/p1", "on a desk the roster with the player in its panel");
  // The tag over the row; in the row the badge renderPlayerBadge draws, who it is (the name over the position), the figure.
  for (const card of cards) {
    assert.deepEqual(classesOf(card), ["g-overview__leadertag", "g-overview__leaderrow"]);
    assert.deepEqual(classesOf(card.querySelector(".g-overview__leaderrow")), ["g-num", "g-overview__leaderwho", "g-overview__leadervalue"]);
    assert.deepEqual(classesOf(card.querySelector(".g-overview__leaderwho")), ["g-overview__leadername", "g-overview__leaderpos"]);
  }
  assert.deepEqual(cards.map((card) => card.querySelector(".g-num").getAttribute("class")), ["g-num g-num--lineman", "g-num g-num--lineman", "g-num g-num--catcher", "g-num g-num--thrower"],
    "the number on the position's colour");
  assert.equal(section.querySelector(".g-overview__leaderrows"), null, "not a phone's rows");
  assert.equal(section.querySelector(".g-overview__leadervalue--spp"), null, "every figure of a desk is in the accent: no SPP's own");
  assert.equal(mount(overviewMarkup(overviewModel(input("t2")))).querySelector(".g-overview__leaders"), null, "a team nobody has scored for has no leaders");
  initLocale("ru");
  try {
    assert.equal(mount(overviewMarkup(overviewModel(input("t1", { team: crew(LEADERS) })))).querySelector("#overview-leaders-title").textContent, "Лидеры команды");
  } finally {
    initLocale("en");
  }
});

test("on a phone the leaders are Team.html's rows under «Leaders»: the tag, the name with «#3 …» beside it, the figure; only SPP's in the accent; each row leads to the player", () => {
  const section = mount(overviewMarkup(overviewModel(input("t1", { team: crew(LEADERS), phone: true })))).querySelector("section.g-overview__leaders");
  assert.equal(section.getAttribute("aria-labelledby"), "overview-leaders-title");
  assert.deepEqual(classesOf(section), ["g-overview__title", "g-overview__leaderrows"]);
  assert.equal(section.querySelector("h2#overview-leaders-title").textContent, "Leaders");
  const rows = section.querySelectorAll(".g-overview__leaderrows a.g-overview__leaderline");
  assert.deepEqual(rows.map((row) => [
    row.querySelector(".g-overview__leadertag").textContent, row.querySelector(".g-overview__leadername").textContent, row.querySelector(".g-overview__leaderpos").textContent,
    row.querySelector(".g-overview__leadervalue").textContent, row.getAttribute("href")]),
  [["SPP", "Ashby #3 Human Lineman", "#3 Human Lineman", "7", "#/t/t1/roster/p1"], ["TD", "Ashby #3 Human Lineman", "#3 Human Lineman", "2", "#/t/t1/roster/p1"],
    ["CAS", "Gruk #12 Catcher", "#12 Catcher", "3", "#/t/t1/roster/p3"], ["COMP", "Vane #5 Thrower", "#5 Thrower", "4", "#/t/t1/roster/p2"]]);
  for (const row of rows) {
    assert.deepEqual(classesOf(row), ["g-overview__leadertag", "g-overview__leadername", "g-overview__leadervalue"]);
    assert.deepEqual(classesOf(row.querySelector(".g-overview__leadername")), ["g-overview__leaderpos"], "the number and the position beside the name, in it");
  }
  assert.deepEqual(rows.map((row) => row.querySelector(".g-overview__leadervalue").getAttribute("class")),
    ["g-overview__leadervalue g-overview__leadervalue--spp", "g-overview__leadervalue", "g-overview__leadervalue", "g-overview__leadervalue"], "SPP's alone in the accent");
  assert.equal(section.querySelector(".g-num"), null, "no badge on a phone (Team.html)");
  assert.equal(section.querySelector(".g-overview__leadercards"), null, "not a desk's cards");
  // A player with no number: the position alone beside the name.
  const unnumbered = mount(overviewMarkup(overviewModel(input("t1", { team: crew([{ ...LEADERS[0], number: "" }]), phone: true }))));
  assert.equal(unnumbered.querySelector(".g-overview__leaderpos").textContent, "Human Lineman");
  initLocale("ru");
  try {
    assert.equal(mount(overviewMarkup(overviewModel(input("t1", { team: crew(LEADERS), phone: true })))).querySelector("#overview-leaders-title").textContent, "Лидеры");
  } finally {
    initLocale("en");
  }
});

test("a leader the roster stores no id for is no link, on either width", () => {
  // Cade leads the SPP and the touchdowns and is stored without an id; Vane, who leads the completions, has his.
  const team = crew([{ rowIndex: 2, number: "7", name: "Cade", spp: { touchdowns: 9 } }, LEADERS[1]]);
  for (const [phone, box] of [[false, ".g-overview__leader"], [true, ".g-overview__leaderline"]]) {
    const fragment = mount(overviewMarkup(overviewModel(input("t1", { team, phone }))));
    const boxes = fragment.querySelectorAll(box);
    assert.deepEqual(boxes.map((node) => [node.tagName.toLowerCase(), node.getAttribute("href") ?? ""]), [["div", ""], ["div", ""], ["a", "#/t/t1/roster/p2"]], phone ? "phone" : "desk");
    assert.equal(boxes[0].querySelector(".g-overview__leadername").textContent.split(" ")[0], "Cade", "still said, only not a link");
    assert.equal(fragment.querySelectorAll(".g-overview__leaders a").length, 1);
  }
});

test("the blocks stand as DeskOverview orders them: the leaders and the results at the left, who can advance at the right; a phone keeps Team.html's order", () => {
  const desk = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) }))));
  assert.deepEqual(classesOf(desk.querySelector(".g-overview")), ["g-kpis", "g-overview__ready", "g-board", "g-overview__cols"], "the columns after the board");
  const cols = desk.querySelector(".g-overview__cols");
  assert.deepEqual(classesOf(cols), ["g-overview__main", "g-overview__aside"]);
  assert.deepEqual(classesOf(cols.querySelector(".g-overview__main")), ["g-overview__leaders", "g-overview__results"]);
  assert.deepEqual(classesOf(cols.querySelector(".g-overview__aside")), ["g-overview__readylist", "g-minitable"], "the table under who can advance (stage 10)");
  // A phone: the tiles, the card of who can advance, the board, the leaders, the recent matches (Team.html; the board, question 2).
  // The right column is a desk's: the stylesheet hides it, and nothing else of the page is in it.
  const phone = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW), phone: true }))));
  assert.deepEqual(classesOf(phone.querySelector(".g-overview")), ["g-kpis", "g-overview__ready", "g-board", "g-overview__cols"]);
  assert.deepEqual(classesOf(phone.querySelector(".g-overview__main")), ["g-overview__leaders", "g-overview__results"]);
  assert.deepEqual(classesOf(phone.querySelector(".g-overview__aside")), ["g-overview__readylist"]);
  assert.deepEqual(inMedia(LISTS_CSS, "max-width: 900px", ".g-overview__aside", "display"), ["none"]);
});

test("one column alone takes the row: no one ready leaves the left alone; no leader and no result leave the right alone", () => {
  // Dunn has too little to spend and Moss has spent it: nobody is ready, and with no table (stage 10: the right column holds it)
  // the left column is drawn alone.
  const left = mount(overviewMarkup(overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]), seasonData: null }))));
  assert.deepEqual(classesOf(left.querySelector(".g-overview__cols")), ["g-overview__main"], "no empty right column");
  assert.deepEqual(classesOf(left.querySelector(".g-overview__main")), ["g-overview__leaders", "g-overview__results"]);
  // No leader and no result: the right column alone.
  const model = { ...overviewModel(input("t1", { team: crew(CREW), games: [] })), leaders: [] };
  assert.deepEqual(model.results, []);
  const right = mount(overviewMarkup(model));
  assert.deepEqual(classesOf(right.querySelector(".g-overview__cols")), ["g-overview__aside"], "no empty left column");
  // A column holds what it has: the leaders alone, or the results alone.
  const leadersOnly = mount(overviewMarkup(overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]), games: [] }))));
  assert.deepEqual(classesOf(leadersOnly.querySelector(".g-overview__main")), ["g-overview__leaders"]);
  const resultsOnly = mount(overviewMarkup({ ...overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]), seasonData: null })), leaders: [] }));
  assert.deepEqual(classesOf(resultsOnly.querySelector(".g-overview__cols")), ["g-overview__main"]);
  assert.deepEqual(classesOf(resultsOnly.querySelector(".g-overview__main")), ["g-overview__results"]);
  // The stylesheet: a row that wraps, each column growing from its basis, so one alone fills the row without a rule of its own.
  const source = text(LISTS_CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = mediaText(LISTS_CSS, "min-width: 901px");
  assert.match(desk, /\.g-overview__cols \{[^}]*flex-direction: row;[^}]*flex-wrap: wrap;[^}]*align-items: flex-start;/);
  assert.match(desk, /\.g-overview__main \{ flex: 2 1 560px; \}/);
  assert.match(desk, /\.g-overview__aside \{ flex: 1 1 300px; \}/);
  // (A result row spans its list's grid, Task 33: that is a row's rule, not a column's.)
  assert.doesNotMatch(source, /:only-child|\.g-overview__(?:cols|main|aside)(?![\w-])[^{]*\{[^}]*grid-column/, "no lone-list rule: the wrap does it");
});

// Stage 10, decision 15: the league of eight, the coach's t1 second, or eighth (DeskOverview.html's «Table»).
const LEAGUE = {
  season: SEASON.season,
  standings: [
    standingRow("r1", "Rival Team", "teams/dwarf", "u-r1", 1, 6), standingRow("t1", "Ashgrove Wardens", "teams/human", "u1", 2, 3),
    standingRow("r2", "Rival Raiders", "teams/skaven", "u-r2", 3, 3), standingRow("r3", "Rival Wardens", "teams/lizardmen", "u-r3", 4, 3),
    standingRow("r4", "Fourth Wall", "teams/orc", "u-r4", 5, 1), standingRow("r5", "Fifth Column", "teams/orc", "u-r5", 6, 1),
    standingRow("r6", "Sixth Sense", "teams/orc", "u-r6", 7, 0), standingRow("r7", "Seventh Seal", "teams/orc", "u-r7", 8, 0),
  ],
  rounds: [{ roundNumber: 1, status: "completed", pairings: [
    { id: "pa", tableNumber: 1, homeEntryId: "e-t1", awayEntryId: "e-r4", homeTouchdowns: 3, awayTouchdowns: 1, homeCasualties: 0, awayCasualties: 0, homePoints: 3, awayPoints: 0, resultStatus: "confirmed" },
  ] }],
};
/** The league with t1 swapped to the last place. */
const LEAGUE_LAST = { ...LEAGUE, standings: LEAGUE.standings.map((row) => {
  if (row.team.id === "t1") return { ...row, rank: 8 };
  return row.rank > 2 ? { ...row, rank: row.rank - 1 } : row;
}).sort((one, other) => one.rank - other.rank) };
/** Each row of the mini table: its place, team, TD± and points, and whether it is the coach's. */
const miniRows = (root) => root.querySelectorAll(".g-minitable__row").map((row) => [
  row.querySelector(".g-minitable__rank").textContent, row.querySelector(".g-minitable__team").textContent,
  row.querySelector(".g-minitable__diff").textContent, row.querySelector(".g-minitable__points").textContent, row.getAttribute("class").includes("g-minitable__row--mine")]);

test("a desk's right column has the table's top six, the team's row marked, and the way to the whole table", async () => {
  const model = overviewModel(input("t1", { seasonData: LEAGUE, viewerId: "u1" }));
  assert.deepEqual(model.table.map((row) => [row.rank, row.team.id]), [[1, "r1"], [2, "t1"], [3, "r2"], [4, "r3"], [5, "r4"], [6, "r5"]]);
  assert.equal(model.viewerId, "u1");
  const aside = mount(overviewMarkup(model)).querySelector(".g-overview__aside");
  const table = aside.querySelector(".g-minitable");
  assert.ok(table, "the table in the right column");
  assert.deepEqual(miniRows(aside), [
    ["1", "Rival Team", "0", "6", false], ["2", "Ashgrove Wardens", "+2", "3", true], ["3", "Rival Raiders", "0", "3", false],
    ["4", "Rival Wardens", "0", "3", false], ["5", "Fourth Wall", "−2", "1", false], ["6", "Fifth Column", "0", "1", false]]);
  assert.equal(table.querySelector("h2").textContent, "Table");
  assert.equal(table.querySelector("a.g-minitable__all").getAttribute("href"), "#/t/t1/matches", "the whole table: the team's season, where a desk has it (decision 12)");
  assert.equal(table.querySelector(".g-minitable__row--mine a").getAttribute("href"), "#/t/t1", "the coach's own row leads to its overview");
  assert.equal(table.querySelectorAll(".g-minitable__row a")[0].getAttribute("href"), "#/coaches/u-r1/teams/r1", "another's to the opponent's page");
  // The screen gives the model the coach who looks.
  coach({ season: LEAGUE });
  await renderTeamOverview("t1");
  await settle();
  assert.equal(view.querySelectorAll(".g-overview__aside .g-minitable__row").length, 6);
  assert.equal(view.querySelector(".g-overview__aside .g-minitable__row--mine .g-minitable__team").textContent, "Ashgrove Wardens");
  releaseCurrentScreen();
});

test("a team below the sixth stands last in it with its place", () => {
  const rows = miniRows(mount(overviewMarkup(overviewModel(input("t1", { seasonData: LEAGUE_LAST, viewerId: "u1" })))));
  assert.deepEqual(rows.map(([rank, team, , , mine]) => [rank, team, mine]), [
    ["1", "Rival Team", false], ["2", "Rival Raiders", false], ["3", "Rival Wardens", false], ["4", "Fourth Wall", false], ["5", "Fifth Column", false], ["8", "Ashgrove Wardens", true]]);
});

test("the coach's other team in the table leads to its overview, unmarked: the overview marks its own team's row (DeskOverview.html)", () => {
  const both = { ...LEAGUE, standings: LEAGUE.standings.map((row) => (row.team.id === "r2" ? { ...row, user: { id: "u1", login: "coach" } } : row)) };
  const rows = mount(overviewMarkup(overviewModel(input("t1", { seasonData: both, viewerId: "u1" })))).querySelectorAll(".g-minitable__row");
  assert.deepEqual(rows.filter((row) => row.getAttribute("class").includes("--mine")).map((row) => row.querySelector(".g-minitable__team").textContent), ["Ashgrove Wardens"]);
  assert.equal(rows[2].querySelector("a").getAttribute("href"), "#/t/r2", "the coach's other team: its overview");
});

test("a phone has no table; a team outside the season has none; until the table is read there is none", () => {
  const phone = overviewModel(input("t1", { seasonData: LEAGUE, viewerId: "u1", phone: true }));
  assert.deepEqual(phone.table, []);
  assert.equal(mount(overviewMarkup(phone)).querySelector(".g-minitable"), null, "Team.html has none");
  const outside = overviewModel(input("t4", { seasonData: LEAGUE, viewerId: "u1" }));
  assert.deepEqual(outside.table, []);
  assert.equal(mount(overviewMarkup(outside)).querySelector(".g-minitable"), null);
  const withdrawn = { ...LEAGUE, standings: LEAGUE.standings.map((row) => (row.team.id === "t1" ? { ...row, withdrawnAt: "2026-10-01T00:00:00Z" } : row)) };
  assert.deepEqual(overviewModel(input("t1", { seasonData: withdrawn, viewerId: "u1" })).table, [], "an entry withdrawn is outside the table");
  const unread = overviewModel(input("t1", { seasonData: null, viewerId: "u1" }));
  assert.deepEqual(unread.table, []);
  assert.equal(mount(overviewMarkup(unread)).querySelector(".g-minitable"), null);
});

test("with nobody ready to advance the column holds the table alone", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]), seasonData: LEAGUE, viewerId: "u1" }))));
  assert.deepEqual(classesOf(fragment.querySelector(".g-overview__cols")), ["g-overview__main", "g-overview__aside"]);
  assert.deepEqual(classesOf(fragment.querySelector(".g-overview__aside")), ["g-minitable"]);
  // Nobody ready and no table: no right column at all, as before.
  assert.deepEqual(classesOf(mount(overviewMarkup(overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]), seasonData: null })))).querySelector(".g-overview__cols")), ["g-overview__main"]);
});

// The team's own MVPs as the server's list sends them (Task 30): Ashby in round 1 at home, two in round 2 away (a conceded
// winner picks two); the rival's own MVP of round 1 is the rival's, not ours.
const MVP_GAMES = gamesWith({
  ga: { homeMvps: [{ id: "p1", name: "Ashby" }], awayMvps: [{ id: "x9", name: "Their Star" }] },
  gb: { awayMvps: [{ id: "p2", name: "Vane" }, { id: "p3", name: "Cade" }] },
});
/** The text of each of a row's parts, "" for a part it does not draw. */
const partsOf = (row, selectors) => selectors.map((selector) => row.querySelector(selector)?.textContent ?? "");
const DESK_PARTS = [".g-sr-only", ".g-overview__round", ".g-overview__opponent", ".g-overview__racelink", ".g-overview__mvp", ".g-overview__cas", ".g-overview__score"];
/** A desk row's links: each one's last class, its address, and its tooltip ("" for none). */
const linksOf = (row) => row.querySelectorAll("a").map((link) => [link.getAttribute("class").split(" ").at(-1), link.getAttribute("href"), link.getAttribute("title") ?? ""]);

test("on a desk a result is DeskOverview's row: the pill, the round, the opponent with the race and the MVP under it, the casualties, the score; the row opens the match", () => {
  const rows = mount(overviewMarkup(overviewModel(input("t1", { games: MVP_GAMES })))).querySelectorAll(".g-overview__results .g-overview__result");
  assert.deepEqual(rows.map((row) => [...partsOf(row, DESK_PARTS), row.querySelector("a.g-overview__match").getAttribute("href")]), [
    ["Friendly", "Friendly", "Rival Team", "Dwarf", "", "CAS 0–0", "1–1", "#/games/gf"],
    ["Loss", "Round 2", "Rival Team", "Dwarf", "MVP Vane, Cade", "CAS 0–2", "0–2", "#/games/gb"],
    ["Win", "Round 1", "Rival Team", "Dwarf", "MVP Ashby", "CAS 1–0", "2–1", "#/games/ga"],
  ]);
  // DeskOverview.html's order. The row is no link (the fidelity pass, F9): the round's word is the match's link, which the
  // stylesheet stretches over the row (spec §3), and the opponent and the race are links of their own, as in the prototype.
  const row = rows[1].querySelector("div.g-overview__row");
  assert.deepEqual(classesOf(row), ["g-result", "g-overview__round", "g-overview__text", "g-overview__cas", "g-overview__score"]);
  assert.deepEqual(classesOf(rows[1].querySelector(".g-overview__text")), ["g-overview__opponent", "g-overview__sub"]);
  // The dot between them is an element of its own, for the eye alone: a wrapped MVP never starts its line with it (T33 m3).
  assert.deepEqual(classesOf(rows[1].querySelector(".g-overview__sub")), ["g-overview__racelink", "g-overview__dot", "g-overview__mvp"]);
  const dot = rows[1].querySelector(".g-overview__dot");
  assert.deepEqual([dot.textContent, dot.getAttribute("aria-hidden")], ["·", "true"]);
  // The match's link first, then the opponent's team (the board's address, Task 34) and the race's rules with the board's tooltip.
  assert.deepEqual(linksOf(rows[1]), [["g-overview__match", "#/games/gb", ""], ["g-overview__opponent", "#/coaches/u-r1/teams/r1", ""],
    ["g-overview__racelink", "#/teams/dwarf", "The team's rules in the reference"]]);
  const match = row.querySelector("a.g-overview__match");
  assert.equal(match.getAttribute("class"), "g-overview__round g-overview__match", "the round's word, styled as the round");
  assert.equal(match.getAttribute("aria-label"), "Round 2, Rival Team, 0–2", "named for the round, the opponent and the score; it starts with the words it shows");
  assert.equal(rows[0].querySelector("a.g-overview__match").getAttribute("aria-label"), "Friendly, Rival Team, 1–1");
  assert.equal(match.getAttribute("data-key"), "game-gb", "the same match's link on the other width (below)");
  // The race: DeskOverview.html's 12px book before its words.
  const race = rows[1].querySelector("a.g-overview__racelink");
  assert.deepEqual([race.querySelector("svg.g-icon").getAttribute("width"), race.querySelector("svg").getAttribute("aria-hidden")], ["12", "true"]);
  assert.deepEqual(race.querySelector("svg").querySelectorAll("path").map((path) => path.getAttribute("d")), ["M5 5a2 2 0 0 1 2-2h12v16H7a2 2 0 0 0-2 2z", "M5 21V5"], "the board's book");
  assert.ok(rows.every((item) => item.querySelectorAll("a").length === 3));
  assert.ok(rows.every((item) => item.querySelector(".g-result") && !item.querySelector(".g-result--compact")), "DeskOverview's 30px pill");
  assert.ok(rows.every((item) => !item.querySelector(".g-overview__line")), "the phone's line is a phone's");
  initLocale("ru");
  try {
    const ru = mount(overviewMarkup(overviewModel(input("t1", { games: MVP_GAMES })))).querySelectorAll(".g-overview__result");
    assert.deepEqual(ru.map((item) => item.querySelector("a.g-overview__match").getAttribute("aria-label")), ["Товарищеский, Rival Team, 1–1", "Тур 2, Rival Team, 0–2", "Тур 1, Rival Team, 2–1"]);
    assert.equal(ru[0].querySelector("a.g-overview__racelink").getAttribute("title"), "Правила команды в справочнике", "the prototype's words");
  } finally {
    initLocale("en");
  }
});

test("on a desk a row says what is known under the opponent: the MVP alone when the race is not known, nothing when neither is; no ids, no link to the team", () => {
  const nameless = side("r9", "Nameless", "teams/nobody");
  const games = [
    played("ga", 1, [2, 1], [1, 0], { away: nameless, homeMvps: [{ id: "p1", name: "Ashby" }] }),
    played("gb", 2, [0, 0], [0, 0], { away: nameless }),
  ];
  const rows = mount(overviewMarkup(overviewModel(input("t1", { games })))).querySelectorAll(".g-overview__result");
  assert.deepEqual(rows.map((row) => partsOf(row, [".g-overview__opponent", ".g-overview__race", ".g-overview__racelink", ".g-overview__mvp"])), [["Nameless", "", "", ""], ["Nameless", "", "", "MVP Ashby"]]);
  assert.equal(rows[0].querySelector(".g-overview__sub"), null, "no empty line");
  assert.deepEqual(classesOf(rows[1].querySelector(".g-overview__sub")), ["g-overview__mvp"], "and no dot before the MVP");
  // The server names no coach or no team of the opponent: the name is text. The match's link stays.
  const teamOnly = { team: RIVAL.team };
  const withoutIds = [played("ga", 1, [2, 1], [1, 0], { away: teamOnly }), played("gb", 2, [0, 0], [0, 0], { away: { ...RIVAL, team: { ...RIVAL.team, id: undefined } } })];
  const plain = mount(overviewMarkup(overviewModel(input("t1", { games: withoutIds })))).querySelectorAll(".g-overview__result");
  for (const row of plain) {
    assert.equal(row.querySelector(".g-overview__opponent").tagName.toLowerCase(), "span");
    assert.deepEqual(linksOf(row).map(([name]) => name), ["g-overview__match", "g-overview__racelink"]);
  }
  // A race the row is given no address for is DeskOverview's plain 12px text, the dot and the MVP after it.
  const model = overviewModel(input("t1", { games: MVP_GAMES }));
  const bare = mount(overviewMarkup({ ...model, results: model.results.map((result) => ({ ...result, raceHref: "" })) })).querySelectorAll(".g-overview__result");
  assert.deepEqual(classesOf(bare[1].querySelector(".g-overview__sub")), ["g-overview__race", "g-overview__dot", "g-overview__mvp"]);
  assert.deepEqual([bare[1].querySelector(".g-overview__race").tagName.toLowerCase(), bare[1].querySelector(".g-overview__race").textContent], ["span", "Dwarf"]);
  assert.equal(bare[1].querySelector(".g-overview__race svg"), null, "no book without the rules");
});

test("on a desk the results are a card with its head inside: «Results» and «Whole season →»", () => {
  const section = mount(overviewMarkup(overviewModel(input("t1")))).querySelector(".g-overview__results");
  assert.deepEqual(classesOf(section), ["g-overview__bar", "g-overview__list"]);
  const title = section.querySelector(".g-overview__bar h2.g-overview__title");
  assert.equal(title.textContent, "Results");
  assert.equal(section.getAttribute("aria-labelledby"), title.getAttribute("id"));
  assert.equal(section.querySelector('.g-overview__bar a.g-overview__all[href="#/t/t1/matches"]').textContent, "Whole season →");
  // DeskOverview.html: the section is the card, 16 round, white in the ring, 8 24 12 in; its head 14 0 6, the title and the link at its two ends.
  const desk = deskOf(LISTS_CSS);
  assert.match(ruleOf(desk, ".g-overview__results"), /^(?=[^]*padding: var\(--space-8\) var\(--space-24\) var\(--space-12\);)(?=[^]*border-radius: var\(--radius-2xl\);)(?=[^]*background: var\(--surface\);)(?=[^]*box-shadow: var\(--ring\);)(?=[^]*gap: 0;)/);
  assert.match(ruleOf(desk, ".g-overview__bar"), /padding: var\(--space-14\) 0 var\(--space-6\);/);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__bar", "justify-content"), ["space-between"]);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__bar", "align-items"), ["center"]);
  assert.doesNotMatch(ruleOf(desk, ".g-overview__list"), /box-shadow|border-radius|background/, "the list is not a card of its own any more");
});

test("on a phone a result keeps Team.html's row: the score in the body's face at 18px, the pill's column 32px", () => {
  const section = mount(overviewMarkup(overviewModel(input("t1", { games: MVP_GAMES, phone: true })))).querySelector(".g-overview__results");
  assert.equal(section.querySelector("h2.g-overview__title").textContent, "Recent matches");
  assert.equal(section.querySelector('.g-overview__bar a[href="#/t/t1/matches"]').textContent, "Whole season →", "the way to the matches stays (§3)");
  const rows = section.querySelectorAll(".g-overview__result");
  assert.deepEqual(rows.map((row) => [...partsOf(row, [".g-sr-only", ".g-overview__opponent", ".g-overview__line", ".g-overview__score"]), row.querySelector("a").getAttribute("href")]), [
    ["Friendly", "Rival Team", "Friendly · CAS 0–0", "1–1", "#/games/gf"],
    ["Loss", "Rival Team", "Round 2 · CAS 0–2", "0–2", "#/games/gb"],
    ["Win", "Rival Team", "Round 1 · CAS 1–0", "2–1", "#/games/ga"]]);
  assert.deepEqual(classesOf(rows[1].querySelector("a.g-overview__row")), ["g-result", "g-overview__text", "g-overview__score"]);
  // Team.html has no race: the whole row stays the one link, the opponent text in it (F9 is a desk's). Its key is the desk's
  // match link's, so a focus on it crosses the width with the match.
  assert.ok(rows.every((row) => row.querySelectorAll("a").length === 1 && row.querySelector("span.g-overview__opponent")));
  assert.deepEqual(rows.map((row) => row.querySelector("a.g-overview__row").getAttribute("data-key")), ["game-gf", "game-gb", "game-ga"]);
  assert.equal(section.querySelector(".g-overview__match, .g-overview__racelink"), null);
  assert.ok(rows.every((row) => row.querySelector(".g-result--compact")), "Team.html's 28px pill");
  for (const desk of [".g-overview__round", ".g-overview__sub", ".g-overview__race", ".g-overview__mvp", ".g-overview__cas"]) assert.equal(section.querySelector(desk), null, `${desk}: Team.html's row has none`);
  // Up to 900px the score is the body's 18/700, from 901px Oswald 26 (DeskOverview.html); the pill's column 32, the gap 10, 10 above and below.
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__score", "font"), ["700 18px/normal var(--font-body)", "700 26px/normal var(--font-display)"]);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__row", "grid-template-columns"), ["32px minmax(0, 1fr) auto", "30px minmax(60px, max-content) minmax(0, 1fr) 90px 70px", "subgrid"]);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__row", "gap"), ["var(--space-10)", "var(--space-14)"]);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__row", "padding"), ["var(--space-10) 0", "0"]);
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__row .g-result--compact", "font-size"), ["13px"], "Team.html's letter");
});

test("the recent matches are five at most, the newest first", () => {
  const many = Array.from({ length: 7 }, (_, index) => played(`m${index}`, 1, [1, 0], [0, 0], { confirmedAt: `2026-09-0${index + 1}T10:00:00Z` }));
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { games: many }))));
  assert.deepEqual(fragment.querySelectorAll(".g-overview__result a.g-overview__match").map((link) => link.getAttribute("href")), ["#/games/m6", "#/games/m5", "#/games/m4", "#/games/m3", "#/games/m2"]);
});

test("a team with no finished match has no results, and a team with no leader no leaders: no empty headings", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t3", { games: [] }))));
  assert.equal(fragment.querySelector(".g-overview__results"), null);
  assert.equal(fragment.querySelector(".g-overview__leaders"), null);
  assert.equal(fragment.querySelector(".g-overview__main"), null);
  // A desk's right column holds the table since stage 10: the columns stand for it alone.
  assert.deepEqual(classesOf(fragment.querySelector(".g-overview__cols")), ["g-overview__aside"]);
  assert.deepEqual(classesOf(fragment.querySelector(".g-overview__aside")), ["g-minitable"]);
  // Without the table, nothing at all.
  assert.ok(!mount(overviewMarkup(overviewModel(input("t3", { games: [], seasonData: null })))).querySelector(".g-overview__cols"));
});

test("games that failed to load leave the figures and say so where the board was", () => {
  const fragment = mount(overviewMarkup(overviewModel({ ...input("t1"), games: [], gamesError: "No connection" })));
  assert.equal(fragment.querySelector(".g-board"), null);
  assert.match(fragment.querySelector(".g-overview__failed").textContent, /No connection/);
  assert.match(fragment.querySelector(".g-overview__failed").textContent, /^The matches did not load/);
  assert.equal(fragment.querySelectorAll(".g-kpi").length, 5, "the table still gives the place and the points");
  assert.equal(fragment.querySelectorAll(".g-kpi__v")[1].textContent, "3", "the points without a record that was not read");
  assert.equal(fragment.querySelectorAll(".g-kpi__v")[4].textContent, "–", "nor a difference");
});

test("a table that failed to load says so where the board would stand; the team's own figures stay", () => {
  const model = overviewModel({ ...input("t1"), seasonData: null, seasonError: "No connection" });
  assert.equal(model.tiles.length, 2, "no place without a table");
  const fragment = mount(overviewMarkup(model));
  assert.deepEqual(fragment.querySelectorAll(".g-overview__failed .g-callout__title").map((title) => title.textContent), ["The league table did not load: No connection"]);
  assert.equal(fragment.querySelector("[data-season-enter]"), null, "a team in the season is not told it is not entered");
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
  assert.ok(fragment.querySelector(".g-callout [data-season-enter]"));
  assert.equal(fragment.querySelector(".g-overview__failed"), null);
});

test("before the table and the games are read nothing is said that they may contradict (a cold page opens on the team)", () => {
  const model = overviewModel(input("t1", { seasonData: null, games: null }));
  assert.equal(model.tiles.length, 2, "no place without a table");
  assert.equal(model.board, null);
  assert.equal(model.seasonLine, "");
  const fragment = mount(overviewMarkup(model));
  assert.equal(fragment.querySelector("[data-season-enter]"), null, "a team in the season is not told it is not entered");
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

test("names from other coaches are text: the opponent, the opponent's race, the MVP, the leader's name and the position", () => {
  const rival = side("r1", HOSTILE, "teams/hostile");
  const hostile = [played("ga", 1, [2, 1], [1, 0], { away: rival, homeMvps: [{ id: "p1", name: HOSTILE }] }), game("g1", { away: rival })];
  const team = { ...TEAMS[0], roster: { treasury: 1, players: [{ id: "p1", rowIndex: 0, number: HOSTILE, name: HOSTILE, spp: { touchdowns: 1 } }] } };
  // A race's name is the reference's (`state.data.teams`): text too, whatever it holds.
  state.data = { teams: [...RACES, { slug: "teams/hostile", title: HOSTILE }] };
  let fragment;
  try {
    fragment = mount(overviewMarkup(overviewModel({ ...input("t1"), team, games: hostile })));
  } finally {
    state.data = { teams: RACES };
  }
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-board__side--away .g-board__name").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__opponent").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__racelink").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__match").getAttribute("aria-label"), `Round 1, ${HOSTILE}, 2–1`, "the name in the match's label is text too");
  assert.equal(fragment.querySelector(".g-overview__mvp").textContent, `MVP ${HOSTILE}`);
  assert.equal(fragment.querySelector(".g-overview__leader .g-overview__leadername").textContent, HOSTILE);
  assert.equal(fragment.querySelector(".g-overview__leader .g-num__n").textContent, HOSTILE);
  assertCspSafe(fragment);
  // A phone's row: the name, and the number beside it.
  const phone = mount(overviewMarkup(overviewModel({ ...input("t1"), team, games: hostile, phone: true })));
  assert.equal(phone.querySelector("img"), null);
  assert.equal(phone.querySelector(".g-overview__leaderline .g-overview__leadername").textContent, `${HOSTILE} #${HOSTILE} Human Lineman`);
  assert.equal(phone.querySelector(".g-overview__leaderline .g-overview__leaderpos").textContent, `#${HOSTILE} Human Lineman`);
  assertCspSafe(phone);
});

test("the leaders' tag is escaped text, whatever the dictionary holds (K7c)", () => {
  const real = { en: dictionary("en"), ru: dictionary("ru") };
  setDictionaries({ ...real, en: { ...real.en, "teamOverview.leader.spp": HOSTILE } });
  try {
    for (const phone of [false, true]) {
      const fragment = mount(overviewMarkup(overviewModel(input("t1", { phone }))));
      assert.equal(fragment.querySelector("img"), null);
      assert.equal(fragment.querySelector(".g-overview__leaders .g-overview__leadertag").textContent, HOSTILE);
      assertCspSafe(fragment);
    }
  } finally {
    setDictionaries(real);
  }
});

// Stage 09a: a desk's board pages through the season, the opponent's value by his name, «Before the match» from the bubbles.
const tabs = () => view.querySelectorAll('.g-board__nav [role="tab"]');
const shownTab = () => tabs().findIndex((tab) => tab.getAttribute("aria-selected") === "true");
const opponentLine = () => view.querySelector(".g-board__side--away .g-board__sub").textContent;
const bubbles = () => view.querySelectorAll("[data-before-open]").map((bubble) => bubble.textContent);
const beforeSheet = () => document.querySelector('[data-sheet-host="match-before"] dialog#match-before');
/** The overview of t1 on a desk or a phone, its reads answered. */
async function visit({ games = GAMES, phone = false } = {}) {
  const { cross } = crossingWindow(phone);
  coach({ games });
  await renderTeamOverview("t1");
  await settle();
  return cross;
}
/** As DeskOverview.html's band: the first match won 2–1 with an MVP, the second lost, the friendly, the match on. */
const PAGED = gamesWith({ ga: { homeMvps: [{ id: "p5", name: "Linewoman Five" }] } });

test("a desk's board pages back to a past match and forward again", async () => {
  try {
    await visit({ games: PAGED });
    assert.deepEqual(tabs().map((tab) => tab.textContent), ["1", "2", "F", "3"]);
    assert.equal(shownTab(), 3, "the match on is shown");
    fireEvent(tabs()[0], "click");
    assert.equal(shownTab(), 0);
    assert.equal(document.activeElement, tabs()[0]);
    assert.equal(view.querySelector(".g-board__score").textContent, "2:1", "as the board writes a score");
    assert.equal(view.querySelector(".g-board__outcome").textContent, "Win · +3 in the table");
    assert.deepEqual(view.querySelectorAll(".g-board__chip").map((chip) => chip.textContent), ["CAS 1–0", "MVP Linewoman Five"]);
    assert.equal(view.querySelector(".g-board__overline").textContent, "Round 1 · home");
    assert.equal(view.querySelector("[data-before-open]"), null, "no bubbles on a match gone");
    fireEvent(view.querySelector("[data-board-current]"), "click");
    assert.equal(shownTab(), 3);
    assert.equal(document.activeElement, tabs()[3], "the focus on the current match's square");
    assert.equal(view.querySelector(".g-board__score").textContent, "–:–");
    // The arrows and the keys too.
    fireEvent(view.querySelector('[data-board-step="-1"]'), "click");
    assert.equal(shownTab(), 2);
    fireEvent(tabs()[2], "keydown", { key: "Home" });
    assert.equal(shownTab(), 0);
    fireEvent(tabs()[0], "keydown", { key: "End" });
    assert.equal(shownTab(), 3);
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
  }
});

test("games read again keep the match shown when it is still there, the current otherwise", async () => {
  try {
    await visit({ games: PAGED });
    fireEvent(tabs()[0], "click");
    await notifyGames(PAGED);
    await settle();
    assert.equal(shownTab(), 0, "the first round, still there");
    assert.equal(view.querySelector(".g-board__score").textContent, "2:1");
    await notifyGames(PAGED.filter((item) => item.id !== "ga"));
    await settle();
    assert.deepEqual(tabs().map((tab) => tab.textContent), ["2", "F", "3"]);
    assert.equal(shownTab(), 2, "gone: the current match");
    await notifyGames(PAGED);
    await settle();
    assert.equal(shownTab(), 3);
    // A pick of the current one follows the current one: once its score is confirmed, the opponent to come is shown, not it.
    fireEvent(tabs()[0], "click");
    fireEvent(tabs()[0], "keydown", { key: "End" });
    assert.equal(shownTab(), 3);
    const settled = PAGED.map((item) => (item.id === "g1" ? { ...item, resultStatus: "confirmed", homeTouchdowns: 1, awayTouchdowns: 0,
      homeCasualties: 0, awayCasualties: 0, confirmedAt: "2026-10-06T10:00:00Z" } : item));
    await notifyGames(settled);
    await settle();
    assert.deepEqual(tabs().map((tab) => tab.textContent), ["1", "2", "F", "3", "4"]);
    assert.equal(shownTab(), 4, "the opponent to come");
    assert.equal(view.querySelector(".g-board__pending").textContent, "Opponent — after round 3");
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
  }
});

test("the opponent's value stands in his line once his team is read, on both widths", async () => {
  const value = `TV ${formatMoney(teamValue(RIVAL_TEAM, raceTeamOf("teams/dwarf")))}`;
  for (const phone of [false, true]) {
    try {
      const { cross } = crossingWindow(phone);
      coach();
      const page = api.hold(RIVAL_PAGE);
      await renderTeamOverview("t1");
      assert.doesNotMatch(opponentLine(), /TV/, "not before his team is read");
      page.release();
      await settle();
      await settle();
      assert.match(opponentLine(), new RegExp(`${value}$`));
      assert.equal(Boolean(view.querySelector('[role="tablist"]')), !phone, "a phone pages nothing");
      assert.equal(bubbles().length, phone ? 0 : 2, "a phone has no bubbles");
      cross(!phone);
      assert.match(opponentLine(), new RegExp(`${value}$`), "the other width says it too");
      api.assertAnswered();
      assert.equal(sent(RIVAL_PAGE), 1, "read once a visit for the game as it stands");
    } finally {
      releaseCurrentScreen();
      delete globalThis.matchMedia;
    }
  }
});

test("the bubbles open «Before the match» over the page", async () => {
  try {
    await visit();
    // Ours: two players, 130k; theirs: seven Dwarf Blocker Linemen, one out, 420k. We get the difference.
    assert.deepEqual(bubbles(), [`+${formatMoney(290)} for inducements`, "missing the match: 1"]);
    assert.ok(view.querySelectorAll(".g-board__side")[0].querySelector("[data-before-open]"), "under our name: we get it");
    const bubble = view.querySelectorAll("[data-before-open]")[1];
    bubble.focus();
    fireEvent(bubble, "click");
    assert.ok(beforeSheet()?.open, "the sheet, over the page");
    assert.equal(beforeSheet().querySelector(".g-sheet__title").textContent, "Before the match · Round\u00a03");
    assert.deepEqual(beforeSheet().querySelectorAll(".g-before__name").map((name) => name.textContent), ["Ashgrove Wardens", "Rival r1"]);
    // The page drawn again (the games answer) leaves it open.
    await notifyGames(GAMES);
    await settle();
    assert.ok(beforeSheet()?.open);
    fireEvent(beforeSheet(), "keydown", { key: "Escape" });
    assert.equal(beforeSheet(), null);
    fireEvent(view.querySelectorAll("[data-before-open]")[0], "click");
    assert.ok(beforeSheet()?.open);
    releaseCurrentScreen();
    assert.equal(document.querySelector('[data-sheet-host="match-before"]'), null, "it goes with the screen");
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
  }
});

test("the opponent could not be read: no bubbles, no value, nothing said twice", async () => {
  try {
    crossingWindow(false);
    coach();
    api.reply(RIVAL_PAGE, 404, { error: { code: "TEAM_NOT_FOUND" } });
    await renderTeamOverview("t1");
    await settle();
    assert.equal(bubbles().length, 0);
    assert.doesNotMatch(opponentLine(), /TV/);
    assert.equal(view.querySelector('[role="alert"]'), null, "the board is drawn and says nothing of it");
    assert.equal(view.querySelector(".g-board__side--away .g-board__name").textContent, "Rival Team");
    // The games answer: read again (a refusal is not kept); it answers now.
    api.reply(RIVAL_PAGE, 200, { team: RIVAL_TEAM });
    await notifyGames(GAMES);
    await settle();
    await settle();
    assert.equal(bubbles().length, 2);
    api.assertAnswered();
    releaseCurrentScreen();
    // The reference not read whole yet (pre-flight L4): no preview, and the board is drawn all the same.
    coach();
    state.data = { teams: RACES };
    await renderTeamOverview("t1");
    await settle();
    await settle();
    assert.equal(bubbles().length, 0);
    assert.match(opponentLine(), /TV/, "his value needs only his race");
    api.assertAnswered();
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
  }
});

test("in a match the band offers the records with their count and the post-match", async () => {
  try {
    crossingWindow(false);
    coach();
    state.activeTeamId = "t2";
    const taps = Array.from({ length: 8 }, (_, at) => ({ id: `e${at}`, pairingId: "g2", playerId: "x", counter: "touchdowns", delta: 1, injury: null, settledAt: null }));
    api.reply("GET /api/teams/t2/events", 200, { events: [...taps, { ...taps[0], id: "old", settledAt: "2026-10-01T10:00:00Z" }], revision: 7 });
    await renderTeamOverview("t2");
    await settle();
    await settle();
    const actions = view.querySelectorAll(".g-board__actions a").map((link) => [link.textContent, link.getAttribute("class"), link.getAttribute("href")]);
    assert.deepEqual(actions, [["Match records · 8", "g-btn", "#/t/t2/roster"], ["Post-match", "g-btn g-btn--primary", "#/games/g2/post-match"]]);
    api.assertAnswered();
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
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
  assert.equal(view.querySelector("[data-season-enter]"), null);
  seasonHold.release();
  await drawing;
  assert.equal(view.querySelectorAll(".g-kpi").length, 5);
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
  // Stage 07e: the leaders' records too — once, after the games have answered (review M2: the games' answer asks for no
  // second read when the first is still to be sent).
  // Stage 09a: the opponent of the match on, from his public page, once the games are in.
  assert.deepEqual(api.calls.map((call) => call.key).sort(), ["GET /api/games", RIVAL_PAGE, "GET /api/season", "GET /api/teams/t1/events"]);
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
  assert.equal(view.querySelectorAll(".g-kpi").length, 5);
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
  assertDictionaryCovers("src/screens/team/overview.mjs", "src/screens/team/overview-lists.mjs");
  for (const key of ["spp", "td", "cas", "comp"]) assert.ok(dictionary("en")[`teamOverview.leader.${key}`] && dictionary("ru")[`teamOverview.leader.${key}`], key);
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  assert.deepEqual([en["teamOverview.leaders"], ru["teamOverview.leaders"]], ["Team leaders", "Лидеры команды"], "a desk's heading (DeskOverview.html)");
  assert.deepEqual([en["teamOverview.leadersShort"], ru["teamOverview.leadersShort"]], ["Leaders", "Лидеры"], "a phone's (Team.html)");
  // A desk's results (DeskOverview.html): the title, the round's column, the casualties' and the MVP under the opponent.
  const RESULT_WORDS = {
    "teamOverview.resultsTitle": ["Results", "Результаты"],
    "teamOverview.round": ["Round {round}", "Тур {round}"],
    "teamOverview.friendly": ["Friendly", "Товарищеский"],
    "teamOverview.cas": ["CAS {cas}", "CAS {cas}"],
    "teamOverview.mvp": ["MVP {names}", "MVP {names}"],
    "teamOverview.matchLabel": ["{round}, {opponent}, {score}", "{round}, {opponent}, {score}"],
    "teamOverview.results": ["Recent matches", "Последние матчи"],
  };
  for (const [key, words] of Object.entries(RESULT_WORDS)) assert.deepEqual([en[key], ru[key]], words, key);
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assertCspSafe(fragment);
  assertStyled(fragment, "src/screens/team/overview.css", LISTS_CSS, "page-head.css", "kpi-tile.css", "search-field.css", "match-board.css", "src/shell/crest.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css", TABLE_CSS);
  const outside = mount(overviewMarkup(overviewModel(input("t4"))));
  assertStyled(outside, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "search-field.css", "status-chip.css", "callout.css", "button.css");
  const phone = mount(overviewMarkup(overviewModel(input("t1", { phone: true }))));
  assertCspSafe(phone);
  assertStyled(phone, "src/screens/team/overview.css", LISTS_CSS, "page-head.css", "kpi-tile.css", "match-board.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css");
});

test("the leaders and the columns as DeskOverview.html and Team.html draw them: styled; readable; D2; wrapping", () => {
  const own = (selector, property) => valuesOf(LISTS_CSS, selector, property);
  const bare = text(LISTS_CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  const desk = mediaText(LISTS_CSS, "min-width: 901px");
  // Stage 09a's sheets come after it (pre-flight L2): what it needs is to come after the sheets it overrides.
  const styles = text("src/styles.css"), at = (file) => styles.indexOf(`@import url("${file}");`);
  assert.ok(at("screens/team/overview-lists.css") > Math.max(at("screens/team/overview.css"), at("ui/match-board.css")), "the sheet reaches the page, after the overview's and the board's");
  assert.ok(Math.min(at("screens/team/overview.css"), at("ui/match-board.css")) >= 0);
  for (const phone of [false, true]) {
    assertStyled(mount(overviewMarkup(overviewModel(input("t1", { team: crew(LEADERS), phone })))), "src/screens/team/overview.css", LISTS_CSS, "page-head.css", "kpi-tile.css",
      "search-field.css", "match-board.css", "src/shell/crest.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css", TABLE_CSS);
  }
  // Every rule of a text sets what the 2.x globals would otherwise give, at the font's own line height where the prototypes give none.
  for (const selector of [".g-overview__title", ".g-overview__leader", ".g-overview__leaderline", ".g-overview__leadertag", ".g-overview__leadername", ".g-overview__leaderpos", ".g-overview__leadervalue"]) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.ok(own(selector, property).length >= 1, `${selector} ${property}`);
    for (const font of own(selector, "font")) assert.match(font, /\/normal /, `${selector} keeps the font's own line height`);
  }
  for (const selector of [".g-overview__title", ".g-overview__leader", ".g-overview__leaderline"]) {
    for (const property of ["border", "background"]) assert.ok(own(selector, property).length >= 1, `${selector} ${property}`);
  }
  // The columns: up to 900px one under the other, 22 apart (Team.html); from 901px DeskOverview.html's wrapping row, 20 apart.
  assert.deepEqual(own(".g-overview__cols", "gap"), ["var(--space-20)", "var(--space-22)"], "the leaders and the results stand as far apart as the other blocks");
  assert.deepEqual(own(".g-overview__main", "gap"), ["var(--space-20)", "var(--space-22)"]);
  assert.deepEqual(own(".g-overview__aside", "gap"), ["var(--space-20)"]);
  assert.deepEqual(own(".g-overview__aside", "display"), ["flex", "none"], "the right column is a desk's: who can advance is the phone's card there");
  assert.match(desk, /\.g-overview__cols \{[^}]*flex-wrap: wrap;/);
  // «Team leaders» (DeskOverview.html): a column 12 apart, the title Oswald 24/700 with no margin.
  assert.deepEqual(own(".g-overview__title", "font"), ["700 24px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-overview__title", "margin"), ["0"]);
  assert.deepEqual(own(".g-overview__leaders", "gap"), ["var(--space-6)", "var(--space-12)"], "a phone's title is 6 over its rows (Team.html), a desk's 12 over its cards");
  assert.match(desk, /\.g-overview__leaders \{ gap: var\(--space-12\); \}/);
  // The cards: a grid that wraps by 150px, 12 apart; a card 14 round, white in the ring, 14 16 in, a column 10 apart, a link without its line.
  assert.deepEqual(own(".g-overview__leadercards", "grid-template-columns"), ["repeat(auto-fit, minmax(150px, 1fr))"]);
  assert.deepEqual(own(".g-overview__leadercards", "gap"), ["var(--space-12)"]);
  assert.deepEqual(own(".g-overview__leader", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(own(".g-overview__leader", "background"), ["var(--surface)"]);
  assert.deepEqual(own(".g-overview__leader", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(own(".g-overview__leader", "padding"), ["var(--space-14) var(--space-16)"]);
  assert.deepEqual(own(".g-overview__leader", "flex-direction"), ["column"]);
  assert.deepEqual(own(".g-overview__leader", "gap"), ["var(--space-10)"]);
  assert.deepEqual(own(".g-overview__leader", "text-decoration"), ["none"]);
  assert.deepEqual(own(".g-overview__leader", "color"), ["var(--ink)"]);
  // In a card: the tag 12/600 with .04em, the row centred 10 apart, the name 13/600, the position 12px, the figure Oswald 30/700 in the accent at the right.
  assert.deepEqual(own(".g-overview__leaderrow", "align-items"), ["center"]);
  assert.deepEqual(own(".g-overview__leaderrow", "gap"), ["var(--space-10)"]);
  assert.deepEqual(own(".g-overview__leaderwho", "flex-direction"), ["column"]);
  assert.deepEqual(own(".g-overview__leadertag", "font"), ["700 13px/normal var(--font-body)", "600 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__leadertag", "letter-spacing"), ["0", ".04em"]);
  assert.deepEqual(own(".g-overview__leadertag", "color"), ["var(--muted)"]);
  assert.deepEqual(own(".g-overview__leadername", "font"), ["500 16px/normal var(--font-body)", "600 13px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__leaderpos", "font"), ["400 13px/normal var(--font-body)", "400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__leaderpos", "color"), ["var(--muted)"]);
  assert.deepEqual(own(".g-overview__leadervalue", "font"), ["700 18px/normal var(--font-body)", "700 30px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-overview__leadervalue", "color"), ["var(--ink)", "var(--accent-text)"]);
  assert.deepEqual(own(".g-overview__leadervalue", "margin-left"), ["auto"]);
  assert.deepEqual(own(".g-overview__leadervalue", "font-variant-numeric"), ["tabular-nums", "tabular-nums"], "after each shorthand, which resets it");
  // A phone's row (Team.html): 44px for the tag, the name, the figure; 10 apart, 8 above and below, a rule under each but the last.
  assert.deepEqual(own(".g-overview__leaderline", "grid-template-columns"), ["44px minmax(0, 1fr) auto"]);
  assert.deepEqual(own(".g-overview__leaderline", "gap"), ["var(--space-10)"]);
  assert.deepEqual(own(".g-overview__leaderline", "align-items"), ["center"]);
  assert.deepEqual(own(".g-overview__leaderline", "padding"), ["var(--space-8) 0"]);
  assert.deepEqual(own(".g-overview__leaderline", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(own(".g-overview__leaderline", "box-sizing"), ["border-box"]);
  assert.deepEqual(own(".g-overview__leaderline:last-child", "border-bottom"), ["0"]);
  assert.deepEqual(own(".g-overview__leaderline", "text-decoration"), ["none"]);
  assert.deepEqual(own(".g-overview__leaderline", "color"), ["var(--ink)"]);
  assert.deepEqual(own(".g-overview__leadername", "column-gap"), ["var(--space-6)"], "«#3 Catcher» 6 beside the name");
  assert.deepEqual(own(".g-overview__leadervalue--spp", "color"), ["var(--accent-text)"]);
  // D2: a phone's row is the link, as high as the prototype's (its 32 of content, 8 and 8, and the rule) and never under 44.
  assert.deepEqual(own(".g-overview__leaderline", "min-height"), ["49px"]);
  assert.deepEqual(own(".g-overview__leaderline:last-child", "min-height"), ["48px"], "the last has no rule");
  for (const value of [...own(".g-overview__leaderline", "min-height"), ...own(".g-overview__leaderline:last-child", "min-height")]) assert.ok(parseInt(value, 10) >= 44, value);
  // Wrapping: a long name or position wraps; nothing is cut with «…» or held on one line — but a desk card's name, which
  // DeskOverview.html holds on one line (`white-space: nowrap`): one longer than its card ends in «…» inside its min-width: 0
  // column, the whole name still the card's text (the fidelity pass, F10). The position under it wraps, as the prototype's.
  assert.deepEqual(["display", "overflow", "text-overflow", "white-space"].map((property) => inMedia(LISTS_CSS, "min-width: 901px", ".g-overview__leadername", property)),
    [["block"], ["hidden"], ["ellipsis"], ["nowrap"]]);
  assert.deepEqual(own(".g-overview__leaderwho", "min-width"), ["0"], "the column the name ends in «…» inside");
  const held = ruleOf(desk, ".g-overview__leadername");
  assert.doesNotMatch(bare.replace(held, ""), /ellipsis|nowrap|text-overflow|line-clamp/, "the desk card's name alone");
  for (const selector of [".g-overview__leadername", ".g-overview__leaderpos"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  assert.deepEqual(inMedia(LISTS_CSS, "max-width: 900px", ".g-overview__leadername", "white-space"), [], "a phone's name wraps");
  // Readable in every palette: the accent of a desk's figure on its card, the grey of the tag and the position on a card and on a phone's page.
  assertReadable(LISTS_CSS, ".g-overview__leadervalue", "color", ["--surface"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__leadervalue--spp", "color", ["--surface", "--page"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__leaderpos", "color", ["--surface", "--page"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__leadertag", "color", ["--surface", "--page"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__leadername", "color", ["--surface", "--page"], 4.5);
  for (const [, query] of text(LISTS_CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  assert.doesNotMatch(bare, /--focus-ring/);
});

const READY_WORDS = {
  en: {
    card: "Advancement available", who: "{name} · {spp} SPP", more: "{name} · {spp} SPP · and {more} more",
    title: "Ready to advance", count: "players: {count}", spp: "{spp} SPP", advance: "Advance", advanceLabel: "Advance: {name}",
  },
  ru: {
    card: "Доступна прокачка", who: "{name} · {spp} SPP", more: "{name} · {spp} SPP · и ещё {more}",
    title: "Готовы к прокачке", count: "игроков: {count}", spp: "{spp} SPP", advance: "Прокачать", advanceLabel: "Прокачать: {name}",
  },
};
const READY_CSS = "src/screens/team/overview.css";
/** The rule block for a selector, comments out, as it stands in the sheet. */
const READY_BARE = () => text(READY_CSS).replace(/\/\*[\s\S]*?\*\//g, "");

test("the overview says who can advance: on a phone the one with the most SPP and how many more, leading to his address", () => {
  const model = overviewModel(input("t1", { team: crew(CREW) }));
  assert.deepEqual(model.ready.map(({ id, available }) => [id, available]), [["p3", 27], ["p1", 7], ["p2", 7]], "most SPP first, a tie in the roster's order; Dunn has too little and Moss has spent it");
  assert.deepEqual(model.ready[0], { id: "p3", number: "7", name: "Cade", position: "Catcher", kind: "catcher", available: 27 });
  const fragment = mount(overviewMarkup(model));
  const card = fragment.querySelector("a.g-overview__ready");
  assert.equal(card.querySelector(".g-overview__readytitle").textContent, "Advancement available");
  assert.equal(card.querySelector(".g-overview__readywho").textContent, "Cade · 27 SPP · and 2 more");
  assert.equal(card.getAttribute("href"), teamPlayerUrl("t1", "p3"));
  assert.equal(card.getAttribute("href"), "#/t/t1/roster/p3");
  assert.equal(card.querySelector("svg").getAttribute("width"), "18", "the chevron of the prototype's 18px");
  assert.equal(card.querySelector("svg").getAttribute("aria-hidden"), "true");
  const page = fragment.querySelector(".g-overview").childNodes.filter((node) => node.nodeType === 1);
  const classes = page.map((node) => node.getAttribute("class").split(" ")[0]);
  assert.ok(classes.indexOf("g-overview__ready") === classes.indexOf("g-kpis") + 1, `the card follows the tiles: ${classes}`);
  assert.ok(classes.indexOf("g-board") === classes.indexOf("g-overview__ready") + 1, "and stands before the board");
  const alone = mount(overviewMarkup(overviewModel(input("t1", { team: crew([CREW[2]]) })))).querySelector("a.g-overview__ready");
  assert.equal(alone.querySelector(".g-overview__readywho").textContent, "Cade · 27 SPP", "nobody else to count");
  const two = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW.slice(0, 2)) })))).querySelector("a.g-overview__ready");
  assert.equal(two.querySelector(".g-overview__readywho").textContent, "Ashby · 7 SPP · and 1 more");
});

test("on a desk every one of them, with his SPP and «Advance» to his address", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) }))));
  const section = fragment.querySelector("section.g-overview__readylist");
  assert.equal(section.querySelector("h2").textContent, "Ready to advance");
  assert.equal(section.querySelector(".g-overview__readycount").textContent, "players: 3");
  const rows = section.querySelectorAll(".g-overview__readyrow");
  assert.deepEqual(rows.map((row) => [
    row.querySelector(".g-num__n").textContent, row.querySelector(".g-overview__readyname").textContent, row.querySelector(".g-overview__readypos").textContent,
    row.querySelector(".g-overview__readyspp").textContent, row.querySelector("a.g-overview__advance").textContent, row.querySelector("a.g-overview__advance").getAttribute("href")]),
  [["7", "Cade", "Catcher", "27 SPP", "Advance", "#/t/t1/roster/p3"], ["3", "Ashby", "Human Lineman", "7 SPP", "Advance", "#/t/t1/roster/p1"],
    ["5", "Vane", "Thrower", "7 SPP", "Advance", "#/t/t1/roster/p2"]]);
  assert.ok(rows[0].querySelector(".g-num--catcher"), "the number on his position's colour");
  // Compared as booleans: a failed `assert.equal` of two DOM nodes would try to print both trees.
  assert.ok(section.parentNode === fragment.querySelector(".g-overview__cols .g-overview__aside"), "the right column (DeskOverview.html)");
});

test("every «Advance» is named for its player, and the name starts with the word it shows", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) }))));
  const links = fragment.querySelectorAll("a.g-overview__advance");
  assert.deepEqual(links.map((link) => link.getAttribute("aria-label")), ["Advance: Cade", "Advance: Ashby", "Advance: Vane"]);
  for (const link of links) assert.ok(link.getAttribute("aria-label").startsWith(link.textContent), "the name contains the visible text, from its start");
  const hostile = mount(overviewMarkup(overviewModel(input("t1", { team: crew([{ id: "p1", rowIndex: 0, number: "3", name: HOSTILE, spp: { touchdowns: 1 } }]) }))));
  assert.equal(hostile.querySelector("a.g-overview__advance").getAttribute("aria-label"), `Advance: ${HOSTILE}`, "text, whatever the name holds");
  assert.equal(hostile.querySelector("img"), null);
  assertCspSafe(hostile);
  initLocale("ru");
  try {
    assert.deepEqual(mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) })))).querySelectorAll("a.g-overview__advance").map((link) => link.getAttribute("aria-label")), ["Прокачать: Cade", "Прокачать: Ashby", "Прокачать: Vane"]);
  } finally {
    initLocale("en");
  }
});

test("a player the roster stores no id for is not listed: there is no address to lead to", () => {
  const nameless = { rowIndex: 3, number: "13", name: "Nobody", spp: { touchdowns: 20 } };
  const model = overviewModel(input("t1", { team: crew([nameless, ...CREW.slice(0, 2)]) }));
  assert.deepEqual(model.ready.map(({ id }) => id), ["p1", "p2"]);
  assert.equal(mount(overviewMarkup(model)).querySelector("a.g-overview__ready .g-overview__readywho").textContent, "Ashby · 7 SPP · and 1 more");
});

test("nobody ready, or no race: neither the card nor the list is drawn", () => {
  const nobody = overviewModel(input("t1", { team: crew([CREW[3], CREW[4]]) }));
  const noRace = overviewModel({ ...input("t1", { team: crew(CREW) }), raceTeam: null });
  const empty = overviewModel(input("t3"));
  for (const model of [nobody, noRace, empty]) {
    assert.deepEqual(model.ready, []);
    const fragment = mount(overviewMarkup(model));
    assert.equal(fragment.querySelector(".g-overview__ready"), null);
    assert.equal(fragment.querySelector(".g-overview__readylist"), null);
  }
});

test("a Skill Table that has not come in leaves the list as it is: «unknown» is not «no skill left» (T5)", async () => {
  // The roster's lines without the table: every `offers` is null, «unknown», and they are ready all the same, by their SPP.
  const lines = rosterLines({ draft: normalizeDraft(crew(CREW).roster), race: raceOf(TEAMS[0]) });
  assert.deepEqual(lines.filter((line) => line.ready).map((line) => [line.id, line.offers]), [["p1", null], ["p2", null], ["p3", null]]);
  coach();
  state.data = { teams: RACES };
  state.myTeams = { ...state.myTeams, items: [crew(CREW), ...TEAMS.slice(1)] };
  await renderTeamOverview("t1");
  assert.equal(view.querySelector("a.g-overview__ready .g-overview__readywho").textContent, "Cade · 27 SPP · and 2 more");
  const withoutTable = view.querySelectorAll(".g-overview__readyrow").map((row) => row.textContent);
  assert.equal(withoutTable.length, 3);
  assert.ok(!view.textContent.includes(dictionary("en")["teamAdvance.refusal.NO_SKILL_LEFT"]) && !view.textContent.includes("NO_SKILL_LEFT"), "nothing here says that a player has no skill left");
  releaseCurrentScreen();
  state.data = { teams: RACES, skillGroups: data.skillGroups };
  await renderTeamOverview("t1");
  assert.deepEqual(view.querySelectorAll(".g-overview__readyrow").map((row) => row.textContent), withoutTable, "the table decides nothing here: the SPP does");
  assert.equal(view.querySelector("a.g-overview__ready").getAttribute("href"), "#/t/t1/roster/p3");
  state.data = { teams: RACES };
});

test("the ready player's name and number are text, and a long name is whole", () => {
  const long = "Bartholomew-Maximilian von Hohenzollern-Sigmaringen the Third of Ashgrove".repeat(2);
  const players = [{ id: "p1", rowIndex: 0, number: HOSTILE, name: HOSTILE, spp: { touchdowns: 1 } }, { id: "p2", rowIndex: 1, number: "5", name: long, spp: { touchdowns: 2 } }];
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew(players) }))));
  assert.equal(fragment.querySelector("img"), null);
  assert.equal(fragment.querySelector(".g-overview__readywho").textContent, `${long} · 6 SPP · and 1 more`);
  assert.deepEqual(fragment.querySelectorAll(".g-overview__readyname").map((name) => name.textContent), [long, HOSTILE]);
  assert.equal(fragment.querySelectorAll(".g-overview__readyrow").at(-1).querySelector(".g-num__n").textContent, HOSTILE);
  assertCspSafe(fragment);
});

test("the ready words: every key in both dictionaries, the same names, and none that names the player's gender", () => {
  assertDictionaryCovers("src/screens/team/overview.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const [key, value] of Object.entries(READY_WORDS[locale])) assert.equal(words[`teamOverview.ready.${key}`], value, `${locale} ${key}`);
    assert.deepEqual(Object.keys(words).filter((key) => key.startsWith("teamOverview.ready.")).sort(), Object.keys(READY_WORDS[locale]).map((key) => `teamOverview.ready.${key}`).sort(), `${locale}: the keys are the eight`);
  }
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  for (const key of Object.keys(READY_WORDS.en)) {
    const names = (value) => [...value.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
    assert.deepEqual(names(en[`teamOverview.ready.${key}`]), names(ru[`teamOverview.ready.${key}`]), key);
  }
  const gendered = { en: /\b(he|him|his|she|her|hers)\b/i, ru: /(?<![а-яё])(он|она|его|её|ему|ей|получил|получила)(?![а-яё])/iu };
  for (const locale of ["en", "ru"]) for (const value of Object.values(READY_WORDS[locale])) assert.doesNotMatch(value, gendered[locale], value);
  // The Russian page says the same of the same players.
  initLocale("ru");
  try {
    const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) }))));
    assert.equal(fragment.querySelector(".g-overview__readytitle").textContent, "Доступна прокачка");
    assert.equal(fragment.querySelector(".g-overview__readywho").textContent, "Cade · 27 SPP · и ещё 2");
    assert.equal(fragment.querySelector(".g-overview__readylist h2").textContent, "Готовы к прокачке");
    assert.equal(fragment.querySelector(".g-overview__readycount").textContent, "игроков: 3");
    assert.equal(fragment.querySelector("a.g-overview__advance").textContent, "Прокачать");
  } finally {
    initLocale("en");
  }
});

test("the ready block is styled, as the prototypes draw it, and readable (Team.html, DeskOverview.html)", () => {
  const fragment = mount(overviewMarkup(overviewModel(input("t1", { team: crew(CREW) }))));
  assertStyled(fragment, READY_CSS, LISTS_CSS, "page-head.css", "kpi-tile.css", "match-board.css", "src/shell/crest.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css", TABLE_CSS);
  const own = (selector, property) => valuesOf(READY_CSS, selector, property);
  // Every rule sets what the 2.x globals would otherwise give: font, letter-spacing, text-transform; the line height is the font's own where the prototypes give none.
  for (const selector of [".g-overview__ready", ".g-overview__readytitle", ".g-overview__readywho", ".g-overview__readylist", ".g-overview__readyheading", ".g-overview__readycount",
    ".g-overview__readyname", ".g-overview__readypos", ".g-overview__readyspp", ".g-overview__advance"]) {
    for (const property of ["font", "letter-spacing", "text-transform"]) assert.equal(own(selector, property).length, 1, `${selector} ${property}`);
    assert.match(own(selector, "font")[0], /\/normal /, `${selector} keeps the font's own line height`);
  }
  // The card (Team.html): 76px (the prototype's content-box 56 and its 10 and 10) and 10 14 in, 14 round, the accent's tint with its ink, 12 between the words and the chevron.
  assert.deepEqual(own(".g-overview__ready", "min-height"), ["76px"]);
  assert.deepEqual(own(".g-overview__ready", "box-sizing"), ["border-box"]);
  assert.deepEqual(own(".g-overview__ready", "padding"), ["var(--space-10) var(--space-14)"]);
  assert.deepEqual(own(".g-overview__ready", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(own(".g-overview__ready", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(own(".g-overview__ready", "color"), ["var(--on-accent-tint)"]);
  assert.deepEqual(own(".g-overview__ready", "gap"), ["var(--space-12)"]);
  assert.deepEqual(own(".g-overview__ready", "justify-content"), ["space-between"]);
  assert.deepEqual(own(".g-overview__ready", "align-items"), ["center"]);
  assert.deepEqual(own(".g-overview__readytext", "gap"), ["2px"]);
  assert.deepEqual(own(".g-overview__readytitle", "font"), ["700 15px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__readywho", "font"), ["400 13px/normal var(--font-body)"]);
  // The list (DeskOverview.html): a 16-round card in a ring, 20 in, 6 between its parts; the title Oswald 24/700, the count 14px in grey.
  assert.deepEqual(own(".g-overview__readylist", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(own(".g-overview__readylist", "box-shadow"), ["var(--ring)"]);
  assert.deepEqual(own(".g-overview__readylist", "background"), ["var(--surface)"]);
  assert.deepEqual(own(".g-overview__readylist", "padding"), ["var(--space-20)"]);
  assert.deepEqual(own(".g-overview__readylist", "gap"), ["var(--space-6)"]);
  assert.deepEqual(own(".g-overview__readybar", "align-items"), ["baseline"]);
  assert.deepEqual(own(".g-overview__readybar", "justify-content"), ["space-between"]);
  assert.deepEqual(own(".g-overview__readybar", "margin"), ["0 0 var(--space-6)"], "6 under the head, on top of the 6 between the parts");
  assert.deepEqual(own(".g-overview__readyheading", "font"), ["700 24px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-overview__readycount", "font"), ["400 14px/normal var(--font-body)"]);
  // The rows: the badge, the player, the SPP and the button; 10 between, 56px at least, a rule under each.
  assert.deepEqual(own(".g-overview__readyrow", "grid-template-columns"), ["36px minmax(0, 1fr) auto auto"]);
  assert.deepEqual(own(".g-overview__readyrow", "gap"), ["var(--space-10)"]);
  assert.deepEqual(own(".g-overview__readyrow", "min-height"), ["57px"], "the prototype's 56 and its rule, in a border-box");
  assert.deepEqual(own(".g-overview__readyrow", "box-sizing"), ["border-box"]);
  assert.deepEqual(own(".g-overview__readyrow", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(own(".g-overview__readyname", "font"), ["600 15px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__readypos", "font"), ["400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__readyspp", "font"), ["700 15px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__advance", "font"), ["600 13px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__advance", "min-height"), ["36px"]);
  assert.deepEqual(own(".g-overview__advance", "padding"), ["0 var(--space-12)"]);
  assert.deepEqual(own(".g-overview__advance", "border-radius"), ["var(--radius-md)"]);
  assert.deepEqual(own(".g-overview__advance", "background"), ["var(--header)"]);
  assert.deepEqual(own(".g-overview__advance", "color"), ["var(--header-ink)"]);
  // Readable in every palette: the ink on the tint, the white on the header, the greys and the accent on the card.
  assertReadable(READY_CSS, ".g-overview__ready", "color", ["--accent-tint"], 4.5);
  assertReadable(READY_CSS, ".g-overview__advance", "color", ["--header"], 4.5);
  assertReadable(READY_CSS, ".g-overview__readycount", "color", ["--surface"], 4.5);
  assertReadable(READY_CSS, ".g-overview__readypos", "color", ["--surface"], 4.5);
  assertReadable(READY_CSS, ".g-overview__readyspp", "color", ["--surface"], 4.5);
  assertReadable(READY_CSS, ".g-overview__readyname", "color", ["--surface"], 4.5);
  assertReadable(READY_CSS, ".g-overview__readyheading", "color", ["--surface"], 4.5);
});

test("one of the two is shown for the width: the card up to 900px, the list from 901px (D2: the card 44px or more, «Advance» 24px or more)", () => {
  const own = (selector, property) => valuesOf(READY_CSS, selector, property);
  assert.deepEqual(own(".g-overview__ready", "display"), ["flex", "none"], "a phone's card, gone from a desk");
  assert.deepEqual(own(".g-overview__readylist", "display"), ["none", "flex"], "a desk's list, gone from a phone");
  const source = READY_BARE();
  assert.match(source, /@media \(min-width: 901px\)\s*\{[^@]*\.g-overview__ready \{ display: none; \}/);
  assert.match(source, /@media \(min-width: 901px\)\s*\{[^@]*\.g-overview__readylist \{ display: flex; \}/);
  // The card is what a thumb presses on a phone: its 76px is 44px and more; the button is on the desk's side of the line and is 24px and more.
  assert.ok(parseInt(own(".g-overview__ready", "min-height")[0], 10) >= 44);
  assert.ok(parseInt(own(".g-overview__advance", "min-height")[0], 10) >= 24);
  assert.doesNotMatch(mediaText(READY_CSS, "max-width: 900px"), /readylist|g-overview__advance|readyrow/, "nothing of the list is drawn on a phone");
  // The list is a column of rows without the 2.x list's bullets and margins.
  assert.deepEqual(own(".g-overview__readyrows", "list-style"), ["none"]);
  assert.deepEqual(own(".g-overview__readyrows", "gap"), ["var(--space-6)"]);
});

test("a long name in «Ready to advance» wraps; nothing is cut with «…» (the owner's answer on wrapping)", () => {
  const source = READY_BARE();
  assert.doesNotMatch(source, /text-overflow/);
  assert.doesNotMatch(source, /-webkit-line-clamp/);
  for (const selector of [".g-overview__readytitle", ".g-overview__readywho", ".g-overview__readyname", ".g-overview__readypos", ".g-overview__ready", ".g-overview__readyrow"]) {
    assert.deepEqual(valuesOf(READY_CSS, selector, "white-space"), [], `${selector} does not hold its words on one line`);
    assert.doesNotMatch(valuesOf(READY_CSS, selector, "overflow").join(" "), /hidden|clip/, selector);
  }
  for (const selector of [".g-overview__readywho", ".g-overview__readyname", ".g-overview__readypos"]) assert.deepEqual(valuesOf(READY_CSS, selector, "overflow-wrap"), ["anywhere"], selector);
  assert.deepEqual(valuesOf(READY_CSS, ".g-overview__readyrow", "align-items"), ["center"]);
  for (const [, query] of text(READY_CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  assert.doesNotMatch(source, /--focus-ring/);
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
  assert.deepEqual(valuesOf(css, ".g-overview", "gap"), ["var(--space-20)", "var(--space-22)"], "20px on a desk (DeskOverview.html), 22px up to 900px (Team.html)");
  assert.match(text(css), /@media \(max-width: 900px\)\s*\{\s*(?:\/\*[^*]*\*\/\s*)?\.g-overview \{ gap: var\(--space-22\); \}/, "and only up to 900px");
  // The columns and the leaders are overview-lists.css's (stage 07d, Task 32): the same 20 and 22 between the columns' blocks, up to 900px one under the other.
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__cols", "gap"), ["var(--space-20)", "var(--space-22)"], "the leaders and the results stand as far apart as the other blocks");
  assert.match(text(LISTS_CSS), /@media \(max-width: 900px\)\s*\{\s*(?:\/\*[^*]*\*\/\s*)?\.g-overview__cols,\s*\.g-overview__main \{ gap: var\(--space-22\); \}/, "and only up to 900px");
  // So are the recent results (Task 33), and their rules and queries have left overview.css.
  const gone = [".g-overview__cols", ".g-overview__title", ".g-overview__leaders", ".g-overview__leaderlist", ".g-ranked", ".g-overview__results", ".g-overview__bar",
    ".g-overview__all", ".g-overview__list", ".g-overview__result", ".g-overview__row", ".g-overview__text", ".g-overview__opponent", ".g-overview__line", ".g-overview__score"];
  for (const name of gone) assert.doesNotMatch(bareOf(css), new RegExp(`\\${name}(?![\\w-])`), `${name} is not overview.css's any more`);
  // A phone's row is 56 as Team.html's content-box draws it, and the phone shows the three newest; a desk's row is 53, its 52 and the rule.
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__result", "min-height"), ["56px", "53px"]);
  assert.match(phoneOf(LISTS_CSS), /\.g-overview__result:nth-child\(n\+4\) \{ display: none; \}/, "the fourth and fifth result wait for a desk");
  assert.match(phoneOf(LISTS_CSS), /\.g-overview__result:nth-child\(3\),\s*\.g-overview__result:last-child \{ border-bottom: 0; \}/, "Team.html's last row has no rule");
  assert.doesNotMatch(deskOf(LISTS_CSS), /:last-child \{ border-bottom: 0/, "DeskOverview.html's last row keeps its rule");
  assert.deepEqual(valuesOf(LISTS_CSS, ".g-overview__score", "font-variant-numeric"), ["tabular-nums", "tabular-nums"], "after each shorthand, which resets it");
  assert.deepEqual(valuesOf(css, ".g-overview .g-kpi__v", "font-size"), ["clamp(24px, calc(10.8vw - 10px), 30px)", "34px"], "a phone's figure keeps to one line at 320px; a desk's is DeskOverview.html's 34px, its cards wrapping instead");
  assert.doesNotMatch(text(css), /1360px|359px/, "the sheet has the 900/901 breakpoints only");
});

test("the results as DeskOverview.html and Team.html draw them: styled; readable; D2; wrapping; the round's column as wide as its longest word", () => {
  const own = (selector, property) => valuesOf(LISTS_CSS, selector, property);
  for (const phone of [false, true]) {
    const fragment = mount(overviewMarkup(overviewModel(input("t1", { games: MVP_GAMES, phone }))));
    assertCspSafe(fragment);
    assertStyled(fragment, "src/screens/team/overview.css", LISTS_CSS, "page-head.css", "kpi-tile.css", "search-field.css", "match-board.css", "src/shell/crest.css", "result-pill.css", "button.css",
      "status-chip.css", "callout.css", "number-badge.css", TABLE_CSS);
  }
  // Every rule of a text sets what the 2.x globals would otherwise give, at the font's own line height (the prototypes give none).
  const texts = [".g-overview__all", ".g-overview__row", ".g-overview__round", ".g-overview__opponent", ".g-overview__race", ".g-overview__racelink", ".g-overview__dot", ".g-overview__mvp", ".g-overview__line",
    ".g-overview__cas", ".g-overview__score"];
  for (const selector of texts) {
    for (const property of ["font", "letter-spacing", "text-transform", "color"]) assert.ok(own(selector, property).length >= 1, `${selector} ${property}`);
    for (const font of own(selector, "font")) assert.match(font, /\/normal /, `${selector} keeps the font's own line height`);
  }
  for (const selector of [".g-overview__results", ".g-overview__result", ".g-overview__row", ".g-overview__all"]) {
    for (const property of ["border", "background"]) assert.ok(own(selector, property).length >= 1, `${selector} ${property}`);
  }
  // DeskOverview.html: the round 13px, the opponent 16/500, under it the race and the MVP 12px 6 apart, the casualties 13px; the greys --muted.
  assert.deepEqual(own(".g-overview__round", "font"), ["400 13px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__opponent", "font"), ["500 16px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__race", "font"), ["400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__mvp", "font"), ["400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__dot", "font"), ["400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__sub", "column-gap"), ["var(--space-6)"]);
  assert.deepEqual(own(".g-overview__cas", "font"), ["400 13px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__line", "font"), ["400 13px/normal var(--font-body)"], "Team.html's line under the opponent");
  assert.deepEqual(own(".g-overview__text", "gap"), [], "the two lines touch, as in both prototypes");
  assert.deepEqual(own(".g-overview__all", "font"), ["600 14px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-overview__all", "color"), ["var(--accent-text)"]);
  assert.deepEqual(own(".g-overview__score", "text-align"), ["right"]);
  for (const selector of [".g-overview__round", ".g-overview__race", ".g-overview__dot", ".g-overview__mvp", ".g-overview__line", ".g-overview__cas"]) assert.deepEqual(own(selector, "color"), ["var(--muted)"], selector);
  // The desk's grid (DeskOverview.html): 30, the round, the opponent, 90, 70, 14 apart, a row at least 52 with its rule under it.
  assert.deepEqual(own(".g-overview__list", "grid-template-columns"), ["30px minmax(60px, max-content) minmax(0, 1fr) 90px 70px"]);
  assert.deepEqual(own(".g-overview__list", "column-gap"), ["var(--space-14)"]);
  assert.deepEqual(own(".g-overview__result", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(own(".g-overview__result", "box-sizing"), ["border-box"]);
  // L6: «Товарищеский» is wider than the prototype's 60px. The round's column is the list's one track, as wide as the widest
  // word in it and never under 60, and every row sits on the list's grid (subgrid), so the columns of all the rows agree;
  // the word is never broken.
  for (const selector of [".g-overview__result", ".g-overview__row"]) {
    assert.match(ruleOf(deskOf(LISTS_CSS), selector), /^(?=[^]*grid-column: 1 \/ -1;)(?=[^]*grid-template-columns: subgrid;)/, `${selector} on the list's grid`);
    // Chrome 111–116 has no subgrid and drops the line: the list's own tracks above it keep each row on one line there (T33 m1).
    assert.match(ruleOf(deskOf(LISTS_CSS), selector), /grid-template-columns: 30px minmax\(60px, max-content\) minmax\(0, 1fr\) 90px 70px;\s*grid-template-columns: subgrid;/, `${selector}: the fallback first`);
  }
  assert.match(ruleOf(deskOf(LISTS_CSS), ".g-overview__list"), /display: grid;/);
  assert.deepEqual(own(".g-overview__round", "overflow-wrap"), [], "a round's word keeps whole");
  // D2: up to 900px «Whole season →» and a row are 44 or more; from 901px «Whole season →» 24, a row 53.
  assert.deepEqual(own(".g-overview__all", "min-height"), ["var(--size-touch)", "24px"]);
  for (const value of own(".g-overview__result", "min-height")) assert.ok(parseInt(value, 10) >= 44, value);
  // Wrapping: the opponent, the race and the MVP wrap; nothing is cut with «…» or held on one line.
  for (const selector of [".g-overview__opponent", ".g-overview__race", ".g-overview__racelink", ".g-overview__mvp"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  assert.match(ruleOf(bareOf(LISTS_CSS), ".g-overview__sub"), /flex-wrap: wrap;/);
  assert.doesNotMatch(bareOf(LISTS_CSS).replace(ruleOf(deskOf(LISTS_CSS), ".g-overview__leadername"), ""), /ellipsis|nowrap|text-overflow|line-clamp/, "only a desk leader's name is held (F10)");
  // Readable in every palette: a desk's greys on its white card, a phone's on its page, the link on both.
  for (const selector of [".g-overview__round", ".g-overview__race", ".g-overview__racelink", ".g-overview__mvp", ".g-overview__cas"]) assertReadable(LISTS_CSS, selector, "color", ["--surface"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__line", "color", ["--page", "--desk", "--surface"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__all", "color", ["--page", "--surface"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__opponent", "color", ["--page", "--surface"], 4.5);
  assertReadable(LISTS_CSS, ".g-overview__score", "color", ["--page", "--surface"], 4.5);
});

test("a desk's row is no link: the round's word is the match's, stretched over the row; the opponent and the race lie over it, each 24px or more (D2); the ring is the whole row's", () => {
  const own = (selector, property) => valuesOf(LISTS_CSS, selector, property);
  const desk = (selector, property) => inMedia(LISTS_CSS, "min-width: 901px", selector, property);
  // The stretched link (F9): the row holds the match link's ::after, which covers it all, so a press anywhere on it opens the
  // match (spec §3). The link itself is not positioned, or its ::after would take its box and not the row's.
  assert.match(ruleOf(deskOf(LISTS_CSS), ".g-overview__row"), /position: relative;/);
  assert.deepEqual(["content", "position", "inset"].map((property) => desk(".g-overview__match::after", property)), [['""'], ["absolute"], ["0"]]);
  assert.deepEqual([own(".g-overview__match", "text-decoration"), own(".g-overview__match", "position")], [["none"], []]);
  // base.css's ring, written out on the ::after: the whole row is ringed, as when the row was the link; the word draws none.
  assert.match(text("src/ui/base.css"), /:focus-visible \{\s*outline: 3px solid var\(--accent-text\);\s*outline-offset: 0;\s*\}/);
  assert.deepEqual([desk(".g-overview__match:focus-visible::after", "outline"), desk(".g-overview__match:focus-visible::after", "outline-offset")], [["3px solid var(--accent-text)"], ["0"]]);
  assert.deepEqual(desk(".g-overview__match:focus-visible", "outline"), ["0"]);
  assert.doesNotMatch(bareOf(LISTS_CSS), /--focus-ring/);
  // Over it, DeskOverview.html's `position: relative; z-index: 2`: the opponent and the race take the pointer.
  for (const selector of ["a.g-overview__opponent", ".g-overview__racelink"]) {
    assert.deepEqual([own(selector, "position"), own(selector, "z-index"), own(selector, "text-decoration")], [["relative"], ["2"], ["none"]], selector);
  }
  // The race: 600 12px in the accent (the prototype's #2F7A52, --accent-text), the 12px book 4 before its words.
  assert.deepEqual(["font", "color", "display", "align-items", "gap"].map((property) => own(".g-overview__racelink", property)),
    [["600 12px/normal var(--font-body)"], ["var(--accent-text)"], ["inline-flex"], ["center"], ["4px"]]);
  // D2 from 901px, measured in Chrome: the race's 2 above and 8 below, taken back by its margin, make it 24px without moving
  // its line; the opponent grows upwards only (7, taken back), since the race lies over its foot: 7 + 19 − 2 = 24px its
  // own. The match's link is the whole row, 52px.
  assert.deepEqual(["padding", "margin", "min-height"].map((property) => own(".g-overview__racelink", property)), [["2px 0 8px"], ["-2px 0 -8px"], ["24px"]]);
  assert.deepEqual([own("a.g-overview__opponent", "padding"), own("a.g-overview__opponent", "margin")], [["7px 0 0"], ["-7px 0 0"]]);
  assert.deepEqual(own("span.g-overview__opponent", "padding"), [], "a name that is no link keeps the prototype's box");
  assertReadable(LISTS_CSS, ".g-overview__racelink", "color", ["--surface"], 4.5);
  // A phone's row is the link it was, nothing stretched over it: the desk's rules alone place them.
  assert.deepEqual([own(".g-overview__row", "position"), own(".g-overview__match::after", "position")], [["relative"], ["absolute"]]);
});

test("a result the coach is on is the same match's row on the other width; the fourth and fifth, hidden on a phone, give the focus to the title", async () => {
  const { cross } = crossingWindow(false);
  const many = Array.from({ length: 5 }, (_, index) => played(`m${index}`, 1, [1, 0], [0, 0], { confirmedAt: `2026-09-0${index + 1}T10:00:00Z` }));
  try {
    coach({ games: many });
    await renderTeamOverview("t1");
    // A desk's row is no link: its match's link is the round's word; a phone's is the row (F9). Both carry the match's key.
    const rows = () => view.querySelectorAll(".g-overview__result a[data-key]");
    assert.ok(view.querySelector(".g-overview__round"), "a desk's row");
    assert.ok(rows().every((link) => link.matches(".g-overview__match")));
    rows()[1].focus();
    cross(true);
    assert.equal(view.querySelector(".g-overview__round"), null, "a phone's row");
    assert.equal(document.activeElement.getAttribute("href"), "#/games/m3", "the same match, and the focus on it");
    cross(false);
    assert.equal(document.activeElement.getAttribute("href"), "#/games/m3");
    // The fifth, from a desk: the patch gives the focus to the phone's link of the same match, which the phone's stylesheet
    // hides (overview-lists.css). The fake page reads no stylesheet and is told so: there, a link in it draws no box.
    const element = Object.getPrototypeOf(view);
    assert.ok(!Object.hasOwn(element, "getClientRects"));
    element.getClientRects = function hiddenOnPhone() {
      const item = this.closest(".g-overview__result");
      return globalThis.matchMedia("(max-width: 900px)").matches && item && item.parentNode.childNodes.indexOf(item) >= 3 ? [] : [{ width: 40, height: 24 }];
    };
    try {
      rows()[4].focus();
      cross(true);
      assert.equal(rows()[4].getAttribute("href"), "#/games/m0", "the same match's link, hidden on a phone");
      assert.ok(document.activeElement === view.querySelector("h1"), "a row the phone hides is no place to leave the focus");
    } finally {
      delete element.getClientRects;
    }
  } finally {
    releaseCurrentScreen();
    delete globalThis.matchMedia;
  }
});

test("at 320px a word of a team or a race keeps whole in the board's side column (T10 carry)", () => {
  const board = text("src/ui/match-board.css");
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__main\s*\{[^}]*gap: var\(--space-4\)[^}]*padding-right: var\(--space-10\)[^}]*padding-left: var\(--space-10\)/);
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__name \{ font-size: 16px; \}/);
  assert.match(board, /@media \(max-width: 359px\)\s*\{[^@]*\.g-board__sub \{ font-size: 12px; \}/);
  assert.match(board, /@media \(max-width: 900px\)\s*\{\s*\.g-board__mid \{ max-width: 124px; \}/, "the middle column is still wide enough for a Russian status");
});

// Stage 07e, decision 13: the leaders are the career, as «Состав» counts it — the roster and the records not settled yet
// (the taps of a match on). The records are read once a visit and again on every answer of the games, one read in the
// air; they are taken only with the revision of the team in the list (else the roster and the records are two moments,
// and a match would count twice or not at all), and only while the visit is here. None of it is said when it fails.
const EVENTS = "GET /api/teams/t1/events";
const LIST = "GET /api/teams";
/** How many requests to `key` the visit has sent. */
const sent = (key) => api.calls.filter((call) => call.key === key).length;
const turns = async () => { for (let turn = 0; turn < 6; turn += 1) await settle(); };
const leaderWords = () => view.querySelectorAll("a.g-overview__leader, a.g-overview__leaderline").map((link) => [
  link.querySelector(".g-overview__leadertag").textContent, link.getAttribute("href"), link.querySelector(".g-overview__leadervalue").textContent]);
// Ashby (TD 2, COMP 1) and Vane (TD 1, COMP 4) are 7 SPP each on the roster; two taps of Vane's touchdowns in the match.
const ROSTER = [["SPP", "#/t/t1/roster/p1", "7"], ["TD", "#/t/t1/roster/p1", "2"], ["COMP", "#/t/t1/roster/p2", "4"]];
const CAREER = [["SPP", "#/t/t1/roster/p2", "13"], ["TD", "#/t/t1/roster/p2", "3"], ["COMP", "#/t/t1/roster/p2", "4"]];
const tap = (id, playerId = "p2") => ({ id, pairingId: "g1", playerId, counter: "touchdowns", delta: 1, injury: null, settledAt: null });
const TAPS = [tap("e1"), tap("e2")];
/** The coach's list as the server sends it again: t1 at `revision`, the others as they were. */
const listAt = (revision) => ({ teams: TEAMS.map((team) => (team.id === "t1" ? { ...team, revision } : team)) });

test("the leaders follow a match's records: read once a visit and when the games change; another revision's records, or a read that failed, leave the roster's numbers, and nothing is said", async () => {
  const calls = () => sent(EVENTS);
  for (const phone of [false, true]) {
    const { cross } = crossingWindow(phone);
    try {
      coach();
      api.reply(EVENTS, 200, { events: TAPS, revision: 4 });
      const records = api.hold(EVENTS);
      await renderTeamOverview("t1");
      assert.equal(calls(), 1, "read once the page is drawn");
      assert.deepEqual(leaderWords(), ROSTER, "the roster's numbers until the records come");
      records.release();
      await turns();
      assert.deepEqual(leaderWords(), CAREER, `the career, as the roster counts it (${phone ? "a phone" : "a desk"})`);
      // A draw that is no answer of the games reads nothing: the width crossed and back.
      cross(!phone);
      cross(phone);
      await turns();
      assert.equal(calls(), 1);
      assert.deepEqual(leaderWords(), CAREER);
      // The games answer: read again. Another revision's records — older than the list's (a save landed since): the
      // roster's numbers. Records newer than the list read the list again (review I1, the test after this one).
      api.reply(EVENTS, 200, { events: TAPS, revision: 3 });
      await notifyGames(GAMES);
      await turns();
      assert.equal(calls(), 2);
      assert.deepEqual(leaderWords(), ROSTER, "the roster and the records of two moments: the roster's");
      assert.equal(sent(LIST), 0, "records behind the list read no list");
      // A read that fails: the roster's numbers, and nothing is said.
      api.reply(EVENTS, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
      await notifyGames(GAMES);
      await turns();
      assert.equal(calls(), 3);
      assert.deepEqual(leaderWords(), ROSTER);
      assert.equal(view.querySelector('[role="alert"]'), null, "no words of the failure");
      // One read in the air: the games answering twice while it is ask for one more after it, not two.
      api.reply(EVENTS, 200, { events: TAPS, revision: 4 });
      const held = api.hold(EVENTS);
      await notifyGames(GAMES);
      await notifyGames(GAMES);
      await turns();
      assert.equal(calls(), 4, "one in the air");
      held.release();
      await turns();
      assert.equal(calls(), 5, "then the one asked for meanwhile");
      assert.deepEqual(leaderWords(), CAREER);
      // An answer after the coach left draws nothing.
      const late = api.hold(EVENTS);
      await notifyGames(GAMES);
      releaseCurrentScreen();
      view.innerHTML = "<p>next</p>";
      late.release();
      await turns();
      assert.equal(view.querySelector("p").textContent, "next");
      api.assertAnswered();
    } finally {
      releaseCurrentScreen();
      delete globalThis.matchMedia;
    }
  }
});

// Review I1: starting a match raises the team's revision on the server (the treasury's pre-match), and so does ending
// one; the coach's list hears neither. Records newer than the list read the list again — once for that answer, none
// while one is in the air — and the whole overview is then of one roster, the leaders the career.
test("records newer than the coach's list read the list again, once: then the leaders are the career; a list at the records' revision is not read again", async () => {
  for (const phone of [false, true]) {
    crossingWindow(phone);
    try {
      coach();
      api.reply(EVENTS, 200, { events: TAPS, revision: 5 });
      api.reply(LIST, 200, listAt(5));
      await renderTeamOverview("t1");
      await turns();
      assert.equal(sent(LIST), 1, "the list read again, once");
      assert.equal(state.myTeams.items.find((item) => item.id === "t1").revision, 5);
      assert.deepEqual(leaderWords(), CAREER, `the career (${phone ? "a phone" : "a desk"})`);
      // The games answer again: the records are at the list's revision now, and the list is not read.
      await notifyGames(GAMES);
      await turns();
      assert.equal(sent(EVENTS), 2);
      assert.equal(sent(LIST), 1);
      assert.deepEqual(leaderWords(), CAREER);
      api.assertAnswered();
    } finally {
      releaseCurrentScreen();
      delete globalThis.matchMedia;
    }
  }
});

test("a list read again that is still behind leaves the roster's numbers and asks nothing more; while it is in the air no other is sent", async () => {
  coach();
  api.reply(EVENTS, 200, { events: TAPS, revision: 5 });
  api.reply(LIST, 200, listAt(4));
  const listing = api.hold(LIST);
  await renderTeamOverview("t1");
  await turns();
  assert.deepEqual([sent(EVENTS), sent(LIST)], [1, 1]);
  // The games answer twice while the list is in the air: no list read besides it, and the records wait for it.
  await notifyGames(GAMES);
  await notifyGames(GAMES);
  await turns();
  assert.deepEqual([sent(EVENTS), sent(LIST)], [1, 1], "one read of the list in the air, and the records after it");
  listing.release();
  await turns();
  // The records asked for meanwhile: one more, still newer than the list, so one more read of it — one for each answer.
  assert.deepEqual([sent(EVENTS), sent(LIST)], [2, 2]);
  assert.deepEqual(leaderWords(), ROSTER, "the list is still behind: the roster's numbers");
  await turns();
  await turns();
  assert.deepEqual([sent(EVENTS), sent(LIST)], [2, 2], "and nothing more: no loop");
  assert.equal(view.querySelector('[role="alert"]'), null);
  api.assertAnswered();
});

test("a list read again that fails leaves the roster's numbers, and nothing is said", async () => {
  coach();
  api.reply(EVENTS, 200, { events: TAPS, revision: 5 });
  api.reply(LIST, 500, { error: { code: "INTERNAL", params: {}, message: "x" } });
  await renderTeamOverview("t1");
  await turns();
  assert.deepEqual([sent(EVENTS), sent(LIST)], [1, 1]);
  assert.deepEqual(leaderWords(), ROSTER);
  assert.equal(view.querySelector('[role="alert"]'), null);
  // The next answer of the games reads the records again, and the list once more for them.
  api.reply(LIST, 200, listAt(5));
  await notifyGames(GAMES);
  await turns();
  assert.deepEqual([sent(EVENTS), sent(LIST)], [2, 2]);
  assert.deepEqual(leaderWords(), CAREER);
  releaseCurrentScreen();
  api.assertAnswered();
});

test("a list read again after the coach left draws nothing", async () => {
  coach();
  api.reply(EVENTS, 200, { events: TAPS, revision: 5 });
  api.reply(LIST, 200, listAt(5));
  const listing = api.hold(LIST);
  await renderTeamOverview("t1");
  await turns();
  releaseCurrentScreen();
  view.innerHTML = "<p>next</p>";
  listing.release();
  await turns();
  assert.equal(view.querySelector("p").textContent, "next");
  assert.deepEqual([sent(EVENTS), sent(LIST)], [1, 1]);
  api.assertAnswered();
});

// Review M2: one read of the records for the start of a visit, once the games have answered — a games answer on its
// way when the page is drawn (app.js's at sign-in, or the overview's own after a failure) asks for no second one.
test("a cold start reads the records once, after the games have answered; a team in its build reads none", async () => {
  coach({ games: [], gamesLoaded: false });
  api.reply("GET /api/games", 200, { games: GAMES, currentGames: [] });
  const games = api.hold("GET /api/games");
  const warming = invalidateGames(); // app.js's read at sign-in
  const drawing = renderTeamOverview("t1");
  await turns();
  assert.equal(sent(EVENTS), 0, "nothing while the games are on their way");
  games.release();
  await warming;
  await drawing;
  await turns();
  assert.equal(sent("GET /api/games"), 1);
  assert.equal(sent(EVENTS), 1, "one read, after them");
  // Fresh Meat (t4) is in its build: it has no match, and no records to read.
  coach();
  state.activeTeamId = "t4";
  await renderTeamOverview("t4");
  await notifyGames(GAMES);
  await turns();
  assert.ok(view.querySelector(".g-pagehead h1"));
  assert.equal(sent("GET /api/teams/t4/events"), 0);
  releaseCurrentScreen();
  api.assertAnswered();
});

// Review M3, pre-flight L11: the records are taken only with a whole revision, the answer's and the list's alike.
test("records with no whole revision, or a team in the list with none, leave the roster's numbers and read no list", async () => {
  const unlisted = () => state.myTeams.items.map((team) => (team.id === "t1" ? { ...team, revision: undefined } : team));
  const cases = [
    ["an answer with no revision", { events: TAPS }, false],
    ["an answer whose revision is text", { events: TAPS, revision: "4" }, false],
    ["an answer whose revision is text and past the list's", { events: TAPS, revision: "5" }, false],
    ["a team in the list with no revision", { events: TAPS, revision: 4 }, true],
    ["neither with one", { events: TAPS }, true],
  ];
  for (const [what, answer, noRevision] of cases) {
    coach();
    if (noRevision) state.myTeams = { ...state.myTeams, items: unlisted() };
    api.reply(EVENTS, 200, answer);
    await renderTeamOverview("t1");
    await turns();
    assert.equal(sent(EVENTS), 1, what);
    assert.deepEqual(leaderWords(), ROSTER, what);
    assert.equal(sent(LIST), 0, `${what}: no list read`);
    releaseCurrentScreen();
    api.assertAnswered();
  }
});

// Review M4, decision 14: «Ready to advance» spends the roster's SPP — the records of a match on, which the leaders
// count, give nobody an advancement, nor more SPP to spend.
test("«Ready to advance» stays on the roster's SPP while the leaders count the career", async () => {
  // Ashby and Vane have 7 SPP on the roster, Dunn 2 — one short of the first random skill (3). Three taps of Dunn's
  // touchdowns would give him 11: the lead, and past the price.
  const players = [CREW[0], CREW[1], CREW[3]];
  const DUNN_TAPS = [tap("e1", "p4"), tap("e2", "p4"), tap("e3", "p4")];
  const readyWords = () => [
    view.querySelector(".g-overview__ready")?.textContent ?? "",
    view.querySelectorAll(".g-overview__readyrow").map((row) => [row.querySelector(".g-overview__readyname").textContent, row.querySelector(".g-overview__readyspp").textContent]),
  ];
  coach();
  state.myTeams = { ...state.myTeams, items: [crew(players), ...TEAMS.slice(1)] };
  api.reply(EVENTS, 200, { events: DUNN_TAPS, revision: 4 });
  const records = api.hold(EVENTS);
  await renderTeamOverview("t1");
  const before = readyWords();
  assert.deepEqual(before[1], [["Ashby", "7 SPP"], ["Vane", "7 SPP"]], "the roster's: Dunn is short");
  assert.equal(leaderWords()[0][2], "7");
  records.release();
  await turns();
  assert.deepEqual(leaderWords()[0], ["SPP", "#/t/t1/roster/p4", "11"], "the leaders: the career");
  assert.deepEqual(readyWords(), before, "the card and the list: the roster's");
  const model = overviewModel({ ...input("t1"), team: crew(players), raceTeam: raceOf(TEAMS[0]), events: DUNN_TAPS });
  assert.deepEqual(model.ready, overviewModel({ ...input("t1"), team: crew(players), raceTeam: raceOf(TEAMS[0]) }).ready);
  releaseCurrentScreen();
  api.assertAnswered();
});
