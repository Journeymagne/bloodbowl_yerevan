import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { readRoster } = await import("../src/screens/team/roster/data.mjs");
const save = await import("../src/screens/team/roster/save.mjs");

setDictionaries({
  en: {
    "teamRoster.readMismatch": "The roster kept changing while it was read. Try again.",
    "auth.otherTab": "Someone signed in or out in another tab, so nothing was saved here.",
    "request.offline": "No connection.",
    "error.ROSTER_BREAKS_THE_RULES": "The roster breaks the rules.",
    "error.TEAM_SAVED_ELSEWHERE": "The team was saved elsewhere.",
    "validation.DUPLICATE_PLAYER_ID": "Players {names} are stored under one id.",
  },
  ru: {},
});

const TOKEN = "gata-league-auth-token";
const LOGO = "data:image/png;base64,AA==";
const TEAM_URL = "GET /api/teams/t1";
const EVENTS_URL = "GET /api/teams/t1/events";
const PATCH_URL = "PATCH /api/teams/t1";

/** t1 as GET sends it: Ann with 2 TD in the blob, the logo in its column. */
const teamAt = (revision, spp = { touchdowns: 2 }, over = {}) => ({
  id: "t1", name: "Iron Rooks", baseTeamSlug: "teams/human", logoData: LOGO, revision, stage: "active",
  roster: { teamSlug: "teams/human", teamName: "Iron Rooks", treasury: 50, players: [{ id: "p1", rowIndex: 0, number: "1", name: "Ann", spp }] },
  ...over,
});
/** A row of match_events as GET …/events sends it: outside any match and not settled. */
const tdOf = (playerId, delta = 1) => ({ playerId, counter: "touchdowns", delta, pairingId: null, settledAt: null, injury: null });
const patches = () => api.calls.filter((call) => call.key === PATCH_URL);
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await tick();
  }
}
/** Wait until the queue has nothing in the air: the state it comes to rest in. */
async function settle(teamId = "t1") {
  for (let spins = 0; spins < 50; spins += 1) {
    await tick();
    const now = save.saveState(teamId);
    if (now.status !== "saving" && now.status !== "dirty") return now;
  }
  throw new Error("the save queue did not come to rest");
}

let coaches = 0;
/** What the test before left in the queue (a step waiting, a status) is given up: each test starts with t1 at rest. */
function clearQueue() {
  if (save.saveState("t1").status !== "idle") save.takeServerTeam(teamAt(4));
}

/** A signed-in coach, and t1 read and tracked as the screen does it. */
async function open(team = teamAt(4), events = []) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: `u${++coaches}`, login: "coach" };
  state.myTeams = { items: [{ id: "t0", name: "Other" }, { id: "t1", name: "Old name", revision: 4 }], loaded: true, loading: false, error: "" };
  clearQueue();
  api.reply(TEAM_URL, 200, { team });
  api.reply(EVENTS_URL, 200, { events, revision: team.revision });
  const read = await readRoster("t1");
  assert.equal(read.error, undefined);
  api.calls.length = 0;
  return save.trackRoster(read.team);
}

test("the team and its records are read until they agree on the revision", async () => {
  api.reset();
  api.reply(TEAM_URL, 200, { team: teamAt(4) });
  api.reply(EVENTS_URL, 200, { events: [tdOf("p1")], revision: 4 });
  const gate = api.hold(EVENTS_URL);
  const reading = readRoster("t1");
  await waitHeld(gate);
  // The records were read a revision behind the team: both are read again.
  gate.release({ status: 200, body: { events: [], revision: 3 } });
  const read = await reading;
  assert.equal(read.team.revision, 4);
  assert.deepEqual(read.events, [tdOf("p1")]);
  assert.deepEqual(api.calls.map((call) => call.key).sort(), [TEAM_URL, TEAM_URL, EVENTS_URL, EVENTS_URL]);
  api.assertAnswered();
});

test("three readings that never agree give up with words; a failed read says why", async () => {
  api.reset();
  api.reply(TEAM_URL, 200, { team: teamAt(4) });
  api.reply(EVENTS_URL, 200, { events: [], revision: 3 });
  assert.deepEqual(await readRoster("t1"), { error: "The roster kept changing while it was read. Try again." });
  assert.equal(api.calls.filter((call) => call.key === TEAM_URL).length, 3);
  api.reset();
  api.reply(EVENTS_URL, 200, { events: [], revision: 4 });
  api.fail(TEAM_URL);
  assert.deepEqual(await readRoster("t1"), { error: "No connection." });
  // `attempts` is how many times the two are read before giving up on their agreeing.
  api.reset();
  api.reply(TEAM_URL, 200, { team: teamAt(4) });
  api.reply(EVENTS_URL, 200, { events: [], revision: 3 });
  assert.equal((await readRoster("t1", { attempts: 1 })).error, "The roster kept changing while it was read. Try again.");
  assert.equal(api.calls.filter((call) => call.key === TEAM_URL).length, 1);
});

