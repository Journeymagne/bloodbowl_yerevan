import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const session = await import("../src/data/session.mjs");
const { sendTap, tapsWaiting } = await import("../src/screens/team/roster/taps.mjs");

const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));

setDictionaries({
  en: {
    "auth.otherTab": "Someone signed in or out in another tab, so nothing was saved here.",
    "teamRoster.tapLost": "The answer to the record did not arrive: the records are read again to see whether it was written.",
    "teamRoster.tapDropped": "Not sent: the record before it did not go through. The records are read again.",
    "error.EVENT_SIDE_LOCKED": "This match's statistics are already saved in your post-match.",
    "error.EVENT_BELOW_ZERO": "This counter is already at zero, there is nothing to take back.",
    "error.MATCH_NOT_LIVE": "There is no match in progress to record this in.",
    "error.POST_PLAYER": "This player is unavailable for this action.",
    "error.ROSTER_BREAKS_THE_RULES": "This roster breaks the league's rules.",
    "validation.DUPLICATE_PLAYER_ID": "Players {names} are stored under one id.",
  },
  ru: {},
});

const TOKEN = "gata-league-auth-token";
const URL_T2 = "POST /api/teams/t2/events";
const LOST = "The answer to the record did not arrive: the records are read again to see whether it was written.";
const DROPPED = "Not sent: the record before it did not go through. The records are read again.";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";

const tick = () => new Promise((resolve) => setImmediate(resolve));
/** A row as POST …/events answers it. */
const eventOf = (delta, over = {}) => ({ id: `e${delta}`, playerId: "q1", counter: "touchdowns", delta, pairingId: "g2", ...over });
const plus = { pairingId: "g2", playerId: "q1", counter: "touchdowns", delta: 1 };
const minus = { ...plus, delta: -1 };
const sent = (key = URL_T2) => api.calls.filter((call) => call.key === key);

/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await tick();
  }
}

/** A signed-in coach whose token is the browser's, and nothing left in the fake from the test before. */
function open() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
}

/** What a tap that was not sent comes to. */
const DROPPED_ANSWER = { refusal: DROPPED, code: null, lost: true };
const LOST_ANSWER = { refusal: LOST, code: null, lost: true };

test("the words of a tap are in both dictionaries", () => {
  const keys = ["teamRoster.tapLost", "teamRoster.tapDropped", "auth.otherTab", "error.EVENT_SIDE_LOCKED", "error.EVENT_BELOW_ZERO",
    "error.MATCH_NOT_LIVE", "error.POST_PLAYER", "error.ROSTER_BREAKS_THE_RULES"];
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const key of keys) assert.ok(typeof words[key] === "string" && words[key].trim(), `${locale} has ${key}`);
  }
});

test("a tap of the match is one row: the match, the player, the counter and the step", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(1) });
  assert.deepEqual(await sendTap("t2", { pairingId: "g2", playerId: "q1", counter: "touchdowns", delta: 1 }), { event: eventOf(1) });
  assert.equal(sent().length, 1);
  // No `injury` key at all: the server takes anything but null on a counter that is not the injury for a 400.
  assert.deepEqual(sent()[0].body, { pairingId: "g2", playerId: "q1", counter: "touchdowns", delta: 1 });
  assert.equal(tapsWaiting("t2"), 0);
  api.assertAnswered();
});

test("an edit outside the match names no match; an injury carries its injury", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(1, { pairingId: null }) });
  await sendTap("t2", { playerId: "q1", counter: "touchdowns", delta: 1 });
  assert.deepEqual(sent()[0].body, { pairingId: null, playerId: "q1", counter: "touchdowns", delta: 1 });
  const injury = { code: "lasting", stat: "ag" };
  api.reply(URL_T2, 201, { event: eventOf(1, { counter: "injury", injury }) });
  assert.deepEqual(await sendTap("t2", { pairingId: "g2", playerId: "q1", counter: "injury", delta: 1, injury }),
    { event: eventOf(1, { counter: "injury", injury }) });
  assert.deepEqual(sent()[1].body, { pairingId: "g2", playerId: "q1", counter: "injury", delta: 1, injury });
  // An injury given to a counter that is not one is not sent along.
  await sendTap("t2", { pairingId: "g2", playerId: "q1", counter: "casualties", delta: 1, injury });
  assert.deepEqual(sent()[2].body, { pairingId: "g2", playerId: "q1", counter: "casualties", delta: 1 });
  api.assertAnswered();
});

