import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { assertCspSafe, assertStyled, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { applyPreparationAction, createPreparation } from "../src/domain/match/preparation.mjs";

/*
 * The preparation 3.0 as a screen (stage 09a, Task 11): what it reads, what each press writes and on which revision,
 * what a refusal or a lost answer does, the start, the poll and the leaving. The domain applies the actions, so every
 * payload the fake server sends is one the server could.
 */

const api = installFakeApi();
const appView = el(document, "section", { id: "app-view" });
document.body.appendChild(appView);
// The poll's timer, held by the test: a tick is a call, a stop is a record.
const polls = { ticks: new Map(), cleared: [], next: 1 };
globalThis.setInterval = (callback, ms) => {
  const id = polls.next++;
  polls.ticks.set(id, { callback, ms });
  return id;
};
globalThis.clearInterval = (id) => {
  polls.cleared.push(id);
  polls.ticks.delete(id);
};
globalThis.location = { hash: "#/games/g1/pre-match", replaced: "", replace(target) { this.replaced = target; } };
// The page's clock, held by the test: the footer's action is armed 600 ms after it appears.
let clock = Date.parse("2026-10-21T10:00:00Z");
Date.now = () => clock;
/** Time passes, past the arming of what appeared. */
const later = (ms = 1000) => {
  clock += ms;
};
const { renderPreMatch } = await import("../src/screens/matches/prep.mjs");
const { gameUrl, preMatchUrl, teamUrl } = await import("../src/core/routes.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");

const text = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const data = expandCollections(JSON.parse(text("public/data.en.json")));
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 6; round += 1) await settle();
};

const PREP = "/api/games/g1/preparation";
const READ = `GET ${PREP}`;
const WRITE = `PATCH ${PREP}`;
const START = "POST /api/games/g1/start";

const players = (prefix, rows) => rows.map((rowIndex, index) => ({ id: `${prefix}-${index + 1}`, rowIndex, number: String(index + 1), name: `${prefix} ${index + 1}` }));
const source = (id, name, roster) => ({ user: { id: `u-${id}`, login: id },
  team: { id, name, baseTeamSlug: "teams/human", revision: 1, roster: { players: roster, treasury: 70, dedicatedFans: 3 } } });
// Ours: eight Human Linemen; theirs: seven and an Ogre, dearer — they buy first.
const OURS = source("t1", "Ashgrove Wardens", players("ash", [0, 0, 0, 0, 0, 0, 0, 0]));
const THEIRS = source("r1", "Silverbrook Rangers", players("sil", [0, 0, 0, 0, 0, 0, 0, 5]));
// Six of ours: one Journeyman short of seven.
const SHORT = source("t1", "Ashgrove Wardens", players("ash", [0, 0, 0, 0, 0, 0]));
const FIXTURE = { id: "g1", kind: "league", seasonName: "Mock Season", roundNumber: 7, tableNumber: 1, closed: false };

const FANS = [["home", { type: "fans", value: 2 }], ["away", { type: "fans", value: 1 }]];
const WEATHER = [["home", { type: "weather", season: "Autumn", home: 3, away: 4 }]];
const ROSTERS = [["home", { type: "lock-roster" }], ["away", { type: "lock-roster" }]];
const THEY_BOUGHT = [["away", { type: "lock-basket" }]];
const TO_INDUCEMENTS = [...FANS, ...WEATHER, ...ROSTERS, ...THEY_BOUGHT];
const READY = [...TO_INDUCEMENTS, ["home", { type: "lock-basket" }], ["home", { type: "confirm" }], ["away", { type: "confirm" }]];

/** What `GET …/preparation` sends after `actions`, as the domain applies them. */
function payloadAt(actions = [], over = {}, { ours = OURS, theirs = THEIRS } = {}) {
  let preparation = createPreparation({ home: ours, away: theirs }, data);
  for (const [side, action] of actions) preparation = applyPreparationAction(preparation, side, action, data);
  return { preparation, snapshots: {}, viewerSide: "home", isAdmin: false, fixture: FIXTURE, ...over };
}
/** The same payload with the match begun. */
const begun = (payload) => ({ ...payload, preparation: { ...payload.preparation, status: "in_progress", revision: payload.preparation.revision + 1, startedAt: "2026-10-21T10:00:00Z" } });

/** The phone's media query, which the test answers and changes. */
function crossingWindow(phone) {
  const listeners = new Set();
  const media = { matches: phone, addEventListener: (type, listener) => listeners.add(listener), removeEventListener: (type, listener) => listeners.delete(listener) };
  globalThis.matchMedia = (query) => (query === "(max-width: 900px)" ? media : { matches: false });
  return (next) => {
    media.matches = next;
    listeners.forEach((listener) => listener());
  };
}

/** A coach on the preparation of g1 at `actions`, on a phone unless told otherwise; the read answered. */
async function visit(actions = [], { step = "", phone = true, over = {}, rosters, user = { id: "u-t1", login: "t1" } } = {}) {
  releaseCurrentScreen();
  api.reset();
  polls.cleared.length = 0;
  view.innerHTML = "";
  document.hidden = false;
  location.hash = preMatchUrl("g1", step);
  location.replaced = "";
  state.auth.currentUser = user;
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  api.reply(READ, 200, payloadAt(actions, over, rosters));
  const cross = crossingWindow(phone);
  await renderPreMatch("g1", step);
  await flush();
  // A coach reads the page before pressing: the footer's action of the first draw is armed by then.
  later();
  return cross;
}

const writes = () => api.calls.filter((call) => call.key === WRITE);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const reads = () => api.calls.filter((call) => call.key === READ);
const face = (group, value) => view.querySelector(`${group} [data-prep-die="${value}"]`);
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
/** The poll of the visit on screen, as its timer would run it. */
async function tick() {
  const [last] = [...polls.ticks.values()].slice(-1);
  assert.ok(last, "a poll is running");
  await last.callback();
  await flush();
}

