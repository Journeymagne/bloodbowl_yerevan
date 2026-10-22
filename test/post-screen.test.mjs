import assert from "node:assert/strict";
import test from "node:test";

import { assertCspSafe, document } from "./helpers/ui.mjs";
import { el, fireEvent } from "./helpers/fake-dom.mjs";
import { installFakeApi } from "./helpers/fake-api.mjs";
import { withoutTimers } from "./helpers/without-timers.mjs";

/*
 * The post-match 3.0 as a screen (stage 09b, Task 9): what it reads, what each press writes and on which revision,
 * what a refusal or a lost answer does, the drafts, the finish, the poll and the leaving. The domain applies the
 * actions (test/helpers/post-cases.mjs), so every payload the fake server sends is one the server could.
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
globalThis.location = { hash: "", replaced: "", replace(target) { this.replaced = target; } };
// The page's clock, held by the test: the footer's action is armed 600 ms after it appears.
let clock = Date.parse("2026-10-21T10:00:00Z");
Date.now = () => clock;
const later = (ms = 1000) => {
  clock += ms;
};
// What the coach answers when asked first (ui/sheet.mjs confirmAction asks the browser where there is no <dialog>).
const asked = [];
let yes = true;
globalThis.confirm = (message) => {
  asked.push(message);
  return yes;
};

const { renderPostMatch } = await import("../src/screens/matches/post.mjs");
const { gameUrl, postMatchUrl, teamUrl } = await import("../src/core/routes.mjs");
const { releaseCurrentScreen } = await import("../src/core/screen-lifecycle.mjs");
const { state } = await import("../src/core/state.mjs");
const { view } = await import("../src/core/view.mjs");
const { t } = await import("../src/core/i18n.mjs");
const { ApiError, API_ERROR } = await import("../src/core/api.mjs");
const { followEvents } = await import("../src/domain/post-match/events.mjs");
const { HOME, RECORDS, act, agreed, begin, data, hurt, payloadOf, players, reach, scored, tap } = await import("./helpers/post-cases.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 8; round += 1) await settle();
};

const READ = "GET /api/games/g1/post-match";
const WRITE = "PATCH /api/games/g1/post-match";
const FINISH = "POST /api/games/g1/finish";
const COACH = { id: "u-home", login: "home" };

/** What a server sends: JSON, so no key holds undefined and nothing is shared with the test's states. */
const json = (value) => JSON.parse(JSON.stringify(value));
const payload = (post, over = {}) => json(payloadOf(post, over));
/** The Players step saved by the home side, `change` on top of what it holds. */
const saved = (post, change = {}, events = RECORDS) => act(post, "home", { type: "statistics", statistics: post.home.statistics, injuries: post.home.injuries,
  mvps: post.home.mvps, departures: post.home.departures, ...change }, events);
/** The post-match finished (the server's `finishPost`). */
const finished = (post) => ({ ...json(post), status: "completed", completedAt: "2026-10-21T12:00:00Z", revision: post.revision + 1 });
const at = (stages, begun = begin()) => reach(agreed(begun), stages);

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

/** A coach on the post-match of g1 at `post`, on a phone unless told otherwise; the read answered. */
async function visit(post, { step = "", phone = true, over = {}, user = COACH } = {}) {
  releaseCurrentScreen();
  api.reset();
  polls.cleared.length = 0;
  asked.length = 0;
  yes = true;
  view.innerHTML = "";
  document.hidden = false;
  location.hash = postMatchUrl("g1", step);
  state.auth.currentUser = user;
  state.data = data;
  state.games = { items: [], currentItems: [], loaded: true, loading: false, error: "" };
  api.reply("GET /api/games", 200, { games: [], currentGames: [] });
  api.reply("GET /api/teams", 200, { teams: [] });
  api.reply(READ, 200, payload(post, over));
  const cross = crossingWindow(phone);
  await renderPostMatch("g1", step);
  await flush();
  // A coach reads the page before pressing: the footer's action of the first draw is armed by then.
  later();
  return cross;
}

const calls = (key) => api.calls.filter((call) => call.key === key);
const writes = () => calls(WRITE);
const reads = () => calls(READ);
const toasts = () => document.querySelectorAll("output").map((node) => node.textContent);
const cta = () => view.querySelector(".g-prep__cta");
const alertText = () => view.querySelector('.g-prep__alert[role="alert"] .g-callout__title')?.textContent ?? "";
const face = (group, value) => view.querySelector(`${group} [data-die="${value}"]`);
const mvp = (id) => view.querySelector(`.g-after__mvp [data-after-mvp="${id}"]`);
const row = (id) => view.querySelector(`.g-after__event[data-after-player="${id}"]`);
const sheet = () => view.querySelector("dialog#after-player");
const press = async (element) => {
  assert.ok(element, "the control is on the page");
  fireEvent(element, "click");
  await flush();
};
/** The footer's button, pressed once its action is armed. */
const pressCta = async () => {
  later();
  await press(cta());
};
/** The poll of the visit on screen, as its timer would run it. */
async function tick() {
  const [last] = [...polls.ticks.values()].slice(-1);
  assert.ok(last, "a poll is running");
  await last.callback();
  await flush();
}
/** A test with toasts, whose timers a fake page cannot end. */
const it = (name, body) => test(name, () => withoutTimers(body));

it("the post-match draws its own frame and the step asked for, the focus on its title", async () => {
  const post = at({ home: 3, away: 2 });
  const cross = await visit(post, { step: "players" });
  assert.ok(view.querySelector(".g-prep.g-prep--phone"), "the preparation's frame, its own");
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(document.activeElement.textContent, t("after.title"));
  assert.equal(view.querySelector('.g-prep__dots [aria-current="step"] .g-prep__dotlabel').textContent, t("after.step.players"));
  const notices = view.querySelector(".g-prep__notices");
  assert.ok(notices.textContent.includes(t("after.passed")), "the step is done");
  assert.equal(notices.querySelector('[data-prep-action="reopen"]').textContent.trim(), t("after.reopen"));
  const chips = view.querySelectorAll("[data-after-mvp]");
  assert.ok(chips.length && chips.every((chip) => chip.getAttribute("aria-disabled") === "true"), "the step reads only");
  assert.equal(view.querySelector("a.g-prep__cta").getAttribute("href"), postMatchUrl("g1", "roster"));
  assert.equal(view.querySelector("a.g-prep__back").getAttribute("href"), teamUrl("t-home", "matches"));
  assert.equal(reads().length, 1);
  assert.deepEqual([...polls.ticks.values()].map((timer) => timer.ms), [6000]);
  assertCspSafe(view);
  // A closed control says why, and writes nothing.
  await press(chips[0]);
  assert.equal(toasts().at(-1), t("after.passed"));
  assert.equal(writes().length, 0);
  // A desk's form when the width crosses 900px, the focus kept on the title.
  cross(false);
  assert.ok(view.querySelector(".g-prep.g-prep--desk"));
  assert.ok(view.querySelector("table.g-after__table"));
  assert.equal(view.querySelector(".g-prep__column .g-prep__panel--rows"), null, "no opponent card");
  assert.equal(document.activeElement, view.querySelector("h1"));
  // A step not reached yet is the current one: the income.
  await visit(agreed(begin()), { step: "review" });
  assert.ok(view.querySelector("[data-after-fans]"));
  api.assertAnswered();
});

it("a guest is asked to sign in, and nothing is read", async () => {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  state.auth.currentUser = null;
  crossingWindow(true);
  await renderPostMatch("g1", "");
  await flush();
  assert.ok(view.querySelector("[data-auth-form]"), "the sign-in");
  assert.equal(api.calls.length, 0);
  assert.equal(polls.ticks.size, 0);
  releaseCurrentScreen();
});

