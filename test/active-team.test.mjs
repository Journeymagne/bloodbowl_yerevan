import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { state } = await import("../src/core/state.mjs");
const { createStorage, storage } = await import("../src/core/storage.mjs");
const team = await import("../src/data/active-team.mjs");
const session = await import("../src/data/session.mjs");
const { loadMyTeams } = await import("../src/data/teams.mjs");

const flush = () => new Promise((resolve) => setImmediate(resolve));
const KEY = "gata-league-active-team";
const IDS = ["t1", "t2", "t3"];
const PATCH = "PATCH /api/auth/preferences";
/** What the account was asked to hold, in order. */
const patches = () => api.calls.filter(({ key }) => key === PATCH).map(({ body }) => body);
function memory() {
  const backend = new Map();
  return { backend, store: createStorage({ getItem: (k) => backend.get(k) ?? null, setItem: (k, v) => backend.set(k, String(v)), removeItem: (k) => backend.delete(k) }) };
}
function coachWith(preferences, ids = IDS) {
  api.reset();
  api.items.set("gata-league-auth-token", "tok");
  state.auth.currentUser = { id: "u1", login: "coach", preferences };
  state.myTeams.items = ids.map((id) => ({ id }));
  state.activeTeamId = null;
}

test("the route's team wins, then the account's, then this browser's, then the first", () => {
  const pick = (over) => team.resolveActiveTeamId({ teamIds: IDS, ...over });
  assert.equal(pick({ routeTeamId: "t3", preferenceTeamId: "t2", cachedTeamId: "t1" }), "t3");
  assert.equal(pick({ preferenceTeamId: "t2", cachedTeamId: "t3" }), "t2");
  assert.equal(pick({ cachedTeamId: "t3" }), "t3");
  assert.equal(pick({}), "t1");
  api.assertAnswered();
});

// K3: the team on the page stays active through a reload of the list, whatever the account still says.
test("the team already active outranks the account and this browser, but not the route", () => {
  const pick = (over) => team.resolveActiveTeamId({ teamIds: IDS, preferenceTeamId: "t1", cachedTeamId: "t1", ...over });
  assert.equal(pick({ currentTeamId: "t2" }), "t2");
  assert.equal(pick({ currentTeamId: "t2", routeTeamId: "t3" }), "t3");
  assert.equal(pick({ currentTeamId: "gone" }), "t1", "a team no longer in the list is not kept");
  api.assertAnswered();
});

test("an id that is not one of the coach's teams is skipped, wherever it came from", () => {
  assert.equal(team.resolveActiveTeamId({ teamIds: IDS, routeTeamId: "x", preferenceTeamId: "y", cachedTeamId: "t2" }), "t2");
  assert.equal(team.resolveActiveTeamId({ teamIds: [], preferenceTeamId: "t1" }), null);
  api.assertAnswered();
});

test("the cache belongs to one coach: another login on this browser does not inherit it", () => {
  const { store, backend } = memory();
  team.writeActiveTeamCache(store, "u1", "t2");
  assert.deepEqual(JSON.parse(backend.get(KEY)), { userId: "u1", teamId: "t2" });
  assert.equal(team.readActiveTeamCache(store, "u1"), "t2");
  assert.equal(team.readActiveTeamCache(store, "u2"), null);
  team.writeActiveTeamCache(store, "u1", null);
  assert.equal(backend.has(KEY), false);
  api.assertAnswered();
});

test("junk in the cache is no team", () => {
  for (const junk of ["{oops", "[]", "null", "42", JSON.stringify({ userId: "u1", teamId: 5 })]) {
    const { store, backend } = memory();
    backend.set(KEY, junk);
    assert.equal(team.readActiveTeamCache(store, "u1"), null, junk);
  }
  api.assertAnswered();
});

test("following a team link makes it active here and in the account, and says so once", async () => {
  const { store } = memory();
  coachWith({ activeTeamId: "t1" });
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t2" } });
  const heard = [];
  const off = team.onActiveTeamChange((id) => heard.push(id));
  assert.equal(team.syncActiveTeam({ routeTeamId: "t2", store }), "t2");
  await flush();
  assert.equal(state.activeTeamId, "t2");
  assert.equal(team.readActiveTeamCache(store, "u1"), "t2");
  team.syncActiveTeam({ routeTeamId: "t2", store });
  await flush();
  assert.deepEqual(api.calls.map(({ body }) => body), [{ activeTeamId: "t2" }], "the account already says t2");
  assert.deepEqual(heard, ["t2"]);
  off();
  api.assertAnswered();
});