test("the preparation draws its own frame and the step asked for, the focus on its title", async () => {
  const cross = await visit(FANS, { step: "weather" });
  const frame = view.querySelector(".g-prep.g-prep--phone");
  assert.ok(frame, "the preparation's own frame");
  assert.ok(view.querySelector('[data-prep-weather="home"]'), "the weather's card");
  assert.ok(view.querySelector('.g-seg[data-seg-group="prep-season"]'));
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(document.activeElement.textContent, "Before the match");
  assert.deepEqual(reads().length, 1);
  // A desk's form when the width crosses 900px, the focus kept on the title.
  cross(false);
  assert.ok(view.querySelector(".g-prep.g-prep--desk"));
  assert.ok(view.querySelector("aside.g-prep__steps"));
  assert.equal(document.activeElement, view.querySelector("h1"));
  // A step not reached yet is the current one.
  await visit(FANS, { step: "review" });
  assert.ok(view.querySelector('[data-prep-weather="home"]'));
  // «Kick-off», a step of the rules before version 2, is the start.
  await visit([], { step: "kickoff" });
  assert.equal(location.replaced, preMatchUrl("g1", "review"));
  assert.equal(reads().length, 0, "nothing is read for an address sent on");
  api.assertAnswered();
});

test("a guest is asked to sign in, and nothing is read", async () => {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  state.auth.currentUser = null;
  crossingWindow(true);
  await renderPreMatch("g1", "");
  await flush();
  assert.ok(view.querySelector("[data-auth-form]"), "the sign-in");
  assert.equal(api.calls.length, 0);
  assert.equal(polls.ticks.size, 0);
  releaseCurrentScreen();
});

test("a preparation that cannot be read says why, with the way back", async () => {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  state.auth.currentUser = { id: "u-t1", login: "t1" };
  state.activeTeamId = "t1";
  crossingWindow(true);
  api.reply(READ, 404, { error: { code: "GAME_NOT_FOUND", message: "Game not found" } });
  await renderPreMatch("g1", "");
  await flush();
  assert.ok(view.querySelector(".g-prep"));
  assert.equal(view.querySelector('[role="alert"] .g-callout__title').textContent, t("error.GAME_NOT_FOUND"));
  // Back to the team's matches, not to the game, which sends the coach straight back here (stage 13, pre-flight L11).
  assert.equal(view.querySelector("a.g-prep__back").getAttribute("href"), teamUrl("t1", "matches"));
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(polls.ticks.size, 0, "no poll for a preparation not read");
  assertStyled(view, "src/screens/matches/prep.css", "callout.css");
  assertCspSafe(view);
  // «Try again» reads it once more (the Task 11 review, m-5): no reload needed after a moment offline.
  const retry = view.querySelector("[data-prep-retry]");
  assert.equal(retry.textContent, t("prep.retry"));
  api.reply(READ, 200, payloadAt());
  fireEvent(retry, "click");
  assert.equal(view.querySelector('[role="status"]').textContent, "Loading the preparation…");
  await flush();
  assert.equal(api.calls.filter((call) => call.key === READ).length, 2);
  assert.ok(view.querySelector(".g-prep__body"), "the preparation, read at last");
  assert.equal(polls.ticks.size, 1, "and its poll");
  // While it is read: the same head, and that it is being read.
  releaseCurrentScreen();
  view.innerHTML = "";
  crossingWindow(false);
  const gate = api.hold(READ);
  const visiting = renderPreMatch("g1", "");
  assert.ok(view.querySelector(".g-prep--desk .g-prep__band"));
  assert.equal(view.querySelector('[role="status"]').textContent, "Loading the preparation…");
  assertStyled(view, "src/screens/matches/prep.css");
  gate.release();
  await visiting;
  await flush();
  // Back from the post-match, whose frame is the same class (stage 09b): its frame gives way to the loading status.
  releaseCurrentScreen();
  view.innerHTML = '<div class="g-prep g-prep--desk" data-screen="post-match"><header class="g-prep__band"><h1 class="g-prep__title" tabindex="-1">After the match</h1></header></div>';
  const back = api.hold(READ);
  const returning = renderPreMatch("g1", "");
  assert.equal(view.querySelector('[role="status"]')?.textContent, "Loading the preparation…");
  assert.equal(view.querySelector("h1").textContent, t("prep.title"));
  back.release();
  await returning;
  await flush();
  assert.ok(view.querySelector(".g-prep--desk .g-prep__card"), "the preparation drawn");
  api.reset();
});

test("a die pressed is one write with the revision and the side; the answer is drawn", async () => {
  await visit();
  const answer = payloadAt([["home", { type: "fans", value: 2 }]]);
  api.reply(WRITE, 200, answer);
  await press(face("[data-prep-fans]", 2));
  assert.deepEqual(writes().map((call) => call.body), [{ revision: 1, side: "home", action: { type: "fans", value: 2 } }]);
  assert.equal(face("[data-prep-fans]", 2).getAttribute("aria-checked"), "true");
  assert.equal(view.querySelector(".g-prep__big--ours").textContent, "5", "Fan Factor 3 + 2, from the answer");
  const keys = api.calls.map((call) => call.key);
  assert.ok(keys.indexOf("GET /api/games") > keys.indexOf(WRITE), "the games are read again after the write");
  // The next press is on the answer's revision.
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }], ["home", { type: "fans", value: 3 }]]));
  await press(face("[data-prep-fans]", 3));
  assert.equal(writes()[1].body.revision, 2);
  api.assertAnswered();
});

