import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertContrast, assertReadable, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale, setDictionaries } from "../src/core/i18n.mjs";

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
  state.data = { teams: RACES };
  state.season = { data: season, loaded: seasonLoaded, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: gamesLoaded, loading: false, error: gamesError };
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
  const desk = bare.slice(bare.indexOf("@media (min-width: 901px)"));
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
  assert.ok(bare.indexOf(".g-overview .g-kpi { gap: 0; }") < bare.indexOf("@media"), "for both widths");
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
  assert.equal(fragment.querySelectorAll(".g-kpi").length, 5, "the table still gives the place and the points");
  assert.equal(fragment.querySelectorAll(".g-kpi__v")[1].textContent, "3", "the points without a record that was not read");
  assert.equal(fragment.querySelectorAll(".g-kpi__v")[4].textContent, "–", "nor a difference");
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
  assertDictionaryCovers("src/screens/team/overview.mjs");
  for (const key of ["spp", "td", "cas", "comp"]) assert.ok(dictionary("en")[`teamOverview.leader.${key}`] && dictionary("ru")[`teamOverview.leader.${key}`], key);
  const fragment = mount(overviewMarkup(overviewModel(input("t1"))));
  assertCspSafe(fragment);
  assertStyled(fragment, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "search-field.css", "match-board.css", "list-row.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css");
  const outside = mount(overviewMarkup(overviewModel(input("t4"))));
  assertStyled(outside, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "search-field.css", "status-chip.css", "callout.css");
  const phone = mount(overviewMarkup(overviewModel(input("t1", { phone: true }))));
  assertCspSafe(phone);
  assertStyled(phone, "src/screens/team/overview.css", "page-head.css", "kpi-tile.css", "match-board.css", "list-row.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css");
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
  const cols = fragment.querySelector(".g-overview__cols");
  const page = fragment.querySelector(".g-overview").childNodes.filter((node) => node.nodeType === 1);
  // Compared as booleans: a failed `assert.equal` of two DOM nodes would try to print both trees.
  assert.ok(page.at(-1) === section, "the last of the page: under the columns, with the width of the page");
  assert.ok(page.at(-2) === cols, "right after the columns");
  assert.equal(cols.querySelector(".g-overview__readylist"), null, "not one of the columns");
  assert.ok(cols.querySelector(".g-overview__leaders") && cols.querySelector(".g-overview__results"), "after the leaders and the recent matches");
});

test("leaders and ready players, no results: the leaders keep the row to themselves, the ready list under them (stage 06's lone-list rule)", () => {
  const model = overviewModel(input("t1", { team: crew(CREW), games: [] }));
  assert.deepEqual(model.results, []);
  assert.ok(model.leaders.length && model.ready.length);
  const fragment = mount(overviewMarkup(model));
  const cols = fragment.querySelector(".g-overview__cols");
  assert.deepEqual(cols.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class")), ["g-overview__leaders"], "one list alone in the columns");
  const page = fragment.querySelector(".g-overview").childNodes.filter((node) => node.nodeType === 1);
  assert.deepEqual(page.slice(-2).map((node) => node.getAttribute("class")), ["g-overview__cols", "g-overview__readylist"]);
  // The rule that gives a lone list the row: with the ready list outside the columns it still has a lone child to apply to.
  assert.match(READY_BARE(), /@media \(min-width: 901px\)\s*\{[^@]*\.g-overview__cols > :only-child \{ grid-column: 1 \/ -1; \}/);
  // And the ready list is no grid item that could ask for a column of its own.
  assert.deepEqual(valuesOf(READY_CSS, ".g-overview__readylist", "grid-column"), []);
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
  assertStyled(fragment, READY_CSS, "page-head.css", "kpi-tile.css", "match-board.css", "list-row.css", "result-pill.css", "button.css", "status-chip.css", "callout.css", "number-badge.css");
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
  assert.doesNotMatch(source.slice(source.indexOf("@media (max-width: 900px)"), source.indexOf("@media (min-width: 901px)")), /readylist|g-overview__advance|readyrow/, "nothing of the list is drawn on a phone");
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
  assert.deepEqual(valuesOf(css, ".g-overview__cols", "gap"), ["var(--space-20)", "var(--space-22)"], "the leaders and the results stand as far apart as the other blocks");
  assert.match(text(css), /@media \(max-width: 900px\)\s*\{\s*(?:\/\*[^*]*\*\/\s*)?\.g-overview,\s*\.g-overview__cols \{ gap: var\(--space-22\); \}/, "and only up to 900px");
  assert.ok(valuesOf(css, ".g-overview__result", "min-height").includes("56px"));
  assert.match(text(css), /@media \(max-width: 900px\)\s*\{[^@]*\.g-overview__result:nth-child\(n\+4\)\s*\{[^}]*display: none/, "the fourth and fifth result wait for a desk");
  assert.match(text(css), /@media \(min-width: 901px\)\s*\{[^@]*\.g-overview__cols\s*\{[^}]*grid-template-columns: minmax\(0, 1fr\) minmax\(0, 1fr\)/);
  assert.ok(valuesOf(css, ".g-overview__score", "font").includes("700 22px/1.1 var(--font-display)"));
  assert.ok(valuesOf(css, ".g-overview__score", "font-variant-numeric").includes("tabular-nums"));
  assert.deepEqual(valuesOf(css, ".g-overview .g-kpi__v", "font-size"), ["clamp(24px, calc(10.8vw - 10px), 30px)", "34px"], "a phone's figure keeps to one line at 320px; a desk's is DeskOverview.html's 34px, its cards wrapping instead");
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