// Review Focus 4: the screen shows the career, the PATCH carries the blob.
test("a tap writes the stored counter plus one, never the career, with the team as read and its revision", async () => {
  const draft = await open(teamAt(4), [tdOf("p1")]);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
  assert.equal(draft.players[0].spp.touchdowns, 3);
  assert.deepEqual(await settle(), { status: "saved", waiting: 0, refusal: "" });
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  assert.equal(body.roster.players[0].spp.touchdowns, 3, "the 2 of the blob, plus one; the waiting +1 TD of the records is not in it");
  assert.deepEqual([body.revision, body.name, body.baseTeamSlug, body.logoData], [4, "Iron Rooks", "teams/human", LOGO]);
  assert.equal(body.roster.logoData, undefined, "the logo goes in its column once");
  assert.equal(body.roster.treasury, 50);
});

test("what the screen read is not touched: the draft is a copy", async () => {
  const team = teamAt(4);
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  clearQueue();
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  const draft = save.trackRoster(team);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.equal(team.roster.players[0].spp.touchdowns, 2);
  assert.notEqual(draft, team.roster);
});

// Review Focus 1: the second request is built when the first has answered, on the revision it brought.
test("two quick taps are two PATCHes in order, the second on the revision the first came back with", async () => {
  await open();
  const first = api.hold(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await waitHeld(first);
  assert.deepEqual(save.saveState("t1"), { status: "saving", waiting: 1, refusal: "" });
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 4 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal(save.saveState("t1").waiting, 2);
  assert.equal(patches().length, 1, "the second waits for the first's answer");
  first.release({ status: 200, body: { team: teamAt(5, { touchdowns: 3 }) } });
  assert.deepEqual(await settle(), { status: "saved", waiting: 0, refusal: "" });
  assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 3], [5, 4]]);
});

// K6: the switcher and #/teams follow the order of the list, so a save does not move a team.
test("the team in its place, with its new revision", async () => {
  await open();
  state.myTeams.items = [{ id: "t0", name: "Other" }, { id: "t1", name: "Old name", revision: 4 }, { id: "t2", name: "Third" }];
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual(state.myTeams.items.map((item) => item.id), ["t0", "t1", "t2"]);
  assert.equal(state.myTeams.items[1].revision, 5);
  assert.equal(state.myTeams.items[1].name, "Iron Rooks");
  // A list that does not hold the team is not made to claim it is complete; another coach's list is not written.
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual(state.myTeams, { items: [], loaded: false, loading: false, error: "" });
});

test("another coach's list is not given the team", async () => {
  await open();
  const held = api.hold(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await waitHeld(held);
  state.auth.currentUser = { id: "someone-else", login: "other" };
  held.release({ status: 200, body: { team: teamAt(5, { touchdowns: 3 }) } });
  await settle();
  assert.equal(state.myTeams.items[1].name, "Old name");
});

// Review Focus 1: an answer that was lost must not be sent again against a revision it has already moved.
test("a 409 that carries our own counters is a save that landed while its answer was lost", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting, offline.refusal], ["offline", 1, "No connection."]);
  // The server has it: the revision is 5 and the roster is what was sent.
  const sent = patches()[0].body;
  const landed = teamAt(5, { touchdowns: 3 }, { roster: { ...sent.roster, logoData: undefined } });
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: landed });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), { status: "saved", waiting: 0, refusal: "" });
  assert.equal(state.myTeams.items[1].revision, 5);
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 4 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 3], [4, 3], [5, 4]]);
});

test("a 409 with anything else is another device: it waits for the coach, and nothing more is sent", async () => {
  const draft = await open();
  const elsewhere = teamAt(5, { touchdowns: 9 });
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  const conflict = await settle();
  assert.deepEqual([conflict.status, conflict.waiting, conflict.refusal], ["conflict", 1, "The team was saved elsewhere."]);
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: false });
  await tick();
  assert.equal(patches().length, 1, "nothing more is sent");
  assert.equal(draft.players[0].spp.touchdowns, 3, "his own tap stays on the screen until the coach takes the server's");
  const taken = save.takeServerTeam(elsewhere);
  assert.equal(taken.players[0].spp.touchdowns, 9);
  assert.deepEqual(save.saveState("t1"), { status: "idle", waiting: 0, refusal: "" });
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 10 }) });
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
  await settle();
  assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 3], [5, 10]]);
});

test("no network: the step waits, counted, and goes when asked again", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting], ["offline", 1]);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), { status: "saved", waiting: 0, refusal: "" });
  assert.deepEqual(patches().map(({ body }) => body.revision), [4, 4]);
});

