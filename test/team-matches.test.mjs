import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, inMedia, mediaText, valuesOf } from "./helpers/contrast.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { initLocale } from "../src/core/i18n.mjs";

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
globalThis.location = { hash: "#/t/t1/matches", replace() {} };
const { renderTeamMatches, matchesMarkup } = await import("../src/screens/matches/index.mjs");
const { MATCH_PHASES, matchesModel, phaseOf } = await import("../src/screens/matches/model.mjs");
const { gameUrl, playerTeamUrl, postMatchUrl, preMatchUrl, teamUrl } = await import("../src/core/routes.mjs");
const { invalidateGames } = await import("../src/data/games.mjs");
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { formatMoney } = await import("../src/core/format.mjs");
const { seasonTable } = await import("../src/data/season-table.mjs");
const { leagueTableMarkup, tablePointsText } = await import("../src/screens/season/table.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const CSS = "src/screens/matches/matches.css";

// The table: the rival first, the coach's three teams after it. Round 3 is on; rounds 1 and 2 are over.
/** A row of the server's standings, as `/api/season` sends it: the coach's own teams are u1's. */
const standingRow = (id, name, slug, user, rank, points) => ({
  entryId: `e-${id}`, withdrawnAt: null, user: { id: user, login: user }, team: { id, name, baseTeamSlug: slug }, rank, points, games: 2, byes: 0, touchdowns: 0, casualties: 0,
});
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3, createdAt: "2026-09-01T00:00:00Z" },
  standings: [
    standingRow("r1", "Rival Team", "teams/dwarf", "u-r1", 1, 6),
    standingRow("t1", "Ashgrove Wardens", "teams/human", "u1", 2, 3),
    standingRow("t2", "Grimtusk Raiders", "teams/orc", "u1", 3, 1),
    standingRow("t3", "Anji Magritta", "teams/human", "u1", 4, 0),
  ],
  rounds: [{ roundNumber: 1, status: "completed" }, { roundNumber: 2, status: "completed" }, { roundNumber: 3, status: "started" }],
};

// t1: two linemen and J. Corr, who misses the next match.
const PLAYERS = [
  { id: "p1", rowIndex: 0, number: "3", name: "Ashby" },
  { id: "p2", rowIndex: 0, number: "5", name: "Vane" },
  { id: "p3", rowIndex: 0, number: "9", name: "J. Corr", skipNextGame: true, absence: { code: "miss" } },
];
const TEAMS = [
  { id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "teams/human", stage: "active", revision: 4, roster: { treasury: 70, players: PLAYERS } },
  { id: "t2", name: "Grimtusk Raiders", baseTeamSlug: "teams/orc", stage: "active", revision: 7, roster: { treasury: 40 } },
  { id: "t3", name: "Anji Magritta", baseTeamSlug: "teams/human", stage: "active", revision: 2, roster: { treasury: 0 } },
  { id: "t4", name: "Loose Ends", baseTeamSlug: "teams/human", stage: "active", revision: 1, roster: { treasury: 0 } },
];

const side = (id, name, slug) => ({ user: { id: `u-${id}`, login: id }, team: { id, name, baseTeamSlug: slug } });
const OURS = { t1: side("t1", "Ashgrove Wardens", "teams/human"), t2: side("t2", "Grimtusk Raiders", "teams/orc"), t3: side("t3", "Anji Magritta", "teams/human"), t4: side("t4", "Loose Ends", "teams/human") };
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
const TOMB = side("r4", "Tombway Kings", "teams/orc");
const MIRE = side("r5", "Mirefen Rotters", "teams/skaven");
const GRIM = side("r6", "Grimtusk Others", "teams/orc");
const GAMES = [
  played("g4", 1, [2, 1], [1, 0], { away: TOMB, homeMvps: [{ id: "p5", name: "Linewoman Five" }] }),
  played("g5", 2, [2, 0], [2, 0], { home: MIRE, away: OURS.t1 }),
  played("g6", 0, [1, 1], [0, 0], { kind: "friendly", season: null, roundStatus: null, away: GRIM, confirmedAt: "2026-10-05T10:00:00Z" }),
  game("g1"),
  game("g2", { home: OURS.t2, away: side("r2", "Rival Raiders", "teams/skaven"), preparationStatus: "in_progress" }),
  game("g3", {
    home: OURS.t3, away: side("r3", "Rival Wardens", "teams/lizardmen"), resultStatus: "awaiting_confirmation", viewerIsProposer: false,
    proposedHomeTouchdowns: 2, proposedAwayTouchdowns: 1, proposedHomeCasualties: 1, proposedAwayCasualties: 0,
  }),
];
/** The games with some of them changed, by id. */
const gamesWith = (changes, games = GAMES) => games.map((item) => (changes[item.id] ? { ...item, ...changes[item.id] } : item));

/** A rival's team as his public page has it: `count` players of the race's first position, the `out`th missing the match. */
const rivalTeam = (id, slug, count, out = -1) => ({ id, name: `Rival ${id}`, baseTeamSlug: slug, revision: 1, roster: { treasury: 40,
  players: Array.from({ length: count }, (_, at) => ({ id: `${id}-${at}`, rowIndex: 0, number: String(at + 1), name: `${id} ${at + 1}`, ...(at === out ? { skipNextGame: true, absence: { code: "miss" } } : {}) })) } });
// The rival of t1's g1: seven Dwarf Blocker Linemen, one of them out.
const RIVAL_TEAM = rivalTeam("r1", "teams/dwarf", 7, 2);
const RIVAL_PAGES = { "u-r1/teams/r1": RIVAL_TEAM, "u-r2/teams/r2": rivalTeam("r2", "teams/skaven", 7), "u-r3/teams/r3": rivalTeam("r3", "teams/lizardmen", 7),
  "u-r6/teams/r6": rivalTeam("r6", "teams/orc", 7) };
const RIVAL_PAGE = "GET /api/players/u-r1/teams/r1";

/** The phone's media query, which the test answers and changes. */
function crossingWindow(phone = true) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return { listeners, cross: (next) => { media.matches = next; listeners.forEach((listener) => listener()); } };
}

/** A coach signed in on a page that has read the list and the table; the games answer the visit's own read. */
function coach({ games = GAMES, season = SEASON, active = "t1" } = {}) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  rememberSessionToken("tok");
  releaseCurrentScreen();
  if (!appView.parentNode) document.body.appendChild(appView);
  view.innerHTML = "";
  state.auth.currentUser = { id: "u1", login: "coach", preferences: { activeTeamId: active } };
  state.myTeams = { items: TEAMS, loaded: true, loading: false, error: "" };
  state.activeTeamId = active;
  state.data = data;
  state.season = { data: season, loaded: true, loading: false, error: "" };
  state.games = { items: games, currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  for (const { id, revision } of TEAMS) api.reply(`GET /api/teams/${id}/events`, 200, { events: [], revision });
  for (const [page, team] of Object.entries(RIVAL_PAGES)) api.reply(`GET /api/players/${page}`, 200, { user: { id: page.split("/")[0], login: team.id }, team });
}

/** The page of `teamId`, on a phone unless told otherwise, every read answered. */
async function visit(teamId = "t1", { phone = true, games = GAMES, season = SEASON, before } = {}) {
  const { cross } = crossingWindow(phone);
  coach({ games, season, active: teamId });
  before?.();
  await renderTeamMatches(teamId);
  await settle();
  await settle();
  return cross;
}

/** The server answering the list again. */
async function notifyGames(games) {
  api.reply("GET /api/games", 200, { games, currentGames: [] });
  await invalidateGames();
}