it("a post-match that cannot be read says why, with «Read again»", async () => {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = "";
  state.auth.currentUser = COACH;
  state.activeTeamId = "t-home";
  crossingWindow(true);
  api.reply(READ, 404, { error: { code: "GAME_NOT_FOUND", message: "Game not found" } });
  await renderPostMatch("g1", "");
  await flush();
  assert.equal(alertText(), t("after.unread", { reason: t("error.GAME_NOT_FOUND") }));
  // Back to the team's matches, not to the game, which sends the coach straight back here (stage 13, pre-flight L11).
  assert.equal(view.querySelector("a.g-prep__back").getAttribute("href"), teamUrl("t-home", "matches"));
  assert.equal(document.activeElement, view.querySelector("h1"));
  assert.equal(polls.ticks.size, 0, "no poll for a post-match not read");
  const retry = view.querySelector("[data-after-retry]");
  assert.equal(retry.textContent, t("after.retry"));
  api.reply(READ, 200, payload(agreed(begin())));
  await press(retry);
  assert.equal(reads().length, 2);
  assert.ok(view.querySelector("[data-after-fans]"), "the post-match, read at last");
  assert.equal(polls.ticks.size, 1, "and its poll");
  releaseCurrentScreen();
});

it("the score is sent with the revision and the side; the answer is drawn", async () => {
  const post = begin();
  await visit(post);
  const value = () => view.querySelector('[data-score-key="own:touchdowns"] .g-after__value').textContent;
  assert.equal(value(), "2", "from the records");
  await press(view.querySelector('[data-score-key="own:touchdowns"] [data-score-step="1"]'));
  assert.equal(value(), "3");
  assert.equal(writes().length, 0, "the score is kept on the page");
  api.reply(WRITE, 200, payload(scored(post, { home: [3, 3] })));
  await pressCta();
  assert.deepEqual(writes().map((call) => call.body), [{ revision: post.revision, side: "home",
    action: { type: "result", mode: "played", winner: "", home: { touchdowns: 3, casualties: 3 }, away: { touchdowns: 1, casualties: 1 } } }]);
  // Drawn from the answer: the score sent, the opponent waited for, the records against it.
  assert.equal(value(), "3");
  assert.ok(cta().hasAttribute("disabled"));
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.waitAgree"));
  assert.ok(view.querySelector('.g-after__alert[role="alert"]').textContent.includes(t("after.mismatch")));
  const keys = api.calls.map((call) => call.key);
  assert.ok(keys.lastIndexOf("GET /api/games") > keys.indexOf(WRITE), "the games are read again");
  // The opponent's score: confirmed as it stands, or answered with ours.
  await visit(scored(post, { by: "away" }), { step: "result" });
  assert.equal(cta().getAttribute("data-prep-action"), "agree-result");
  api.reply(WRITE, 200, payload(agreed(post, { by: "away" })));
  await pressCta();
  assert.deepEqual(writes().at(-1).body.action, { type: "agree-result" });
  api.assertAnswered();
});

it("a refused write on a revision moved by the opponent is sent once more when this side and the score are as seen", async () => {
  const base = agreed(begin());
  const fans = { type: "fans", roll: 4, technicalRoll: null, painted: false, stalling: false };
  await visit(base, { step: "fans" });
  await press(face("[data-after-fans]", 4));
  const moved = act(base, "away", { type: "fans", roll: 3, technicalRoll: "", painted: false, stalling: false });
  api.reply(READ, 200, payload(moved));
  api.reply(WRITE, 200, payload(act(moved, "home", fans)));
  const gate = api.hold(WRITE);
  await pressCta();
  gate.release({ status: 409, body: { error: { code: "POST_REVISION", message: "x" } } });
  await flush();
  assert.deepEqual(writes().map((call) => [call.body.revision, call.body.side, call.body.action]), [[base.revision, "home", fans], [moved.revision, "home", fans]]);
  assert.equal(alertText(), "", "it went: nothing to say");
  assert.equal(view.querySelector("a.g-prep__cta").getAttribute("href"), postMatchUrl("g1", "players"));
  // The score changed meanwhile (the opponent sent another): nothing is sent again; the server's words, the page read.
  await visit(base, { step: "fans" });
  await press(face("[data-after-fans]", 4));
  api.reply(READ, 200, payload(scored(base, { home: [2, 3], away: [2, 1], by: "away" })));
  api.reply(WRITE, 409, { error: { code: "POST_REVISION", message: "x" } });
  await pressCta();
  assert.equal(writes().length, 1);
  assert.equal(alertText(), t("error.POST_REVISION"));
  assert.ok(view.querySelector('[data-score-key="own:touchdowns"]'), "drawn as read: the score to confirm");
  assert.equal(cta().getAttribute("data-prep-action"), "agree-result");
  api.assertAnswered();
});

it("a lost answer reads the post-match again and sends nothing twice", async () => {
  const base = at({ home: 3, away: 3 });
  await visit(base);
  api.fail(WRITE);
  api.reply(READ, 200, payload(act(base, "home", { type: "lock-roster" })));
  await pressCta();
  assert.equal(writes().length, 1);
  assert.equal(reads().length, 2);
  assert.ok(view.querySelector('[data-resource-key="deposit"]'), "the read shows it went: the treasury");
  // A timeout is a lost answer too; the page keeps what the read says.
  await visit(base);
  api.fail(WRITE, new ApiError(API_ERROR.TIMEOUT));
  await pressCta();
  assert.deepEqual([writes().length, reads().length], [1, 2]);
  assert.equal(cta().getAttribute("data-prep-action"), "lock-roster", "it did not go: the coach presses again");
  // A refusal that is no 409 is said, and nothing is read.
  await visit(base);
  api.reply(WRITE, 403, { error: { code: "FIXTURE_NOT_YOURS", message: "x" } });
  await pressCta();
  assert.deepEqual([writes().length, reads().length], [1, 1]);
  assert.equal(alertText(), t("error.FIXTURE_NOT_YOURS"));
  api.reset();
});

it("a press while a write is on its way sends nothing; a Players' press waits and is sent from the latest draft", async () => {
  const roster = at({ home: 3, away: 3 });
  await visit(roster);
  api.reply(WRITE, 200, payload(act(roster, "home", { type: "lock-roster" })));
  const gate = api.hold(WRITE);
  const next = cta();
  await press(next);
  later();
  await press(next);
  assert.equal(writes().length, 1);
  gate.release();
  await flush();
  assert.equal(writes().length, 1, "nothing is sent later on its behalf");
  // The MVP pressed three times while the first write is out: the last one goes, once, on the answer's revision.
  const post = at({ home: 2, away: 2 });
  await visit(post);
  const first = saved(post, { mvps: ["h3"] });
  const held = api.hold(WRITE);
  await press(mvp("h3"));
  await press(mvp("h4"));
  await press(mvp("h1"));
  assert.deepEqual(writes().map((call) => call.body.action.mvps), [["h3"]]);
  assert.equal(mvp("h1").getAttribute("aria-checked"), "true", "the page shows the latest press");
  api.reply(WRITE, 200, payload(saved(first, { mvps: ["h1"] })));
  held.release({ status: 200, body: payload(first) });
  await flush();
  assert.deepEqual(writes().map((call) => [call.body.revision, call.body.action.mvps]), [[post.revision, ["h3"]], [first.revision, ["h1"]]]);
  // The whole side, in the shape the domain saves (2.x's `statisticsAction`): every counter, the injuries, MVPs, departures.
  const { action } = writes()[1].body;
  assert.deepEqual(Object.keys(action).sort(), ["departures", "injuries", "mvps", "statistics", "type"]);
  assert.deepEqual(action.statistics, json(post.home.statistics));
  assert.deepEqual(action.injuries, { h2: { code: "lasting", stat: "ag", retire: false } });
  assert.equal(mvp("h1").getAttribute("aria-checked"), "true");
  api.assertAnswered();
});