test("a die pressed while a write is on its way: the latest value wins, sent once from the answer", async () => {
  await visit();
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }]]));
  const gate = api.hold(WRITE);
  await press(face("[data-prep-fans]", 2));
  await press(face("[data-prep-fans]", 3));
  await press(face("[data-prep-fans]", 1));
  assert.equal(writes().length, 1, "one write in the air");
  // The follow-up goes on the answer's revision, once, with the last face pressed.
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }], ["home", { type: "fans", value: 1 }]]));
  gate.release({ status: 200, body: payloadAt([["home", { type: "fans", value: 2 }]]) });
  await flush();
  assert.deepEqual(writes().map((call) => [call.body.revision, call.body.action.value]), [[1, 2], [2, 1]]);
  assert.equal(face("[data-prep-fans]", 1).getAttribute("aria-checked"), "true", "the last answer is what is drawn");
  assert.equal(face("[data-prep-fans]", 2).getAttribute("aria-checked"), "false");
  // Back to the face on its way: the answer holds it, so nothing follows.
  await visit();
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }]]));
  const held = api.hold(WRITE);
  await press(face("[data-prep-fans]", 2));
  await press(face("[data-prep-fans]", 3));
  await press(face("[data-prep-fans]", 2));
  held.release();
  await flush();
  assert.equal(writes().length, 1, "a value the answer already holds is not sent again");
  assert.equal(face("[data-prep-fans]", 2).getAttribute("aria-checked"), "true");
  api.assertAnswered();
});

test("a value waiting is dropped when the write on its way is refused or lost: nothing is sent on the coach's behalf", async () => {
  for (const refuse of [(gate) => gate.release({ status: 409, body: { error: { code: "MATCH_REVISION", message: "x" } } }), (gate) => gate.release({ error: new TypeError("Failed to fetch") })]) {
    await visit();
    api.reply(READ, 200, payloadAt([["away", { type: "fans", value: 1 }]]));
    const gate = api.hold(WRITE);
    await press(face("[data-prep-fans]", 2));
    await press(face("[data-prep-fans]", 3));
    refuse(gate);
    await flush();
    assert.equal(writes().length, 1, "the value that waited is not sent");
    assert.equal(reads().length, 2, "the preparation is read again");
    assert.ok(view.querySelectorAll("[data-prep-fans] [data-prep-die]").every((die) => die.getAttribute("aria-checked") === "false"), "and drawn as read");
    api.assertAnswered();
  }
});

test("the arrow keys move a die; each value set waits for the write on its way, and the last one is the one kept", async () => {
  await visit();
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }]]));
  const gate = api.hold(WRITE);
  face("[data-prep-fans]", 1).focus();
  fireEvent(face("[data-prep-fans]", 1), "keydown", { key: "ArrowRight" });
  await flush();
  assert.ok(document.activeElement === face("[data-prep-fans]", 2), "the focus moved with the arrow");
  fireEvent(face("[data-prep-fans]", 2), "keydown", { key: "ArrowRight" });
  await flush();
  assert.equal(writes().length, 1);
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }], ["home", { type: "fans", value: 3 }]]));
  gate.release({ status: 200, body: payloadAt([["home", { type: "fans", value: 2 }]]) });
  await flush();
  assert.deepEqual(writes().map((call) => call.body.action.value), [2, 3]);
  assert.equal(face("[data-prep-fans]", 3).getAttribute("aria-checked"), "true", "the check where the focus is");
  assert.ok(document.activeElement === face("[data-prep-fans]", 3), "the focus where the check is");
  api.assertAnswered();
});

test("the weather's dice and season pressed while a write is on its way add up into one follow-up", async () => {
  await visit(FANS, { step: "weather" });
  api.reply(WRITE, 200, payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: null, away: null }]]));
  const gate = api.hold(WRITE);
  await press(view.querySelector('.g-seg[data-seg-group="prep-season"] [data-seg-value="Spring"]'));
  await press(face('[data-prep-weather="home"]', 3));
  await press(face('[data-prep-weather="away"]', 5));
  api.reply(WRITE, 200, payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: 3, away: 5 }]]));
  gate.release({ status: 200, body: payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: null, away: null }]]) });
  await flush();
  assert.deepEqual(writes().map((call) => call.body.action), [
    { type: "weather", season: "Spring", home: null, away: null },
    { type: "weather", season: "Spring", home: 3, away: 5 },
  ]);
  // A die waiting that the answer already holds is not sent (the weather's `holds`).
  await visit(FANS, { step: "weather" });
  const held = api.hold(WRITE);
  await press(view.querySelector('.g-seg[data-seg-group="prep-season"] [data-seg-value="Spring"]'));
  await press(face('[data-prep-weather="home"]', 3));
  held.release({ status: 200, body: payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: 3, away: null }]]) });
  await flush();
  assert.equal(writes().length, 1);
  api.assertAnswered();
});

test("a counter, a journeyman, a lock, a confirmation or a star pressed while a write is on its way is dropped, not sent later", async () => {
  const short = { rosters: { ours: SHORT } };
  const stars = async () => press(view.querySelector('.g-seg[data-seg-group="prep-category"] [data-seg-value="stars"]'));
  const cases = [
    ["a counter", TO_INDUCEMENTS, {}, null, '[data-resource-key="bloodweiser-keg"] [data-resource-step="1"]'],
    ["a journeyman", [...FANS, ...WEATHER], short, null, '[data-prep-hire="0"]'],
    ["a lock", [...FANS, ...WEATHER], { step: "roster" }, null, '[data-prep-action="lock-roster"]'],
    ["a confirmation", [...TO_INDUCEMENTS, ["home", { type: "lock-basket" }]], {}, null, '[data-prep-action="confirm"]'],
    ["a star", TO_INDUCEMENTS, {}, stars, () => view.querySelectorAll("[data-prep-star]").find((each) => each.getAttribute("aria-disabled") !== "true")],
  ];
  for (const [label, actions, options, before, selector] of cases) {
    await visit(actions, options);
    await before?.();
    api.reply(WRITE, 409, { error: { code: "MATCH_REVISION", message: "x" } });
    const gate = api.hold(WRITE);
    const control = typeof selector === "function" ? selector() : view.querySelector(selector);
    await press(control);
    await press(control);
    gate.release();
    await flush();
    assert.equal(writes().length, 1, label);
  }
  api.reset();
});