const sent = (key) => api.calls.filter((call) => call.key === key).length;
const card = () => view.querySelector('article[aria-labelledby="matches-current"]');
const beforeSheet = () => document.querySelector('[data-sheet-host="match-before"] dialog#match-before');
const words = (selector, root = view) => root.querySelectorAll(selector).map((node) => node.textContent);
const raceTitle = (slug) => data.teams.find((race) => race.slug === slug).title;
/** What the model says of a team, as the screen would hand it the state. */
const modelOf = (teamId, over = {}) => matchesModel({ team: TEAMS.find((item) => item.id === teamId), seasonData: SEASON, games: GAMES, data, phone: true, ...over });

function leave() {
  releaseCurrentScreen();
  delete globalThis.matchMedia;
}

test("a phone's next match: its card, the CTVs, the inducements and who misses it, «Match preparation»", async () => {
  try {
    await visit();
    assert.equal(view.querySelector("h1").textContent, "Matches");
    assert.equal(view.querySelector("h2#matches-current").textContent, "Next match");
    assert.equal(view.querySelector(".g-matches__head .g-status"), null, "no chip for a match not begun (the prototype's notIdle)");
    const article = card();
    assert.ok(article, "the card is named by the section's heading");
    assert.equal(article.querySelector(".g-match__head"), null);
    assert.match(article.querySelector(".g-match__meta").textContent, /Round 3 · home/);
    assert.deepEqual(words(".g-match__name", article), ["Ashgrove Wardens", "Rival Team"]);
    assert.equal(article.querySelector("a.g-match__name").getAttribute("href"), playerTeamUrl("u-r1", "r1"), "the opponent leads to his team");
    assert.deepEqual(words(".g-match__sub", article), [`${raceTitle("teams/human")} · #2`, `${raceTitle("teams/dwarf")} · #1`]);
    assert.equal(article.querySelector(".g-match__mid").textContent, "vs");
    assert.equal(article.querySelectorAll(".g-matches__tile").length, 2);
    // Ours: two linemen in the lineup (J. Corr is out), 100k; theirs: six Dwarf Blocker Linemen in it. We get the difference.
    const [ctv, ind] = article.querySelectorAll(".g-matches__tile");
    assert.equal(ctv.querySelector(".g-matches__tilek").textContent, "CTV");
    assert.match(ctv.querySelector(".g-matches__tilev").textContent, new RegExp(`^${formatMoney(100)} / \\d`));
    assert.equal(ind.tagName, "BUTTON");
    assert.ok(ind.classList.contains("g-matches__tile--gets"));
    assert.match(ind.querySelector(".g-matches__tilek").textContent, /^Inducements · we get them$/);
    assert.match(ind.querySelector(".g-matches__tilev").textContent, /^\+\d/);
    assert.equal(article.querySelector(".g-matches__miss").textContent, "Out: J. Corr · Seriously Hurt");
    assert.equal(article.querySelector(".g-btn--primary, .g-matches__cta").getAttribute("href"), preMatchUrl("g1"));
    assert.equal(article.querySelector(".g-matches__cta").textContent, "Match preparation");
    assert.equal(view.querySelector(".g-matches__friendlies").getAttribute("href"), teamUrl("t1", "challenges"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("an opponent's team that answers for a match no longer on is dropped: the match on keeps its own opponent", async () => {
  let gate;
  try {
    await visit("t1", { before: () => { gate = api.hold(RIVAL_PAGE); } });
    assert.equal(sent(RIVAL_PAGE), 1, "g1's opponent is asked for");
    // Meanwhile g1 is gone from the list and g9, against r2, is the match on; r2's team answers at once.
    const next = game("g9", { away: side("r2", "Rival Raiders", "teams/skaven") });
    await notifyGames([...GAMES.filter((item) => item.id !== "g1"), next]);
    await settle();
    await settle();
    const tile = () => card().querySelector(".g-matches__tile .g-matches__tilev").textContent;
    assert.match(tile(), /^\d/, "g9's CTVs, from r2's team");
    // r1's answer comes late: it is not taken for g9's (band.mjs `readRival`, the batch B concern).
    gate.release();
    await settle();
    await settle();
    assert.match(tile(), /^\d/, "still g9's: the late answer was dropped");
  } finally {
    leave();
  }
});

test("the inducement tile and the line of who misses it open «Before the match»", async () => {
  try {
    await visit();
    fireEvent(view.querySelector(".g-matches__tile--ind"), "click");
    assert.ok(beforeSheet()?.open);
    assert.equal(beforeSheet().querySelector(".g-sheet__title").textContent, "Before the match · Round\u00a03");
    fireEvent(beforeSheet(), "keydown", { key: "Escape" });
    assert.equal(beforeSheet(), null);
    fireEvent(view.querySelector(".g-matches__miss"), "click");
    assert.ok(beforeSheet()?.open, "the line opens it too");
  } finally {
    leave();
  }
});

/** Eight taps of the match on, two touchdowns and three casualties among them, and one settled before. */
const TAPS = [
  ...Array.from({ length: 6 }, (_, at) => ({ id: `e${at}`, pairingId: "g2", playerId: "x", counter: at < 2 ? "touchdowns" : "completions", delta: 1, injury: null, settledAt: null })),
  ...Array.from({ length: 2 }, (_, at) => ({ id: `c${at}`, pairingId: "g2", playerId: "x", counter: "casualties", delta: at ? 2 : 1, injury: null, settledAt: null })),
  { id: "old", pairingId: "g0", playerId: "x", counter: "touchdowns", delta: 1, injury: null, settledAt: "2026-10-01T10:00:00Z" },
];

test("in play: the records with their count and sums lead to the roster, and «Post-match» to its first step", async () => {
  try {
    await visit("t2", { before: () => api.reply("GET /api/teams/t2/events", 200, { events: TAPS, revision: 7 }) });
    assert.equal(view.querySelector("h2#matches-current").textContent, "Current match");
    assert.equal(view.querySelector(".g-matches__head .g-status--live").textContent, "In play");
    assert.ok(card().classList.contains("g-match--live"), "ringed in the accent");
    const records = card().querySelector("a.g-matches__records");
    assert.equal(records.querySelector(".g-matches__recordstitle").textContent, "Match records · 8");
    assert.equal(records.querySelector(".g-matches__recordssub").textContent, "TD 2 · CAS 3 · taps on the «Roster»");
    assert.equal(records.getAttribute("href"), teamUrl("t2", "roster"));
    assert.match(card().querySelector(".g-matches__note").textContent, /^After the game both coaches/);
    const post = card().querySelector(".g-matches__cta--dark");
    assert.equal(post.textContent, "Post-match");
    assert.equal(post.getAttribute("href"), postMatchUrl("g2"));
    assert.equal(card().querySelectorAll(".g-matches__tile").length, 2, "the tiles stay in play (MatchesLive.html)");
    assert.equal(card().querySelector(".g-matches__miss"), null);
    assert.equal(view.querySelector(".g-matches__friendlies"), null, "no friendlies during a match");
    assert.equal(sent("GET /api/teams/t2/events"), 1);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("a match whose post-match is open says so; one being prepared says so; the phases are the card's", () => {
  const post = gamesWith({ g2: { postMatchStatus: "draft" } });
  assert.equal(modelOf("t2", { games: post }).current.phase, "post");
  assert.equal(modelOf("t2").current.phase, "live");
  for (const status of ["preparing", "ready"]) assert.equal(modelOf("t1", { games: gamesWith({ g1: { preparationStatus: status } }) }).current.phase, "preparing");
  assert.equal(modelOf("t1").current.phase, "idle");
  assert.equal(modelOf("t3").current.phase, "sent");
  assert.equal(phaseOf({ game: GAMES[3], phase: "idle" }), "idle");
  const preparing = matchesMarkup(modelOf("t1", { games: gamesWith({ g1: { preparationStatus: "preparing" } }) }));
  assert.match(preparing, /g-status g-status--wait">Preparation</);
  assert.match(preparing, /g-matches__cta" href="#\/games\/g1\/pre-match">Match preparation/);
  const posted = matchesMarkup(modelOf("t2", { games: post }));
  assert.match(posted, /g-status g-status--wait">Post-match</);
  assert.match(posted, /g-match g-match--live/);
});

test("records not read: the block has no count and says why", async () => {
  try {
    await visit("t2", { before: () => api.reply("GET /api/teams/t2/events", 500, { error: { code: "SERVER_ERROR", message: "Boom" } }) });
    const records = card().querySelector(".g-matches__records");
    assert.equal(records.querySelector(".g-matches__recordstitle").textContent, "Match records");
    assert.match(records.querySelector(".g-matches__recordssub").textContent, /^Records not read: /);
  } finally {
    leave();
  }
});

test("a score sent: the line, and who confirms it; sent by the opponent, «Confirm the score»", async () => {
  try {
    await visit("t3");
    assert.equal(view.querySelector("h2#matches-current").textContent, "Last match");
    assert.equal(view.querySelector(".g-matches__head .g-status--wait").textContent, "Awaiting confirmation");
    assert.equal(card().querySelector(".g-match__mid--score").textContent, "2 : 1");
    assert.equal(card().querySelector(".g-matches__sentline").textContent, "Win 2–1 · CAS 1–0");
    assert.equal(card().querySelector(".g-matches__sentnote"), null, "the coach is the one to confirm it");
    const confirm = card().querySelector(".g-matches__cta");
    assert.equal(confirm.textContent, "Confirm the score");
    assert.equal(confirm.getAttribute("href"), gameUrl("g3"));
    assert.equal(card().querySelector(".g-matches__tile"), null, "no tiles once a score is sent");
    assert.equal(view.querySelector(".g-matches__friendlies"), null);
  } finally {
    leave();
  }
  const own = matchesMarkup(modelOf("t3", { games: gamesWith({ g3: { viewerIsProposer: true } }) }));
  assert.match(own, /g-matches__sentnote">Rival Wardens confirms the result</);
  assert.doesNotMatch(own, /Confirm the score/);
});

test("a friendly: the note, the tiles too", async () => {
  const friendly = game("g7", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, away: GRIM });
  try {
    await visit("t1", { games: [...GAMES.filter((item) => item.id !== "g1"), friendly] });
    assert.equal(view.querySelector("h2#matches-current").textContent, "Friendly match");
    assert.equal(card().querySelector(".g-match__meta").textContent, "Friendly · off the table");
    assert.equal(card().querySelector(".g-matches__friendly").textContent, "Does not count in the league table. SPP, injuries and the treasury count as usual.");
    assert.equal(card().querySelectorAll(".g-matches__tile").length, 2, "a friendly's preparation has inducements too (decision 4)");
    assert.ok(card().querySelector(".g-matches__tile--ind[data-before-open]"));
    assert.equal(card().querySelector(".g-matches__cta").getAttribute("href"), preMatchUrl("g7"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("no opponent yet: «Opponent — after round 3», no tiles", async () => {
  const settled = gamesWith({ g1: { resultStatus: "confirmed", homeTouchdowns: 1, awayTouchdowns: 0, homeCasualties: 0, awayCasualties: 0, confirmedAt: "2026-10-06T10:00:00Z" } });
  try {
    await visit("t1", { games: settled });
    assert.equal(card(), null, "no card: no match on");
    assert.equal(view.querySelector(".g-matches__tile"), null);
    assert.equal(view.querySelector("h2#matches-current"), null, "the round's match is played: nothing waits in its place");
    const later = view.querySelectorAll(".g-matches__later");
    assert.deepEqual(words(".g-matches__round", later.at(-1)), ["Round\u00a04"]);
    assert.equal(later.at(-1).querySelector(".g-matches__next").textContent, "Opponent — after round 3");
    assert.equal(later.at(-1).querySelector(".g-matches__line").textContent, "Swiss: paired by points once every result of the round is in");
    assert.equal(later.at(-1).tagName, "DIV", "nothing to open");
    assert.ok(view.querySelector(".g-matches__friendlies"), "with no match on, the friendlies");
    assert.equal(sent(RIVAL_PAGE), 0, "no opponent to read");
  } finally {
    leave();
  }
  // A team in the table with no match of the round on at all (a bye, a late entry): its place says so.
  const none = matchesMarkup(modelOf("t1", { games: GAMES.filter((item) => item.id !== "g1") }));
  assert.match(none, /id="matches-current">Next match<\/h2><\/div><p class="g-matches__none">The team has no match of this round yet</);
});

test("the opponent could not be read: the inducement tile is closed and says why, the rest is drawn", async () => {
  try {
    await visit("t1", { before: () => api.reply(RIVAL_PAGE, 404, { error: { code: "TEAM_NOT_FOUND", message: "No such team" } }) });
    const tile = card().querySelector(".g-matches__tile--ind");
    assert.equal(tile.getAttribute("aria-disabled"), "true");
    assert.equal(tile.hasAttribute("data-before-open"), false);
    assert.match(tile.querySelector(".g-matches__tilewhy").textContent, /^The opponent's team could not be read: /);
    assert.equal(words(".g-matches__tilev", card())[0], "– / –", "no half figures");
    fireEvent(tile, "click");
    assert.equal(beforeSheet(), null, "pressed, it opens nothing");
    await new Promise((resolve) => { setTimeout(resolve, 5); });
    assert.match(document.querySelector('[role="status"]')?.textContent ?? "", /could not be read/, "it says why");
    assert.equal(card().querySelector(".g-matches__miss"), null);
    assert.equal(card().querySelector(".g-matches__cta").getAttribute("href"), preMatchUrl("g1"), "«Match preparation» stays");
    assert.equal(view.querySelector('[role="alert"]'), null);
  } finally {
    leave();
  }
});

test("the results: every finished match, newest first, the record in its head", async () => {
  try {
    await visit();
    const results = view.querySelector('section[aria-labelledby="matches-results"]');
    assert.equal(results.querySelector("h2").textContent, "Results");
    assert.equal(results.querySelector(".g-matches__record").textContent, "W · D · L: 1 · 0 · 1");
    assert.deepEqual(words(".g-matches__opponent", results), ["Grimtusk Others", "Mirefen Rotters", "Tombway Kings"]);
    const rows = results.querySelectorAll(".g-matches__row");
    // A row opens the match, as the overview's rows do (spec §3; the fix wave's parked 8).
    assert.deepEqual(rows.map((row) => row.getAttribute("href")), [gameUrl("g6"), gameUrl("g5"), gameUrl("g4")]);
    // A friendly's square says how it ended, as Matches.html's (G2): the 1–1 is a draw.
    assert.deepEqual(rows.map((row) => row.querySelector(".g-result").getAttribute("class")), ["g-result g-result--d", "g-result g-result--l", "g-result g-result--w"]);
    assert.deepEqual(words(".g-matches__score", results), ["1–1", "0–2", "2–1"]);
    assert.deepEqual(words(".g-matches__line", rows[2]), [`Round\u00a01 · ${raceTitle("teams/orc")} · CAS 1–0`, "MVP: Linewoman Five"]);
    assert.deepEqual(words(".g-matches__line", rows[0]), [`Friendly · ${raceTitle("teams/orc")} · CAS 0–0`], "no MVP: none picked");
    assert.equal(rows[2].querySelector("a"), null, "the row is one link: the race is text (pre-flight L14)");
  } finally {
    leave();
  }
  assert.match(matchesMarkup(modelOf("t2")), /g-matches__empty">No matches played yet</);
});

test("a score sent is the first result: its outcome on the waiting tint, «awaiting confirmation» in its line, the score proposed, the row to the match", async () => {
  try {
    await visit("t3");
    const results = view.querySelector('section[aria-labelledby="matches-results"]');
    const first = results.querySelector(".g-matches__item");
    const pill = first.querySelector(".g-matches__pill--sent");
    assert.ok(pill, "the waiting tint");
    assert.equal(pill.querySelector('[aria-hidden="true"]').textContent, "W", "won 2–1 by the score proposed, from t3's side");
    assert.equal(pill.querySelector(".g-sr-only").textContent, `${t("ui.result.wName")} · ${t("matches.sentResult")}`);
    assert.equal(first.querySelector(".g-result--w"), null, "not the colour of a win confirmed");
    assert.equal(first.querySelector(".g-matches__opponent").textContent, "Rival Wardens");
    assert.deepEqual(words(".g-matches__line", first), ["Round\u00a03 · awaiting confirmation · CAS 1–0"], "no MVP");
    assert.equal(first.querySelector(".g-matches__score").textContent, "2–1");
    assert.equal(first.querySelector("a.g-matches__row").getAttribute("href"), gameUrl("g3"));
    assert.equal(results.querySelectorAll(".g-matches__item").length, 1, "nothing else played yet");
    assert.equal(results.querySelector(".g-matches__empty"), null);
  } finally {
    leave();
  }
  const [sentRow] = modelOf("t3").results;
  assert.deepEqual({ ...sentRow }, { gameId: "g3", result: "w", sent: true, opponent: "Rival Wardens", href: gameUrl("g3"),
    line: "Round\u00a03 · awaiting confirmation · CAS 1–0", mvp: "", score: "2–1" });
  assert.ok(modelOf("t1").results.every((row) => row.sent === false));
});

test("a score sent from the other side reads from the team's own: the opponent's 2–1 at home is our loss 1–2", () => {
  const away = gamesWith({ g3: { home: side("r3", "Rival Wardens", "teams/lizardmen"), away: OURS.t3, proposedHomeCasualties: 0, proposedAwayCasualties: 2 } });
  const [row] = modelOf("t3", { games: away }).results;
  assert.deepEqual([row.result, row.score, row.line], ["l", "1–2", "Round\u00a03 · awaiting confirmation · CAS 2–0"]);
});

test("every score sent leads the results, not only the card's: a friendly's waits beside a league match on", () => {
  const friendly = game("g8", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, home: OURS.t1, away: GRIM, resultStatus: "awaiting_confirmation",
    proposedHomeTouchdowns: 1, proposedAwayTouchdowns: 1, proposedHomeCasualties: 0, proposedAwayCasualties: 0 });
  const rows = modelOf("t1", { games: [...GAMES, friendly] }).results;
  assert.equal(modelOf("t1", { games: [...GAMES, friendly] }).current.gameId, "g1", "the card is the league's match");
  assert.deepEqual([rows[0].gameId, rows[0].sent, rows[0].result, rows[0].line], ["g8", true, "d", "Friendly · awaiting confirmation · CAS 0–0"]);
  assert.deepEqual(rows.slice(1).map((row) => row.gameId), ["g6", "g5", "g4"]);
  const { others } = modelOf("t1", { games: [...GAMES, friendly] });
  assert.ok(!others.some((row) => row.key === "g8"), "said once: the results have it, «Later in the season» does not (final review m-7)");
  const desk = modelOf("t1", { games: [...GAMES, friendly], phone: false });
  assert.ok(desk.calendar.some((row) => row.key === "g8"), "a desk's calendar, which has no results list, keeps it");
});

test("a score not sent adds no row", async () => {
  try {
    await visit("t1");
    const results = view.querySelector('section[aria-labelledby="matches-results"]');
    assert.equal(results.querySelectorAll(".g-matches__item").length, 3, "the three finished matches");
    assert.equal(results.querySelector(".g-matches__pill--sent"), null);
  } finally {
    leave();
  }
});

test("later in the season: the team's other open matches first, then the next round", async () => {
  const friendly = game("g7", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, away: GRIM, preparationStatus: "preparing" });
  try {
    await visit("t1", { games: [...GAMES, friendly] });
    assert.equal(card().querySelector(".g-match__meta").textContent, "Round 3 · home", "the league's match is on the card");
    const rows = view.querySelectorAll(".g-matches__later");
    assert.equal(rows.length, 2);
    assert.equal(rows[0].querySelector(".g-matches__next").textContent, "Friendly · Grimtusk Others");
    assert.equal(rows[0].querySelector(".g-matches__line").textContent, "Preparation");
    assert.equal(rows[0].getAttribute("href"), preMatchUrl("g7"));
    assert.equal(rows[1].querySelector(".g-matches__round").textContent, "Round\u00a04");
  } finally {
    leave();
  }
});

test("a team not in the table: the call to enter the season, the friendlies, their results — and the current friendly's card (L9)", async () => {
  const friendly = game("g8", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, home: OURS.t4, away: GRIM, preparationStatus: "in_progress" });
  const done = played("g9", 0, [0, 1], [1, 1], { kind: "friendly", season: null, roundStatus: null, home: OURS.t4, away: GRIM, confirmedAt: "2026-10-04T10:00:00Z" });
  try {
    await visit("t4", { games: [...GAMES, done, friendly] });
    assert.equal(view.querySelector("h2#matches-current").textContent, "Current match");
    assert.ok(card().querySelector(".g-matches__records"), "the records and the post-match of a friendly in the off-season");
    assert.equal(card().querySelector(".g-matches__cta--dark").getAttribute("href"), postMatchUrl("g8"));
    const call = view.querySelector("a.g-callout");
    assert.equal(call.querySelector(".g-callout__title").textContent, "Not entered in the season");
    const blocks = view.querySelector(".g-matches").childNodes.map((node) => node.getAttribute("class"));
    assert.ok(blocks.indexOf("g-callout") > blocks.indexOf("g-matches__current"), "under the card");
    assert.equal(view.querySelector(".g-matches__record"), null, "no league record outside the table");
    assert.deepEqual(words(".g-matches__opponent"), ["Grimtusk Others"]);
    assert.equal(view.querySelector(".g-matches__later"), null, "no round to come");
  } finally {
    leave();
  }
  // Nothing on: the call, the friendlies, the results.
  const quiet = matchesMarkup(modelOf("t4", { games: [...GAMES, done] }));
  assert.match(quiet, /Not entered in the season[\s\S]*g-matches__friendlies[\s\S]*Results/);
  // A friendly settled before the season began is still one of its results (the final review, m-8): the season's cut is
  // for a team in its table.
  const before = played("g10", 0, [2, 0], [0, 0], { kind: "friendly", season: null, roundStatus: null, home: OURS.t4, away: TOMB, confirmedAt: "2026-08-20T10:00:00Z" });
  const model = modelOf("t4", { games: [...GAMES, done, before] });
  assert.deepEqual(model.results.map((row) => row.gameId), ["g9", "g10"]);
  assert.deepEqual(model.calendar.map((row) => row.key), ["g10", "g9"], "and of its calendar");
  assert.deepEqual(modelOf("t1", { games: [...GAMES, played("g11", 0, [2, 0], [0, 0], { kind: "friendly", season: null, roundStatus: null, away: TOMB, confirmedAt: "2026-08-20T10:00:00Z" })] })
    .results.map((row) => row.gameId), ["g6", "g5", "g4"], "a team in the table keeps the season's cut");
});

test("the games are read afresh on the way in and when the tab is seen again", async () => {
  const events = new EventTarget();
  Object.assign(document, { addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events), visibilityState: "visible" });
  try {
    await visit();
    assert.equal(sent("GET /api/games"), 1, "on entry, though the page had the games");
    document.visibilityState = "hidden";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/games"), 1, "a tab put away reads nothing");
    document.visibilityState = "visible";
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/games"), 2);
    leave();
    events.dispatchEvent(new Event("visibilitychange"));
    await settle();
    assert.equal(sent("GET /api/games"), 2, "a page left reads nothing");
  } finally {
    leave();
    for (const name of ["addEventListener", "removeEventListener", "visibilityState"]) delete document[name];
  }
});

test("the page follows the games: a match begun turns the card, the records read then", async () => {
  try {
    await visit();
    assert.equal(sent("GET /api/teams/t1/events"), 0, "no records to read before the match");
    await notifyGames(gamesWith({ g1: { preparationStatus: "in_progress" } }));
    await settle();
    await settle();
    assert.equal(view.querySelector("h2#matches-current").textContent, "Current match");
    assert.equal(sent("GET /api/teams/t1/events"), 1);
    assert.equal(card().querySelector(".g-matches__recordstitle").textContent, "Match records · 0");
  } finally {
    leave();
  }
});

test("one form for each width: crossing 900px draws the other, the focus kept or on the title", async () => {
  try {
    const cross = await visit();
    view.querySelector(".g-matches__tile--ind").focus();
    cross(false);
    assert.equal(view.querySelector("h1").textContent, "Season", "drawn again as a desk's");
    assert.ok(view.querySelector('[role="tablist"]'));
    assert.equal(view.querySelector(".g-matches__tile"), null);
    assert.equal(document.activeElement, view.querySelector("h1"), "the tile went with the phone's form: the focus on the title");
    view.querySelector(".g-matches__calfriendlies").focus();
    cross(true);
    assert.equal(view.querySelector("h1").textContent, "Matches");
    assert.equal(document.activeElement, view.querySelector("h1"));
    view.querySelector(".g-matches__friendlies").focus();
    const friendlies = document.activeElement;
    cross(true);
    assert.equal(document.activeElement, friendlies, "a focus the form keeps stays");
  } finally {
    leave();
  }
});

test("leaving closes the sheet and stops listening", async () => {
  try {
    await visit();
    fireEvent(view.querySelector(".g-matches__tile--ind"), "click");
    assert.ok(beforeSheet()?.open);
    releaseCurrentScreen();
    assert.equal(document.querySelector('[data-sheet-host="match-before"]'), null);
    view.innerHTML = "<p>next</p>";
    await notifyGames(GAMES);
    await settle();
    assert.equal(view.querySelector("p").textContent, "next");
  } finally {
    leave();
  }
});

test("it draws at once from what the page has and takes the title for the focus; a team gone from the list leaves the screen", async () => {
  try {
    crossingWindow(true);
    coach();
    const hold = api.hold("GET /api/games");
    const drawing = renderTeamMatches("t1");
    assert.equal(document.activeElement, view.querySelector("h1"));
    assert.ok(card(), "the games the page had");
    hold.release();
    await drawing;
    assert.equal(document.activeElement, view.querySelector("h1"), "not taken again");
    releaseCurrentScreen();
    coach({ games: [] });
    state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
    const unread = renderTeamMatches("t1");
    assert.equal(view.querySelector(".g-matches__section"), null, "no results the games could contradict");
    await unread;
  } finally {
    leave();
  }
});

test("a read that failed is said where the card would stand", () => {
  const markup = matchesMarkup(matchesModel({ team: TEAMS[0], seasonData: null, seasonError: "No connection", games: GAMES, gamesError: "No connection", data, phone: true }));
  assert.match(markup, /role="alert"/);
  assert.match(markup, /The league table did not load: No connection/);
  assert.match(markup, /The matches did not load: No connection/);
  assert.doesNotMatch(markup, /matches-current/);
});

test("names are text", () => {
  const hostileSide = side("rx", HOSTILE, "teams/orc");
  const games = [
    game("gh", { away: hostileSide }),
    played("gp", 1, [1, 0], [0, 0], { away: hostileSide, homeMvps: [{ id: "m", name: HOSTILE }] }),
  ];
  const team = { ...TEAMS[0], name: HOSTILE };
  const markup = matchesMarkup(matchesModel({ team, seasonData: SEASON, games, data, phone: true }));
  const fragment = mountHere(markup);
  assert.equal(fragment.querySelector("img"), null);
  assert.deepEqual(words(".g-match__name", fragment), [HOSTILE, HOSTILE]);
  assert.equal(fragment.querySelector(".g-matches__opponent").textContent, HOSTILE);
  assert.match(words(".g-matches__line", fragment).join(" "), /MVP: <img/);
  assertCspSafe(fragment);
});

/** Markup parsed into a detached node, as a page would hold it. */
function mountHere(markup) {
  const holder = el(document, "div");
  holder.innerHTML = markup;
  return holder;
}

test("every key in both dictionaries; the phases' words for every phase", () => {
  assertDictionaryCovers("src/screens/matches/index.mjs", "src/screens/matches/model.mjs", "src/screens/matches/card.mjs", "src/screens/matches/lists.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const phase of MATCH_PHASES) assert.ok(words[`matches.status.${phase}`], `${locale} matches.status.${phase}`);
    for (const head of ["next", "friendly", "live", "sent"]) assert.ok(words[`matches.head.${head}`], `${locale} matches.head.${head}`);
  }
  assert.deepEqual([...MATCH_PHASES], ["idle", "preparing", "live", "post", "sent"]);
  assert.ok(Object.isFrozen(MATCH_PHASES));
  initLocale("ru");
  try {
    const markup = matchesMarkup(modelOf("t1"));
    assert.match(markup, /Следующий матч/);
    assert.match(markup, /Дальше в сезоне/);
    assert.doesNotMatch(markup, /индусмент/i);
  } finally {
    initLocale("en");
  }
});

test("styled as Matches.html draws it; readable; D2 up to 900px; nothing cut with «…»", () => {
  const sheets = [CSS, "src/ui/match-card.css", "src/screens/matches/before.css", "status-chip.css", "result-pill.css", "callout.css", "page-head.css"];
  const live = gamesWith({ g2: { preparationStatus: "in_progress" } });
  for (const model of [modelOf("t1"), modelOf("t2", { games: live, records: { events: TAPS } }), modelOf("t3"), modelOf("t4"), modelOf("t1", { opponent: { error: "x" } })]) {
    assertStyled(mountHere(matchesMarkup(model)), ...sheets);
  }
  const own = (selector, property) => valuesOf(CSS, selector, property);
  // Matches.html's values.
  assert.deepEqual(own(".g-matches", "gap"), ["var(--space-22)"]);
  assert.deepEqual(own(".g-matches__title", "font"), ["700 26px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-matches__tile", "border-radius"), ["var(--radius-lg)"]);
  assert.deepEqual(own(".g-matches__tile", "padding"), ["var(--space-10) var(--space-12)"]);
  assert.deepEqual(own(".g-matches__tile", "background"), ["var(--surface-2)"]);
  assert.deepEqual(own(".g-matches__tilev", "font"), ["700 17px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-matches__records", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(own(".g-matches__recordstitle", "font"), ["700 16px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-matches__cta", "font"), ["700 17px/1.2 var(--font-body)"]);
  assert.deepEqual(own(".g-matches__cta--dark", "background"), ["var(--header)"]);
  assert.deepEqual(own(".g-matches__sent", "background"), ["var(--warn-tint)"]);
  assert.deepEqual(own(".g-matches__friendlies", "box-shadow"), ["inset 0 0 0 1.5px var(--accent)"]);
  assert.deepEqual(own(".g-matches__friendlies", "border-radius"), ["var(--radius-xl)"]);
  assert.deepEqual(own(".g-matches__row", "grid-template-columns"), ["30px minmax(0, 1fr) auto"]);
  assert.deepEqual(own(".g-matches__row", "border-bottom"), ["1px solid var(--line)"]);
  assert.deepEqual(own(".g-matches__later", "grid-template-columns"), ["56px minmax(0, 1fr)"]);
  assert.deepEqual(own(".g-matches__score", "font"), ["700 26px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-matches__record", "font"), ["600 15px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-matches .g-match__mid", "color"), ["var(--muted)"], "«vs» in the page's grey, not the faint one (3.1:1)");
  // Readable in every palette.
  assertReadable(CSS, ".g-matches__tile--gets", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-matches__tile--pays", "color", ["--danger-tint"], 4.5);
  assertReadable(CSS, ".g-matches__tile--even", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-matches__tilek", "color", ["--surface-2"], 4.5);
  assertReadable(CSS, ".g-matches__records", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-matches__sent", "color", ["--warn-tint"], 4.5);
  assertReadable(CSS, ".g-matches__pill--sent", "color", ["--warn-tint"], 4.5);
  assert.deepEqual(own(".g-matches__pill--sent", "background"), ["var(--warn-tint)"]);
  assertReadable(CSS, ".g-matches__cta", "color", ["--accent"], 4.5);
  assertReadable(CSS, ".g-matches__cta--dark", "color", ["--header"], 4.5);
  assertReadable(CSS, ".g-matches__friendlies", "color", ["--surface", "--page"], 4.5);
  assertReadable(CSS, ".g-matches__missicon", "color", ["--surface"], 3);
  assertReadable(CSS, ".g-matches__line", "color", ["--surface", "--page"], 4.5);
  assertReadable(CSS, ".g-matches__next", "color", ["--surface", "--page"], 4.5);
  // D2: every target a thumb's up to 900px — the card's controls, the rows, the opponent's name.
  const px = (value) => ({ "var(--size-touch)": 44, "var(--size-cta)": 52 })[value] ?? parseInt(value, 10);
  for (const selector of [".g-matches__tile", ".g-matches__miss", ".g-matches__cta", ".g-matches__records", ".g-matches__friendlies", ".g-matches__row", ".g-matches__later", ".g-matches a.g-match__name"]) {
    const [height] = own(selector, "min-height");
    assert.ok(px(height) >= 44, `${selector} ${height}`);
  }
  // Wrapping: the long lines wrap; nothing is cut or held on one line.
  const bare = text(CSS).replace(/\/\*[\s\S]*?\*\//g, "");
  assert.doesNotMatch(bare, /ellipsis|text-overflow|nowrap|line-clamp/);
  for (const selector of [".g-matches__opponent", ".g-matches__line", ".g-matches__next", ".g-matches__title", ".g-matches__misstext", ".g-matches__tilewhy"]) {
    assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  }
  assert.doesNotMatch(bare, /--focus-ring/);
  for (const [, query] of text(CSS).matchAll(/@media\s*([^{]+)\{/g)) assert.ok(["(max-width: 900px)", "(min-width: 901px)"].includes(query.trim()), query);
  assert.equal(mediaText(CSS, "max-width: 900px").includes("ellipsis"), false);
  const styles = text("src/styles.css").trim().split("\n");
  assert.ok(styles.includes('@import url("screens/matches/matches.css");'), "the sheet reaches the page");
});

// Task 8: a desk's page is the season's (DeskSeason.html), without the table until stage 10 (the owner's M2 answer 1).
const tabs = () => view.querySelectorAll('.g-board__nav [role="tab"]');
const shownTab = () => tabs().findIndex((tab) => tab.getAttribute("aria-selected") === "true");
const calendarRows = () => view.querySelectorAll(".g-matches__calrow").map((row) => [
  row.querySelector(".g-matches__square").textContent, row.querySelector(".g-matches__calopp").textContent,
  row.querySelector(".g-matches__calline").textContent, row.querySelector(".g-matches__calscore").textContent]);
const CALENDAR = [
  ["WWin", "Tombway Kings", "Round\u00a01 · at home · CAS 1–0", "2–1"],
  ["LLoss", "Mirefen Rotters", "Round\u00a02 · away · CAS 0–2", "0–2"],
  ["FFriendly", "Grimtusk Others", "Friendly · off the table · CAS 0–0", "1–1"],
  ["3", "Rival Team", "Round\u00a03 · at home · next", "—"],
  ["4", "Opponent — after round 3", "Round\u00a04 · paired by the Swiss system", "—"],
];

test("a desk's matches page is the season's: its head, the board through its matches, the calendar", async () => {
  try {
    await visit("t1", { phone: false });
    assert.equal(view.querySelector("h1").textContent, "Season");
    assert.equal(view.querySelector(".g-pagehead__sub").textContent, "Mock Season · teams: 4 · after round 2");
    assert.ok(view.querySelector('.g-board [role="tablist"]'));
    assert.deepEqual(tabs().map((tab) => tab.textContent), ["1", "2", "F", "3"]);
    assert.equal(shownTab(), 3, "the match on");
    assert.equal(view.querySelector(".g-board__overline").textContent, "Round 3 · home");
    assert.deepEqual(view.querySelectorAll(".g-board__actions a").map((link) => link.textContent), ["Match preparation", "Friendlies"]);
    assert.equal(view.querySelector("h2#matches-calendar").textContent, "Calendar");
    assert.equal(view.querySelector(".g-matches__calfriendlies").getAttribute("href"), teamUrl("t1", "challenges"));
    assert.deepEqual(calendarRows(), CALENDAR);
    const links = view.querySelectorAll("a.g-matches__calopp").map((link) => link.getAttribute("href"));
    assert.deepEqual(links, [playerTeamUrl("u-r4", "r4"), playerTeamUrl("u-r5", "r5"), playerTeamUrl("u-r6", "r6"), playerTeamUrl("u-r1", "r1")]);
    assert.ok(view.querySelector(".g-matches__calopp--muted"), "the opponent to come is quiet");
    assert.deepEqual(view.querySelectorAll(".g-matches__square").map((square) => square.getAttribute("class")), [
      "g-matches__square g-matches__square--w", "g-matches__square g-matches__square--l", "g-matches__square g-matches__square--t",
      "g-matches__square g-matches__square--current", "g-matches__square g-matches__square--later"]);
    for (const absent of [".g-matches__current", ".g-matches__friendlies", ".g-matches__section"]) assert.equal(view.querySelector(absent), null, absent);
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("paging the board shows a past match; the calendar stays", async () => {
  try {
    await visit("t1", { phone: false });
    fireEvent(tabs()[0], "click");
    assert.equal(shownTab(), 0);
    assert.equal(view.querySelector(".g-board__score").textContent, "2:1");
    assert.equal(view.querySelector("[data-board-current]").textContent, "To the current match →");
    assert.deepEqual(calendarRows(), CALENDAR);
    await notifyGames(GAMES);
    await settle();
    assert.equal(shownTab(), 0, "the games read again keep it");
    fireEvent(view.querySelector("[data-board-current]"), "click");
    assert.equal(shownTab(), 3);
    assert.equal(document.activeElement, tabs()[3]);
  } finally {
    leave();
  }
});

test("in play: the band's records and post-match; the calendar's line says it is on", async () => {
  try {
    await visit("t2", { phone: false, before: () => api.reply("GET /api/teams/t2/events", 200, { events: TAPS, revision: 7 }) });
    assert.ok(view.querySelector(".g-board--live"));
    const actions = view.querySelectorAll(".g-board__actions a").map((link) => [link.textContent, link.getAttribute("href")]);
    assert.deepEqual(actions, [["Match records · 8", teamUrl("t2", "roster")], ["Post-match", postMatchUrl("g2")]]);
    assert.deepEqual(calendarRows().at(-2), ["3", "Rival Raiders", "Round\u00a03 · at home · in play", "—"]);
  } finally {
    leave();
  }
  const sentRow = matchesModel({ team: TEAMS[2], seasonData: SEASON, games: GAMES, data, phone: false }).calendar.at(-2);
  assert.deepEqual([sentRow.line, sentRow.score], ["Round\u00a03 · at home · awaiting confirmation", "2–1"]);
});

test("the bubbles open «Before the match»", async () => {
  try {
    await visit("t1", { phone: false });
    const bubbles = view.querySelectorAll("[data-before-open]");
    assert.equal(bubbles.length, 2);
    fireEvent(bubbles[0], "click");
    assert.ok(beforeSheet()?.open);
    assert.equal(beforeSheet().querySelector(".g-sheet__title").textContent, "Before the match · Round\u00a03");
  } finally {
    leave();
  }
});

test("the table is the season's: the same rows as #/season", async () => {
  try {
    await visit("t1", { phone: false });
    const table = view.querySelector(".g-season__table");
    assert.equal(table.getAttribute("aria-labelledby"), "matches-table");
    assert.equal(table.querySelector("h2#matches-table").textContent, "Table");
    const own = (markup) => mountHere(markup).querySelector('[role="table"]').textContent;
    const rows = seasonTable(SEASON);
    assert.equal(table.querySelector('[role="table"]').textContent,
      own(leagueTableMarkup({ rows, phone: false, viewerId: "u1", signedIn: true, labelledBy: "matches-table" })));
    assert.equal(table.querySelector(".g-season__rule").textContent, tablePointsText(), "the league's points at the card's head (pre-flight L17)");
    assert.ok(table.querySelector(".g-table__notes").textContent.includes(t("league.order")));
    assert.ok(!table.querySelector(".g-table__notes").textContent.includes(tablePointsText()), "said once");
  } finally {
    leave();
  }
});

test("a desk's season: the board, then the table at the left with the coach's row marked and the calendar at the right", async () => {
  try {
    await visit("t1", { phone: false });
    const page = view.querySelector(".g-matches--desk");
    const row = view.querySelector(".g-season__row");
    assert.equal(row.parentNode, page);
    const order = page.childNodes.filter((node) => node.nodeType === 1).map((node) => node.getAttribute("class").split(" ")[0]);
    assert.deepEqual(order, ["g-board", "g-season__row"], "the board the whole width, then the row");
    const [table, aside] = row.childNodes.filter((node) => node.nodeType === 1);
    assert.ok(table.classList.contains("g-season__table"));
    assert.ok(table.querySelector('[role="table"]'));
    assert.ok(aside.classList.contains("g-season__aside"));
    assert.ok(aside.querySelector(".g-matches__calendar"));
    const mine = view.querySelectorAll(".g-table__row--mine").map((item) => item.querySelector(".g-table__link").getAttribute("href"));
    assert.deepEqual(mine, [teamUrl("t1")], "the team's own row, as DeskSeason.html marks one (final review m-4)");
    const others = view.querySelectorAll(".g-table__row").filter((item) => ["t2", "t3"].some((id) => item.querySelector(".g-table__link")?.getAttribute("href") === teamUrl(id)));
    assert.equal(others.length, 2, "the coach's other teams lead to their overviews, unmarked");
    assert.equal(view.querySelector(".g-table__row .g-table__link").getAttribute("href"), playerTeamUrl("u-r1", "r1"));
    assert.equal(view.querySelector(".g-matches__calall").getAttribute("href"), "#/season", "the league's calendar is a step away (pre-flight L11)");
  } finally {
    leave();
  }
});

test("a desk's season whose games are not read: the table's card takes the row, no empty column beside it", () => {
  for (const failed of [{ games: null }, { gamesError: "Server unavailable" }]) {
    const page = mountHere(matchesMarkup(modelOf("t1", { phone: false, viewerId: "u1", ...failed })));
    const row = page.querySelector(".g-season__row");
    assert.ok(row.querySelector(".g-season__table"));
    // (assert.ok, not assert.equal(node, null): a failing equal prints the fake DOM node and runs out of memory.)
    assert.ok(!row.querySelector(".g-season__aside"), "no empty complementary landmark");
    assert.ok(!page.querySelector("aside"));
  }
});

test("the calendar lists the team's other open matches after the one on, each leading to the match", async () => {
  const friendly = game("g7", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, away: GRIM, preparationStatus: "preparing" });
  try {
    await visit("t1", { phone: false, games: [...GAMES, friendly] });
    assert.deepEqual(calendarRows(), [...CALENDAR.slice(0, 4), ["F", "Grimtusk Others", "Friendly · Preparation", "—"], CALENDAR[4]]);
    const other = view.querySelectorAll(".g-matches__calrow")[4];
    assert.equal(other.querySelector("a.g-matches__calline").getAttribute("href"), preMatchUrl("g7"));
    assert.equal(other.querySelector("a.g-matches__calopp").getAttribute("href"), playerTeamUrl("u-r6", "r6"));
    assert.equal(other.querySelector(".g-matches__square").getAttribute("class"), "g-matches__square g-matches__square--later");
    assert.equal(view.querySelectorAll("a.g-matches__calline").length, 1, "no other row's line is a link");
  } finally {
    leave();
  }
  const rows = modelOf("t1", { phone: false, games: [...GAMES, friendly] }).calendar;
  assert.deepEqual(rows.map((row) => row.href), ["", "", "", "", preMatchUrl("g7"), ""]);
});

test("a team outside the table: no table, the calendar and the call to enter the season", async () => {
  try {
    await visit("t4", { phone: false });
    assert.equal(view.querySelector(".g-season__row"), null);
    assert.equal(view.querySelector(".g-table"), null);
    const page = view.querySelector(".g-matches--desk");
    assert.equal(view.querySelector(".g-matches__calendar").parentNode, page, "the calendar takes the row, as before stage 10 (pre-flight L18)");
    assert.match(page.textContent, /Not entered in the season/);
  } finally {
    leave();
  }
  assert.deepEqual(modelOf("t4", { phone: false }).table.map((row) => row.team.id), ["r1", "t1", "t2", "t3"], "the model has the table; the page shows it for a team in it");
  assert.deepEqual(modelOf("t1", { phone: false, seasonData: null }).table, []);
});

test("a desk outside the table: the call to enter the season, the board only with a match on, the friendlies in the calendar", () => {
  const done = played("g9", 0, [0, 1], [1, 1], { kind: "friendly", season: null, roundStatus: null, home: OURS.t4, away: GRIM, confirmedAt: "2026-10-04T10:00:00Z" });
  const quiet = matchesModel({ team: TEAMS[3], seasonData: SEASON, games: [...GAMES, done], data, phone: false });
  assert.equal(quiet.band, null);
  assert.deepEqual(quiet.calendar.map((row) => row.line), ["Friendly · off the table · CAS 1–1"]);
  const markup = matchesMarkup(quiet);
  assert.match(markup, /Not entered in the season/);
  assert.doesNotMatch(markup, /g-board/);
  const live = game("g8", { kind: "friendly", season: null, roundNumber: null, roundStatus: null, home: OURS.t4, away: GRIM, preparationStatus: "in_progress" });
  const on = matchesModel({ team: TEAMS[3], seasonData: SEASON, games: [...GAMES, done, live], data, phone: false });
  assert.ok(on.band, "a friendly on is on the board (pre-flight L9)");
  assert.equal(on.calendar.at(-1).line, "Friendly · off the table · in play");
  assert.equal(on.calendar.at(-1).square.label, "F");
  // Before the games are read, no calendar; without a season, no line.
  assert.equal(matchesModel({ team: TEAMS[0], seasonData: SEASON, games: null, data, phone: false }).calendar.length, 0);
  assert.equal(matchesModel({ team: TEAMS[0], seasonData: null, games: GAMES, data, phone: false }).seasonLine, "");
  const opening = { ...SEASON, season: { ...SEASON.season, currentRound: 1 }, rounds: [{ roundNumber: 1, status: "started" }] };
  assert.equal(matchesModel({ team: TEAMS[0], seasonData: opening, games: GAMES, data, phone: false }).seasonLine, "Mock Season · teams: 4");
  const unnamed = { ...SEASON, rounds: undefined };
  assert.equal(matchesModel({ team: TEAMS[0], seasonData: unnamed, games: GAMES, data, phone: false }).seasonLine, "Mock Season · teams: 4 · after round 2");
  initLocale("ru");
  try {
    assert.equal(matchesModel({ team: TEAMS[0], seasonData: SEASON, games: GAMES, data, phone: false }).seasonLine, "Mock Season · команд: 4 · после тура 2");
  } finally {
    initLocale("en");
  }
});

test("a desk's calendar: styled as DeskSeason.html; readable; D2 from 901px; nothing cut", () => {
  const sheets = [CSS, "src/ui/match-card.css", "src/screens/matches/before.css", "match-board.css", "src/shell/crest.css", "status-chip.css", "button.css",
    "callout.css", "page-head.css", "result-pill.css", "src/screens/season/table.css", "src/screens/season/league.css", "form-strip.css"];
  const live = gamesWith({ g2: { preparationStatus: "in_progress" } });
  for (const model of [modelOf("t1", { phone: false }), modelOf("t2", { phone: false, games: live }), modelOf("t3", { phone: false }), modelOf("t4", { phone: false })]) {
    assertStyled(mountHere(matchesMarkup(model)), ...sheets);
  }
  const own = (selector, property) => valuesOf(CSS, selector, property);
  assert.deepEqual(own(".g-matches--desk", "gap"), ["var(--space-20)"]);
  assert.deepEqual(own(".g-matches__calendar", "background"), ["var(--surface)"]);
  assert.deepEqual(own(".g-matches__calendar", "border-radius"), ["var(--radius-2xl)"]);
  assert.deepEqual(own(".g-matches__calendar", "padding"), ["var(--space-16) var(--space-20) var(--space-8)"]);
  assert.deepEqual(own(".g-matches__caltitle", "font"), ["700 24px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-matches__calrow", "grid-template-columns"), ["30px minmax(0, 1fr) auto"]);
  assert.deepEqual(own(".g-matches__calrow", "min-height"), ["52px"]);
  assert.deepEqual(own(".g-matches__square", "font"), ["700 13px/1 var(--font-body)"]);
  assert.deepEqual(own(".g-matches__square--t", "background"), ["var(--result-friendly)"]);
  assert.deepEqual(own(".g-matches__square--current", "background"), ["var(--accent-tint)"]);
  assert.deepEqual(own(".g-matches__calopp", "font"), ["500 15px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-matches__calline", "font"), ["400 12px/normal var(--font-body)"]);
  assert.deepEqual(own(".g-matches__calscore", "font"), ["700 22px/normal var(--font-display)"]);
  assert.deepEqual(own(".g-matches__calfriendlies", "font"), ["700 13px/1.2 var(--font-body)"]);
  assert.deepEqual(own(".g-matches__calfriendlies", "box-shadow"), ["inset 0 0 0 1.5px var(--accent)"]);
  // Readable in every palette: the letters on the squares, the quiet words, the accent of «Friendlies».
  for (const [square, background] of [["w", "--accent"], ["d", "--neutral-result"], ["t", "--result-friendly"]]) {
    assertReadable(CSS, ".g-matches__square", "color", [background], 4.5);
    assert.ok(own(`.g-matches__square--${square}`, "background").length);
  }
  assertReadable(CSS, ".g-matches__square--l", "color", ["--danger"], 4.5);
  assertReadable(CSS, ".g-matches__square--current", "color", ["--accent-tint"], 4.5);
  assertReadable(CSS, ".g-matches__square--later", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-matches__calline", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-matches__calopp--muted", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-matches__calscore--none", "color", ["--surface"], 4.5);
  assertReadable(CSS, ".g-matches__calfriendlies", "color", ["--surface"], 4.5);
  // D2 from 901px: «Friendlies» 36px, the opponent's link 24px, the board's squares 30px — each 24 or more.
  assert.ok(parseInt(own(".g-matches__calfriendlies", "min-height")[0], 10) >= 24);
  assert.deepEqual(own("a.g-matches__calopp", "min-height"), ["24px"]);
  const season = "src/screens/season/table.css";
  assert.ok(parseInt(inMedia(season, "min-width: 901px", "a.g-matches__calline", "min-height")[0], 10) >= 24, "a match's line that leads to it (pre-flight L19)");
  assert.ok(parseInt(inMedia(season, "min-width: 901px", ".g-matches__calall", "min-height")[0], 10) >= 24);
  assertReadable(season, "a.g-matches__calline", "color", ["--surface"], 4.5);
  assertReadable(season, ".g-matches__calall", "color", ["--surface"], 4.5);
  assert.deepEqual(valuesOf("src/ui/match-board.css", ".g-board__square", "width"), ["30px"]);
  for (const selector of [".g-matches__calopp", ".g-matches__calline", ".g-matches__caltitle"]) assert.deepEqual(own(selector, "overflow-wrap"), ["anywhere"], selector);
  assert.doesNotMatch(text(CSS).replace(/\/\*[\s\S]*?\*\//g, ""), /ellipsis|text-overflow|nowrap/);
});

test("the desk's words in both dictionaries, the calendar's states for every phase", () => {
  assertDictionaryCovers("src/screens/matches/model.mjs", "src/screens/matches/lists.mjs", "src/screens/matches/index.mjs");
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const phase of MATCH_PHASES) assert.ok(words[`matches.calendarState.${phase}`], `${locale} matches.calendarState.${phase}`);
    for (const where of ["home", "away", "friendly"]) assert.ok(words[`matches.calendarAt.${where}`], `${locale} matches.calendarAt.${where}`);
  }
});
