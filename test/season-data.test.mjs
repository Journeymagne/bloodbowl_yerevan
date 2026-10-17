import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { loadSeason } = await import("../src/screens/season/season-data.mjs");
const { state } = await import("../src/core/state.mjs");

const SEASON = "GET /api/season";
const sent = () => api.calls.filter((call) => call.key === SEASON).length;

function reset() {
  api.reset();
  state.season = { data: null, loaded: false, loading: false, error: "" };
  state.auth.currentUser = null;
}

// On a first load of #/season the frame asks for the table (app.js) and the screen forces it: one request, not two racing.
test("a load while one is on its way, forced or not, waits for that one", async () => {
  reset();
  api.reply(SEASON, 200, { standings: [{ rank: 1 }] });
  const gate = api.hold(SEASON);
  const frame = loadSeason();
  const screen = loadSeason(true);
  assert.equal(sent(), 1);
  assert.equal(state.season.loading, true);
  gate.release();
  await Promise.all([frame, screen]);
  assert.equal(sent(), 1);
  assert.deepEqual(state.season.data, { standings: [{ rank: 1 }] });
  assert.equal(state.season.loading, false);
  await loadSeason();
  assert.equal(sent(), 1, "loaded, and nothing forced: nothing sent");
  await loadSeason(true);
  assert.equal(sent(), 2, "forced with nothing on its way: sent");
  api.assertAnswered();
});

test("a coach who signed in while a guest's request was out gets a request of their own, and the guest's answer is dropped", async () => {
  reset();
  const guestGate = api.hold(SEASON);
  const guest = loadSeason();
  state.auth.currentUser = { id: "u1", login: "coach" };
  const coachGate = api.hold(SEASON);
  const coach = loadSeason(true);
  assert.equal(sent(), 2);
  coachGate.release({ status: 200, body: { who: "coach" } });
  await coach;
  guestGate.release({ status: 200, body: { who: "guest" } });
  await guest;
  assert.deepEqual(state.season.data, { who: "coach" });
  assert.equal(state.season.loading, false);
});

test("a failed load says why and lets the next one go out", async () => {
  reset();
  api.reply(SEASON, 500, { error: "boom" });
  await loadSeason();
  assert.ok(state.season.error);
  assert.equal(state.season.loading, false);
  api.reply(SEASON, 200, { standings: [] });
  await loadSeason();
  assert.equal(sent(), 2);
  assert.equal(state.season.error, "");
  assert.deepEqual(state.season.data, { standings: [] });
});