test("a 409 reads the preparation again and says why; nothing is sent twice", async () => {
  await visit();
  // The opponent rolled on his device meanwhile: our revision is old.
  const theirs = payloadAt([["away", { type: "fans", value: 1 }]]);
  api.reply(WRITE, 409, { error: { code: "MATCH_REVISION", message: "MATCH_REVISION" } });
  api.reply(READ, 200, theirs);
  await press(face("[data-prep-fans]", 2));
  assert.equal(writes().length, 1);
  assert.equal(reads().length, 2, "read again after the refusal");
  assert.equal(view.querySelector('[role="alert"]').textContent.trim(), t("error.MATCH_REVISION"));
  assert.equal(view.querySelector(".g-prep__opp").textContent, "The opponent has entered their roll", "what was read again is drawn");
  assert.equal(face("[data-prep-fans]", 2).getAttribute("aria-checked"), "false", "the press is not taken for done");
  await flush();
  assert.equal(writes().length, 1, "and not sent again by itself");
  // The next press is on the revision read again.
  api.reply(WRITE, 200, payloadAt([["away", { type: "fans", value: 1 }], ["home", { type: "fans", value: 2 }]]));
  await press(face("[data-prep-fans]", 2));
  assert.equal(writes()[1].body.revision, theirs.preparation.revision);
  assert.equal(view.querySelector('[role="alert"]'), null, "a write that lands clears the words");
  api.assertAnswered();
});

test("a lost answer reads the preparation again", async () => {
  await visit();
  api.fail(WRITE);
  await press(face("[data-prep-fans]", 2));
  assert.equal(writes().length, 1);
  assert.equal(reads().length, 2);
  assert.equal(view.querySelector('[role="alert"]').textContent.trim(), t("request.offline"));
  await flush();
  assert.equal(writes().length, 1, "never sent again by itself");
  api.reset();
});

test("the weather sends what is chosen: the season and both dice, an empty die as null", async () => {
  await visit(FANS, { step: "weather" });
  const spring = payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: null, away: null }]]);
  api.reply(WRITE, 200, spring);
  await press(view.querySelector('.g-seg[data-seg-group="prep-season"] [data-seg-value="Spring"]'));
  assert.deepEqual(writes()[0].body, { revision: 3, side: "home", action: { type: "weather", season: "Spring", home: null, away: null } });
  api.reply(WRITE, 200, payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: 3, away: null }]]));
  await press(face('[data-prep-weather="home"]', 3));
  assert.deepEqual(writes()[1].body.action, { type: "weather", season: "Spring", home: 3, away: null });
  // The opponent's die comes with the poll; ours pressed after it does not wipe it (pre-flight L21).
  api.reply(READ, 200, payloadAt([...FANS, ["home", { type: "weather", season: "Spring", home: 3, away: null }], ["away", { type: "weather", season: "Spring", home: 3, away: 4 }]]));
  await tick();
  assert.equal(face('[data-prep-weather="away"]', 4).getAttribute("aria-checked"), "true");
  api.reply(WRITE, 200, payloadAt([...FANS, ["away", { type: "weather", season: "Spring", home: 5, away: 4 }]]));
  await press(face('[data-prep-weather="home"]', 5));
  assert.deepEqual(writes()[2].body.action, { type: "weather", season: "Spring", home: 5, away: 4 });
  api.assertAnswered();
});

test("a journeyman added, the roster confirmed, reopened", async () => {
  const before = [...FANS, ...WEATHER];
  await visit(before, { rosters: { ours: SHORT } });
  const hired = [...before, ["home", { type: "add-journeyman", rowIndex: 0 }]];
  api.reply(WRITE, 200, payloadAt(hired, {}, { ours: SHORT }));
  await press(view.querySelector('[data-prep-hire="0"]'));
  assert.deepEqual(writes()[0].body.action, { type: "add-journeyman", rowIndex: 0 });
  const journeyman = view.querySelector("[data-prep-remove]");
  const id = journeyman.getAttribute("data-prep-remove");
  assert.equal(id, "journeyman-7");
  const removed = [...hired, ["home", { type: "remove-journeyman", id }]];
  api.reply(WRITE, 200, payloadAt(removed, {}, { ours: SHORT }));
  await press(journeyman);
  assert.deepEqual(writes()[1].body.action, { type: "remove-journeyman", id });
  const locked = [...removed, ["home", { type: "lock-roster" }]];
  api.reply(WRITE, 200, payloadAt(locked, {}, { ours: SHORT }));
  await press(view.querySelector('[data-prep-action="lock-roster"]'));
  assert.deepEqual(writes()[2].body.action, { type: "lock-roster" });
  api.reply(WRITE, 200, payloadAt([...locked, ["home", { type: "reopen" }]], {}, { ours: SHORT }));
  await press(view.querySelector('[data-prep-action="reopen"]'));
  assert.deepEqual(writes()[3].body.action, { type: "reopen" });
  assert.deepEqual(writes().map((call) => call.body.revision), [4, 5, 6, 7], "each on the revision the last answer brought");
  assert.ok(view.querySelector('[data-prep-action="lock-roster"]'), "reopened: the roster can be confirmed again");
  api.assertAnswered();
});