it("an answer equal to the draft sends nothing more; an injury chosen and taken back, a non-veteran's departure: one write each (pre-flight L2)", async () => {
  const post = at({ home: 2, away: 2 });
  await visit(post);
  const first = saved(post, { mvps: ["h3"] });
  const held = api.hold(WRITE);
  await press(mvp("h3"));
  await press(mvp("h4"));
  await press(mvp("h3"));
  held.release({ status: 200, body: payload(first) });
  await flush();
  assert.equal(writes().length, 1, "pressed back to what was on its way: nothing more");
  await tick();
  assert.equal(reads().length, 2, "nothing kept: the poll reads again");
  // An answer that is not what was sent (a tap the server read meanwhile) is taken as it is: never sent «until it matches».
  await visit(post);
  const tapped = { home: [...RECORDS.home, ...tap("h6", "knockouts")], away: RECORDS.away };
  api.reply(WRITE, 200, payload(saved(followEvents(post, tapped), { mvps: ["h4"] }, tapped)));
  await press(mvp("h4"));
  await flush();
  assert.equal(writes().length, 1);
  assert.ok(row("h6"), "the answer drawn as it is");
  await visit(post);
  api.reply(WRITE, 200, payload(first));
  await press(mvp("h3"));
  // An injury chosen in the player's sheet and taken back: «No injury» kept as the domain keeps it.
  await press(row("h3"));
  const missed = saved(first, { injuries: { ...first.home.injuries, h3: { code: "miss", retire: false } } });
  api.reply(WRITE, 200, payload(missed));
  await press(sheet().querySelector('[data-after-injury="h3"] [data-code="miss"]'));
  api.reply(WRITE, 200, payload(saved(missed, { injuries: { ...first.home.injuries, h3: { code: "none", retire: false } } })));
  await press(sheet().querySelector('[data-after-injury="h3"] [data-code="none"]'));
  await flush();
  assert.deepEqual(writes().slice(1).map((call) => call.body.action.injuries.h3), [{ code: "miss", retire: false }, { code: "none", retire: false }]);
  // A Lasting Injury waits for its characteristic: nothing goes, «Next: roster» says why; the characteristic goes.
  await press(sheet().querySelector('[data-after-injury="h3"] [data-code="lasting"]'));
  assert.equal(writes().length, 3);
  await pressCta();
  assert.equal(toasts().at(-1), t("after.statFirst"));
  assert.equal(writes().length, 3);
  api.reply(WRITE, 200, payload(saved(missed, { injuries: { ...first.home.injuries, h3: { code: "lasting", stat: "ag", retire: false } } })));
  await press(sheet().querySelector('[data-after-stat="h3"] [data-stat="ag"]'));
  assert.deepEqual(writes().slice(3).map((call) => call.body.action.injuries.h3), [{ code: "lasting", stat: "ag", retire: false }]);
  // A side that conceded in full: a veteran's die, then one of a player who is no veteran (a control the page does
  // not draw for him) — one write each, his die left out, and nothing after.
  const veteran = HOME.map((player, index) => (index === 0 ? { ...player, advancements: [1, 2, 3].map((n) => ({ type: "primary", grants: { skill: ["Block", "Dodge", "Catch"][n - 1] } })) } : player));
  const conceded = reach(agreed(begin({ home: { roster: veteran } }), { home: [0, 0], away: [2, 0], mode: "conceded", winner: "away", by: "away" }), { home: 2, away: 2 });
  await visit(conceded);
  const died = saved(conceded, { departures: { h1: 2 } });
  api.reply(WRITE, 200, payload(died));
  await press(view.querySelector('[data-after-departure="h1"] [data-die="2"]'));
  const card = view.querySelector('[data-after-departure="h1"]').parentNode;
  card.appendChild(el(document, "div", { role: "radiogroup", "data-after-departure": "h3" },
    el(document, "button", { type: "button", role: "radio", "aria-checked": "false", "data-die": "2" }, "2")));
  api.reply(WRITE, 200, payload(saved(died)));
  await press(view.querySelector('[data-after-departure="h3"] [data-die="2"]'));
  await flush();
  assert.deepEqual(writes().map((call) => call.body.action.departures), [{ h1: 2 }, { h1: 2 }]);
  api.assertAnswered();
});

it("a refused Players write reads the post-match again: the draft goes, and the coach is told when it held what was not sent", async () => {
  const post = at({ home: 2, away: 2 });
  await visit(post);
  api.reply(WRITE, 409, { error: { code: "POST_ACTION", message: "x" } });
  await press(mvp("h3"));
  assert.deepEqual([writes().length, reads().length], [1, 2]);
  assert.equal(toasts().at(-1), t("after.draftLost"));
  assert.equal(mvp("h3").getAttribute("aria-checked"), "false", "drawn as read");
  assert.equal(alertText(), t("error.POST_ACTION"));
  // A lost answer whose write landed: the read holds the draft, nothing is said lost.
  await visit(post);
  const count = toasts().length;
  api.fail(WRITE);
  api.reply(READ, 200, payload(saved(post, { mvps: ["h3"] })));
  await press(mvp("h3"));
  assert.deepEqual([writes().length, reads().length], [1, 2]);
  assert.equal(toasts().length, count);
  assert.equal(mvp("h3").getAttribute("aria-checked"), "true");
  await tick();
  assert.equal(reads().length, 3, "nothing kept: the poll reads");
});

it("the Players draft changes only in the shape the domain saves (pre-flight L2)", async () => {
  const { changePlayers, playersDraft, playersSendable } = await import("../src/screens/matches/post-players.mjs");
  const { postModel } = await import("../src/screens/matches/post-model.mjs");
  const post = at({ home: 2, away: 2 });
  const model = postModel(payloadOf(post), "home", "players", { data });
  const draft = playersDraft(post.home);
  // Crowd casualties past CAS, an unknown counter, a player not in the match, an MVP not offered: the same draft.
  for (const change of [{ kind: "counter", playerId: "h3", counter: "crowdCasualties", delta: 1 }, { kind: "counter", playerId: "h3", counter: "mvps", delta: 1 },
    { kind: "counter", playerId: "x9", counter: "touchdowns", delta: 1 }, { kind: "departure", playerId: "h1", die: 2 }, { kind: "stat", playerId: "h3", stat: "ag" }]) {
    assert.equal(changePlayers(model, draft, change), draft, JSON.stringify(change));
  }
  // CAS first, then its part; never below 0 or past 99.
  const cas = changePlayers(model, changePlayers(model, draft, { kind: "counter", playerId: "h3", counter: "casualties", delta: 1 }), { kind: "counter", playerId: "h3", counter: "crowdCasualties", delta: 1 });
  assert.deepEqual([cas.statistics.h3.casualties, cas.statistics.h3.crowdCasualties], [1, 1]);
  assert.equal(changePlayers(model, draft, { kind: "counter", playerId: "h6", counter: "knockouts", delta: -1 }).statistics.h6.knockouts, 0);
  // A Lasting Injury keeps its characteristic and «rest of the season» through the switch; any other injury is plain.
  const lasting = changePlayers(model, draft, { kind: "retire", playerId: "h2", on: true });
  assert.deepEqual(lasting.injuries.h2, { code: "lasting", stat: "ag", retire: true });
  assert.deepEqual(changePlayers(model, lasting, { kind: "injury", playerId: "h2", code: "niggling" }).injuries.h2, { code: "niggling", retire: false });
  assert.equal(playersSendable(changePlayers(model, draft, { kind: "injury", playerId: "h3", code: "lasting" })), false);
  // One MVP replaced; the draft is a new object, the one given left alone.
  const one = changePlayers(model, changePlayers(model, draft, { kind: "mvp", playerId: "h3", on: true }), { kind: "mvp", playerId: "h4", on: true });
  assert.deepEqual([one.mvps, draft.mvps], [["h4"], []]);
});