// Review Focus 1: a step down must not overtake the step up it takes back.
test("taps go one at a time: a minus waits for the plus before it", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(-1) });
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  await waitHeld(gate);
  await tick();
  await tick();
  assert.equal(gate.count, 1);
  assert.equal(sent().length, 1, "the minus is not sent while the plus is in the air");
  assert.equal(tapsWaiting("t2"), 2);
  gate.release({ status: 201, body: { event: eventOf(1) } });
  assert.deepEqual(await first, { event: eventOf(1) });
  assert.deepEqual(await second, { event: eventOf(-1) });
  assert.deepEqual(sent().map((call) => call.body.delta), [1, -1]);
  assert.equal(tapsWaiting("t2"), 0);
  api.assertAnswered();
});

test("teams do not wait for each other, and a team nobody tapped has none waiting", async () => {
  open();
  api.reply("POST /api/teams/t3/events", 201, { event: eventOf(1) });
  const gate = api.hold(URL_T2);
  const held = sendTap("t2", plus);
  await waitHeld(gate);
  assert.deepEqual(await sendTap("t3", plus), { event: eventOf(1) });
  assert.equal(tapsWaiting("t2"), 1);
  assert.equal(tapsWaiting("t3"), 0);
  assert.equal(tapsWaiting("nobody"), 0);
  gate.release({ status: 201, body: { event: eventOf(1) } });
  await held;
  assert.equal(tapsWaiting("t2"), 0);
});

// Review Focus 1: a request that got no answer may have been written; sending it again may write it twice.
test("a tap whose answer was lost is not sent again", async () => {
  open();
  api.fail(URL_T2);
  assert.deepEqual(await sendTap("t2", plus), { refusal: LOST, code: null, lost: true });
  await tick();
  await tick();
  assert.equal(sent().length, 1);
  assert.equal(tapsWaiting("t2"), 0);
});

test("an answer that is none is lost in every way it can be: offline, timed out, a 5xx, a status without the server's words", async () => {
  const timedOut = Object.assign(new Error("aborted"), { name: "AbortError" });
  const answers = [
    () => api.fail(URL_T2),
    () => api.fail(URL_T2, timedOut),
    () => api.reply(URL_T2, 500, { error: { code: "INTERNAL_ERROR", message: "x" } }),
    () => api.reply(URL_T2, 502, {}),
    () => api.reply(URL_T2, 404, {}),
  ];
  for (const [index, answer] of answers.entries()) {
    open();
    answer();
    assert.deepEqual(await sendTap("t2", plus), { refusal: LOST, code: null, lost: true }, `answer ${index}`);
    assert.equal(sent().length, 1, `answer ${index} is not sent again`);
  }
});

test("a refusal is said and named", async () => {
  open();
  const refusals = [
    [409, "EVENT_SIDE_LOCKED", "This match's statistics are already saved in your post-match."],
    [409, "EVENT_BELOW_ZERO", "This counter is already at zero, there is nothing to take back."],
    [409, "MATCH_NOT_LIVE", "There is no match in progress to record this in."],
    [422, "POST_PLAYER", "This player is unavailable for this action."],
  ];
  for (const [status, code, words] of refusals) {
    api.reply(URL_T2, status, { error: { code, params: {}, message: "english" } });
    const answer = await sendTap("t2", minus);
    assert.deepEqual(answer, { refusal: words, code }, code);
    assert.equal(tapsWaiting("t2"), 0);
  }
  // The rules a 422 names go after its words, as the roster editor says them.
  api.reply(URL_T2, 422, {
    error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "english" },
    violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
  });
  assert.deepEqual(await sendTap("t2", plus), {
    refusal: "This roster breaks the league's rules. Players Ann, Bo are stored under one id.",
    code: "ROSTER_BREAKS_THE_RULES",
  });
  assert.equal(sent().length, refusals.length + 1, "each refusal was one request and none was sent again");
  api.assertAnswered();
});

test("the count is already down when the answer is said", async () => {
  open();
  const seen = [];
  const note = (answer) => { seen.push(tapsWaiting("t2")); return answer; };
  api.reply(URL_T2, 201, { event: eventOf(1) });
  await sendTap("t2", plus).then(note);
  api.reply(URL_T2, 409, { error: { code: "EVENT_BELOW_ZERO" } });
  await sendTap("t2", minus).then(note);
  api.fail(URL_T2);
  await sendTap("t2", plus).then(note);
  assert.deepEqual(seen, [0, 0, 0]);
});

