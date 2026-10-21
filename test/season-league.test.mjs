import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document, mount } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { inMedia, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/season", replace() {} };
const { renderSeasonRoute, leagueModel, leagueMarkup, roundsMarkup } = await import("../src/screens/season/league.mjs");
const { ROUND_STATES, leagueRounds } = await import("../src/data/season-table.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const CSS = "src/screens/season/league.css";

const COACH = { id: "u1", login: "coach", isAdmin: false, preferences: {} };
const ADMIN = { ...COACH, isAdmin: true };

/** An entry: `t1` is the coach's (u1), the others a coach each; the race is the reference's Dwarf unless told. */
const entry = (key, user, { withdrawn = false, race = "teams/dwarf" } = {}) => ({
  id: `e-${key}`, withdrawnAt: withdrawn ? "2026-10-01T10:00:00Z" : null,
  user: { id: user, login: `coach-${user}` }, team: { id: key, name: `Team ${key}`, baseTeamSlug: race },
});
const ENTRIES = [entry("t1", "u1", { race: "teams/human" }), entry("r1", "u2"), entry("r2", "u3"), entry("r3", "u4"), entry("r4", "u5")];
const standing = (key, rank, games, points) => {
  const { id, withdrawnAt, user, team } = ENTRIES.find((item) => item.team.id === key);
  return { entryId: id, withdrawnAt, user, team, points, games, byes: 0, touchdowns: 0, casualties: 0, rank };
};
/** A pairing of round `round` (its status `status`): home and away by team key, the score [home, away] once confirmed. */
const pairing = (round, status, table, home, away, { score = null, cas = [0, 0], result = score ? "confirmed" : "pending", points = null } = {}) => ({
  id: `p${round}-${table}`, roundNumber: round, roundStatus: status, tableNumber: table,
  homeEntryId: home ? `e-${home}` : null, awayEntryId: away ? `e-${away}` : null,
  homeTouchdowns: score?.[0] ?? null, awayTouchdowns: score?.[1] ?? null, homeCasualties: score ? cas[0] : null, awayCasualties: score ? cas[1] : null,
  homePoints: points?.[0] ?? null, awayPoints: points?.[1] ?? null, resultStatus: result,
});
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3 },
  entries: ENTRIES,
  historicalEntries: [],
  standings: [standing("t1", 1, 2, 7), standing("r1", 2, 2, 5), standing("r4", 3, 1, 3), standing("r2", 4, 2, 1), standing("r3", 5, 2, 1)],
  rounds: [
    { roundNumber: 1, status: "completed", pairings: [pairing(1, "completed", 2, "r2", "r3", { score: [1, 1], points: [1, 1] }), pairing(1, "completed", 1, "t1", "r1", { score: [2, 1], cas: [1, 0], points: [3, 0] })] },
    { roundNumber: 2, status: "completed", pairings: [pairing(2, "completed", 1, "r1", "r2", { score: [3, 0], points: [5, 0] }), pairing(2, "completed", 2, "r3", "t1", { score: [0, 2], points: [0, 4] })] },
    { roundNumber: 3, status: "started", pairings: [
      pairing(3, "started", 1, "t1", "r2", { result: "awaiting_confirmation" }), pairing(3, "started", 2, "r3", "r1"), pairing(3, "started", 3, "r4", null, { points: [3, null] })] },
    { roundNumber: 4, status: "draft", pairings: [] },
  ],
};