it("a row opens the player's sheet; a stepper in it writes once and keeps the sheet and the focus; closing gives the focus back (pre-flight L6)", async () => {
  const post = at({ home: 2, away: 2 });
  await visit(post);
  row("h3").focus();
  await press(row("h3"));
  assert.ok(sheet()?.open, "the sheet is open");
  const plus = sheet().querySelector('[data-action-key="knockouts"] [data-action-step="1"]');
  plus.focus();
  const counted = saved(post, { statistics: { ...post.home.statistics, h3: { ...post.home.statistics.h3, knockouts: 1 } } });
  api.reply(WRITE, 200, payload(counted));
  await press(plus);
  assert.equal(writes().length, 1);
  assert.equal(writes()[0].body.action.statistics.h3.knockouts, 1);
  assert.ok(sheet()?.open, "the sheet stays");
  assert.equal(sheet().querySelector('[data-action-key="knockouts"] .g-stepper__value').textContent, "1");
  assert.ok(document.activeElement.closest('[data-action-key="knockouts"]'), "the focus stays on the stepper");
  // Crowd casualties past CAS: refused with why, nothing written.
  await press(sheet().querySelector('[data-action-key="crowdCasualties"] [data-action-step="1"]'));
  assert.equal(toasts().at(-1), t("after.casFirst"));
  assert.equal(writes().length, 1);
  await press(sheet().querySelector("[data-sheet-close]"));
  assert.equal(sheet(), null);
  assert.equal(document.activeElement, row("h3"));
  api.assertAnswered();
});

it("a tap that changed the side is said, and the advancements chosen go", async () => {
  const events = { home: [...RECORDS.home, ...tap("h4", "touchdowns")], away: RECORDS.away };
  const post = reach(agreed(begin({ events }), { home: [3, 3], events }), { home: 2, away: 2 }, { events });
  const advanced = act(post, "home", { type: "advance", playerId: "h4", advancementType: "primary", grant: { skill: "Block" } }, events);
  await visit(advanced);
  assert.ok(view.querySelector('[data-after-untake="h4"]'), "the advancement chosen");
  api.reply(READ, 200, payload(followEvents(advanced, { home: [...events.home, ...tap("h6", "knockouts")], away: events.away })));
  await tick();
  assert.equal(toasts().at(-1), t("after.tapsChanged"));
  assert.equal(view.querySelector("[data-after-untake]"), null, "taken off");
  assert.ok(row("h6"), "the tap is drawn");
  // A read that brings the same records says nothing.
  const count = toasts().length;
  api.reply(READ, 200, payload({ ...followEvents(advanced, { home: [...events.home, ...tap("h6", "knockouts")], away: events.away }), revision: advanced.revision + 5 }));
  await tick();
  assert.equal(toasts().length, count);
});

it("a new score rebuilds the side from the records, and the mismatch is said on the Players step", async () => {
  const base = agreed(begin());
  await visit(base, { step: "result" });
  await press(view.querySelector('[data-prep-action="unlock-result"]'));
  await press(view.querySelector('[data-score-key="own:touchdowns"] [data-score-step="1"]'));
  const rescored = scored(base, { home: [3, 3] });
  assert.equal(rescored.home.stage, 0, "both sides start again from the records");
  api.reply(WRITE, 200, payload(rescored));
  await pressCta();
  assert.deepEqual(writes()[0].body.action.home, { touchdowns: 3, casualties: 3 });
  assert.ok(view.querySelector('.g-after__alert[role="alert"]').textContent.includes(t("after.mismatch")));
  // Agreed, the income in: the Players step says it, and «Next: roster» stays closed with why.
  await visit(reach(act(rescored, "away", { type: "agree-result" }), { home: 2, away: 2 }));
  assert.ok(view.querySelector('.g-after__alert[role="alert"]').textContent.includes(t("after.mismatch")));
  assert.ok(cta().hasAttribute("disabled"));
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.mismatchShut"));
});

it("the fans, the treasury and the captain are kept on the page and sent by the step's button", async () => {
  const base = agreed(begin());
  await visit(base, { step: "fans" });
  await press(face("[data-after-fans]", 4));
  await press(view.querySelector('[data-toggle-key="stalling"]'));
  assert.equal(writes().length, 0);
  assert.equal(view.querySelector('[data-toggle-key="stalling"]').getAttribute("aria-checked"), "true");
  const fans = { type: "fans", roll: 4, technicalRoll: null, painted: false, stalling: true };
  api.reply(WRITE, 200, payload(act(base, "home", fans)));
  await pressCta();
  assert.deepEqual(writes().map((call) => call.body.action), [fans]);
  await tick();
  assert.equal(reads().length, 2, "the draft went with its write: the poll reads again");
  // The treasury: the safe's counter and the Expensive Mistakes' die.
  const finance = reach(base, { home: 4, away: 3 });
  await visit(finance);
  const safe = () => view.querySelector('[data-resource-key="deposit"] [data-resource-step="1"]');
  await press(safe());
  await press(safe());
  await press(face("[data-after-mistake]", 6));
  assert.equal(writes().length, 0);
  const money = { type: "finance", deposit: 2, mistake: { roll: 6, first: null, second: null } };
  api.reply(WRITE, 200, payload(act(finance, "home", money)));
  await pressCta();
  assert.deepEqual(writes().map((call) => call.body.action), [money]);
  // The captain.
  const next = reach(base, { home: 5, away: 3 });
  await visit(next);
  // The reference reaches the steps (postModel's `data`, batch B's hand-off): TV and CTV are counted, not «—».
  const valueOf = (label) => view.querySelectorAll(".g-after__row").find((item) => item.querySelector(".g-after__rowk").textContent.startsWith(label))
    ?.querySelector(".g-after__rowv").textContent;
  assert.match(valueOf(t("after.tv")), /\d.* → .*\d/);
  assert.match(valueOf(t("after.ctv")), /\d.* → .*\d/);
  await press(view.querySelector('[data-after-captain] [data-captain="h3"]'));
  assert.equal(writes().length, 0);
  api.reply(WRITE, 200, payload(act(next, "home", { type: "next", captain: "h3" })));
  await pressCta();
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "next", captain: "h3" }]);
  api.assertAnswered();
});

it("staff, hire, sell, keep and raise are writes of the roster step; «Undo the last» takes one back", async () => {
  const atRoster = (begun, events = RECORDS) => reach(agreed(begun, { events }), { home: 3, away: 3 }, { events });
  const base = atRoster(begin({ home: { treasury: 300 } }));
  await visit(base);
  const staffed = act(base, "home", { type: "roster", operation: "staff", key: "assistantCoaches", delta: 1 });
  api.reply(WRITE, 200, payload(staffed));
  await press(view.querySelector('[data-resource-key="assistantCoaches"] [data-resource-step="1"]'));
  const opener = view.querySelector('[data-after-open="hire"]');
  opener.focus();
  await press(opener);
  assert.ok(view.querySelector("dialog#after-hire").open);
  const hired = act(staffed, "home", { type: "roster", operation: "hire", rowIndex: 0 });
  api.reply(WRITE, 200, payload(hired));
  await press(view.querySelector('#after-hire [data-after-hire="0"]'));
  assert.equal(view.querySelector("dialog#after-hire"), null, "the sheet closed");
  assert.equal(document.activeElement, view.querySelector('[data-after-open="hire"]'), "the focus back on «+ Hire»");
  await press(view.querySelector('[data-after-open="sell"]'));
  const sold = act(hired, "home", { type: "roster", operation: "sell", playerId: "h6" });
  api.reply(WRITE, 200, payload(sold));
  await press(view.querySelector('#after-sell [data-after-sell="h6"]'));
  api.reply(WRITE, 200, payload(act(sold, "home", { type: "undo-roster" })));
  await press(view.querySelector('[data-prep-action="undo-roster"]'));
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "roster", operation: "staff", key: "assistantCoaches", delta: 1 },
    { type: "roster", operation: "hire", rowIndex: 0 }, { type: "roster", operation: "sell", playerId: "h6" }, { type: "undo-roster" }]);
  // A journeyman of this match kept.
  const kept = atRoster(begin({ home: { roster: HOME.slice(0, 6), journeymen: [0] } }));
  await visit(kept);
  api.reply(WRITE, 200, payload(act(kept, "home", { type: "roster", operation: "keep", playerId: "journeyman-7" })));
  await press(view.querySelector('[data-after-keep="journeyman-7"]'));
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "roster", operation: "keep", playerId: "journeyman-7" }]);
  // Raise Dead for Masters of Undeath.
  const events = { home: RECORDS.home, away: [...RECORDS.away, ...hurt("a3", { code: "dead" })] };
  const undead = atRoster(begin({ home: { roster: players("h", [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]), slug: "teams/shambling-undead" }, events }), events);
  await visit(undead);
  api.reply(WRITE, 200, payload(act(undead, "home", { type: "roster", operation: "raise", rowIndex: 1 }, events)));
  await press(view.querySelector('[data-after-raise="1"]'));
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "roster", operation: "raise", rowIndex: 1 }]);
  api.assertAnswered();
});