test("steps taken offline go in order when the network is back, each on the revision before it", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).waiting, 2);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  const first = api.hold(PATCH_URL);
  const retried = save.retrySaves("t1");
  await waitHeld(first);
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 4 }) });
  first.release({ status: 200, body: { team: teamAt(5, { touchdowns: 3 }) } });
  await retried;
  assert.deepEqual(await settle(), { status: "saved", waiting: 0, refusal: "" });
  assert.deepEqual(patches().slice(-2).map(({ body }) => [body.revision, body.roster.players[0].spp.touchdowns]), [[4, 3], [5, 4]]);
});

test("a stored 0 takes no step down, 999 no step up, and a player the roster has not none", async () => {
  await open(teamAt(4, { touchdowns: 0, casualties: 999 }));
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", -1), { ok: false });
  assert.deepEqual(save.stepSpp("t1", "p1", "casualties", 1), { ok: false });
  assert.deepEqual(save.stepSpp("t1", "p9", "touchdowns", 1), { ok: false });
  assert.deepEqual(save.stepSpp("t1", "", "touchdowns", 1), { ok: false });
  assert.deepEqual(save.stepSpp("t1", "p1", "goals", 1), { ok: false });
  assert.deepEqual(save.stepSpp("t2", "p1", "touchdowns", 1), { ok: false }, "a team the queue does not hold");
  assert.deepEqual(save.saveState("t1"), { status: "idle", waiting: 0, refusal: "" });
  await tick();
  assert.equal(api.calls.length, 0);
  // The ends themselves are reachable.
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 1, casualties: 998 }) });
  assert.deepEqual([save.stepSpp("t1", "p1", "touchdowns", 1), save.stepSpp("t1", "p1", "casualties", -1)], [{ ok: true }, { ok: true }]);
  await settle();
});

test("another tab's coach: nothing is sent", async () => {
  const draft = await open();
  api.items.set(TOKEN, "someone-else");
  const refused = save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.match(refused.refusal, /another tab/);
  assert.equal(draft.players[0].spp.touchdowns, 2);
  assert.deepEqual(save.saveState("t1"), { status: "idle", waiting: 0, refusal: "" });
  await tick();
  assert.equal(api.calls.length, 0);
});

// The request leaves later than the tap that made it when it waits behind another or for the network.
test("a step that waits sends nothing once another tab has moved the token", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "offline");
  api.items.set(TOKEN, "someone-else");
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  assert.equal(await save.retrySaves("t1"), "error");
  const now = save.saveState("t1");
  assert.deepEqual([now.waiting, patches().length], [1, 1]);
  assert.match(now.refusal, /another tab/);
  save.takeServerTeam(teamAt(4));
});

test("a refusal names the rule", async () => {
  await open();
  api.reply(PATCH_URL, 422, {
    error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
    violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
  });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  const refused = await settle();
  assert.equal(refused.status, "error");
  assert.match(refused.refusal, /Ann, Bo/);
  assert.equal(refused.refusal, "The roster breaks the rules. Players Ann, Bo are stored under one id.");
  save.takeServerTeam(teamAt(4));
  assert.deepEqual(save.saveState("t1"), { status: "idle", waiting: 0, refusal: "" });
});

test("the screen hears every change of the state, and the first at once; a listener that left hears no more", async () => {
  await open();
  const heard = [];
  const stop = save.onSaveState("t1", (now) => heard.push(`${now.status}:${now.waiting}`));
  assert.deepEqual(heard, ["idle:0"]);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual(heard.slice(1), ["dirty:1", "saving:1", "saved:0"]);
  stop();
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.equal(heard.length, 4);
});

test("a team read again while a step waits keeps the draft and the revision that step was taken on", async () => {
  const draft = await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  // Another device has moved the team on meanwhile: the screen is entered again with its copy.
  const again = save.trackRoster(teamAt(7, { touchdowns: 8 }));
  assert.equal(again, draft);
  assert.equal(again.players[0].spp.touchdowns, 3);
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: teamAt(7, { touchdowns: 8 }) });
  assert.equal(await save.retrySaves("t1"), "conflict", "so the save is refused, not laid over what the other device wrote");
  assert.equal(patches().at(-1).body.revision, 4);
  save.takeServerTeam(teamAt(7, { touchdowns: 8 }));
  // With nothing waiting, a copy read again is taken.
  assert.equal(save.trackRoster(teamAt(8, { touchdowns: 11 })).players[0].spp.touchdowns, 11);
});

test("the browser asks before the tab closes while a step waits", async () => {
  await open();
  const target = new EventTarget();
  const release = save.guardUnload(target);
  assert.equal(save.guardUnload(target), release, "one guard to a target");
  const ask = () => {
    const leaving = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  };
  assert.equal(ask(), false, "nothing waits");
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.equal(ask(), true, "a step waits for the network");
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  await save.retrySaves("t1");
  assert.equal(ask(), false, "it was answered");
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  release();
  assert.equal(ask(), false, "a guard taken off is silent");
  assert.notEqual(save.guardUnload(target), release, "and may be put on again");
  save.takeServerTeam(teamAt(4));
});