test("a counter's plus is a basket of one more; a refused plus says why and sends nothing", async () => {
  await withoutTimers(async () => {
    await visit(TO_INDUCEMENTS);
    const keg = view.querySelector('[data-resource-key="bloodweiser-keg"] [data-resource-step="1"]');
    api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "basket", id: "bloodweiser-keg", quantity: 1 }]]));
    await press(keg);
    assert.deepEqual(writes()[0].body.action, { type: "basket", id: "bloodweiser-keg", quantity: 1 });
    api.reply(WRITE, 200, payloadAt(TO_INDUCEMENTS));
    await press(view.querySelector('[data-resource-key="bloodweiser-keg"] [data-resource-step="-1"]'));
    assert.deepEqual(writes()[1].body.action, { type: "basket", id: "bloodweiser-keg", quantity: 0 });
    // A chef the budget does not reach: the plus says why, nothing is sent.
    const chef = view.querySelector('[data-resource-key="halfling-master-chef"] [data-resource-step="1"]');
    assert.equal(chef.getAttribute("aria-disabled"), "true");
    await press(chef);
    assert.equal(writes().length, 2);
    assert.equal(toasts().at(-1), chef.getAttribute("title"));
    // The stars: «Take» is one of them, the category is the screen's own and writes nothing.
    await press(view.querySelector('.g-seg[data-seg-group="prep-category"] [data-seg-value="stars"]'));
    assert.equal(writes().length, 2, "a category shown is no write");
    const take = view.querySelectorAll("[data-prep-star]").find((button) => button.getAttribute("aria-disabled") !== "true");
    const star = take.getAttribute("data-prep-star");
    api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "basket", id: star, quantity: 1 }]]));
    await press(take);
    assert.deepEqual(writes()[2].body.action, { type: "basket", id: star, quantity: 1 });
    // A star out of reach says why, and is no write.
    const closed = view.querySelectorAll("[data-prep-star]").find((button) => button.getAttribute("aria-disabled") === "true");
    await press(closed);
    assert.equal(writes().length, 3);
    assert.equal(toasts().at(-1), closed.closest(".g-prep-ind__star").querySelector(".g-prep-ind__why").textContent);
    api.assertAnswered();
  });
});

test("the effects are written when a prayer is picked and when the form is saved, as the form says them", async () => {
  const bought = [...TO_INDUCEMENTS, ["home", { type: "basket", id: "nuffles-prayers", quantity: 1 }]];
  await visit(bought);
  const RealFormData = globalThis.FormData;
  // What a browser's FormData reads of the form: the options chosen in each named select.
  globalThis.FormData = class {
    constructor(form) { this.form = form; }
    getAll(name) { return this.form.querySelectorAll(`select[name="${name}"] option[selected]`).map((option) => option.getAttribute("value")); }
    get(name) { return this.getAll(name)[0] ?? null; }
  };
  try {
    const roll = view.querySelector("select[data-prep-prayer]");
    for (const option of roll.querySelectorAll("option")) option.removeAttribute("selected");
    roll.querySelector('option[value="3"]').setAttribute("selected", "");
    api.reply(WRITE, 200, payloadAt(bought));
    fireEvent(roll, "change");
    await flush();
    const effects = { prayers: [{ roll: 3, targets: [], count: null, skill: "" }], markTarget: "", rookies: { first: null, second: null, rowIndex: 0 } };
    assert.deepEqual(writes()[0].body.action, { type: "effects", effects });
    fireEvent(view.querySelector("form[data-prep-effects]"), "submit");
    await flush();
    assert.equal(writes().length, 2);
    assert.equal(writes()[1].body.action.type, "effects");
  } finally {
    globalThis.FormData = RealFormData;
  }
  api.assertAnswered();
});

test("the start pressed twice is one request; a start answered in_progress leads to the matches", async () => {
  await visit(READY);
  const ready = payloadAt(READY);
  assert.equal(ready.preparation.status, "ready");
  const start = view.querySelector('[data-prep-action="start"]');
  assert.ok(!start.hasAttribute("disabled"));
  api.reply(START, 200, begun(ready));
  const gate = api.hold(START);
  await press(start);
  await press(view.querySelector('[data-prep-action="start"]'));
  assert.equal(api.calls.filter((call) => call.key === START).length, 1);
  assert.deepEqual(api.calls.find((call) => call.key === START).body, { revision: ready.preparation.revision, side: "home" });
  assert.equal(writes().length, 0, "the start is no preparation write");
  gate.release();
  await flush();
  assert.equal(location.hash, teamUrl("t1", "matches"));
  const keys = api.calls.map((call) => call.key);
  assert.ok(keys.indexOf("GET /api/games") > keys.indexOf(START), "the games are read again: the match is on");
  assert.equal(keys.filter((key) => key === "GET /api/games").length, 1, "once (the Task 11 review, m-3)");
  // A start answered by nothing: the preparation is read, and a match begun there leads on too.
  await visit(READY);
  api.fail(START);
  api.reply(READ, 200, begun(ready));
  await press(view.querySelector('[data-prep-action="start"]'));
  assert.equal(reads().length, 2);
  assert.equal(location.hash, teamUrl("t1", "matches"));
  assert.equal(api.calls.filter((call) => call.key === START).length, 1, "the start is not sent again");
  // Not ready: the start is closed, and a press sends nothing.
  await visit([...READY.slice(0, -1)]);
  const closed = view.querySelector('[data-prep-action="start"]');
  assert.ok(closed.hasAttribute("disabled"));
  await press(closed);
  assert.equal(api.calls.filter((call) => call.key === START).length, 0);
  api.reset();
});

const starts = () => api.calls.filter((call) => call.key === START).length;

test("the footer's action is armed when it appears: «Confirm» turned into «Start» on its node starts nothing on a second click", async () => {
  const theyConfirmed = [...TO_INDUCEMENTS, ["home", { type: "lock-basket" }], ["away", { type: "confirm" }]];
  await visit(theyConfirmed);
  const button = view.querySelector('[data-prep-action="confirm"]');
  api.reply(WRITE, 200, payloadAt([...theyConfirmed, ["home", { type: "confirm" }]]));
  api.reply(START, 200, begun(payloadAt([...theyConfirmed, ["home", { type: "confirm" }]])));
  await press(button);
  // The double click's second half lands on the same node, which is «Start the match» now.
  assert.equal(button.getAttribute("data-prep-action"), "start", "the same node");
  assert.ok(!button.hasAttribute("disabled"));
  await press(button);
  later(400);
  await press(button);
  assert.equal(starts(), 0, "no start within the arming time");
  later(300);
  await press(button);
  assert.equal(starts(), 1, "a deliberate press after it starts the match");
  assert.equal(location.hash, teamUrl("t1", "matches"));
  api.assertAnswered();
});