it("changing the score after it is agreed asks first", async () => {
  await visit(agreed(begin()), { step: "result" });
  const step = () => view.querySelector('[data-score-key="own:touchdowns"] [data-score-step="1"]');
  assert.ok(step().hasAttribute("disabled"), "agreed: closed");
  yes = false;
  await press(view.querySelector('[data-prep-action="unlock-result"]'));
  assert.deepEqual(asked, [t("after.changeAsk")]);
  assert.ok(step().hasAttribute("disabled"), "cancelled: still closed");
  yes = true;
  await press(view.querySelector('[data-prep-action="unlock-result"]'));
  assert.ok(!step().hasAttribute("disabled"), "open to change");
  assert.ok(cta().hasAttribute("disabled"));
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.changeFirst"));
  assert.equal(writes().length, 0);
});

it("reopen and reset-side ask first", async () => {
  const post = at({ home: 3, away: 2 });
  await visit(post, { step: "players" });
  yes = false;
  await press(view.querySelector('[data-prep-action="reopen"]'));
  assert.deepEqual(asked.splice(0), [t("after.reopenAsk")]);
  assert.equal(writes().length, 0);
  yes = true;
  api.reply(WRITE, 200, payload(act(post, "home", { type: "reopen" })));
  await press(view.querySelector('[data-prep-action="reopen"]'));
  assert.deepEqual(asked.splice(0), [t("after.reopenAsk")]);
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "reopen" }]);
  assert.ok(view.querySelector("[data-after-fans]"), "back on the income");
  // The team changed since the post-match began: «Start over with the current roster».
  await visit(post, { over: { rosterChanged: { home: true, away: false } } });
  const reset = view.querySelector('.g-prep__notices [data-prep-action="reset-side"]');
  assert.ok(reset.closest(".g-callout").textContent.includes(t("after.rosterChanged")));
  assert.equal(reset.textContent.trim(), t("after.reset"));
  api.reply(WRITE, 200, payload({ ...json(post), revision: post.revision + 1 }));
  await press(reset);
  assert.deepEqual(asked.splice(0), [t("after.resetAsk")]);
  assert.deepEqual(writes().map((call) => call.body.action), [{ type: "reset-side" }]);
  api.assertAnswered();
});

it("«Finish the match» pressed twice is one request; a finish answered completed draws the summary read only", async () => {
  const ready = at({ home: 7, away: 7 });
  assert.equal(ready.status, "ready");
  await visit(ready);
  const button = cta();
  assert.equal(button.getAttribute("data-prep-action"), "finish");
  assert.equal(button.textContent, t("after.finish"));
  api.reply(FINISH, 200, payload(finished(ready)));
  const gate = api.hold(FINISH);
  await press(button);
  await press(button);
  assert.equal(calls(FINISH).length, 1);
  assert.deepEqual(calls(FINISH)[0].body, { revision: ready.revision, side: "home" });
  assert.equal(writes().length, 0, "the finish is no post-match write");
  gate.release();
  await flush();
  const notices = view.querySelector(".g-prep__notices");
  assert.ok(notices.textContent.includes(t("after.completed")));
  assert.deepEqual(notices.querySelectorAll("a").map((link) => [link.textContent.trim(), link.getAttribute("href")]),
    [[t("after.toMatches"), teamUrl("t-home", "matches")], [t("after.toRoster"), teamUrl("t-home", "roster")]]);
  assert.equal(cta(), null, "nothing more to press");
  assert.ok(view.querySelector(".g-after__sides"), "the summary, read only");
  const keys = api.calls.map((call) => call.key);
  assert.ok(keys.indexOf("GET /api/teams") > keys.indexOf(FINISH), "the teams are read again: the fallen, the new players");
  assert.ok(keys.lastIndexOf("GET /api/games") > keys.indexOf(FINISH), "and the games");
  assert.equal(polls.ticks.size, 0, "the poll stopped");
  api.assertAnswered();
});

it("the finish reads the teams again, also when its answer was lost and the read finds it finished", async () => {
  const ready = at({ home: 7, away: 7 });
  await visit(ready);
  api.fail(FINISH);
  api.reply(READ, 200, payload(finished(ready)));
  await pressCta();
  assert.deepEqual([calls(FINISH).length, reads().length], [1, 2]);
  assert.ok(view.querySelector(".g-prep__notices").textContent.includes(t("after.completed")));
  assert.equal(calls("GET /api/teams").length, 1);
  assert.equal(calls("GET /api/games").length, 1);
  // The other coach finished: the poll finds it so, reads the teams and stops.
  await visit(ready);
  api.reply(READ, 200, payload(finished(ready)));
  await tick();
  assert.equal(calls("GET /api/teams").length, 1);
  assert.equal(polls.ticks.size, 0);
});

it("a finish refused is read again and said: a roll the finish refuses (422, pre-flight L9), a team changed", async () => {
  const ready = at({ home: 7, away: 7 });
  await visit(ready);
  api.reply(FINISH, 422, { error: { code: "DICE_ROLL_MISMATCH", message: "x", params: { playerId: "h3" } } });
  await pressCta();
  assert.deepEqual([calls(FINISH).length, reads().length], [1, 2]);
  assert.equal(alertText(), t("error.DICE_ROLL_MISMATCH"));
  await visit(ready);
  api.reply(FINISH, 409, { error: { code: "POST_TEAM_CHANGED", message: "x" } });
  api.reply(READ, 200, payload(ready, { rosterChanged: { home: true, away: false } }));
  await pressCta();
  assert.equal(alertText(), t("error.POST_TEAM_CHANGED"));
  assert.ok(view.querySelector('.g-prep__notices [data-prep-action="reset-side"]'), "the way to start over");
  assert.equal(calls(FINISH).length, 1, "nothing is sent again");
});

it("the footer's action is armed when it appears: a double click on «Confirm the summary» finishes nothing", async () => {
  const theyConfirmed = at({ home: 6, away: 7 });
  await visit(theyConfirmed);
  const button = cta();
  assert.equal(button.getAttribute("data-prep-action"), "confirm");
  const ready = act(theyConfirmed, "home", { type: "confirm" });
  assert.equal(ready.status, "ready");
  api.reply(WRITE, 200, payload(ready));
  api.reply(FINISH, 200, payload(finished(ready)));
  await press(button);
  assert.equal(button.getAttribute("data-prep-action"), "finish", "the same node");
  await press(button);
  later(400);
  await press(button);
  assert.equal(calls(FINISH).length, 0, "nothing within the arming time");
  later(300);
  await press(button);
  assert.equal(calls(FINISH).length, 1, "a deliberate press finishes");
  // An Enter held down presses once: its auto-repeat is no click.
  await visit(ready);
  assert.equal(fireEvent(cta(), "keydown", { key: "Enter", repeat: false }).defaultPrevented, false);
  assert.equal(fireEvent(cta(), "keydown", { key: "Enter", repeat: true }).defaultPrevented, true);
  // The first draw arms it too: a page opened by «Next: summary» finishes nothing on the double click's second half.
  releaseCurrentScreen();
  api.reply(READ, 200, payload(ready));
  await renderPostMatch("g1", "review");
  await flush();
  await press(cta());
  assert.equal(calls(FINISH).length, 0);
  later(700);
  await press(cta());
  assert.equal(calls(FINISH).length, 1);
});