// K3: the router makes the route's team active (its PATCH on the way), then the roster screen
// reloads the list, and that reload's sync has no route — while the account still names t1.
test("reloading the list on a team's page keeps that team active before the account answers", async () => {
  coachWith({ activeTeamId: "t1" });
  let answer;
  api.reply(PATCH, 200, new Promise((resolve) => { answer = resolve; }));
  api.reply("GET /api/teams", 200, { teams: IDS.map((id) => ({ id })) });
  const heard = [];
  const off = team.onActiveTeamChange((id) => heard.push(id));
  team.syncActiveTeam({ routeTeamId: "t2" });
  await loadMyTeams(true);
  const accountThen = state.auth.currentUser.preferences.activeTeamId;
  const activeThen = state.activeTeamId;
  // Answered before anything is asserted, so a failure here leaves no write hanging for the next test.
  answer({ preferences: { activeTeamId: "t2" } });
  await flush();
  assert.equal(accountThen, "t1", "the account had not answered yet");
  assert.equal(activeThen, "t2");
  assert.deepEqual(patches(), [{ activeTeamId: "t2" }], "one write, not one per sync");
  assert.deepEqual(heard, ["t2"], "the page's team never flips back");
  off();
  api.assertAnswered();
});

test("a team chosen before the account answers is written after that answer, in the order shown", async () => {
  coachWith({ activeTeamId: "t1" });
  let answer;
  api.reply(PATCH, 200, new Promise((resolve) => { answer = resolve; }));
  team.syncActiveTeam({ routeTeamId: "t2", store: memory().store });
  await flush(); // t2 is on its way
  team.syncActiveTeam({ routeTeamId: "t3", store: memory().store });
  await flush();
  const sentThen = patches().length;
  api.reply(PATCH, 200, { preferences: { activeTeamId: "t3" } }); // for the write still to come
  answer({ preferences: { activeTeamId: "t2" } });
  await flush();
  assert.equal(sentThen, 1, "one write at a time");
  assert.deepEqual(patches(), [{ activeTeamId: "t2" }, { activeTeamId: "t3" }]);
  assert.equal(state.auth.currentUser.preferences.activeTeamId, "t3");
  api.assertAnswered();
});

test("a team left again before the account answers is not written", async () => {
  coachWith({ activeTeamId: "t1" });
  let answer;
  api.reply(PATCH, 200, new Promise((resolve) => { answer = resolve; }));
  for (const routeTeamId of ["t2", "t3", "t2"]) team.syncActiveTeam({ routeTeamId, store: memory().store });
  answer({ preferences: { activeTeamId: "t2" } });
  await flush();
  assert.deepEqual(patches(), [{ activeTeamId: "t2" }], "t3 was shown and left while t2 was on its way");
  api.assertAnswered();
});

test("the active team deleted elsewhere moves to another team without writing a dead id", async () => {
  coachWith({ activeTeamId: "t1" }, ["t2", "t3"]);
  api.reply("PATCH /api/auth/preferences", 200, { preferences: { activeTeamId: "t2" } });
  assert.equal(team.syncActiveTeam({ store: memory().store }), "t2");
  await flush();
  assert.deepEqual(api.calls.map(({ body }) => body), [{ activeTeamId: "t2" }]);
  api.assertAnswered();
});

test("the active team deleted on this page moves to another one on the next reload of the list", async () => {
  coachWith({ activeTeamId: "t1" });
  team.syncActiveTeam(); // this browser's cache, which the reload reads too, now says t1
  api.reply("GET /api/teams", 200, { teams: [{ id: "t3" }, { id: "t2" }] });
  api.reply(PATCH, 200, { preferences: { activeTeamId: "t3" } });
  await loadMyTeams(true);
  await flush();
  assert.equal(state.activeTeamId, "t3");
  assert.deepEqual(patches(), [{ activeTeamId: "t3" }], "never t1");
  api.assertAnswered();
});

