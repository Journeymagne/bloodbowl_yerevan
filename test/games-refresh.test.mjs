import assert from "node:assert/strict";
import test from "node:test";

import { document } from "./helpers/ui.mjs";
import { el } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";

// What the screens do to a game (a start, a result, a challenge) reaches the SideNav's match card without anyone calling refreshShell.
const api = installFakeApi();
document.body.appendChild(el(document, "div", { id: "app-frame" },
  el(document, "aside", { id: "side-nav" }), el(document, "header", { id: "app-header" }),
  el(document, "div", { id: "ref-search", hidden: "" }), el(document, "section", { id: "app-view" }), el(document, "footer", { id: "site-footer" })));
const { mountShell, refreshShell } = await import("../src/shell/shell.mjs");
const { invalidateGames, loadGames, onGamesChange } = await import("../src/data/games.mjs");
const { state } = await import("../src/core/state.mjs");

mountShell({ document, scroller: { addEventListener() {}, document } });

const GAMES = "GET /api/games";
const side = (id, name) => ({ user: { id: `u-${id}`, login: "x" }, team: { id, name } });
const game = (id, over = {}) => ({
  id, kind: "league", roundStatus: "started", roundNumber: 7, season: { currentRound: 7 }, resultStatus: "pending",
  preparationStatus: "not_started", postMatchStatus: "not_started", viewerIsHome: true, updatedAt: "2026-10-10T10:00:00Z",
  home: side("t1", "Ashgrove Wardens"), away: side("r1", "Grimtusk Raiders"), ...over,
});
const NEXT = game("g-next");
const LIVE = game("g-next", { preparationStatus: "in_progress", postMatchStatus: "draft" });
const label = () => document.querySelector("#side-nav .g-navmatch .g-navmatch__label")?.textContent ?? null;
const sent = () => api.calls.filter((call) => call.key === GAMES).length;

function signedIn(items) {
  api.reset();
  state.auth.currentUser = { id: "u1", login: "coach", isAdmin: false };
  state.myTeams = { items: [{ id: "t1", name: "Ashgrove Wardens", baseTeamSlug: "human" }], loaded: true, loading: false, error: "" };
  state.activeTeamId = "t1";
  state.data = { teams: [{ slug: "human", title: "Human" }], generatedAt: "2026-10-07T10:00:00Z" };
  state.games = { items, currentItems: [], loaded: true, loading: false, error: "" };
  refreshShell({ name: "teamRoster", params: { teamId: "t1" } });
}

test("a screen that starts a match invalidates the games, and the card follows once the server answers", async () => {
  signedIn([NEXT]);
  assert.equal(label(), "Next match");
  api.reply(GAMES, 200, { games: [LIVE], currentGames: [] });
  const gate = api.hold(GAMES);
  const reloading = invalidateGames();
  assert.equal(label(), "Next match", "until the server answers, the card is what it was");
  gate.release();
  await reloading;
  assert.equal(label(), "Match in play", "no refreshShell from outside");
  assert.equal(sent(), 1);
  assert.deepEqual([state.games.loaded, state.games.loading, state.games.error], [true, false, ""]);
  api.assertAnswered();
});

test("a reload that fails keeps the games and the card, and says why in `error`", async () => {
  signedIn([LIVE]);
  api.fail(GAMES);
  const heard = [];
  const stop = onGamesChange(() => heard.push(state.games.error));
  await invalidateGames();
  assert.deepEqual(state.games.items, [LIVE], "a blip in the network does not empty the list");
  assert.notEqual(state.games.error, "");
  assert.equal(state.games.loaded, true);
  assert.equal(label(), "Match in play");
  assert.equal(heard.length, 1, "the listeners hear a failure too");
  api.reply(GAMES, 200, { games: [NEXT], currentGames: [] });
  await invalidateGames();
  assert.deepEqual([state.games.items, state.games.error, label(), heard.length], [[NEXT], "", "Next match", 2]);
  stop();
});

test("every listener hears each write, one that throws does not silence the rest, and a stopped one hears nothing", async () => {
  signedIn([NEXT]);
  api.reply(GAMES, 200, { games: [NEXT], currentGames: [] });
  const heard = [];
  const errors = [];
  const logged = console.error;
  console.error = (error) => errors.push(error.message);
  const stops = [onGamesChange(() => { throw new Error("a listener broke"); }), onGamesChange(() => heard.push("second"))];
  try {
    await invalidateGames();
    assert.deepEqual([heard, errors], [["second"], ["a listener broke"]]);
    stops[1]();
    await invalidateGames();
    assert.deepEqual(heard, ["second"]);
  } finally {
    console.error = logged;
    stops[0]();
  }
});

const AFTER = { status: 200, body: { games: [LIVE], currentGames: [] } };
const BEFORE = { status: 200, body: { games: [NEXT], currentGames: [] } };
const settle = () => new Promise((resolve) => setImmediate(resolve));

test("a read that was overtaken and lands late is dropped: the newer answer stands", async () => {
  signedIn([NEXT]);
  const first = api.hold(GAMES);
  const older = loadGames(true);
  const second = api.hold(GAMES);
  const newer = invalidateGames();
  second.release(AFTER);
  await newer;
  assert.equal(label(), "Match in play");
  first.release(BEFORE); // the list from before the change arrives after the list from after it
  await older;
  assert.equal(state.games.items[0].preparationStatus, "in_progress");
  assert.equal(label(), "Match in play");
});

test("a read that was overtaken and lands first writes nothing, and its caller waits for the newer one", async () => {
  signedIn([NEXT]);
  const first = api.hold(GAMES);
  let olderDone = false;
  const older = loadGames(true).then(() => { olderDone = true; });
  const second = api.hold(GAMES);
  const newer = invalidateGames();
  first.release(BEFORE);
  await settle();
  assert.equal(olderDone, false, "its caller reads state.games when it returns, so it waits for the list that will be there");
  assert.equal(label(), "Next match");
  second.release(AFTER);
  await Promise.all([older, newer]);
  assert.deepEqual([olderDone, label(), state.games.items[0].preparationStatus], [true, "Match in play", "in_progress"]);
});

test("a visitor who is not signed in has no games to read, and nothing is sent", async () => {
  signedIn([]);
  state.auth.currentUser = null;
  await invalidateGames();
  assert.equal(sent(), 0);
});

// Final-wave item 3: an answer is the games of the coach it was asked for.
test("games that come back after their coach signed out are not written, nor heard", async () => {
  signedIn([NEXT]);
  const heard = [];
  const stop = onGamesChange(() => heard.push(state.games.items.length));
  const gate = api.hold(GAMES);
  const loading = loadGames(true);
  state.auth.currentUser = null;
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" }; // as signing out leaves it
  gate.release(AFTER);
  await loading;
  stop();
  assert.deepEqual([state.games.items, state.games.loaded], [[], false]);
  assert.deepEqual(heard, []);
});

test("games that come back after another coach signed in are not that coach's", async () => {
  signedIn([NEXT]);
  const gate = api.hold(GAMES);
  const loading = loadGames(true);
  state.auth.currentUser = { id: "u2", login: "other", isAdmin: false };
  state.games = { items: [], currentItems: [], loaded: false, loading: false, error: "" };
  gate.release(AFTER);
  await loading;
  assert.deepEqual([state.games.items, state.games.loaded], [[], false]);
  api.reply(GAMES, 200, { games: [NEXT], currentGames: [] });
  await loadGames();
  assert.deepEqual(state.games.items, [NEXT], "the next coach's own read is not held up by the dropped one");
});