/** The phone's media query, which the test answers and changes. */
function crossingWindow(phone = true) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { listeners, cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

/** Somebody on the page — a coach, an admin or a guest (null) — with the table read once already. */
function visitor(user = COACH, { season = SEASON, answer = season } = {}) {
  api.reset();
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  if (user) {
    api.items.set("gata-league-auth-token", "tok");
    rememberSessionToken("tok");
  } else {
    api.items.delete("gata-league-auth-token");
    rememberSessionToken("");
  }
  state.auth.currentUser = user;
  state.myTeams = { items: [], loaded: true, loading: false, error: "" };
  state.data = data;
  state.season = { data: season, loaded: Boolean(season), loading: false, error: "" };
  api.reply("GET /api/season", 200, answer);
}

async function visit(tab = "", { phone = true, user = COACH, season = SEASON, answer } = {}) {
  const { cross, listeners } = crossingWindow(phone);
  visitor(user, { season, answer: answer ?? season });
  await renderSeasonRoute(tab);
  await settle();
  return { cross, listeners };
}

function leave() {
  releaseCurrentScreen();
  delete globalThis.matchMedia;
}

const sent = (key) => api.calls.filter((call) => call.key === key).length;
const words = (selector, root = view) => root.querySelectorAll(selector).map((node) => node.textContent);

test("a phone's table page: the season's name and the last round over, the table, the rules, the season's calendar", async () => {
  try {
    await visit("");
    assert.equal(view.querySelector("h2#league-title").textContent, "Mock Season");
    assert.match(view.querySelector(".g-league__bar").textContent, /after round 2/);
    assert.equal(view.querySelectorAll('.g-table [role="row"]').length, 1 + SEASON.standings.length);
    assert.equal(view.querySelector(".g-table").getAttribute("aria-labelledby"), "league-title");
    assert.equal(view.querySelectorAll('.g-table [role="columnheader"]').length, 8, "the phone's form");
    assert.ok(view.querySelector(".g-table__notes").textContent.includes(t("league.taps")));
    assert.ok(view.querySelector("#league-calendar"));
    assert.equal(view.querySelector("h1").textContent, t("shell.tab.table"), "a screen reader is told the page");
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a desk's page: «Season» with its line, the table and the calendar side by side; an admin has the way to the season's administration", async () => {
  try {
    await visit("", { phone: false });
    assert.equal(view.querySelector("h1").textContent, "Season");
    assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Mock Season · teams: 5 · after round 2");
    const row = view.querySelector(".g-season__row");
    const table = view.querySelector(".g-season__table");
    const aside = view.querySelector(".g-season__aside");
    assert.equal(table.parentNode, row);
    assert.equal(aside.parentNode, row);
    assert.equal(row.childNodes.filter((node) => node.nodeType === 1)[0], table, "the table first, the calendar at its right");
    assert.equal(table.querySelector("h2#league-title").textContent, t("shell.tab.table"));
    assert.equal(table.querySelector(".g-season__rule").textContent, t("league.points", { win: 3, draw: 1, loss: 0, bonus: 1, margin: 3, casualties: 3 }));
    assert.equal(table.querySelectorAll('[role="columnheader"]').length, 11, "the desk's form");
    assert.ok(table.querySelector(".g-table__notes").textContent.includes(t("league.clicks")));
    assert.ok(aside.querySelector("#league-calendar"));
    assert.equal(view.querySelector('a[href="#/season/administration"]'), null, "a coach has none");
    await visit("", { phone: false, user: ADMIN });
    const admin = view.querySelector('.g-pagehead__meta a[href="#/season/administration"]');
    assert.equal(admin.textContent, t("league.admin"));
  } finally {
    leave();
  }
});

test("a guest reads the table and the calendar; no row leads to a coach's page", async () => {
  try {
    await visit("", { phone: false, user: null });
    assert.equal(view.querySelectorAll("a.g-table__link").length, 0);
    assert.equal(view.querySelectorAll(".g-table__row--mine").length, 0);
    assert.ok(view.querySelectorAll("a.g-table__race").length > 0, "a race leads to its rules");
    assert.equal(view.querySelectorAll(".g-league__pair a").length, 0, "the calendar's names are text");
    assert.ok(view.querySelector(".g-table__notes").textContent.includes(t("league.clicksGuest")));
    assert.ok(words(".g-league__team").includes("Team t1"));
    await visit("", { phone: true, user: null });
    assert.equal(view.querySelectorAll("a").length, 0, "a phone's guest page has no link at all: rows, races and names are text");
    assert.ok(!view.querySelector(".g-table__notes").textContent.includes(t("league.taps")));
  } finally {
    leave();
  }
});

test("the calendar: newest round first, its state, a pair's score once confirmed, a bye, the coach's pair marked", async () => {
  try {
    await visit("");
    const calendar = view.querySelector(".g-league__calendar");
    assert.equal(calendar.getAttribute("aria-labelledby"), "league-calendar");
    assert.equal(calendar.querySelector("h2#league-calendar").textContent, t("league.calendar"));
    assert.deepEqual(words("h3", calendar), [
      `${t("matches.before.round", { round: 3 })} · ${t("league.roundState.started")}`,
      `${t("matches.before.round", { round: 2 })} · ${t("league.roundState.completed")}`,
      `${t("matches.before.round", { round: 1 })} · ${t("league.roundState.completed")}`,
    ], "the draft round 4 is not shown");
    const pairs = [...calendar.querySelectorAll(".g-league__pair")];
    assert.equal(pairs.length, 7);
    const [ours, theirs, bye, , , first] = pairs;
    assert.ok(ours.classList.contains("g-league__pair--mine"));
    assert.ok(!theirs.classList.contains("g-league__pair--mine"));
    assert.equal(ours.querySelector(".g-league__names").textContent, "Team t1 — Team r2");
    assert.equal(ours.querySelector(".g-league__state").textContent, t("league.awaiting"));
    assert.equal(ours.querySelector(".g-league__score").textContent, "—");
    assert.equal(theirs.querySelector(".g-league__state").textContent, t("league.pending"));
    assert.equal(bye.querySelector(".g-league__names").textContent, t("league.bye", { team: "Team r4" }));
    assert.equal(bye.querySelector(".g-league__state"), null);
    assert.equal(first.querySelector(".g-league__names").textContent, "Team t1 — Team r1");
    assert.equal(first.querySelector(".g-league__score").textContent, "2–1");
    assert.equal(first.querySelector(".g-league__state"), null, "a played pair waits for nothing");
    assert.equal(ours.querySelector("a.g-league__team").getAttribute("href"), "#/t/t1", "the coach's own team leads to its overview");
    assert.equal(ours.querySelectorAll("a.g-league__team")[1].getAttribute("href"), "#/coaches/u3/teams/r2");
    assert.equal(bye.querySelector("a.g-league__team").getAttribute("href"), "#/coaches/u5/teams/r4", "a bye's team leads to its page too");
  } finally {
    leave();
  }
});

test("a withdrawn side of a pairing is text, as its row in the table; no rounds is said", () => {
  const season = { ...SEASON, entries: ENTRIES.filter((item) => item.team.id !== "r2"), historicalEntries: [entry("r2", "u3", { withdrawn: true })] };
  const fragment = mount(roundsMarkup(leagueRounds(season), { viewerId: "u1", signedIn: true }));
  const names = [...fragment.querySelectorAll(".g-league__pair")].find((item) => item.textContent.includes("Team r2") && item.textContent.includes("Team t1"));
  assert.equal(names.querySelectorAll("a.g-league__team").length, 1, "the withdrawn team is text");
  const none = mount(roundsMarkup([], { viewerId: "u1", signedIn: true }));
  assert.equal(none.querySelector(".g-league__none").textContent, t("league.noRounds"));
  assert.ok(none.querySelector("#league-calendar"));
});

test("registration for a coach and administration for an admin are the 2.x screen with those two tabs; anything else, and the same addresses for a guest, are the league's page", async () => {
  try {
    await visit("registration");
    assert.ok(view.querySelector('[data-season-tab="registration"]'));
    for (const gone of ["standings", "schedule", "fixture"]) assert.equal(view.querySelector(`[data-season-tab="${gone}"]`), null, gone);
    assert.equal(view.querySelector(".g-league"), null);
    await visit("administration", { user: ADMIN, answer: { ...SEASON, admin: { users: [], savedTeams: [] } } });
    assert.ok(view.querySelector('[data-season-tab="administration"]'));
    assert.deepEqual(view.querySelectorAll("[data-season-tab]").map((tab) => tab.getAttribute("data-season-tab")), ["registration", "administration"]);
    for (const [tab, user] of [["administration", COACH], ["standings", COACH], ["schedule", ADMIN], ["registration", null], ["standings", null], ["administration", null]]) {
      await visit(tab, { user });
      assert.ok(view.querySelector(".g-league"), `${tab} for ${user?.isAdmin ? "an admin" : user ? "a coach" : "a guest"}`);
      assert.equal(view.querySelector("[data-season-tab]"), null);
    }
  } finally {
    leave();
  }
});

test("the table is read afresh on the way in; a failure is said while there is no table", async () => {
  try {
    await visit("");
    assert.equal(sent("GET /api/season"), 1, "read on the way in, though the page had it");
    await renderSeasonRoute("");
    await settle();
    assert.equal(sent("GET /api/season"), 2);
    crossingWindow(true);
    visitor(COACH, { season: null });
    api.reply("GET /api/season", 500, { error: { code: "INTERNAL" } });
    await renderSeasonRoute("");
    await settle();
    const alert = view.querySelector('[role="alert"]');
    assert.ok(alert);
    assert.match(alert.textContent, new RegExp(t("teamOverview.seasonFailed", { reason: "" }).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
    assert.equal(view.querySelector(".g-table"), null);
    crossingWindow(true);
    visitor(COACH, { season: SEASON });
    api.reply("GET /api/season", 500, { error: { code: "INTERNAL" } });
    await renderSeasonRoute("");
    await settle();
    assert.equal(view.querySelector('[role="alert"]'), null, "the table the page has stands; no failure is said over it");
    assert.ok(view.querySelector(".g-table"));
  } finally {
    leave();
  }
});

test("a table not read yet says it is on its way, not that it is empty", () => {
  const markup = leagueMarkup(leagueModel({ seasonData: null, seasonError: "", viewer: COACH, phone: true }));
  const fragment = mount(markup);
  assert.equal(fragment.querySelector(".g-league__loading").textContent, t("season.loading"));
  assert.equal(fragment.querySelector(".g-table__empty"), null);
  assert.equal(fragment.querySelector("h2#league-title").textContent, t("shell.league"));
});

test("crossing 900px draws the other form, the focus kept or on the title", async () => {
  try {
    const { cross } = await visit("");
    view.querySelector(".g-table__racetext").closest(".g-table__row").querySelector("a.g-table__link").focus();
    cross(false);
    assert.equal(view.querySelector("h1").textContent, "Season", "drawn again as a desk's");
    assert.equal(view.querySelectorAll('.g-table [role="columnheader"]').length, 11);
    assert.ok(view.querySelector(".g-season__row"));
    view.querySelector("a.g-table__race").focus();
    cross(true);
    assert.equal(view.querySelectorAll('.g-table [role="columnheader"]').length, 8);
    assert.equal(document.activeElement, view.querySelector("h1"), "the race's link went with the desk's form: the focus on the title");
    const team = view.querySelector(".g-league__pair a.g-league__team");
    team.focus();
    cross(true);
    assert.equal(document.activeElement, team, "a focus the form keeps stays");
  } finally {
    leave();
  }
});

test("leaving stops listening", async () => {
  try {
    const { cross, listeners } = await visit("");
    releaseCurrentScreen();
    assert.equal(listeners.size, 0);
    view.innerHTML = "<p>next</p>";
    cross(false);
    assert.equal(view.querySelector("p").textContent, "next");
  } finally {
    leave();
  }
});

test("names are text", () => {
  const hostile = {
    ...SEASON,
    season: { ...SEASON.season, name: HOSTILE },
    entries: ENTRIES.map((item) => ({ ...item, team: { ...item.team, name: HOSTILE } })),
    standings: SEASON.standings.map((item) => ({ ...item, team: { ...item.team, name: HOSTILE } })),
  };
  for (const phone of [true, false]) {
    const fragment = mount(leagueMarkup(leagueModel({ seasonData: hostile, viewer: COACH, phone })));
    assert.equal(fragment.querySelector("img"), null);
    assert.ok(fragment.textContent.includes(HOSTILE));
    assertCspSafe(fragment);
  }
});

test("styled", () => {
  for (const [phone, viewer] of [[true, COACH], [false, ADMIN], [true, null], [false, null]]) {
    const fragment = mount(leagueMarkup(leagueModel({ seasonData: SEASON, viewer, phone })));
    assertStyled(fragment, CSS, "src/screens/season/table.css", "page-head.css", "form-strip.css", "callout.css");
  }
  assertStyled(mount(leagueMarkup(leagueModel({ seasonData: null, seasonError: "offline", viewer: COACH, phone: true }))), CSS, "src/screens/season/table.css",
    "page-head.css", "callout.css");
  assertStyled(mount(roundsMarkup([], { viewerId: "", signedIn: false })), CSS);
  const styles = text("src/styles.css");
  assert.ok(styles.indexOf('@import url("screens/season/league.css");') > styles.indexOf('@import url("screens/season/table.css");'), "after the table's sheet");
});

test("every key in both dictionaries", () => {
  assertDictionaryCovers("src/screens/season/league.mjs", "src/screens/season/index.mjs");
  const [en, ru] = [dictionary("en"), dictionary("ru")];
  for (const status of ROUND_STATES) {
    assert.ok(en[`league.roundState.${status}`], `en ${status}`);
    assert.ok(ru[`league.roundState.${status}`], `ru ${status}`);
  }
  for (const gone of ["season.tab.standings", "season.tab.fixture"]) assert.equal(en[gone], undefined, gone);
});

test("up to 900px the league's, an opponent's and the matches' pages are white, as their prototypes: the 2.x view's wash is off for them alone", () => {
  assert.deepEqual(inMedia(CSS, "max-width: 900px", "#app-view:has(> .g-league, > .g-opp, > .g-matches)::after", "display"), ["none"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", "#app-view:has(> .g-league, > .g-opp, > .g-matches)::after", "display"), [], "a desk's page is the desk's grey");
  assert.match(text("src/styles/site-matchday.css"), /\.view::after \{[^}]*var\(--md-wash\)/, "the 2.x pages keep it until stage 13");
  // The matches' page is matches/index.mjs's .g-matches, a child of the view as the others are.
  assert.match(text("src/screens/matches/index.mjs"), /<div class="g-matches">/);
});

test("the table's rule at the card's head: balanced lines from the left, no word left alone at the right (DeskSeason.html)", () => {
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__rule", "text-align"), []);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__rule", "text-wrap"), ["balance"]);
});

test("the sizes: the season's row, its two columns, the calendar's targets (D2), nothing cut with «…»", () => {
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__table", "flex"), ["999 1 640px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__aside", "flex"), ["1 1 320px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__aside", "max-width"), ["420px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__inner", "min-width"), ["700px"]);
  assert.deepEqual(inMedia(CSS, "min-width: 901px", ".g-season__table", "overflow-x"), ["auto"]);
  const px = (values) => Number(String(values.at(-1)).replace("px", ""));
  assert.ok(px(inMedia(CSS, "max-width: 900px", ".g-league__team", "min-height")) >= 44);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-league__team", "min-height")) >= 24);
  assert.ok(px(inMedia(CSS, "min-width: 901px", ".g-league__admin", "min-height")) >= 24);
  assert.doesNotMatch(text(CSS), /ellipsis/);
  assert.deepEqual(valuesOf(CSS, ".g-league__team", "overflow-wrap"), ["anywhere"]);
  assert.deepEqual(valuesOf(CSS, ".g-league__pair--mine", "background"), ["var(--accent-tint)"]);
  for (const sheet of ["src/styles/season.css", "src/styles/responsive.css"]) assert.doesNotMatch(text(sheet), /season-table|season-withdrawn-label|fixture-headline|season-score-summary/, sheet);
});