test("a team created a moment ago is found by reloading the list once, not bounced to My Teams", async () => {
  api.reset();
  state.myTeams.items = [{ id: "t1" }];
  let reloads = 0;
  const reload = async () => { reloads += 1; state.myTeams.items = [{ id: "new" }, { id: "t1" }]; };
  assert.equal(await team.prepareTeamRoute("new", { reload }), true);
  assert.equal(await team.prepareTeamRoute("t1", { reload }), true);
  assert.equal(reloads, 1, "a known team costs no request");
  assert.equal(await team.prepareTeamRoute("gone", { reload }), false);
  assert.deepEqual(api.calls, [], "the route asks nothing of its own");
  api.assertAnswered();
});

// Found on the real server: the reload's own sync has no route, so with no team active yet it
// settled on the first of the list and wrote it, and only then did the router make the route's
// team active and write that too.
test("the list read again for a team's address settles on that team, not on the first", async () => {
  coachWith({}, []);
  team.writeActiveTeamCache(storage, "u1", null);
  api.reply("GET /api/teams", 200, { teams: [{ id: "t2" }, { id: "t1" }] });
  api.reply(PATCH, 200, { preferences: { activeTeamId: "t1" } });
  const heard = [];
  const off = team.onActiveTeamChange((id) => heard.push(id));
  assert.equal(await team.prepareTeamRoute("t1", { reload: () => loadMyTeams(true) }), true);
  team.syncActiveTeam({ routeTeamId: "t1" }); // as the router does next
  await flush();
  assert.deepEqual(patches(), [{ activeTeamId: "t1" }]);
  assert.deepEqual(heard, ["t1"]);
  off();
  api.assertAnswered();
});

test("an address stops steering the syncs once its reload is over", async () => {
  coachWith({ activeTeamId: "t1" }, ["t1"]);
  const reload = async () => { state.myTeams.items = [{ id: "t1" }, { id: "t2" }]; };
  assert.equal(await team.prepareTeamRoute("t2", { reload }), true);
  assert.equal(team.syncActiveTeam({ store: memory().store }), "t1", "no route now, and the account says t1");
  await flush();
  assert.deepEqual(patches(), []);
  api.assertAnswered();
});

test("another coach's team in this browser's cache is not this coach's", async () => {
  const { store } = memory();
  team.writeActiveTeamCache(store, "u2", "t3");
  coachWith({});
  api.reply(PATCH, 200, { preferences: { activeTeamId: "t1" } });
  assert.equal(team.syncActiveTeam({ store }), "t1");
  await flush();
  assert.deepEqual(patches(), [{ activeTeamId: "t1" }]);
  assert.equal(team.readActiveTeamCache(store, "u1"), "t1");
  api.assertAnswered();
});

test("a coach with no team has none, and an account that names none is left alone", async () => {
  const { store, backend } = memory();
  team.writeActiveTeamCache(store, "u1", "t1");
  coachWith({}, []);
  assert.equal(team.syncActiveTeam({ store }), null);
  await flush();
  assert.equal(state.activeTeamId, null);
  assert.equal(team.activeTeam(), null);
  assert.equal(backend.has(KEY), false);
  assert.deepEqual(patches(), []);
  api.assertAnswered();
});

test("the account that already names the team is not written again, and the team is at hand", async () => {
  coachWith({ activeTeamId: "t3" });
  assert.equal(team.syncActiveTeam({ store: memory().store }), "t3");
  await flush();
  assert.equal(team.activeTeam(), state.myTeams.items[2]);
  assert.deepEqual(patches(), []);
  api.assertAnswered();
});

test("a guest has no active team, and nothing is asked", async () => {
  coachWith({ activeTeamId: "t1" });
  team.syncActiveTeam({ store: memory().store });
  state.auth.currentUser = null;
  assert.equal(team.syncActiveTeam({ store: memory().store }), null);
  await flush();
  assert.equal(state.activeTeamId, null);
  assert.deepEqual(api.calls, []);
  api.assertAnswered();
});

test("signing out forgets the active team here and in this browser", async () => {
  coachWith({ activeTeamId: "t1" });
  team.syncActiveTeam();
  assert.ok(api.items.has(KEY));
  api.fail("POST /api/auth/logout");
  await session.signOut();
  assert.equal(state.activeTeamId, null);
  assert.equal(api.items.has(KEY), false);
  assert.deepEqual(patches(), []);
  api.assertAnswered();
});
