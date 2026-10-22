import assert from "node:assert/strict";
import test, { mock } from "node:test";

/*
 * What the preparation (prep.mjs, 09a) and the post-match (post.mjs, 09b) share, in one module (stage 13, Task 6; the
 * hand-off of 09b, decision 11): the footer's button armed `FOOTER_ARM_MS` after its action appears, and the poll that
 * reads the open page every six seconds, waits longer after each read that fails and stops for good on a refusal. The
 * screens' own tests (match-prep-screen, post-screen) hold each page's behaviour; these hold the shared pieces alone,
 * on a fake clock.
 */

const { FOOTER_ARM_MS, armFooter, focusGone, startPoll, takeFooter } = await import("../src/screens/matches/visit-common.mjs");

const settle = () => new Promise((resolve) => { setImmediate(resolve); });
const flush = async () => {
  for (let round = 0; round < 4; round += 1) await settle();
};

/** A fake clock for the test's body: `Date.now()` and `setInterval` are the test's, `setImmediate` stays real. */
async function onFakeClock(body) {
  mock.timers.enable({ apis: ["Date", "setInterval"], now: 1_000_000 });
  try {
    await body();
  } finally {
    mock.timers.reset();
  }
}

/** A refusal as the API client throws it: a status, or none for an answer that never came. */
const refusal = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

/**
 * A poll of a visit whose reads `answer()` answers; `ticks(n)` runs n of its intervals, each read settled before the
 * next tick, and says at which of them a read went out.
 */
function polled({ answer = () => Promise.resolve(), may = () => true, ...options } = {}) {
  const visit = { here: true };
  const seen = [];
  let reads = 0;
  const stop = startPoll(visit, {
    read(target) {
      seen.push(target);
      reads += 1;
      return answer();
    },
    mayPoll: (target) => target === visit && may(),
    ...options,
  });
  const ticks = async (count, everyMs = options.everyMs ?? 6000) => {
    const readsAt = [];
    for (let at = 0; at < count; at += 1) {
      const before = reads;
      mock.timers.tick(everyMs);
      await flush();
      if (reads > before) readsAt.push(at);
    }
    return readsAt;
  };
  return { visit, seen, stop, ticks, reads: () => reads };
}

test("the footer's action is armed FOOTER_ARM_MS after it appears, and again when it changes", () => onFakeClock(() => {
  assert.equal(FOOTER_ARM_MS, 600, "as the preparation's and the post-match's were");
  const visit = { footerAction: "", footerAfter: 0 };
  const armed = () => Date.now() >= visit.footerAfter;
  takeFooter(visit, "confirm");
  assert.equal(visit.footerAction, "confirm");
  assert.equal(visit.footerAfter, Date.now() + FOOTER_ARM_MS, "a press before then is the rest of an earlier gesture");
  assert.equal(armed(), false);
  mock.timers.tick(FOOTER_ARM_MS - 1);
  assert.equal(armed(), false, "a double click's second press");
  mock.timers.tick(1);
  assert.equal(armed(), true);
  // The same action drawn again is not armed anew: the coach who waited may press it.
  takeFooter(visit, "confirm");
  assert.equal(armed(), true);
  // «Confirm» turned into «Start» on the same node: armed again.
  takeFooter(visit, "start");
  assert.equal(visit.footerAction, "start");
  assert.equal(armed(), false);
  mock.timers.tick(FOOTER_ARM_MS);
  assert.equal(armed(), true);
  // No action (a closed button, a link on): nothing to arm; the action that comes back is armed again.
  takeFooter(visit, "");
  assert.equal(visit.footerAction, "");
  assert.equal(armed(), true, "nothing armed for no action");
  takeFooter(visit, "start");
  assert.equal(armed(), false, "the action back after none is new");
  mock.timers.tick(FOOTER_ARM_MS);
  // The page moved the focus onto the footer's button: armed from now.
  armFooter(visit);
  assert.equal(visit.footerAfter, Date.now() + FOOTER_ARM_MS);
  assert.equal(visit.footerAction, "start", "arming keeps the action");
}));

