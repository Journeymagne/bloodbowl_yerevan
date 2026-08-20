import test from "node:test";
import assert from "node:assert/strict";

import {
  onScreenLeave,
  pendingScreenCleanupCount,
  releaseCurrentScreen,
} from "../src/core/screen-lifecycle.mjs";

test("leaving a screen runs what it registered", () => {
  releaseCurrentScreen();
  let stopped = 0;
  onScreenLeave("a", () => { stopped += 1; });
  assert.equal(stopped, 0, "still on screen, nothing torn down yet");
  releaseCurrentScreen();
  assert.equal(stopped, 1);
  assert.equal(pendingScreenCleanupCount(), 0, "and it is not owed twice");
  releaseCurrentScreen();
  assert.equal(stopped, 1);
});

test("re-registering a key drops the subscription it replaces", () => {
  // The leak this exists for: the saved roster re-renders on every edit and
  // re-subscribes each time, so the previous listener has to go immediately —
  // waiting for the route to change would let them pile up.
  releaseCurrentScreen();
  const stopped = [];
  onScreenLeave("autosave", () => stopped.push(1));
  onScreenLeave("autosave", () => stopped.push(2));
  onScreenLeave("autosave", () => stopped.push(3));
  assert.deepEqual(stopped, [1, 2], "each render tears down the one before it");
  assert.equal(pendingScreenCleanupCount(), 1, "only the newest is still owed");
  releaseCurrentScreen();
  assert.deepEqual(stopped, [1, 2, 3]);
});

test("keys are independent", () => {
  releaseCurrentScreen();
  const stopped = [];
  onScreenLeave("one", () => stopped.push("one"));
  onScreenLeave("two", () => stopped.push("two"));
  assert.equal(pendingScreenCleanupCount(), 2);
  releaseCurrentScreen();
  assert.deepEqual(stopped.sort(), ["one", "two"]);
});

test("a teardown that throws does not strand the rest", () => {
  releaseCurrentScreen();
  let reached = false;
  const consoleError = console.error;
  console.error = () => {};
  try {
    onScreenLeave("boom", () => { throw new Error("teardown failed"); });
    onScreenLeave("fine", () => { reached = true; });
    releaseCurrentScreen();
  } finally {
    console.error = consoleError;
  }
  assert.equal(reached, true);
  assert.equal(pendingScreenCleanupCount(), 0);
});
