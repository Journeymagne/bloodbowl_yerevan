import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { HOSTILE, assertCspSafe, assertDictionaryCovers, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { assertReadable, mediaText, valuesOf } from "./helpers/contrast.mjs";
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

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const dictionary = (locale) => JSON.parse(text(`src/i18n/${locale}.json`));
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const CSS = "src/screens/matches/matches.css";

// The table: the rival first, the coach's three teams after it. Round 3 is on; rounds 1 and 2 are over.
const SEASON = {
  season: { id: "s1", name: "Mock Season", currentRound: 3, createdAt: "2026-09-01T00:00:00Z" },
  standings: [
    { team: { id: "r1" }, rank: 1, points: 6 },
    { team: { id: "t1" }, rank: 2, points: 3 },
    { team: { id: "t2" }, rank: 3, points: 1 },
    { team: { id: "t3" }, rank: 4, points: 0 },
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
    assert.equal(article.querySelector(".g-matches__miss").textContent, "Out: J. Corr · seriously Hurt");
    assert.equal(article.querySelector(".g-btn--primary, .g-matches__cta").getAttribute("href"), preMatchUrl("g1"));
    assert.equal(article.querySelector(".g-matches__cta").textContent, "Match preparation");
    assert.equal(view.querySelector(".g-matches__friendlies").getAttribute("href"), teamUrl("t1", "challenges"));
    api.assertAnswered();
  } finally {
    leave();
  }
});

test("the inducement tile and the line of who misses it open «Before the match»", async () => {
  try {
    await visit();
    fireEvent(view.querySelector(".g-matches__tile--ind"), "click");
    assert.ok(beforeSheet()?.open);
    assert.equal(beforeSheet().querySelector(".g-sheet__title").textContent, "Before the match · Round 3");
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
    assert.deepEqual(words(".g-matches__round", later.at(-1)), ["Round 4"]);
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
    assert.deepEqual(rows.map((row) => row.getAttribute("href")), [playerTeamUrl("u-r6", "r6"), playerTeamUrl("u-r5", "r5"), playerTeamUrl("u-r4", "r4")]);
    assert.deepEqual(rows.map((row) => row.querySelector(".g-result").getAttribute("class")), ["g-result g-result--t", "g-result g-result--l", "g-result g-result--w"]);
    assert.deepEqual(words(".g-matches__score", results), ["1–1", "0–2", "2–1"]);
    assert.deepEqual(words(".g-matches__line", rows[2]), [`Round 1 · ${raceTitle("teams/orc")} · CAS 1–0`, "MVP: Linewoman Five"]);
    assert.deepEqual(words(".g-matches__line", rows[0]), [`Friendly · ${raceTitle("teams/orc")} · CAS 0–0`], "no MVP: none picked");
    assert.equal(rows[2].querySelector("a"), null, "the row is one link: the race is text (pre-flight L14)");
  } finally {
    leave();
  }
  assert.match(matchesMarkup(modelOf("t2")), /g-matches__empty">No matches played yet</);
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
    assert.equal(rows[1].querySelector(".g-matches__round").textContent, "Round 4");
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
    const ind = view.querySelector(".g-matches__tile--ind");
    ind.focus();
    cross(false);
    assert.equal(view.querySelector("h1").textContent, "Matches", "drawn again for a desk");
    cross(true);
    assert.ok(document.activeElement === view.querySelector(".g-matches__tile--ind") || document.activeElement === view.querySelector("h1"));
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