it("after the footer's own action the focus stays on the footer, else the title — never the body", async () => {
  // «Confirm the summary» while the opponent's is not: «Finish the match» stays closed — the title takes the focus.
  const both = at({ home: 6, away: 6 });
  await visit(both);
  cta().focus();
  api.reply(WRITE, 200, payload(act(both, "home", { type: "confirm" })));
  await pressCta();
  assert.ok(cta().hasAttribute("disabled"));
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.finishHint"));
  assert.equal(document.activeElement, view.querySelector("h1"));
  // «Next: summary» from the captain: the link on keeps the focus on the footer.
  const next = at({ home: 5, away: 5 });
  await visit(next, { step: "next" });
  cta().focus();
  api.reply(WRITE, 200, payload(act(next, "home", { type: "next", captain: "h1" })));
  await pressCta();
  assert.equal(document.activeElement, view.querySelector("a.g-prep__cta"));
  assert.equal(document.activeElement.getAttribute("href"), postMatchUrl("g1", "review"));
});

it("the admin picks a side and writes for it", async () => {
  const post = at({ home: 3, away: 3 });
  await visit(post, { user: { id: "u-admin", login: "admin", isAdmin: true }, over: { isAdmin: true } });
  assert.equal(view.querySelector("a.g-prep__back").getAttribute("href"), gameUrl("g1"));
  await press(view.querySelector('.g-seg[data-seg-group="prep-side"] [data-seg-value="away"]'));
  api.reply(WRITE, 200, payload(act(post, "away", { type: "lock-roster" }), { isAdmin: true }));
  await pressCta();
  assert.deepEqual(writes().map((call) => [call.body.side, call.body.action]), [["away", { type: "lock-roster" }]]);
  assert.equal(view.querySelector('.g-seg[data-seg-group="prep-side"] [aria-checked="true"]').getAttribute("data-seg-value"), "away");
});

it("the poll waits while a write is on its way, a draft is kept, a sheet is open or the tab is hidden; a finished post-match stops it", async () => {
  const base = agreed(begin());
  const moved = act(base, "away", { type: "fans", roll: 3, technicalRoll: "", painted: false, stalling: false });
  await visit(base, { step: "fans" });
  assert.equal(view.querySelector(".g-prep__opp").textContent, t("after.opponent.same"));
  api.reply(READ, 200, payload(moved));
  document.hidden = true;
  await tick();
  assert.equal(reads().length, 1, "the tab is hidden");
  document.hidden = false;
  // A draft kept holds no read: the opponent's move is drawn under it, and the draft stays.
  await press(face("[data-after-fans]", 4));
  await tick();
  assert.equal(reads().length, 2, "a draft is kept: the poll reads all the same");
  assert.ok(view.querySelector(".g-prep__opp").textContent.includes(t("after.step.players")), "the opponent's line, read again");
  assert.equal(face("[data-after-fans]", 4).getAttribute("aria-checked"), "true", "the draft stays");
  // A read that moved this side is not drawn over a draft: what the coach began stands on what it was drawn from.
  api.reply(READ, 200, payload(act(moved, "home", { type: "fans", roll: 2, technicalRoll: "", painted: false, stalling: false })));
  await tick();
  assert.equal(reads().length, 3);
  assert.equal(face("[data-after-fans]", 4).getAttribute("aria-checked"), "true", "not taken");
  assert.equal(cta().getAttribute("data-prep-action"), "fans");
  // The poll reads and draws another revision once nothing is kept.
  await visit(base, { step: "fans" });
  api.reply(READ, 200, payload(moved));
  await tick();
  assert.equal(reads().length, 2);
  assert.ok(view.querySelector(".g-prep__opp").textContent.includes(t("after.step.players")), "the opponent's line, read again");
  // A write on its way.
  const roster = at({ home: 3, away: 3 });
  await visit(roster);
  api.reply(READ, 200, payload(roster));
  const gate = api.hold(WRITE);
  await pressCta();
  await tick();
  assert.equal(reads().length, 1, "a write is on its way");
  gate.release({ status: 200, body: payload(act(roster, "home", { type: "lock-roster" })) });
  await flush();
  // A sheet open.
  const players = at({ home: 2, away: 2 });
  await visit(players);
  api.reply(READ, 200, payload(players));
  await press(row("h3"));
  await tick();
  assert.equal(reads().length, 1, "a sheet is open");
  await press(sheet().querySelector("[data-sheet-close]"));
  await tick();
  assert.equal(reads().length, 2);
  // Finished: drawn, and the poll stops.
  const ready = at({ home: 7, away: 7 });
  await visit(ready);
  api.reply(READ, 200, payload(finished(ready)));
  await tick();
  assert.equal(polls.ticks.size, 0);
  assert.ok(view.querySelector(".g-prep__notices").textContent.includes(t("after.completed")));
});

it("the poll stops on a refusal for good and waits longer after each read that fails", async () => {
  await visit(agreed(begin()), { step: "fans" });
  api.reply(READ, 404, { error: { code: "GAME_NOT_FOUND", message: "x" } });
  await tick();
  assert.equal(polls.ticks.size, 0, "a 404 stops it");
  await visit(agreed(begin()), { step: "fans" });
  api.fail(READ);
  const [timer] = [...polls.ticks.values()];
  const readsAt = [];
  for (let at = 0; at < 8; at += 1) {
    const before = reads().length;
    await timer.callback();
    await flush();
    if (reads().length > before) readsAt.push(at);
  }
  assert.deepEqual(readsAt, [0, 2, 6], "1, 3, then 7 ticks waited");
  api.reset();
});

it("leaving stops the poll and the listeners", async () => {
  await visit(at({ home: 3, away: 3 }));
  const [id] = [...polls.ticks.keys()];
  const button = cta();
  releaseCurrentScreen();
  assert.ok(polls.cleared.includes(id));
  later();
  fireEvent(button, "click");
  await flush();
  assert.equal(writes().length, 0, "a press after leaving sends nothing");
});

it("one form for each width: crossing 900px draws the other, the focus kept or on the title", async () => {
  const cross = await visit(at({ home: 2, away: 2 }), { phone: false });
  assert.ok(view.querySelector(".g-prep.g-prep--desk"));
  assert.ok(view.querySelector(".g-prep__panel--action .g-after__lead"), "the opponent's chip over the button");
  view.querySelector('.g-after__cellbtn[data-after-player="h3"]').focus();
  cross(true);
  assert.ok(view.querySelector(".g-prep.g-prep--phone"));
  assert.equal(view.querySelector("table"), null);
  assert.ok(document.activeElement === view.querySelector("h1") || view.contains(document.activeElement), "never the body");
  assert.notEqual(document.activeElement, document.body);
});

// ———————————————————————————— Task 9 review fixes ————————————————————————————

