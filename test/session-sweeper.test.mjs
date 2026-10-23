import assert from "node:assert/strict";
import test from "node:test";

import { forgetExpiredLoginAttempts, recordFailedLogin } from "../server/auth/rate-limit.mjs";
import { purgeExpiredSessions, startSessionSweeper } from "../server/auth/session.mjs";

test("the purge asks for expired rows only", async () => {
  const asked = [];
  const removed = await purgeExpiredSessions(async (text) => {
    asked.push(text.replace(/\s+/g, " ").trim());
    return { rowCount: 4 };
  });
  assert.equal(removed, 4);
  assert.deepEqual(asked, ["DELETE FROM sessions WHERE expires_at <= now()"]);
});

test("a driver that reports nothing counts as nothing removed", async () => {
  assert.equal(await purgeExpiredSessions(async () => undefined), 0);
});

test("the sweeper runs once at once, and says so only when it removed something", async () => {
  const said = [];
  let removed = 3;
  const sweeper = startSessionSweeper({
    intervalMs: 60_000,
    purge: async () => removed,
    log: (message) => said.push(message),
  });
  await new Promise((resolve) => { setImmediate(resolve); });
  sweeper.stop();
  assert.deepEqual(said, ["[sessions] removed 3 expired session(s)"]);

  said.length = 0;
  removed = 0;
  const quiet = startSessionSweeper({ intervalMs: 60_000, purge: async () => removed, log: (m) => said.push(m) });
  await new Promise((resolve) => { setImmediate(resolve); });
  quiet.stop();
  assert.deepEqual(said, [], "a sweep that found nothing is not news");
});

test("a failed sweep does not take the site down with it", async () => {
  const sweeper = startSessionSweeper({
    intervalMs: 60_000,
    purge: async () => { throw new Error("connection terminated"); },
    log: () => {},
  });
  await new Promise((resolve) => { setImmediate(resolve); });
  sweeper.stop();
  // Reaching here at all is the assertion: the rejection was handled rather
  // than left to become an unhandled promise rejection at boot.
  assert.ok(true);
});

test("each sweep also forgets the wrong-login counts whose window has passed, so a name nobody holds stops being counted", async () => {
  const forgot = [];
  const sweeper = startSessionSweeper({ intervalMs: 60_000, purge: async () => 0, forget: () => forgot.push("swept"), log: () => {} });
  await new Promise((resolve) => { setImmediate(resolve); });
  sweeper.stop();
  assert.deepEqual(forgot, ["swept"], "once at once, with the sessions");

  // By default it is the limiter's own sweep: a count from long ago is gone after the first sweep.
  recordFailedLogin("login:nobody-at-all", { now: () => 0 });
  const remaining = () => forgetExpiredLoginAttempts({ now: () => 0 }); // at time 0 nothing has expired: this only counts
  assert.equal(remaining(), 1);
  const real = startSessionSweeper({ intervalMs: 60_000, purge: async () => 0, log: () => {} });
  await new Promise((resolve) => { setImmediate(resolve); });
  real.stop();
  assert.equal(remaining(), 0);
});

test("a sweep that fails to purge still forgets the old counts, and one whose forgetting fails still purges", async () => {
  const done = [];
  const failing = startSessionSweeper({ intervalMs: 60_000, purge: async () => { throw new Error("down"); }, forget: () => done.push("forgot"), log: () => {} });
  await new Promise((resolve) => { setImmediate(resolve); });
  failing.stop();
  const forgetful = startSessionSweeper({ intervalMs: 60_000, purge: async () => { done.push("purged"); return 0; }, forget: () => { throw new Error("odd"); }, log: () => {} });
  await new Promise((resolve) => { setImmediate(resolve); });
  forgetful.stop();
  assert.deepEqual(done, ["forgot", "purged"]);
});
