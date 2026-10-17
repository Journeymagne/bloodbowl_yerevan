import test from "node:test";
import assert from "node:assert/strict";

import {
  checkLoginAttempt,
  clearLoginAttempts,
  forgetExpiredLoginAttempts,
  moveLoginAttempts,
  recordFailedLogin,
} from "../server/auth/rate-limit.mjs";

/**
 * The clock is passed in so these do not sleep. The module's own default is
 * Date.now; every call here supplies its own, which is also how the window
 * boundary can be tested at all.
 */
const options = (now, extra = {}) => ({ now: () => now, limit: 3, windowMs: 1000, ...extra });

test("a few wrong guesses are allowed", () => {
  const login = "coach-a";
  clearLoginAttempts(login);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(checkLoginAttempt(login, options(0)).allowed, true);
    recordFailedLogin(login, options(0));
  }
  assert.equal(checkLoginAttempt(login, options(0)).allowed, false);
});

test("the refusal says how long to wait", () => {
  const login = "coach-b";
  clearLoginAttempts(login);
  for (let attempt = 0; attempt < 3; attempt += 1) recordFailedLogin(login, options(0));
  const verdict = checkLoginAttempt(login, options(400));
  assert.equal(verdict.allowed, false);
  assert.equal(verdict.retryAfterSeconds, 1);
});

test("the window runs from the first failure, not the last", () => {
  const login = "coach-c";
  clearLoginAttempts(login);
  recordFailedLogin(login, options(0));
  recordFailedLogin(login, options(500));
  recordFailedLogin(login, options(900));
  assert.equal(checkLoginAttempt(login, options(950)).allowed, false);
  // 1000ms after the first failure the window is over, however recent the last
  // attempt was — otherwise a slow guesser could keep it open forever.
  assert.equal(checkLoginAttempt(login, options(1000)).allowed, true);
});

test("getting the password right clears the count", () => {
  const login = "coach-d";
  clearLoginAttempts(login);
  for (let attempt = 0; attempt < 3; attempt += 1) recordFailedLogin(login, options(0));
  assert.equal(checkLoginAttempt(login, options(0)).allowed, false);
  clearLoginAttempts(login);
  assert.equal(checkLoginAttempt(login, options(0)).allowed, true);
});

test("one login being locked does not lock another", () => {
  clearLoginAttempts("coach-e");
  clearLoginAttempts("coach-f");
  for (let attempt = 0; attempt < 3; attempt += 1) recordFailedLogin("coach-e", options(0));
  assert.equal(checkLoginAttempt("coach-e", options(0)).allowed, false);
  assert.equal(checkLoginAttempt("coach-f", options(0)).allowed, true);
});

test("expired records are forgotten, so the map cannot grow forever", () => {
  clearLoginAttempts("coach-g");
  recordFailedLogin("coach-g", options(0));
  assert.ok(forgetExpiredLoginAttempts(options(0)) >= 1);
  forgetExpiredLoginAttempts(options(10_000));
  assert.equal(checkLoginAttempt("coach-g", options(10_000)).allowed, true);
});

// A rename must not give back the guesses: the count is kept per login, and a signed-in user can change their login.

/** A record under `key`: `failures` wrong guesses, the window beginning at `since`. */
function failed(key, since, failures) {
  clearLoginAttempts(key);
  for (let attempt = 0; attempt < failures; attempt += 1) recordFailedLogin(key, options(since));
}

test("a rename carries the count to the new name, with the window it had, and leaves nothing under the old one", () => {
  failed("moved-from", 0, 3);
  clearLoginAttempts("moved-to");
  moveLoginAttempts("moved-from", "moved-to", options(100));
  assert.deepEqual(checkLoginAttempt("moved-to", options(400)), { allowed: false, retryAfterSeconds: 1 });
  // The window is the one the failures began, not a new one that starts with the rename.
  assert.equal(checkLoginAttempt("moved-to", options(1050)).allowed, true);
  assert.equal(checkLoginAttempt("moved-from", options(400)).allowed, true);
});

test("a rename onto a name that already has a record keeps the stricter one, whichever name it was under", () => {
  // `at` is when the rename happens and `probeAt` when the new name is looked at; "one more" adds a failure first.
  const cases = [
    { name: "both block: the later window blocks longer", strict: [400, 3], loose: [0, 3], at: 500, probeAt: 1100, probe: "blocked" },
    { name: "one blocks, the other only counts", strict: [0, 3], loose: [0, 2], at: 0, probeAt: 0, probe: "blocked" },
    { name: "the one that blocks beats a newer one that does not", strict: [0, 3], loose: [400, 2], at: 500, probeAt: 500, probe: "blocked" },
    { name: "neither blocks: more failures", strict: [0, 2], loose: [0, 1], at: 0, probeAt: 0, probe: "one more" },
    { name: "neither blocks: more failures beat a newer window", strict: [0, 2], loose: [400, 1], at: 500, probeAt: 500, probe: "one more" },
    { name: "a record whose window is over counts for nothing", strict: [1500, 2], loose: [0, 3], at: 2000, probeAt: 2000, probe: "one more" },
  ];
  for (const { name, strict, loose, at, probeAt, probe } of cases) {
    for (const movingIsStricter of [true, false]) {
      const label = `${name}, the ${movingIsStricter ? "moving" : "staying"} record is the stricter`;
      failed("merge-from", ...(movingIsStricter ? strict : loose));
      failed("merge-to", ...(movingIsStricter ? loose : strict));
      moveLoginAttempts("merge-from", "merge-to", options(at));
      if (probe === "one more") recordFailedLogin("merge-to", options(probeAt));
      assert.equal(checkLoginAttempt("merge-to", options(probeAt)).allowed, false, label);
      assert.equal(checkLoginAttempt("merge-from", options(probeAt)).allowed, true, `${label}: nothing is left under the old name`);
    }
  }
});

test("a rename of a login with no record changes nothing: it creates no record, and leaves the new name's own alone", () => {
  failed("has-its-own", 0, 2);
  clearLoginAttempts("never-failed");
  const before = forgetExpiredLoginAttempts(options(0));
  moveLoginAttempts("never-failed", "has-its-own", options(0));
  moveLoginAttempts("never-failed", "gets-nothing", options(0));
  assert.equal(forgetExpiredLoginAttempts(options(0)), before, "no record was made or lost");
  recordFailedLogin("has-its-own", options(0));
  assert.equal(checkLoginAttempt("has-its-own", options(0)).allowed, false, "its own two failures are still two");
  assert.equal(checkLoginAttempt("gets-nothing", options(0)).allowed, true);
});

test("a rename to the same key is no move: the count stays where it is", () => {
  failed("same-key", 0, 3);
  moveLoginAttempts("same-key", "same-key", options(100));
  assert.equal(checkLoginAttempt("same-key", options(100)).allowed, false);
});