it("a Players press made while its write is out is said lost when that write's answer is lost or refused", async () => {
  const post = at({ home: 2, away: 2 });
  await visit(post);
  let count = toasts().length;
  const held = api.hold(WRITE);
  await press(mvp("h3"));
  await press(mvp("h4"));
  assert.equal(mvp("h4").getAttribute("aria-checked"), "true", "the page shows the press waiting");
  // The answer never comes, but the write landed: the read holds h3, and h4 was never sent.
  api.reply(READ, 200, payload(saved(post, { mvps: ["h3"] })));
  held.release({ error: new TypeError("Failed to fetch") });
  await flush();
  assert.deepEqual(writes().map((call) => call.body.action.mvps), [["h3"]], "nothing sent again by itself");
  assert.equal(mvp("h3").getAttribute("aria-checked"), "true", "drawn as read");
  assert.equal(alertText(), t("request.offline"));
  assert.deepEqual(toasts().slice(count), [t("after.draftLost")]);
  // A refusal whose read finds this side moved by a tap: the press is said lost too.
  await visit(post);
  count = toasts().length;
  const tapped = followEvents(post, { home: [...RECORDS.home, ...tap("h6", "knockouts")], away: RECORDS.away });
  api.reply(WRITE, 409, { error: { code: "POST_REVISION", message: "x" } });
  api.reply(READ, 200, payload(tapped));
  await press(mvp("h3"));
  assert.equal(writes().length, 1);
  assert.equal(alertText(), t("error.POST_REVISION"));
  assert.equal(mvp("h3").getAttribute("aria-checked"), "false", "drawn as read");
  assert.ok(row("h6"), "the tap drawn");
  assert.deepEqual(toasts().slice(count), [t("after.draftLost")]);
  api.assertAnswered();
});

it("a draft kept does not hold the poll: the treasury waiting on the opponent's Players opens, the dice kept", async () => {
  const waiting = reach(agreed(begin()), { home: 4, away: 2 });
  await visit(waiting);
  assert.ok(cta().hasAttribute("disabled"));
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.waitStats"));
  await press(face("[data-after-mistake]", 6));
  const saved = reach(waiting, { home: 4, away: 3 });
  api.reply(READ, 200, payload(saved));
  await tick();
  assert.equal(reads().length, 2);
  assert.equal(view.querySelector(".g-prep__hint"), null, "the opponent saved «Players»: the button opens");
  assert.ok(!cta().hasAttribute("disabled"));
  assert.equal(face("[data-after-mistake]", 6).getAttribute("aria-checked"), "true", "the die kept");
  const money = { type: "finance", deposit: 0, mistake: { roll: 6, first: null, second: null } };
  api.reply(WRITE, 200, payload(act(saved, "home", money)));
  await pressCta();
  assert.deepEqual(writes().map((call) => [call.body.revision, call.body.action]), [[saved.revision, money]]);
  api.assertAnswered();
});

it("a veteran who missed the match gets his die after a full concession, and «Next: roster» opens", async () => {
  const none = { home: [], away: [] };
  const three = ["Block", "Dodge", "Catch"].map((skill) => ({ type: "primary", grants: { skill } }));
  const roster = HOME.map((player) => (player.id === "h9" ? { ...player, advancements: three } : player));
  const begun = begin({ events: none, home: { roster } });
  const conceded = reach(agreed(begun, { home: [0, 0], away: [2, 0], mode: "conceded", winner: "away", by: "away", events: none }), { home: 2, away: 2 }, { events: none });
  assert.equal(conceded.home.snapshot.players.some((player) => player.id === "h9"), false, "J. Corr missed the match");
  await visit(conceded);
  assert.ok(view.querySelector('[data-after-departure="h9"]'), "his die all the same");
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.departureShut"));
  const died = saved(conceded, { departures: { h9: 4 } }, none);
  api.reply(WRITE, 200, payload(died));
  await press(view.querySelector('[data-after-departure="h9"] [data-die="4"]'));
  assert.deepEqual(writes().map((call) => call.body.action.departures), [{ h9: 4 }]);
  assert.equal(view.querySelector('[data-after-departure="h9"] [data-die="4"]').getAttribute("aria-checked"), "true");
  assert.equal(cta().getAttribute("data-prep-action"), "lock-players");
  assert.ok(!cta().hasAttribute("disabled"), "nothing left to mark");
  assert.equal(act(died, "home", { type: "lock-players" }, none).home.stage, 3, "and the domain takes the lock");
  api.assertAnswered();
});

it("an MVP marked Dead afterwards leaves the MVPs: the write drops him, «Next: roster» asks for another", async () => {
  const { changePlayers, playersDraft, playersFooter } = await import("../src/screens/matches/post-players.mjs");
  const { postModel } = await import("../src/screens/matches/post-model.mjs");
  const post = at({ home: 2, away: 2 });
  await visit(post);
  const first = saved(post, { mvps: ["h3"] });
  api.reply(WRITE, 200, payload(first));
  await press(mvp("h3"));
  await press(row("h3"));
  const dead = { ...first.home.injuries, h3: { code: "dead", retire: false } };
  api.reply(WRITE, 200, payload(saved(first, { injuries: dead, mvps: [] })));
  await press(sheet().querySelector('[data-after-injury="h3"] [data-code="dead"]'));
  assert.deepEqual(writes().map((call) => call.body.action.mvps), [["h3"], []]);
  assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.mvpShut"));
  // Two MVPs (a technical win): the dead one goes, and another can take his place.
  const technical = reach(agreed(begin(), { mode: "technical", winner: "home", home: [2, 0], away: [0, 0] }), { home: 2, away: 2 });
  const model = postModel(payloadOf(technical), "home", "players", { data });
  const two = changePlayers(model, changePlayers(model, playersDraft(technical.home), { kind: "mvp", playerId: "h3", on: true }), { kind: "mvp", playerId: "h4", on: true });
  assert.deepEqual(two.mvps, ["h3", "h4"]);
  const one = changePlayers(model, two, { kind: "injury", playerId: "h3", code: "dead" });
  assert.deepEqual(one.mvps, ["h4"]);
  assert.deepEqual(changePlayers(model, one, { kind: "mvp", playerId: "h5", on: true }).mvps, ["h4", "h5"]);
  const held = { ...playersDraft(technical.home), injuries: { ...technical.home.injuries, h3: { code: "dead", retire: false } }, mvps: ["h3", "h4"] };
  assert.deepEqual(changePlayers(model, held, { kind: "mvp", playerId: "h5", on: true }).mvps, ["h4", "h5"], "one held dead before: the same");
  // An MVP the post-match already holds dead (saved so before) counts for none: the button says to choose.
  const played = postModel(payloadOf(post), "home", "players", { data });
  const kept = { ...playersDraft(post.home), injuries: { ...post.home.injuries, h3: { code: "dead", retire: false } }, mvps: ["h3"] };
  assert.equal(playersFooter(played, kept).hint, t("after.mvpShut"));
  assert.equal(playersFooter(played, { ...kept, mvps: ["h4"] }).hint, "", "a live MVP opens it");
  api.assertAnswered();
});

it("an answer that comes after the coach left still reads the games, and the teams once finished", async () => {
  const ready = at({ home: 7, away: 7 });
  await visit(ready);
  api.reply(FINISH, 200, payload(finished(ready)));
  const gate = api.hold(FINISH);
  await pressCta();
  releaseCurrentScreen();
  gate.release();
  await flush();
  assert.deepEqual([calls("GET /api/teams").length, calls("GET /api/games").length], [1, 1], "the fallen, the new players, the match card");
  // A finish whose answer was lost after the coach left may have landed: read the same.
  await visit(ready);
  const lost = api.hold(FINISH);
  await pressCta();
  releaseCurrentScreen();
  lost.release({ error: new TypeError("Failed to fetch") });
  await flush();
  assert.deepEqual([calls("GET /api/teams").length, calls("GET /api/games").length], [1, 1]);
  assert.equal(reads().length, 1, "nothing read again for a page that is gone");
  // Any other write answered after leaving: the games.
  const roster = at({ home: 3, away: 3 });
  await visit(roster);
  api.reply(WRITE, 200, payload(act(roster, "home", { type: "lock-roster" })));
  const write = api.hold(WRITE);
  await pressCta();
  releaseCurrentScreen();
  write.release();
  await flush();
  assert.deepEqual([calls("GET /api/teams").length, calls("GET /api/games").length], [0, 1]);
});