test("another tab's coach: nothing is sent", async () => {
  open();
  api.items.set(TOKEN, "someone-else");
  assert.deepEqual(await sendTap("t2", plus), { refusal: OTHER_TAB, code: null });
  assert.equal(api.calls.length, 0);
  assert.equal(tapsWaiting("t2"), 0);
});

test("a tap that waited is asked about the token when its turn comes; what waits behind a tap that was not sent is not sent", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(1) });
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  const third = sendTap("t2", plus);
  await waitHeld(gate);
  // Another tab signs in as someone else while the first is on its way: the first was the coach's, the next are not.
  api.items.set(TOKEN, "someone-else");
  gate.release({ status: 201, body: { event: eventOf(1) } });
  assert.deepEqual(await first, { event: eventOf(1) });
  assert.deepEqual(await second, { refusal: OTHER_TAB, code: null });
  assert.deepEqual(await third, { refusal: DROPPED, code: null, lost: true });
  assert.equal(sent().length, 1);
  assert.equal(tapsWaiting("t2"), 0);
});

// R10: a -1 queued to take back a +1 that was never written would take a real point.
test("a tap behind a failed one is not sent", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(1) });
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  await waitHeld(gate);
  assert.equal(tapsWaiting("t2"), 2);
  gate.release({ error: new TypeError("Failed to fetch") });
  assert.deepEqual(await first, { refusal: LOST, code: null, lost: true });
  assert.deepEqual(await second, { refusal: DROPPED, code: null, lost: true });
  assert.equal(sent().length, 1);
  assert.equal(tapsWaiting("t2"), 0);
  // The record after the failure is known goes out as any other.
  assert.deepEqual(await sendTap("t2", plus), { event: eventOf(1) });
  assert.equal(sent().length, 2);
  assert.equal(tapsWaiting("t2"), 0);
  api.assertAnswered();
});

test("a refusal takes the taps behind it too, and each is told", async () => {
  open();
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", minus);
  const second = sendTap("t2", plus);
  const third = sendTap("t2", minus);
  await waitHeld(gate);
  gate.release({ status: 409, body: { error: { code: "EVENT_SIDE_LOCKED", params: {} } } });
  assert.deepEqual(await first, { refusal: "This match's statistics are already saved in your post-match.", code: "EVENT_SIDE_LOCKED" });
  assert.deepEqual(await second, { refusal: DROPPED, code: null, lost: true });
  assert.deepEqual(await third, { refusal: DROPPED, code: null, lost: true });
  assert.equal(sent().length, 1);
  assert.equal(tapsWaiting("t2"), 0);
});

test("a failure on one team does not take the taps of another", async () => {
  open();
  api.reply("POST /api/teams/t3/events", 201, { event: eventOf(1) });
  const gate = api.hold(URL_T2);
  const lost = sendTap("t2", plus);
  const other = sendTap("t3", plus);
  await waitHeld(gate);
  gate.release({ error: new TypeError("Failed to fetch") });
  assert.equal((await lost).lost, true);
  assert.deepEqual(await other, { event: eventOf(1) });
});

// A lane that waits for an answer that never comes holds every tap of the team after it, and the unload guard with it.
test("a refusal whose words cannot be made is a lost answer, and the queue drains", async () => {
  open();
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  await waitHeld(gate);
  // A 422 of the rules with a rule whose params are not the object the server sends: wording it throws. (Rules that are
  // not a list, and a rule without a code, are left out of the words since stage 13: the test below.)
  gate.release({
    status: 422,
    body: { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "english" }, violations: [{ code: "DUPLICATE_PLAYER_ID", params: "Ann" }] },
  });
  assert.deepEqual(await first, LOST_ANSWER);
  assert.deepEqual(await second, DROPPED_ANSWER);
  assert.equal(tapsWaiting("t2"), 0);
  assert.equal(sent().length, 1);
  api.reply(URL_T2, 201, { event: eventOf(1) });
  assert.deepEqual(await sendTap("t2", plus), { event: eventOf(1) });
  assert.equal(sent().length, 2);
  assert.equal(tapsWaiting("t2"), 0);
});