test("a focus is gone when it is on nothing, on the body, on a node taken away or hidden, or on a control closed", () => {
  const body = { isConnected: true };
  const page = { body };
  const node = ({ connected = true, rects = 1, disabled = false } = {}) => ({ ownerDocument: page, isConnected: connected,
    getClientRects: () => Array.from({ length: rects }), hasAttribute: (name) => name === "disabled" && disabled });
  assert.equal(focusGone(null), true);
  assert.equal(focusGone(Object.assign(body, { ownerDocument: page })), true, "the page's body");
  assert.equal(focusGone(node({ connected: false })), true, "a node the draw replaced");
  assert.equal(focusGone(node({ rects: 0 })), true, "a node the stylesheet hides");
  assert.equal(focusGone(node({ disabled: true })), true, "a «−» closed at zero takes no press and no key");
  assert.equal(focusGone(node()), false);
});

test("the poll reads every six seconds while the screen lets it, the visit given to each call; a read in the air is not doubled", () => onFakeClock(async () => {
  let open = true;
  const poll = polled({ may: () => open });
  mock.timers.tick(5999);
  await flush();
  assert.equal(poll.reads(), 0, "not before six seconds");
  mock.timers.tick(1);
  await flush();
  assert.equal(poll.reads(), 1);
  assert.deepEqual(await poll.ticks(3), [0, 1, 2]);
  assert.ok(poll.seen.every((target) => target === poll.visit));
  open = false;
  assert.deepEqual(await poll.ticks(2), [], "the screen holds it back: a write on its way, a hidden tab, a dialog open");
  poll.stop();
  // A read that takes longer than a tick: the next ticks read nothing until it is answered.
  let answer = () => {};
  const slow = polled({ answer: () => new Promise((resolve) => { answer = resolve; }) });
  assert.deepEqual(await slow.ticks(3), [0]);
  answer();
  await flush();
  assert.deepEqual(await slow.ticks(1), [0], "answered, it reads again");
  slow.stop();
}));

test("the poll waits longer after each failure, a minute at most, and stops for good on 403 and 404", () => onFakeClock(async () => {
  const poll = polled({ answer: () => Promise.reject(refusal(500)) });
  // The waits double — 1, 3, 7 ticks — and stay at 9 from then on: ten ticks of six seconds, a minute between reads.
  assert.deepEqual(await poll.ticks(36), [0, 2, 6, 14, 24, 34]);
  poll.stop();
  // An answer that never came (no status) waits like any other failure.
  const lost = polled({ answer: () => Promise.reject(Object.assign(new Error("offline"), { kind: "offline" })) });
  assert.deepEqual(await lost.ticks(7), [0, 2, 6]);
  lost.stop();
  // An answer ends the waiting, and a failure after it waits one tick again: the count starts over.
  let fails = true;
  const again = polled({ answer: () => (fails ? Promise.reject(refusal(500)) : Promise.resolve()) });
  assert.deepEqual(await again.ticks(3), [0, 2]);
  fails = false;
  assert.deepEqual(await again.ticks(5), [3, 4], "three ticks waited, then reads that answer, one a tick");
  fails = true;
  assert.deepEqual(await again.ticks(3), [0, 2], "read, one tick waited, read");
  again.stop();
  for (const refused of [403, 404]) {
    const gone = polled({ answer: () => Promise.reject(refusal(refused)) });
    assert.deepEqual(await gone.ticks(30), [0], `a ${refused} stops it for good`);
  }
}));

test("the poll's pace, ceiling and refusals for good are the caller's to set", () => onFakeClock(async () => {
  const poll = polled({ answer: () => Promise.reject(refusal(500)), everyMs: 1000, maxTicks: 2 });
  assert.deepEqual(await poll.ticks(10, 1000), [0, 2, 5, 8]);
  poll.stop();
  const teapot = polled({ answer: () => Promise.reject(refusal(418)), refusedForGood: (error) => error.status === 418 });
  assert.deepEqual(await teapot.ticks(10), [0]);
  const kept = polled({ answer: () => Promise.reject(refusal(404)), refusedForGood: () => false });
  assert.deepEqual(await kept.ticks(4), [0, 2], "a 404 the caller does not refuse waits like any failure");
  kept.stop();
}));

test("leaving stops the poll: no tick reads again, and a read in the air when it stopped starts nothing more", () => onFakeClock(async () => {
  const poll = polled();
  assert.deepEqual(await poll.ticks(1), [0]);
  poll.stop();
  assert.deepEqual(await poll.ticks(5), []);
  poll.stop();
  // Stopped while a read is in the air — and the read then refused: nothing reads again.
  let refuse;
  const flying = polled({ answer: () => new Promise((resolve, reject) => { refuse = reject; }) });
  assert.deepEqual(await flying.ticks(1), [0]);
  flying.stop();
  refuse(refusal(500));
  await flush();
  assert.deepEqual(await flying.ticks(20), []);
}));