it("a Players press made while «Next: roster» is on its way is not sent once the step closed, and is said lost", async () => {
  const first = saved(at({ home: 2, away: 2 }), { mvps: ["h3"] });
  for (const step of ["", "players"]) {
    await visit(first, { step });
    const count = toasts().length;
    const held = api.hold(WRITE);
    await pressCta();
    await press(mvp("h4"));
    held.release({ status: 200, body: payload(act(first, "home", { type: "lock-players" })) });
    await flush();
    assert.deepEqual(writes().map((call) => call.body.action.type), ["lock-players"], step);
    assert.equal(alertText(), "", "no refusal to say");
    assert.deepEqual(toasts().slice(count), [t("after.draftLost")]);
    api.assertAnswered();
  }
});

it("the score's draft is what it writes: a winner picked, then «Played» again, is the opponent's score to confirm", async () => {
  await visit(scored(begin(), { by: "away" }), { step: "result" });
  assert.equal(cta().getAttribute("data-prep-action"), "agree-result");
  await press(view.querySelector('[data-after-mode] [data-mode="technical"]'));
  await press(view.querySelector('.g-seg[data-seg-group="after-winner"] [data-seg-value="away"]'));
  assert.equal(cta().getAttribute("data-prep-action"), "result");
  await press(view.querySelector('[data-after-mode] [data-mode="played"]'));
  assert.equal(cta().getAttribute("data-prep-action"), "agree-result");
  assert.equal(writes().length, 0);
});

it("a technical result's reason (stage 12): none picked, nothing sent; the arrows move it with the focus, the group patched, not drawn anew; it goes with the score", async () => {
  for (const phone of [true, false]) {
    await visit(begin(), { step: "result", phone });
    await press(view.querySelector('[data-after-mode] [data-mode="technical"]'));
    const group = view.querySelector('[role="radiogroup"][data-after-reason]');
    const item = (reason) => view.querySelector(`[data-after-reason] [data-reason="${reason}"]`);
    assert.ok(group, "the reason asked under the winner");
    assert.deepEqual([cta().getAttribute("data-prep-action"), cta().hasAttribute("disabled")], ["result", true]);
    assert.equal(view.querySelector(".g-prep__hint").textContent, t("after.reasonFirst"));
    await pressCta();
    assert.equal(writes().length, 0, "no reason, no write");
    item("no_team").focus();
    fireEvent(item("no_team"), "keydown", { key: "ArrowRight" });
    await flush();
    assert.equal(item("other").getAttribute("aria-checked"), "true");
    assert.ok(document.activeElement === item("other"), "the focus moved with the arrow");
    assert.ok(view.querySelector("[data-after-reason]") === group, "the group is the one drawn before");
    fireEvent(item("other"), "keydown", { key: "ArrowLeft" });
    await flush();
    assert.deepEqual([item("no_team").getAttribute("aria-checked"), item("other").getAttribute("aria-checked")], ["true", "false"]);
    assert.ok(document.activeElement === item("no_team"), "the focus where the check is");
    assert.equal(view.querySelector(".g-after__pts").textContent, t("after.points", { points: 4 }));
    assert.equal(cta().hasAttribute("disabled"), false);
    const action = { type: "result", mode: "technical", winner: "home", reason: "no_team", home: { touchdowns: 2, casualties: 0 }, away: { touchdowns: 0, casualties: 0 } };
    api.reply(WRITE, 200, payload(act(begin(), "home", action)));
    await pressCta();
    assert.deepEqual(writes().map((call) => call.body.action), [action]);
    // The answer drawn: the reason sent is the one checked.
    assert.equal(view.querySelector('[data-after-reason] [aria-checked="true"]').getAttribute("data-reason"), "no_team");
    api.assertAnswered();
  }
});

it("a sheet's «−» pressed down to its floor keeps the focus in the sheet, on its «+»", async () => {
  const post = at({ home: 2, away: 2 });
  const counts = (side, knockouts) => ({ statistics: { ...side.statistics, h3: { ...side.statistics.h3, knockouts } } });
  const counted = saved(post, counts(post.home, 1));
  await visit(counted);
  await press(row("h3"));
  const minus = sheet().querySelector('[data-action-key="knockouts"] [data-action-step="-1"]');
  minus.focus();
  api.reply(WRITE, 200, payload(saved(counted, counts(counted.home, 0))));
  await press(minus);
  assert.equal(writes()[0].body.action.statistics.h3.knockouts, 0);
  assert.ok(sheet()?.open, "the sheet stays");
  assert.ok(minus.hasAttribute("disabled"), "nothing below zero");
  assert.ok(document.activeElement === sheet().querySelector('[data-action-key="knockouts"] [data-action-step="1"]'), "the focus on the same stepper's «+»");
  api.assertAnswered();
});

it("a draw that gives the focus to the footer's button arms it again (09a F-2): a quick press after a «−» to zero sends nothing", async () => {
  const base = reach(agreed(begin({ home: { treasury: 300 } })), { home: 3, away: 3 });
  const staffed = act(base, "home", { type: "roster", operation: "staff", key: "assistantCoaches", delta: 1 });
  await visit(staffed);
  const minus = view.querySelector('[data-resource-key="assistantCoaches"] [data-resource-step="-1"]');
  minus.focus();
  const unstaffed = act(staffed, "home", { type: "roster", operation: "staff", key: "assistantCoaches", delta: -1 });
  api.reply(WRITE, 200, payload(unstaffed));
  await press(minus);
  assert.ok(document.activeElement === cta(), "the «−» closed: the focus on the footer's button");
  assert.equal(cta().getAttribute("data-prep-action"), "lock-roster", "the same action as before");
  await press(cta());
  assert.deepEqual(writes().map((call) => call.body.action.type), ["roster"], "the rest of the keyboard's presses");
  later(700);
  api.reply(WRITE, 200, payload(act(unstaffed, "home", { type: "lock-roster" })));
  await press(cta());
  assert.deepEqual(writes().map((call) => call.body.action.type), ["roster", "lock-roster"]);
  api.assertAnswered();
});

it("arriving from the preparation, whose frame is on screen, says the post-match is being read; a step link keeps its own frame", async () => {
  releaseCurrentScreen();
  api.reset();
  view.innerHTML = `<div class="g-prep g-prep--phone"><header class="g-prep__head"><h1 class="g-prep__title" tabindex="-1">${t("prep.title")}</h1></header></div>`;
  state.auth.currentUser = COACH;
  state.data = data;
  crossingWindow(true);
  api.reply(READ, 200, payload(agreed(begin())));
  let gate = api.hold(READ);
  let open = renderPostMatch("g1", "");
  await flush();
  assert.equal(view.querySelector('.g-prep__note[role="status"]')?.textContent, t("after.loading"));
  assert.equal(view.querySelector("h1").textContent, t("after.title"));
  gate.release();
  await open;
  await flush();
  assert.ok(view.querySelector("[data-after-fans]"), "the post-match drawn");
  // Another step of the same post-match: its frame stays while the step is read (no flash between steps).
  releaseCurrentScreen();
  gate = api.hold(READ);
  open = renderPostMatch("g1", "result");
  await flush();
  assert.equal(view.querySelector('.g-prep__note[role="status"]'), null);
  assert.ok(view.querySelector("[data-after-fans]"), "the frame drawn last stays");
  gate.release();
  await open;
  await flush();
  assert.ok(view.querySelector('[data-score-key="own:touchdowns"]'));
  releaseCurrentScreen();
  api.assertAnswered();
});
