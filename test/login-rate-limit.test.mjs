import test from "node:test";
import assert from "node:assert/strict";

import {
  checkLoginAttempt,
  clearLoginAttempts,
  forgetExpiredLoginAttempts,
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