// Stage 13 (decision 20, hand-off 07b): a rule the 422 names without a code is left out of the words, and the refusal is
// the server's own — not a lost answer, which would read the records again for nothing.
test("a refusal with a rule it cannot name says the refusal alone, and the queue drains", async () => {
  open();
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  await waitHeld(gate);
  gate.release({
    status: 422,
    body: { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "english" }, violations: [null] },
  });
  assert.deepEqual(await first, { refusal: "This roster breaks the league's rules.", code: "ROSTER_BREAKS_THE_RULES" });
  assert.deepEqual(await second, DROPPED_ANSWER);
  assert.equal(tapsWaiting("t2"), 0);
  assert.equal(sent().length, 1);
});

test("a tap that cannot be built is lost without a request, the queue drains, and the next tap goes out", async () => {
  open();
  const injury = { code: "lasting", stat: "ag" };
  injury.again = injury;
  const first = sendTap("t2", { pairingId: "g2", playerId: "q1", counter: "injury", delta: 1, injury });
  const second = sendTap("t2", minus);
  // Not a JS message ("Converting circular structure to JSON…") but the same words as any answer that did not come.
  assert.deepEqual(await first, LOST_ANSWER);
  assert.deepEqual(await second, DROPPED_ANSWER);
  assert.equal(api.calls.length, 0);
  assert.equal(tapsWaiting("t2"), 0);
  api.reply(URL_T2, 201, { event: eventOf(1) });
  assert.deepEqual(await sendTap("t2", plus), { event: eventOf(1) });
  assert.equal(tapsWaiting("t2"), 0);
  // And a tap that is not even a tap.
  assert.deepEqual(await sendTap("t2", undefined), LOST_ANSWER);
  assert.equal(tapsWaiting("t2"), 0);
});

test("a 2xx without the row is not a success: it is lost, and the taps behind it are not sent", async () => {
  open();
  api.reply(URL_T2, 200, {});
  const gate = api.hold(URL_T2);
  const first = sendTap("t2", plus);
  const second = sendTap("t2", minus);
  await waitHeld(gate);
  gate.release({ status: 200, body: {} });
  assert.deepEqual(await first, LOST_ANSWER);
  assert.deepEqual(await second, DROPPED_ANSWER);
  assert.equal(sent().length, 1);
  assert.equal(tapsWaiting("t2"), 0);
  assert.deepEqual(await sendTap("t2", plus), LOST_ANSWER, "the reply that is none of the server's is lost each time it comes");
});

test("a session that ends drops the taps that wait, unsent, and leaves the one in the air to finish", async () => {
  open();
  const gate = api.hold(URL_T2);
  const inAir = sendTap("t2", plus);
  const waiting = sendTap("t2", minus);
  const later = sendTap("t2", plus);
  await waitHeld(gate);
  assert.equal(tapsWaiting("t2"), 3);
  session.sessionEnded();
  assert.deepEqual(await waiting, DROPPED_ANSWER);
  assert.deepEqual(await later, DROPPED_ANSWER);
  assert.equal(tapsWaiting("t2"), 1, "the one in the air is not taken back");
  gate.release({ status: 201, body: { event: eventOf(1) } });
  assert.deepEqual(await inAir, { event: eventOf(1) });
  assert.equal(tapsWaiting("t2"), 0);
  assert.equal(sent().length, 1);
});

test("a session read again for the same coach keeps the taps that wait; another coach's does not", async () => {
  open();
  api.reply(URL_T2, 201, { event: eventOf(-1) });
  const gate = api.hold(URL_T2);
  const inAir = sendTap("t2", plus);
  const waiting = sendTap("t2", minus);
  await waitHeld(gate);
  api.reply("GET /api/auth/me", 200, { user: { id: "u1", login: "coach" } });
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await session.loadSession(), "signed-in");
  assert.equal(tapsWaiting("t2"), 2, "another tab moved the token, and the same coach is still here");
  api.reply("GET /api/auth/me", 200, { user: { id: "someone-else", login: "other" } });
  assert.equal(await session.loadSession(), "signed-in");
  assert.deepEqual(await waiting, DROPPED_ANSWER);
  assert.equal(tapsWaiting("t2"), 1);
  gate.release({ status: 201, body: { event: eventOf(1) } });
  assert.deepEqual(await inAir, { event: eventOf(1) });
  assert.equal(sent().length, 1);
  // The coach who is here now taps as any other.
  assert.deepEqual(await sendTap("t2", plus), { event: eventOf(-1) });
  assert.equal(sent().length, 2);
});
