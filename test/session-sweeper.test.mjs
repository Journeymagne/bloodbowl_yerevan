import assert from "node:assert/strict";
import test from "node:test";

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