test("a page opened by «Next: start» arms its «Start the match» on its first draw: a double click on the link starts nothing", async () => {
  // Ready, and the coach went back to the inducements to look (the re-review's F-1).
  await visit(READY, { step: "inducements" });
  const link = view.querySelector("a.g-prep__cta");
  assert.equal(link.getAttribute("href"), preMatchUrl("g1", "review"));
  api.reply(START, 200, begun(payloadAt(READY)));
  // The first click: the router opens the address; the new page's button stands where the link stood.
  await renderPreMatch("g1", "review");
  await flush();
  const button = view.querySelector('.g-prep__cta[data-prep-action="start"]');
  assert.ok(button && !button.hasAttribute("disabled"), "«Start the match», live");
  await press(button);
  assert.equal(starts(), 0, "the double click's second half starts nothing");
  later(700);
  await press(button);
  assert.equal(starts(), 1, "a deliberate press does");
  api.assertAnswered();
});

test("a «−» that reaches zero gives the focus to the footer's button, armed: the next press of the key locks nothing", async () => {
  // The re-review's F-2: «Confirm the purchases» and «Go on without purchases» are one action, so only the focus moved.
  const chosen = [...TO_INDUCEMENTS, ["home", { type: "basket", id: "bloodweiser-keg", quantity: 1 }]];
  await visit(chosen);
  const minus = view.querySelector('[data-resource-key="bloodweiser-keg"] [data-resource-step="-1"]');
  minus.focus();
  api.reply(WRITE, 200, payloadAt(TO_INDUCEMENTS));
  await press(minus);
  const cta = view.querySelector(".g-prep__cta");
  assert.ok(document.activeElement === cta, `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  assert.equal(cta.textContent, "Go on without purchases");
  await press(cta);
  assert.equal(writes().length, 1, "a stray press locks nothing");
  later(700);
  api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "lock-basket" }]]));
  await press(cta);
  assert.deepEqual(writes().map((call) => call.body.action.type), ["basket", "lock-basket"]);
  api.assertAnswered();
});

test("an Enter held down presses the footer's action once: its auto-repeat makes no click", async () => {
  // The re-review's F-3: a button's Enter repeats its click; the first keydown is the press, the repeats are not.
  await visit(READY);
  const button = view.querySelector('.g-prep__cta[data-prep-action="start"]');
  assert.equal(fireEvent(button, "keydown", { key: "Enter", repeat: false }).defaultPrevented, false);
  assert.equal(fireEvent(button, "keydown", { key: "Enter", repeat: true }).defaultPrevented, true);
  const quiet = await visit([...TO_INDUCEMENTS, ["home", { type: "lock-basket" }]], { step: "inducements" }).then(() => view.querySelector(".g-prep__quiet"));
  assert.equal(fireEvent(quiet, "keydown", { key: "Enter", repeat: true }).defaultPrevented, true, "the quiet one too");
  api.assertAnswered();
});

test("after the footer's own action the focus stays on the footer, else the title — never the body", async () => {
  const focused = async (element) => {
    element.focus();
    await press(element);
  };
  // «Confirm the roster» with the opponent's confirmed: the button becomes the link on.
  const theirsLocked = [...FANS, ...WEATHER, ["away", { type: "lock-roster" }]];
  await visit(theirsLocked, { step: "roster" });
  api.reply(WRITE, 200, payloadAt([...theirsLocked, ["home", { type: "lock-roster" }]]));
  await focused(view.querySelector('[data-prep-action="lock-roster"]'));
  assert.equal(document.activeElement.tagName, "A");
  assert.ok(document.activeElement === view.querySelector("a.g-prep__cta"), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  assert.equal(document.activeElement.textContent, "Next: inducements");
  // «Change the roster»: the quiet button goes, the focus to «Confirm the roster».
  api.reply(WRITE, 200, payloadAt([...theirsLocked, ["home", { type: "lock-roster" }], ["home", { type: "reopen" }]]));
  await focused(view.querySelector('[data-prep-action="reopen"]'));
  assert.ok(document.activeElement === view.querySelector('[data-prep-action="lock-roster"]'), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  // «Confirm the roster» while the opponent's is not: the button stays, closed — the title takes the focus.
  await visit([...FANS, ...WEATHER], { step: "roster" });
  api.reply(WRITE, 200, payloadAt([...FANS, ...WEATHER, ["home", { type: "lock-roster" }]]));
  await focused(view.querySelector('[data-prep-action="lock-roster"]'));
  assert.ok(document.activeElement === view.querySelector("h1"), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  // «Confirm the purchases» once the opponent's are in: the link on to the start.
  await visit(TO_INDUCEMENTS, { step: "inducements" });
  api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "lock-basket" }]]));
  await focused(view.querySelector('[data-prep-action="lock-basket"]'));
  assert.ok(document.activeElement === view.querySelector("a.g-prep__cta"), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  // Both forms of the footer's button carry one key, the quiet button its own: `patch` finds one in the other's place.
  assert.deepEqual([view.querySelector("a.g-prep__cta").getAttribute("data-key"), view.querySelector(".g-prep__quiet").getAttribute("data-key")], ["prep-cta", "prep-quiet"]);
  // «Change the purchases»: a write of `reopen`, the quiet button goes and the focus to the footer's button. The domain's
  // `reopen` unlocks the roster and empties both baskets, so the page stands on the roster again: «Confirm the roster».
  api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "lock-basket" }], ["home", { type: "reopen" }]]));
  await focused(view.querySelector('.g-prep__quiet[data-prep-action="reopen"]'));
  assert.deepEqual(writes().at(-1).body.action, { type: "reopen" });
  assert.ok(document.activeElement === view.querySelector('.g-prep__cta[data-prep-action="lock-roster"]'), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  assert.equal(document.activeElement.getAttribute("data-key"), "prep-cta");
  // The address with no step follows the step on: the same node, «Confirm the preparation» now, keeps the focus — and a
  // second click right after it confirms nothing.
  await visit(TO_INDUCEMENTS);
  api.reply(WRITE, 200, payloadAt([...TO_INDUCEMENTS, ["home", { type: "lock-basket" }]]));
  const button = view.querySelector('[data-prep-action="lock-basket"]');
  await focused(button);
  assert.equal(button.getAttribute("data-prep-action"), "confirm");
  assert.ok(document.activeElement === button, "the focus stays on the footer's button");
  await press(button);
  assert.equal(writes().length, 1, "the rest of a double click is no confirmation");
  // A match begun elsewhere: the footer goes, the title takes the focus.
  await visit(READY);
  view.querySelector('[data-prep-action="start"]').focus();
  api.reply(READ, 200, begun(payloadAt(READY)));
  await tick();
  assert.ok(!view.querySelector(".g-prep__cta"), "the footer is gone");
  assert.ok(document.activeElement === view.querySelector("h1"), `the focus is on ${document.activeElement?.tagName} ${document.activeElement?.textContent}`);
  api.assertAnswered();
});

test("a refusal that is not a 409 is said and nothing is read; a timeout reads again; a start refused reads again and stays", async () => {
  await visit();
  api.reply(WRITE, 403, { error: { code: "FIXTURE_NOT_YOURS", message: "x" } });
  await press(face("[data-prep-fans]", 2));
  assert.equal(view.querySelector('[role="alert"]').textContent.trim(), t("error.FIXTURE_NOT_YOURS"));
  assert.equal(reads().length, 1, "a 403 is not read again");
  assert.ok(view.querySelector(".g-prep__body"), "the page keeps its preparation");
  // A timeout is a lost answer.
  await visit();
  const { ApiError, API_ERROR } = await import("../src/core/api.mjs");
  api.fail(WRITE, new ApiError(API_ERROR.TIMEOUT));
  await press(face("[data-prep-fans]", 2));
  assert.equal(reads().length, 2, "read again after a timeout");
  // The start refused: MATCH_WAIT, read again, drawn, the coach not taken away.
  const notYet = READY.slice(0, -1);
  await visit(READY);
  const hash = location.hash;
  api.reply(START, 409, { error: { code: "MATCH_WAIT", message: "x" } });
  api.reply(READ, 200, payloadAt(notYet));
  await press(view.querySelector('[data-prep-action="start"]'));
  assert.equal(location.hash, hash);
  assert.equal(reads().length, 2);
  assert.equal(view.querySelector('[role="alert"]').textContent.trim(), t("error.MATCH_WAIT"));
  assert.ok(view.querySelector('[data-prep-action="start"]').hasAttribute("disabled"), "drawn as read: not ready");
  api.reset();
});

test("a match begun elsewhere makes the preparation read-only", async () => {
  await withoutTimers(async () => {
    await visit(FANS, { step: "fans" });
    const hash = location.hash;
    api.reply(READ, 200, begun(payloadAt(FANS)));
    await tick();
    assert.equal(view.querySelector(".g-prep__notices").textContent.includes(t("prep.started")), true);
    assert.equal(view.querySelectorAll("[data-prep-action]").length, 0, "no button writes");
    assert.ok(view.querySelectorAll("[data-prep-fans] [data-prep-die]").every((button) => button.getAttribute("aria-disabled") === "true"));
    assert.equal(location.hash, hash, "the coach is not taken away");
    await press(face("[data-prep-fans]", 3));
    assert.equal(writes().length, 0, "a closed die writes nothing");
    assert.equal(toasts().at(-1), t("prep.started"), "and says why");
    api.assertAnswered();
  });
});

test("the poll waits while a write is on its way, the tab is hidden, or the effects' form is being filled", async () => {
  await visit([], { step: "fans" });
  const [timer] = [...polls.ticks.values()];
  assert.equal(timer.ms, 6000);
  const answer = payloadAt([["home", { type: "fans", value: 2 }]]);
  api.reply(WRITE, 200, answer);
  const gate = api.hold(WRITE);
  await press(face("[data-prep-fans]", 2));
  await tick();
  assert.equal(reads().length, 1, "not while a write is on its way");
  gate.release();
  await flush();
  api.reply(READ, 200, answer);
  await tick();
  assert.equal(reads().length, 2, "after it");
  document.hidden = true;
  await tick();
  assert.equal(reads().length, 2, "not while the tab is hidden");
  document.hidden = false;
  const dialog = el(document, "dialog", { open: "" });
  document.body.appendChild(dialog);
  await tick();
  assert.equal(reads().length, 2, "not while a dialog is open");
  document.body.removeChild(dialog);
  // The same revision is not drawn again; another is.
  api.reply(READ, 200, payloadAt([["home", { type: "fans", value: 2 }], ["away", { type: "fans", value: 1 }]]));
  await tick();
  assert.equal(reads().length, 3);
  assert.equal(view.querySelector(".g-prep__opp").textContent, "The opponent has entered their roll");
  // The effects' form being filled.
  const bought = [...TO_INDUCEMENTS, ["home", { type: "basket", id: "nuffles-prayers", quantity: 1 }]];
  await visit(bought);
  fireEvent(view.querySelector("form[data-prep-effects] select"), "input");
  await tick();
  assert.equal(reads().length, 1, "not while the effects' form holds what is not saved");
  api.assertAnswered();
});

test("the poll stops once the match is begun or the preparation is refused, and waits longer after each read that fails", async () => {
  await visit(FANS, { step: "fans" });
  const [id] = [...polls.ticks.keys()];
  api.reply(READ, 200, begun(payloadAt(FANS)));
  await tick();
  assert.ok(polls.cleared.includes(id), "a match begun changes no more here");
  assert.equal(polls.ticks.size, 0);
  // Opened on a match begun: no poll at all.
  await visit(READY, { over: {} });
  api.reply(READ, 200, begun(payloadAt(READY)));
  releaseCurrentScreen();
  api.reset();
  api.reply(READ, 200, begun(payloadAt(READY)));
  polls.ticks.clear();
  await renderPreMatch("g1", "");
  await flush();
  assert.equal(polls.ticks.size, 0, "a page read only from the start is not polled");
  // A 404 stops it for good.
  await visit();
  api.reply(READ, 404, { error: { code: "GAME_NOT_FOUND", message: "x" } });
  await tick();
  assert.equal(polls.ticks.size, 0);
  // A 500: one tick waited out, then three, then the next read; an answer resets the waits.
  await visit();
  api.reply(READ, 500, { error: { code: "INTERNAL", message: "x" } });
  const readAt = [];
  for (let round = 0; round < 36; round += 1) {
    const before = reads().length;
    await tick();
    if (reads().length > before) readAt.push(round);
  }
  // The waits double — 1, 3, 7 ticks — and stay at 9 (a minute) from then on.
  assert.deepEqual(readAt, [0, 2, 6, 14, 24, 34]);
  api.reply(READ, 200, payloadAt());
  for (let round = 0; round < 9; round += 1) await tick();
  const answered = reads().length;
  await tick();
  assert.equal(reads().length, answered + 1, "an answer ends the waiting");
  // A failure after an answer waits one tick again: the count starts over.
  api.reply(READ, 500, { error: { code: "INTERNAL", message: "x" } });
  await tick();
  await tick();
  await tick();
  assert.equal(reads().length, answered + 3, "read, one tick waited, read");
  api.assertAnswered();
});

test("a poll in the air is not doubled; the effects' form read again after a refusal no longer holds the poll", async () => {
  await visit([], { step: "fans" });
  const gate = api.hold(READ);
  const [{ callback }] = [...polls.ticks.values()];
  const first = callback();
  await flush();
  await tick();
  assert.equal(reads().length, 2, "a second tick while a read is in the air reads nothing");
  gate.release({ status: 200, body: payloadAt() });
  await first;
  await flush();
  // The form touched, «Save» refused with a 409: the form is drawn from the read, and the poll may read again.
  const bought = [...TO_INDUCEMENTS, ["home", { type: "basket", id: "nuffles-prayers", quantity: 1 }]];
  await visit(bought);
  fireEvent(view.querySelector("form[data-prep-effects] select"), "input");
  api.reply(WRITE, 409, { error: { code: "MATCH_REVISION", message: "x" } });
  api.reply(READ, 200, payloadAt(bought));
  const RealFormData = globalThis.FormData;
  globalThis.FormData = class { getAll() { return []; } get() { return null; } };
  try {
    fireEvent(view.querySelector("form[data-prep-effects]"), "submit");
    await flush();
  } finally {
    globalThis.FormData = RealFormData;
  }
  assert.equal(reads().length, 2);
  await tick();
  assert.equal(reads().length, 3, "the poll reads again");
  api.assertAnswered();
});

test("a poll that a write overtook draws nothing: the write's answer is newer", async () => {
  await visit([], { step: "fans" });
  const gate = api.hold(READ);
  const polling = [...polls.ticks.values()].at(-1).callback();
  await flush();
  api.reply(WRITE, 200, payloadAt([["home", { type: "fans", value: 2 }]]));
  await press(face("[data-prep-fans]", 2));
  assert.equal(writes().length, 1, "a press is not held back by a poll in the air");
  gate.release();
  await polling;
  await flush();
  assert.equal(reads().length, 2);
  assert.equal(face("[data-prep-fans]", 2).getAttribute("aria-checked"), "true", "the poll's older preparation is dropped");
  api.assertAnswered();
});

test("the admin picks a side and writes for it", async () => {
  const admin = { id: "admin", login: "admin", isAdmin: true };
  await visit([], { over: { isAdmin: true }, user: admin });
  assert.equal(view.querySelector("a.g-prep__back").getAttribute("href"), gameUrl("g1"));
  await press(view.querySelector('.g-seg[data-seg-group="prep-side"] [data-seg-value="away"]'));
  assert.equal(writes().length, 0, "a side shown is no write");
  assert.equal(view.querySelector(".g-prep__teamrow .g-prep__team").textContent, "Silverbrook Rangers", "the page is the away side's");
  api.reply(WRITE, 200, payloadAt([["away", { type: "fans", value: 3 }]], { isAdmin: true }));
  await press(face("[data-prep-fans]", 3));
  assert.deepEqual(writes()[0].body, { revision: 1, side: "away", action: { type: "fans", value: 3 } });
  // An admin who is not the side's coach goes to the game after the start (pre-flight L20).
  await visit(READY, { over: { isAdmin: true }, user: admin });
  api.reply(START, 200, begun(payloadAt(READY, { isAdmin: true })));
  await press(view.querySelector('[data-prep-action="start"]'));
  assert.equal(location.hash, gameUrl("g1"));
  api.assertAnswered();
});

test("leaving stops the poll and the listeners", async () => {
  await visit();
  const [id] = [...polls.ticks.keys()];
  const die = face("[data-prep-fans]", 2);
  releaseCurrentScreen();
  assert.ok(polls.cleared.includes(id), "the poll is stopped");
  fireEvent(die, "click");
  await flush();
  assert.equal(writes().length, 0, "a press after leaving sends nothing");
  // A read that answers after the coach left draws nothing.
  api.reset();
  view.innerHTML = "";
  api.reply(READ, 200, payloadAt());
  const gate = api.hold(READ);
  const visiting = renderPreMatch("g1", "");
  releaseCurrentScreen();
  gate.release();
  await visiting;
  await flush();
  assert.equal(view.querySelector(".g-prep__body"), null, "nothing drawn for a coach who has gone");
  assert.equal(polls.ticks.size, 0, "and no poll left behind");
});
