import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { installFakeApi } from "./helpers/fake-api.mjs";
import { expandCollections } from "../src/data/reference.mjs";
import { EDIT_REFUSALS, FIX_REFUSALS } from "../src/domain/roster/edits.mjs";
import { ADVANCE_REFUSALS } from "../src/domain/roster/progression.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries, setLocale } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const session = await import("../src/data/session.mjs");
const { loadMyTeams, onMyTeamsChange } = await import("../src/data/teams.mjs");
const { readRoster } = await import("../src/screens/team/roster/data.mjs");
const save = await import("../src/screens/team/roster/save.mjs");
const { checkRoster, loadTeamReference, teamBySlug } = await import("../server/domain/roster.mjs");

// The races as public/data.en.json has them, read the way the server reads them.
await loadTeamReference(fileURLToPath(new URL("..", import.meta.url)));
// Human: 0 Human Lineman 50k (0-16), 1 Thrower 80k (0-2), 2 Catcher 75k (0-2), 3 Blitzer 80k (0-2), 4 Halfling Hopeful 30k (0-3), 5 Ogre 140k (0-1).
const human = teamBySlug("teams/human");
// Nurgle, Favoured of Nurgle: 0 Rotter Lineman. The Skill Table as public/data.en.json has it.
const nurgle = teamBySlug("teams/nurgle");
const { skillGroups } = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const dictionary = (file) => JSON.parse(readFileSync(new URL(`../src/i18n/${file}`, import.meta.url), "utf8"));
const EN = dictionary("en.json");
const RU = dictionary("ru.json");
/** Stage 07d's words as src/i18n/en.json has them, with the characteristics they name. */
const words07d = Object.fromEntries(Object.entries(EN).filter(([key]) => /^(teamPlayer|teamAdvance|stats)\./.test(key)));

setDictionaries({
  en: {
    "teamRoster.readMismatch": "The roster kept changing while it was read. Try again.",
    "auth.otherTab": "Someone signed in or out in another tab, so nothing was saved here.",
    "request.offline": "No connection.",
    "request.noAnswer": "The server did not answer.",
    "error.ROSTER_BREAKS_THE_RULES": "The roster breaks the rules.",
    "error.TEAM_SAVED_ELSEWHERE": "The team was saved elsewhere.",
    "validation.DUPLICATE_PLAYER_ID": "Players {names} are stored under one id.",
    "validation.POSITION_MAX": "{position}: maximum is {max}.",
    "validation.ROSTER_MAX_PLAYERS": "A team has at most {max} players (now {count}).",
    "validation.TREASURY_INVALID": "Treasury must be a nonnegative amount in whole gold pieces.",
    "validation.PLAYER_SALE_MIN": "A sale cannot leave fewer than seven players on the team.",
    "validation.PLAYER_PURCHASE_CLOSED": "This purchase can no longer be cancelled. Use a sale under the league rules.",
    "validation.PLAYER_NOT_FOUND": "This player is no longer on the team.",
    "error.DICE_ROLL_MISMATCH": "This advancement does not match its roll on the site.",
    ...words07d,
  },
  ru: { "auth.otherTab": "Кто-то вошёл или вышел в другой вкладке, поэтому здесь ничего не сохранено." },
});

const TOKEN = "gata-league-auth-token";
const LOGO = "data:image/png;base64,AA==";
const TEAM_URL = "GET /api/teams/t1";
const EVENTS_URL = "GET /api/teams/t1/events";
const PATCH_URL = "PATCH /api/teams/t1";

/** t1 as GET sends it: Ann with 2 TD in the blob, the logo in its column; or the players given. */
const teamAt = (revision, spp = { touchdowns: 2 }, over = {}, players = [{ id: "p1", rowIndex: 0, number: "1", name: "Ann", spp }]) => ({
  id: "t1", name: "Iron Rooks", baseTeamSlug: "teams/human", logoData: LOGO, revision, stage: "active",
  roster: { teamSlug: "teams/human", teamName: "Iron Rooks", treasury: 50, players },
  ...over,
});
/** Ann, who plays; Bo, who misses the next match; Cy, retired for the season, as a stored one is: skipping, and why (stage 07b). */
const skips = () => [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann", spp: { touchdowns: 2 } },
  { id: "p2", rowIndex: 0, number: "2", name: "Bo", skipNextGame: true, absence: { code: "miss" } },
  { id: "p3", rowIndex: 0, number: "3", name: "Cy", temporarilyRetired: true, skipNextGame: true, absence: { code: "lasting", stat: "ag" } },
];
const elsewhereError = { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" };
const rulesRefusal = {
  error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
  violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
};
/** A row of match_events as GET …/events sends it: outside any match and not settled. */
const tdOf = (playerId, delta = 1) => ({ playerId, counter: "touchdowns", delta, pairingId: null, settledAt: null, injury: null });
const patches = () => api.calls.filter((call) => call.key === PATCH_URL);
const tick = () => new Promise((resolve) => setImmediate(resolve));
/** `saveState` with no failure behind it. */
const quiet = (status, waiting = 0) => ({ status, waiting, refusal: "", kind: "", code: "" });

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

// Final review, Important 1: a 2xx whose body is not JSON comes back from api.mjs as `{}` — a proxy's page, not the server's word.
test("a read answered 2xx without the team or without its records is a read that failed, said in words, not in a script's", async () => {
  for (const [teamBody, eventsBody] of [[{}, { events: [], revision: 4 }], [{ team: teamAt(4) }, {}], [null, { events: [], revision: 4 }]]) {
    api.reset();
    api.reply(TEAM_URL, 200, teamBody);
    api.reply(EVENTS_URL, 200, eventsBody);
    assert.deepEqual(await readRoster("t1"), { error: "The server did not answer." });
  }
});

test("a save answered 2xx without the team is an answer that did not come: the step waits, and its retry finds it landed by the 409", async () => {
  await open();
  api.reply(PATCH_URL, 200, {});
  save.stepSpp("t1", "p1", "touchdowns", 1);
  const lost = await settle();
  assert.deepEqual([lost.status, lost.waiting, lost.kind, lost.refusal], ["offline", 1, "offline", "No connection."], "not «Saved»");
  assert.equal(save.savedRevision("t1"), 4);
  assert.equal(state.myTeams.items[1].name, "Old name", "nothing is put in the coach's list");
  const sent = patches()[0].body;
  const landed = teamAt(5, { touchdowns: 3 }, { roster: { ...sent.roster, logoData: undefined } });
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: landed });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
  assert.equal(save.savedRevision("t1"), 5);
});

// Review Focus 4: the screen shows the career, the PATCH carries the blob.
test("a tap writes the stored counter plus one, never the career, with the team as read and its revision", async () => {
  const draft = await open(teamAt(4), [tdOf("p1")]);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: true });
  assert.equal(draft.players[0].spp.touchdowns, 3);
  assert.deepEqual(await settle(), quiet("saved"));
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
  assert.deepEqual(save.saveState("t1"), quiet("saving", 1));
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 4 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal(save.saveState("t1").waiting, 2);
  assert.equal(patches().length, 1, "the second waits for the first's answer");
  first.release({ status: 200, body: { team: teamAt(5, { touchdowns: 3 }) } });
  assert.deepEqual(await settle(), quiet("saved"));
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
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
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
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
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
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
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
  assert.deepEqual(await settle(), quiet("saved"));
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
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
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
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
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
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
});

// Final review, Minor 5: failSave puts the refused step back at the head of the queue, and a tap would send it again.
test("a step the rules refused is not sent again by a tap while the server's roster is read: the tap says why and changes nothing", async () => {
  const draft = await open();
  api.reply(PATCH_URL, 422, {
    error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
    violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
  });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "error");
  assert.deepEqual(save.stepSpp("t1", "p1", "casualties", 1), { ok: false, refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id." });
  await tick();
  assert.equal(patches().length, 1, "the refused step is not sent again");
  assert.deepEqual([draft.players[0].spp.casualties, save.saveState("t1").waiting], [undefined, 1]);
  // Once the server's roster is taken, a tap goes.
  save.takeServerTeam(teamAt(4));
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 2, casualties: 1 }) });
  assert.deepEqual(save.stepSpp("t1", "p1", "casualties", 1), { ok: true });
  assert.deepEqual(await settle(), quiet("saved"));
  // Another failure (a 5xx) is no refusal by the rules: a tap sends the step that waits and his own.
  api.reply(PATCH_URL, 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  save.stepSpp("t1", "p1", "casualties", 1);
  assert.equal((await settle()).kind, "http");
  api.reply(PATCH_URL, 200, { team: teamAt(7, { touchdowns: 2, casualties: 3 }) });
  assert.deepEqual(save.stepSpp("t1", "p1", "casualties", 1), { ok: true });
  assert.deepEqual(await settle(), quiet("saved"));
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

// The review's interleaving, step by step: a 409, a retry, the coach takes the server's team, a retry again.
test("a conflict is the coach's to settle: a retry sends nothing, and nothing stale is left to go over the server's team", async () => {
  await open();
  const elsewhere = teamAt(5, { touchdowns: 9 });
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "conflict");
  assert.equal(await save.retrySaves("t1"), "conflict");
  await tick();
  assert.equal(patches().length, 1, "the step that met the 409 is not put in the air again");
  assert.equal(save.takeServerTeam(elsewhere).players[0].spp.touchdowns, 9);
  // A server that takes anything: a step left in the queue would be accepted on the revision taken, and 9 would become 3.
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 3 }) });
  assert.equal(await save.retrySaves("t1"), "idle");
  await tick();
  assert.equal(patches().length, 1, "nothing is left in the queue to send");
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
});

test("the server's team is not taken while a request is in the air; the 409 that comes back leaves no stale step behind", async () => {
  const draft = await open();
  const elsewhere = teamAt(5, { touchdowns: 9 });
  api.reply(PATCH_URL, 422, {
    error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
    violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
  });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "error");
  // The retry of a refused step is in the air when the coach asks for the server's team.
  const gate = api.hold(PATCH_URL);
  const retrying = save.retrySaves("t1");
  await waitHeld(gate);
  assert.equal(save.takeServerTeam(elsewhere), null, "not now");
  assert.equal(draft.players[0].spp.touchdowns, 3, "the draft is as it was");
  assert.deepEqual(save.saveState("t1"), quiet("saving", 1));
  gate.release({ status: 409, body: { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: elsewhere } });
  assert.equal(await retrying, "conflict");
  assert.equal(save.takeServerTeam(elsewhere).players[0].spp.touchdowns, 9, "once it has answered");
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 3 }) });
  assert.equal(await save.retrySaves("t1"), "idle");
  assert.equal(patches().length, 2, "the step that came back was not kept");
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 10 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual([patches().at(-1).body.revision, patches().at(-1).body.roster.players[0].spp.touchdowns], [5, 10]);
});

test("what failed is told by kind and code, for the screen to act on, not only in words", async () => {
  await open();
  const failure = () => {
    const { status, kind, code } = save.saveState("t1");
    return [status, kind, code];
  };
  const refuse = async (status, body) => {
    api.reply(PATCH_URL, status, body);
    await save.retrySaves("t1");
    return failure();
  };
  assert.deepEqual(failure(), ["idle", "", ""]);
  api.reply(PATCH_URL, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [] });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.deepEqual(failure(), ["error", "invalid", "ROSTER_BREAKS_THE_RULES"], "a 422: the screen takes the server's team");
  assert.deepEqual(await refuse(404, { error: { code: "TEAM_NOT_FOUND", params: {}, message: "x" } }), ["error", "http", "TEAM_NOT_FOUND"]);
  assert.deepEqual(await refuse(500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } }), ["error", "http", "SERVER_ERROR"]);
  assert.deepEqual(await refuse(502, {}), ["error", "http", ""], "a proxy's answer has no code");
  api.fail(PATCH_URL);
  await save.retrySaves("t1");
  assert.deepEqual(failure(), ["offline", "offline", ""]);
  api.items.set(TOKEN, "someone-else");
  await save.retrySaves("t1");
  assert.deepEqual(failure(), ["error", "forbidden", "OTHER_TAB"], "another tab's coach");
  api.reply(PATCH_URL, 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: teamAt(5, { touchdowns: 9 }) });
  api.items.set(TOKEN, "tok");
  await save.retrySaves("t1");
  assert.deepEqual(failure(), ["conflict", "conflict", "TEAM_SAVED_ELSEWHERE"]);
  save.takeServerTeam(teamAt(4));
  assert.deepEqual(failure(), ["idle", "", ""]);
});

test("the other-tab refusal is worded when it is read, in the language of that moment", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  api.items.set(TOKEN, "someone-else");
  assert.equal(await save.retrySaves("t1"), "error");
  assert.match(save.saveState("t1").refusal, /another tab/);
  // setLocale writes the page's language and its static texts: a page that has them.
  globalThis.document = { documentElement: {}, querySelectorAll: () => [] };
  try {
    setLocale("ru");
    assert.match(save.saveState("t1").refusal, /другой вкладке/);
  } finally {
    setLocale("en");
    delete globalThis.document;
  }
  assert.match(save.saveState("t1").refusal, /another tab/);
  save.takeServerTeam(teamAt(4));
});

test("a team the queue does not hold can be listened to: it is at rest, and says so once", () => {
  const heard = [];
  const stop = save.onSaveState("nobody", (now) => heard.push(now));
  assert.deepEqual(heard, [quiet("idle")]);
  assert.equal(typeof stop, "function");
  stop();
});

test("a session that ends takes the queue with it: a step that can never go is not asked about", async () => {
  await open();
  const target = new EventTarget();
  const release = save.guardUnload(target);
  const asks = () => {
    const leaving = new Event("beforeunload", { cancelable: true });
    target.dispatchEvent(leaving);
    return leaving.defaultPrevented;
  };
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  assert.equal(asks(), true);
  session.sessionEnded();
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
  assert.equal(asks(), false, "nothing waits for a coach who has gone");
  assert.deepEqual(save.stepSpp("t1", "p1", "touchdowns", 1), { ok: false }, "nor is the team held for whoever comes next");
  release();
});

test("a session read again for the same coach keeps the steps that wait; another coach's does not", async () => {
  await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await settle();
  api.reply("GET /api/auth/me", 200, { user: { id: state.auth.currentUser.id, login: "coach" } });
  api.reply("GET /api/teams", 200, { teams: [] });
  assert.equal(await session.loadSession(), "signed-in");
  assert.equal(save.saveState("t1").waiting, 1, "another tab moved the token, and the same coach is still here");
  api.reply("GET /api/auth/me", 200, { user: { id: "someone-else", login: "other" } });
  assert.equal(await session.loadSession(), "signed-in");
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
});

// Stage 07b: a missed-match mark and back on the roster are steps of the same queue.
test("a missed match is one PATCH of the whole roster: the reason, the missed match, and what the injury did, on the revision as read", async () => {
  const draft = await open();
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.markSkip("t1", "p1", { code: "lasting", stat: "ag" }), { ok: true });
  assert.deepEqual([draft.players[0].skipNextGame, save.saveState("t1").waiting], [true, 1], "the draft has it at once, and it waits");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  const [ann] = body.roster.players;
  assert.deepEqual([ann.skipNextGame, ann.absence, ann.statMods.ag, ann.injuryStatMods.ag], [true, { code: "lasting", stat: "ag" }, -1, -1]);
  assert.deepEqual([body.revision, body.name, body.baseTeamSlug, body.logoData, ann.spp.touchdowns], [4, "Iron Rooks", "teams/human", LOGO, 2]);
  assert.equal(save.savedRevision("t1"), 5);
});

test("back on the roster is one PATCH that ends the missed match and its reason", async () => {
  const draft = await open(teamAt(4, undefined, {}, skips()));
  api.reply(PATCH_URL, 200, { team: teamAt(5, undefined, {}, skips()) });
  assert.deepEqual(save.unmarkSkip("t1", "p2"), { ok: true });
  assert.deepEqual([draft.players[1].skipNextGame, draft.players[1].absence], [false, null]);
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  assert.deepEqual([body.roster.players[1].skipNextGame, body.roster.players[1].absence, body.revision], [false, null, 4]);
  assert.equal(body.roster.players[2].temporarilyRetired, true, "the rest of the roster as read");
});

test("a mark queues behind a step in the air and goes on the revision it came back with", async () => {
  await open();
  const first = api.hold(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  await waitHeld(first);
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 3 }) });
  assert.deepEqual(save.markSkip("t1", "p1", { code: "niggling" }), { ok: true });
  assert.deepEqual([save.saveState("t1").waiting, patches().length], [2, 1], "the mark waits for the step's answer");
  first.release({ status: 200, body: { team: teamAt(5, { touchdowns: 3 }) } });
  assert.deepEqual(await settle(), quiet("saved"));
  const [step, mark] = patches().map(({ body }) => body);
  assert.deepEqual([step.revision, step.roster.players[0].spp.touchdowns, Boolean(step.roster.players[0].skipNextGame)], [4, 3, false]);
  const ann = mark.roster.players[0];
  assert.deepEqual([mark.revision, ann.spp.touchdowns, ann.skipNextGame, ann.absence, ann.nigglingInjuries], [5, 3, true, { code: "niggling" }, 1]);
});

test("a mark whose answer was lost is the 409 that holds it: taken as saved, not sent as new", async () => {
  const draft = await open();
  api.fail(PATCH_URL);
  save.markSkip("t1", "p1", { code: "other", note: "Wedding" });
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting], ["offline", 1]);
  const sent = patches()[0].body;
  const landed = teamAt(5, undefined, { roster: { ...sent.roster, logoData: undefined } });
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: landed });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
  assert.equal(save.savedRevision("t1"), 5);
  assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players[0].absence]), [[4, { code: "other", note: "Wedding" }], [4, { code: "other", note: "Wedding" }]]);
  assert.deepEqual(draft.players[0].absence, { code: "other", note: "Wedding" }, "the mark once, as it landed");
});

test("nothing is sent for a player who already misses the match, one retired for the season, one the roster has not, or after a conflict; another tab's coach is told", async () => {
  const draft = await open(teamAt(4, undefined, {}, skips()));
  const before = structuredClone(draft.players);
  assert.deepEqual(save.markSkip("t1", "p2", { code: "miss" }), { ok: false }, "Bo already misses it: a second mark would lay its injury over the first");
  assert.deepEqual(save.markSkip("t1", "p3", { code: "miss" }), { ok: false }, "Cy is retired for the season");
  assert.deepEqual(save.unmarkSkip("t1", "p3"), { ok: false }, "and back on the roster does not end that");
  assert.deepEqual(save.unmarkSkip("t1", "p1"), { ok: false }, "Ann misses nothing");
  assert.deepEqual(save.markSkip("t1", "p9", { code: "miss" }), { ok: false }, "a player the roster has not");
  assert.deepEqual(save.unmarkSkip("t1", ""), { ok: false });
  assert.deepEqual(save.markSkip("t2", "p1", { code: "miss" }), { ok: false }, "a team the queue does not hold");
  api.items.set(TOKEN, "someone-else");
  assert.match(save.markSkip("t1", "p1", { code: "miss" }).refusal, /another tab/);
  assert.match(save.unmarkSkip("t1", "p2").refusal, /another tab/);
  assert.deepEqual(draft.players, before, "the draft is as it was");
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
  await tick();
  assert.equal(api.calls.length, 0);
  // Another device's save: the coach settles it before anything more goes.
  api.items.set(TOKEN, "tok");
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: teamAt(5, { touchdowns: 9 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "conflict");
  assert.deepEqual(save.markSkip("t1", "p1", { code: "miss" }), { ok: false });
  assert.deepEqual(save.unmarkSkip("t1", "p2"), { ok: false });
  await tick();
  assert.deepEqual([patches().length, Boolean(draft.players[0].skipNextGame), draft.players[1].skipNextGame], [1, false, true]);
});

test("a mark after a refusal by the rules says why and changes nothing, until the server's roster is taken", async () => {
  const draft = await open(teamAt(4, undefined, {}, skips()));
  api.reply(PATCH_URL, 422, rulesRefusal);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "error");
  const why = { ok: false, refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id." };
  assert.deepEqual([save.markSkip("t1", "p1", { code: "miss" }), save.unmarkSkip("t1", "p2")], [why, why]);
  await tick();
  assert.deepEqual([patches().length, Boolean(draft.players[0].skipNextGame), draft.players[1].skipNextGame], [1, false, true]);
  save.takeServerTeam(teamAt(4, undefined, {}, skips()));
  api.reply(PATCH_URL, 200, { team: teamAt(5, undefined, {}, skips()) });
  assert.deepEqual(save.unmarkSkip("t1", "p2"), { ok: true });
  assert.deepEqual(await settle(), quiet("saved"));
});

// A death and its undo are not the queue's (fallen.mjs): their answer is taken here, the queue first — for the roster's
// visit that sent it while it is here (`queue`); for anyone else the list alone (final review, I1).
test("the answer to a death or an undo goes to the queue, then to the coach's list", async () => {
  await open(teamAt(4, undefined, {}, skips()));
  state.myTeams.items = [{ id: "t0", name: "Other" }, { id: "t1", name: "Old name", revision: 4 }, { id: "t9", name: "Ninth", revision: 2 }];
  const heard = [];
  const off = onMyTeamsChange(() => heard.push([save.savedRevision("t1"), state.myTeams.items[1].revision]));
  try {
    // Bo died: the answer's roster is without him.
    const draft = save.takeAnswerTeam(teamAt(5, undefined, {}, skips().filter((player) => player.id !== "p2")), { queue: true });
    assert.deepEqual(draft.players.map((player) => player.id), ["p1", "p3"]);
    assert.equal(save.savedRevision("t1"), 5);
    assert.deepEqual(state.myTeams.items.map((item) => [item.id, item.revision]), [["t0", undefined], ["t1", 5], ["t9", 2]]);
    assert.deepEqual(heard, [[5, 5]], "the list's listener reads the queue's revision as it reads the list's: nothing to read again");
    assert.deepEqual(save.saveState("t1"), quiet("idle"));
    api.reply(PATCH_URL, 200, { team: teamAt(6) });
    assert.deepEqual(save.markSkip("t1", "p1", { code: "miss" }), { ok: true });
    await settle();
    assert.deepEqual(patches().map(({ body }) => [body.revision, body.roster.players.length]), [[5, 2]], "the next step goes on the answer's revision and roster");
    // Not asked to take it into the queue (a visit that has left, the fallen player's profile): the list alone has it,
    // and the queue's draft, which a visit of the roster may be drawing, is left as it is.
    const before = save.saveState("t1");
    assert.equal(save.takeAnswerTeam(teamAt(7, undefined, {}, skips())), null);
    assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[1].revision, save.saveState("t1")], [6, 7, before]);
    // A team the queue does not hold: the list has it all the same.
    heard.length = 0;
    assert.equal(save.takeAnswerTeam({ ...teamAt(3), id: "t9", name: "Ninth" }, { queue: true }), null);
    assert.deepEqual([state.myTeams.items[2].revision, save.savedRevision("t9"), heard.length], [3, null, 1]);
  } finally {
    off();
  }
});

// Review Minor 1: a death answered slowly, while the strip (or another device) wrote after it.
test("an answer older than what the queue or the list holds is not taken: neither goes back", async () => {
  const draft = await open(teamAt(4, undefined, {}, skips()));
  api.reply(PATCH_URL, 200, { team: teamAt(6, undefined, {}, skips()) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.deepEqual(await settle(), quiet("saved"));
  assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[1].revision], [6, 6]);
  let heard = 0;
  const off = onMyTeamsChange(() => { heard += 1; });
  try {
    const late = teamAt(5, undefined, {}, skips().filter((player) => player.id !== "p2"));
    assert.equal(save.takeAnswerTeam(late, { queue: true }), null);
    assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[1].revision, heard], [6, 6, 0]);
    assert.deepEqual([save.saveState("t1"), draft.players.length], [quiet("saved"), 3], "the queue and its draft as they were");
    // Only the list ahead (the strip's write, not yet read): the queue at 4 is not moved to 5 either.
    save.takeServerTeam(teamAt(4, undefined, {}, skips()));
    state.myTeams.items[1] = { ...state.myTeams.items[1], revision: 6 };
    assert.equal(save.takeAnswerTeam(late, { queue: true }), null);
    assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[1].revision, heard], [4, 6, 0]);
    // The same revision is the same team: taken.
    assert.ok(save.takeAnswerTeam(teamAt(6, undefined, {}, skips()), { queue: true }));
    assert.deepEqual([save.savedRevision("t1"), state.myTeams.items[1].revision, heard], [6, 6, 1]);
  } finally {
    off();
  }
});

// K7: taken while a step waits, the answer would give that step up without a word.
test("an answer that comes while a step waits or is in the air goes to the list only: the step is kept for the coach to see", async () => {
  const draft = await open();
  api.fail(PATCH_URL);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "offline");
  assert.equal(save.takeAnswerTeam(teamAt(5), { queue: true }), null, "a step waits for the network");
  assert.deepEqual([save.saveState("t1").waiting, save.savedRevision("t1"), draft.players[0].spp.touchdowns], [1, 4, 3]);
  assert.equal(state.myTeams.items[1].revision, 5, "the list has the answer: the screen reads the team again");
  const gate = api.hold(PATCH_URL);
  const retried = save.retrySaves("t1");
  await waitHeld(gate);
  assert.equal(save.takeAnswerTeam(teamAt(6), { queue: true }), null, "a step in the air");
  assert.deepEqual([save.saveState("t1").waiting, save.savedRevision("t1"), state.myTeams.items[1].revision], [1, 4, 6]);
  gate.release({ status: 409, body: { error: elsewhereError, team: teamAt(6) } });
  assert.equal(await retried, "conflict", "the step meets the server's roster, and the coach settles it");
  assert.equal(save.saveState("t1").waiting, 1);
  // Settled, a later answer is the queue's again.
  save.takeServerTeam(teamAt(6));
  assert.equal(save.takeAnswerTeam(teamAt(7), { queue: true }).players[0].spp.touchdowns, 2);
  assert.equal(save.savedRevision("t1"), 7);
});

// Stage 07c: a purchase and a sale are steps of the same queue, the whole roster saved, one step one PATCH.

/** A roster as GET returns it: what the server stores of what was sent (`checkRoster`), over the wire. */
const stored = (roster) => JSON.parse(JSON.stringify(checkRoster("teams/human", roster).roster));
/** t1 as GET sends it with the players given, its roster as the server stores it; 50k in the treasury. */
const storedTeam = (revision, players) => teamAt(revision, undefined, { roster: stored(teamAt(revision, undefined, {}, players).roster) });
const ann = () => [{ id: "p1", rowIndex: 0, number: "1", name: "Ann" }];
/** Ann, Hal the Catcher with Block (75k and 20k), five Linemen, and Ned, a Lineman bought for 50k before any match: eight. */
const eight = () => [
  ...ann(),
  { id: "p2", rowIndex: 2, number: "2", name: "Hal", extraSkills: ["Block"] },
  ...[3, 4, 5, 6, 7].map((n) => ({ id: `p${n}`, rowIndex: 0, number: String(n) })),
  { id: "p8", rowIndex: 0, number: "8", name: "Ned", purchased: true, purchaseRefund: 50 },
];
/** The eight, Ned's purchase sealed by a match: bought, and nothing to cancel any more. */
const sealedEight = () => eight().map((player) => (player.id === "p8" ? { ...player, purchaseRefund: undefined } : player));
const BROKE = "Treasury must be a nonnegative amount in whole gold pieces.";
const LIST_URL = "GET /api/teams";

test("a purchase is one PATCH of the whole roster: the new players with the next free numbers and their price recorded, the treasury spent, on the revision as read", async () => {
  const draft = await open(storedTeam(4, ann()));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.buyPlayers("t1", human, { 0: 1 }), { ok: true, hired: [{ number: "2", position: "Human Lineman" }], treasury: 0 });
  assert.deepEqual([draft.players.length, draft.treasury, save.saveState("t1").waiting], [2, 0, 1], "the draft has him at once, and it waits");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  const { rowIndex, number, purchased, purchaseRefund } = body.roster.players[1];
  assert.deepEqual({ rowIndex, number, purchased, purchaseRefund }, { rowIndex: 0, number: "2", purchased: true, purchaseRefund: 50 });
  assert.deepEqual([body.revision, body.name, body.baseTeamSlug, body.logoData], [4, "Iron Rooks", "teams/human", LOGO]);
  assert.deepEqual([body.roster.treasury, body.roster.roster, body.roster.players[0].name], [0, { 0: 2 }, "Ann"]);
  assert.equal(save.savedRevision("t1"), 5);
});

// Review Focus 2: the cart is asked again, as a whole, on the queue's draft at the press.
test("a cart the draft no longer pays for, or that breaks a limit, sends nothing and says why", async () => {
  const draft = await open(storedTeam(4, ann()));
  const before = structuredClone(draft);
  assert.deepEqual(save.buyPlayers("t1", human, { 0: 2 }), { ok: false, refusal: BROKE }, "100k from 50k");
  assert.deepEqual(save.buyPlayers("t1", human, { 1: 3 }), { ok: false, refusal: "Thrower: maximum is 2." });
  assert.deepEqual(save.buyPlayers("t1", human, { 0: 14 }), { ok: false, refusal: "A team has at most 14 players (now 15)." });
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
  // A purchase spent the treasury: the same cart pressed again is asked on the draft it left, its answer not yet come.
  const held = api.hold(PATCH_URL);
  assert.equal(save.buyPlayers("t1", human, { 0: 1 }).ok, true);
  await waitHeld(held);
  assert.deepEqual(save.buyPlayers("t1", human, { 0: 1 }), { ok: false, refusal: BROKE });
  held.release({ status: 200, body: { team: teamAt(5) } });
  assert.deepEqual(await settle(), quiet("saved"));
  assert.deepEqual([patches().length, draft.players.length, draft.treasury], [1, 2, 0]);
});

test("a sale is one PATCH without him and the treasury up by the sale; a cancelled purchase by what was paid", async () => {
  const draft = await open(storedTeam(4, eight()));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.removePlayer("t1", human, "p2", "sell"), { ok: true, amount: 47.5, treasury: 97.5 }, "half of 75k and Block's 20k");
  assert.deepEqual(save.removePlayer("t1", human, "p2", "sell"), { ok: false }, "a second press finds nobody to sell");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const sold = patches()[0].body;
  assert.deepEqual(sold.roster.players.map((player) => player.id), ["p1", "p3", "p4", "p5", "p6", "p7", "p8"]);
  assert.deepEqual([sold.revision, sold.roster.treasury, sold.roster.roster], [4, 97.5, { 0: 7 }]);
  // Seven are left: a sale would be refused, a purchase is cancelled all the same (owner, Q1).
  api.reply(PATCH_URL, 200, { team: teamAt(6) });
  assert.deepEqual(save.removePlayer("t1", human, "p8", "cancel-purchase"), { ok: true, amount: 50, treasury: 147.5 });
  assert.deepEqual(await settle(), quiet("saved"));
  const cancelled = patches()[1].body;
  assert.deepEqual([cancelled.revision, cancelled.roster.players.length, cancelled.roster.treasury, cancelled.roster.roster], [5, 6, 147.5, { 0: 6 }]);
  assert.equal(draft.players.length, 6);
});

test("a sale the rules refuse sends nothing and says why", async () => {
  // Seven, Ned among them, his purchase sealed.
  const draft = await open(storedTeam(4, sealedEight().filter((player) => player.id !== "p7")));
  const before = structuredClone(draft);
  assert.deepEqual(save.removePlayer("t1", human, "p2", "sell"), { ok: false, refusal: "A sale cannot leave fewer than seven players on the team." });
  assert.deepEqual(save.removePlayer("t1", human, "p8", "cancel-purchase"),
    { ok: false, refusal: "This purchase can no longer be cancelled. Use a sale under the league rules." });
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
});

// T4-1: the plan and `removeLeaguePlayer` ask the same rules twice; should the two ever drift, the step must not count
// as waiting and send the roster unchanged with «+undefined» said. Here the purchase is sealed between the two asks.
test("a removal the domain did not apply throws: nothing waits, nothing is sent", async () => {
  const draft = await open(storedTeam(4, eight()));
  const ids = () => draft.players.map((player) => player.id);
  const before = [ids(), draft.treasury];
  let asked = 0;
  const ned = draft.players.find((player) => player.id === "p8");
  Object.defineProperty(ned, "purchased", { configurable: true, enumerable: true, get: () => (asked += 1) === 1 });
  assert.throws(() => save.removePlayer("t1", human, "p8", "cancel-purchase"),
    { message: /PLAYER_PURCHASE_CLOSED/, refusal: "This purchase can no longer be cancelled. Use a sale under the league rules." });
  assert.equal(asked, 2, "a purchase to cancel for the plan, sealed for the apply");
  assert.deepEqual([[ids(), draft.treasury], save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
});

// Review Focus 1: the step sent again is the snapshot sent first, the new player's id with it.
test("a purchase whose answer was lost is the 409 that holds it: taken as saved, nobody hired twice", async () => {
  const draft = await open(storedTeam(4, ann()));
  api.fail(PATCH_URL);
  assert.equal(save.buyPlayers("t1", human, { 0: 1 }).ok, true);
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting], ["offline", 1]);
  // The server has it: the revision is 5, and the roster is what was sent, as the server stores it.
  const sent = patches()[0].body;
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: teamAt(5, undefined, { roster: stored(sent.roster) }) });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
  assert.equal(save.savedRevision("t1"), 5);
  assert.equal(patches().length, 2);
  assert.deepEqual(patches()[1].body, sent, "the same body, the same new player");
  assert.deepEqual([draft.players.length, draft.treasury], [2, 0], "one Lineman, paid for once");
});

test("a sale whose answer was lost: the same — the money comes back once", async () => {
  const draft = await open(storedTeam(4, eight()));
  api.fail(PATCH_URL);
  assert.equal(save.removePlayer("t1", human, "p2", "sell").ok, true);
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting], ["offline", 1]);
  const sent = patches()[0].body;
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: teamAt(5, undefined, { roster: stored(sent.roster) }) });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
  assert.equal(save.savedRevision("t1"), 5);
  assert.equal(patches().length, 2);
  assert.deepEqual(patches()[1].body, sent);
  assert.deepEqual([draft.players.length, draft.treasury], [7, 97.5]);
});

// Review Focus 5: the full price of a purchase a match has sealed never comes back.
test("a purchase sealed by a match begun elsewhere is not refunded in full: the 409 that does not hold it is the coach's conflict", async () => {
  await open(storedTeam(4, eight()));
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: storedTeam(5, sealedEight()) });
  assert.equal(save.removePlayer("t1", human, "p8", "cancel-purchase").ok, true, "the draft does not know of the match");
  const conflict = await settle();
  assert.deepEqual([conflict.status, conflict.waiting, conflict.refusal], ["conflict", 1, "The team was saved elsewhere."]);
  assert.equal(await save.retrySaves("t1"), "conflict");
  await tick();
  assert.equal(patches().length, 1, "nothing more is sent");
  // The coach takes the server's roster: Ned is on it, and his purchase is no longer one to cancel.
  const taken = save.takeServerTeam(storedTeam(5, sealedEight()));
  assert.deepEqual([taken.players.length, taken.treasury], [8, 50]);
  assert.deepEqual(save.removePlayer("t1", human, "p8", "cancel-purchase"),
    { ok: false, refusal: "This purchase can no longer be cancelled. Use a sale under the league rules." });
});

test("nothing is sent after a conflict, for a player the roster has not, for an empty cart; another tab's coach is told", async () => {
  const draft = await open(storedTeam(4, eight()));
  const before = structuredClone(draft);
  assert.deepEqual(save.removePlayer("t1", human, "p9", "sell"), { ok: false }, "a player the roster has not");
  assert.deepEqual(save.removePlayer("t1", human, "", "sell"), { ok: false });
  assert.deepEqual(save.removePlayer("t1", human, "p2", "trade"), { ok: false }, "neither a sale nor a cancel");
  assert.deepEqual(save.removePlayer("t1", human, "p8", "sell"), { ok: false }, "a sale offered for a purchase the roster says is to cancel");
  assert.deepEqual(save.buyPlayers("t1", human, {}), { ok: false }, "an empty cart");
  assert.deepEqual(save.buyPlayers("t1", human, { 9: 1, 0: 0 }), { ok: false }, "a line the race has not, and none of a line");
  assert.deepEqual(save.buyPlayers("t2", human, { 0: 1 }), { ok: false }, "a team the queue does not hold");
  api.items.set(TOKEN, "someone-else");
  assert.match(save.buyPlayers("t1", human, { 0: 1 }).refusal, /another tab/);
  assert.match(save.removePlayer("t1", human, "p2", "sell").refusal, /another tab/);
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
  // Another device's save: the coach settles it before anything more goes.
  api.items.set(TOKEN, "tok");
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: teamAt(5, { touchdowns: 9 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "conflict");
  assert.deepEqual(save.buyPlayers("t1", human, { 0: 1 }), { ok: false });
  assert.deepEqual(save.removePlayer("t1", human, "p2", "sell"), { ok: false });
  assert.deepEqual(save.removePlayer("t1", human, "p8", "cancel-purchase"), { ok: false });
  await tick();
  assert.deepEqual([patches().length, draft.players.length, draft.treasury], [1, 8, 50]);
  // A refusal by the rules: the refused step heads the queue, and a purchase or a sale says why until the server's roster is taken.
  save.takeServerTeam(storedTeam(4, eight()));
  api.reply(PATCH_URL, 422, rulesRefusal);
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.equal((await settle()).status, "error");
  const why = { ok: false, refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id." };
  assert.deepEqual([save.buyPlayers("t1", human, { 0: 1 }), save.removePlayer("t1", human, "p2", "sell")], [why, why]);
  await tick();
  assert.equal(patches().length, 2);
  // A session that ends takes the queue with it: there is no team to buy for.
  session.sessionEnded();
  assert.deepEqual([save.buyPlayers("t1", human, { 0: 1 }), save.removePlayer("t1", human, "p2", "sell")], [{ ok: false }, { ok: false }]);
});

// Decision 11, as `adopt` in data/treasury.mjs: a read of the list asked before a save answered cannot know of it.
test("a list read on its way when a save answers is asked again: the older list never takes the answer back", async () => {
  await open();
  // The list's answer settles the active team: it is t1 already, and the account says so, so nothing is written there.
  state.auth.currentUser.preferences = { activeTeamId: "t1" };
  state.activeTeamId = "t1";
  const listAt = (revision) => ({ teams: [{ id: "t0", name: "Other" }, { id: "t1", name: "Iron Rooks", revision }] });
  const lists = () => api.calls.filter((call) => call.key === LIST_URL).length;
  const older = api.hold(LIST_URL);
  const reading = loadMyTeams(true);
  await waitHeld(older);
  const newer = api.hold(LIST_URL);
  api.reply(PATCH_URL, 200, { team: teamAt(5, { touchdowns: 3 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(state.myTeams.items[1].revision, 5, "the answer is in the list at once");
  await waitHeld(newer);
  assert.equal(lists(), 2, "and the list is asked again");
  older.release({ status: 200, body: listAt(4) });
  await tick();
  await tick();
  assert.equal(state.myTeams.items[1].revision, 5, "the list asked before the save is dropped");
  newer.release({ status: 200, body: listAt(5) });
  await reading;
  assert.deepEqual([state.myTeams.items[1].revision, state.myTeams.loading, lists()], [5, false, 2]);
  // A list that does not hold the team is not written; a read of it on its way is asked again all the same.
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  const unread = api.hold(LIST_URL);
  const first = loadMyTeams(true);
  await waitHeld(unread);
  const again = api.hold(LIST_URL);
  api.reply(PATCH_URL, 200, { team: teamAt(6, { touchdowns: 4 }) });
  save.stepSpp("t1", "p1", "touchdowns", 1);
  assert.deepEqual(await settle(), quiet("saved"));
  await waitHeld(again);
  assert.deepEqual([state.myTeams.items, lists()], [[], 4]);
  unread.release({ status: 200, body: listAt(5) });
  again.release({ status: 200, body: listAt(6) });
  await first;
  assert.equal(state.myTeams.items[1].revision, 6);
  api.assertAnswered();
});

// Stage 07d: a player's edit, a fix by hand, an advancement, its undo, a roll bound and a god's bonus are steps of the
// same queue, one player's fields changed and the whole roster saved, one step one PATCH.

/** Ann; Bors the Blitzer, captain; Cade the Catcher with 10 TD (30 SPP); Dell with a Niggling Injury and MA −1 that lasts. */
const squad = (cade = {}) => [
  { id: "p1", rowIndex: 0, number: "1", name: "Ann" },
  { id: "p2", rowIndex: 3, number: "2", name: "Bors", isCaptain: true },
  { id: "p3", rowIndex: 2, number: "3", name: "Cade", spp: { touchdowns: 10 }, ...cade },
  { id: "p4", rowIndex: 0, number: "4", name: "Dell", nigglingInjuries: 1, niglingInjury: true, statMods: { ma: -1 }, injuryStatMods: { ma: -1 } },
];
/** A random skill rolled on the site for Cade, as GET …/rolls and POST …/rolls send it: Frenzy, at the first try. */
const ROLL = {
  id: "r1", playerId: "p3", purpose: "random_skill", params: { category: "General", sides: 16, captain: false },
  result: { skill: "Frenzy", attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }] }, usedAt: null, createdAt: "2026-10-19T10:00:00Z",
};
const SITE = { id: "r1", via: "site" };
const frenzy = (over = {}) => ({ type: "random", grant: { skill: "Frenzy" }, roll: SITE, siteRoll: ROLL, ...over });
/** Cade with Frenzy taken by a random advancement, rolled on the site (`roll`) or at the table. */
const frenzied = (roll = SITE) => squad({ advancements: [{ type: "random", grants: { skill: "Frenzy" }, roll }], extraSkills: [{ name: "Frenzy", access: "primary" }] });
/** A fix of Dell that leaves him as he is but for `over`. */
const fixOf = (over = {}) => ({ niggling: 1, lasting: {}, stats: {}, contracts: 0, favoured: { add: [], remove: [] }, dropSkills: [], ...over });
/** t1 as a Nurgle team that chose Nurgle's favour, with Rot, a Rotter Lineman with 30 SPP to spend. */
const nurgleTeam = (revision) => teamAt(revision, undefined, {
  baseTeamSlug: "teams/nurgle",
  roster: { teamSlug: "teams/nurgle", teamName: "Iron Rooks", treasury: 50, favouredChoice: "Nurgle",
    players: [{ id: "n1", rowIndex: 0, number: "1", name: "Rot", spp: { touchdowns: 10 } }] },
});
const USED = "Undo the later advancement first: its roll was taken after this one.";
/** The screen open at the press (K15): a step of 07d is always told why it would be closed, here never. */
const OPEN = { closed: () => "" };

test("a player's number, name and captaincy are one PATCH of the whole roster on the revision as read; the armband moves from the one who had it", async () => {
  const draft = await open(storedTeam(4, squad()));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "9", name: "Anna", captain: true }, OPEN), { ok: true });
  assert.deepEqual([draft.players[0].name, draft.players[1].isCaptain, save.saveState("t1").waiting], ["Anna", false, 1], "the draft has it at once, and it waits");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  const [ann, bors] = body.roster.players;
  assert.deepEqual([body.revision, ann.number, ann.name, ann.isCaptain, bors.isCaptain], [4, "9", "Anna", true, false]);
  assert.deepEqual([body.name, body.baseTeamSlug, body.logoData, body.roster.players.length], ["Iron Rooks", "teams/human", LOGO, 4]);
});

test("an edit the rules refuse sends nothing and says why; an edit that changes nothing sends nothing", async () => {
  const draft = await open(storedTeam(4, squad()));
  const before = structuredClone(draft);
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "2", name: "Ann" }, OPEN), { ok: false, refusal: "Number 2 is Bors's already" });
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "0", name: "Ann" }, OPEN), { ok: false, refusal: "The number is from 1 to 99" });
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "1", name: "  " }, OPEN), { ok: false, refusal: "The name cannot be empty" });
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "1", name: "Ann", captain: false }, OPEN), { ok: false }, "the same fields");
  assert.deepEqual(save.amendPlayer("t1", "p2", { number: "02", name: " Bors ", captain: true }, OPEN), { ok: false }, "the same, as the server stores them");
  assert.deepEqual(save.amendPlayer("t1", "p9", { number: "9", name: "Nobody" }, OPEN), { ok: false, refusal: "This player is no longer on the team." });
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
});

test("an advancement is one PATCH: the skill, its type and its roll as the server reads it; what it cost and added is said", async () => {
  const draft = await open(storedTeam(4, squad()));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.advancePlayer("t1", human, "p3", frenzy(), skillGroups, OPEN), { ok: true, cost: 3, value: 20, level: 1 });
  // A second press of the same roll: the roll is the draft's already, and the server uses a roll once.
  assert.deepEqual(save.advancePlayer("t1", human, "p3", frenzy(), skillGroups, OPEN), { ok: false });
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const [{ body }] = patches();
  const cade = body.roster.players[2];
  assert.deepEqual(cade.advancements, [{ type: "random", grants: { skill: "Frenzy" }, roll: SITE }]);
  assert.deepEqual(cade.extraSkills.map((skill) => skill.name), ["Frenzy"]);
  assert.equal(JSON.stringify(body).includes("siteRoll"), false, "the roll's data stays on the screen");
  assert.deepEqual([body.revision, draft.players[2].advancements.length], [4, 1]);
  // A chosen skill names no roll; a characteristic at the table names it so.
  api.reply(PATCH_URL, 200, { team: teamAt(6) });
  assert.deepEqual(save.advancePlayer("t1", human, "p3", { type: "primary", grant: { skill: "Block" } }, skillGroups, OPEN), { ok: true, cost: 8, value: 20, level: 2 });
  assert.deepEqual(await settle(), quiet("saved"));
  assert.deepEqual(patches()[1].body.roster.players[2].advancements.at(-1), { type: "primary", grants: { skill: "Block" } });
});

// Review Focus 1: the step sent again is the snapshot sent first, the roll's id with it.
test("an advancement whose answer was lost is the 409 that holds it: taken as saved, never taken twice", async () => {
  const draft = await open(storedTeam(4, squad()));
  api.fail(PATCH_URL);
  assert.equal(save.advancePlayer("t1", human, "p3", frenzy(), skillGroups, OPEN).ok, true);
  const offline = await settle();
  assert.deepEqual([offline.status, offline.waiting], ["offline", 1]);
  const sent = patches()[0].body;
  api.reply(PATCH_URL, 409, { error: elsewhereError, team: teamAt(5, undefined, { roster: stored(sent.roster) }) });
  assert.equal(await save.retrySaves("t1"), "saved");
  assert.deepEqual(save.saveState("t1"), quiet("saved"));
  assert.equal(save.savedRevision("t1"), 5);
  assert.equal(patches().length, 2);
  assert.deepEqual(patches()[1].body, sent, "the same body, the same roll r1");
  assert.deepEqual(draft.players[2].advancements, [{ type: "random", grants: { skill: "Frenzy" }, roll: SITE }], "one advancement");
});

// Review Focus 3: the server would refuse the save that takes it; the coach is told before anything goes.
test("a site roll the player can no longer take sends nothing and says why", async () => {
  const draft = await open(storedTeam(4, squad()));
  const before = structuredClone(draft);
  assert.deepEqual(save.advancePlayer("t1", human, "p3", frenzy({ siteRoll: { ...ROLL, stale: true } }), skillGroups, OPEN), {
    ok: false,
    refusal: "Came up: Frenzy — the player has it all already: the roll cannot be taken. Take a skill off, or take this advancement at the table.",
  });
  const rerolled = { ...ROLL, result: { skill: "Frenzy", attempts: [{ roll: 1, skill: "Block", duplicate: true }, { roll: 4, skill: "Frenzy", duplicate: false }] } };
  assert.deepEqual(save.advancePlayer("t1", human, "p3", frenzy({ siteRoll: rerolled }), skillGroups, OPEN), {
    ok: false,
    refusal: "This roll was rolled again past Block, which the player has no more: give the skill back before taking the roll, or take this advancement at the table.",
  });
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
});

test("an advancement the rules refuse sends nothing and says why, a characteristic by its name", async () => {
  await open(storedTeam(4, squad({ spp: {} })));
  const refusal = (choice, playerId = "p3") => save.advancePlayer("t1", human, playerId, choice, skillGroups, OPEN).refusal;
  assert.equal(refusal(frenzy()), "3 SPP short", "Cade without SPP: a random skill costs 3");
  assert.equal(refusal({ type: "primary", grant: { skill: "Block" } }), "6 SPP short");
  save.takeServerTeam(storedTeam(4, squad({ statMods: { ag: 2 } })));
  // Cade: Catcher, AG 3+ raised twice to 1+ — at its limit, and +2 taken by advancements.
  assert.equal(refusal({ type: "stat", grant: { stat: "ag" } }), "AG: +2 taken already");
  assert.equal(refusal({ type: "primary", grant: { skill: "Pass" } }), "Pass cannot be taken with this advancement", "a skill of no primary category");
  assert.equal(refusal({ type: "stat", grant: { skill: "Tentacles" } }), "Tentacles cannot be taken with this advancement", "in place of a characteristic, no access to name");
  assert.equal(refusal({ type: "random", grant: { stat: "ma" } }), "This advancement does not give that");
  assert.equal(refusal(frenzy(), "p9"), "This player is no longer on the team.");
  assert.deepEqual(save.saveState("t1"), quiet("idle"));
  await tick();
  assert.equal(api.calls.length, 0);
});

// Review Focus 5: the server frees the roll the save no longer names.
test("the last advancement undone is one PATCH: what it gave gone, its roll no longer named, so the server frees it", async () => {
  const draft = await open(storedTeam(4, frenzied()));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  // No god's skill was tied to it (de470aa: "" for none).
  assert.deepEqual(save.undoAdvancement("t1", "p3", OPEN), { ok: true, cost: 3, type: "random", grants: { skill: "Frenzy" }, roll: SITE, favoured: "" });
  assert.deepEqual(save.undoAdvancement("t1", "p3", OPEN), { ok: false }, "none left: nothing to undo");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const cade = patches()[0].body.roster.players[2];
  assert.deepEqual([cade.advancements, cade.extraSkills.map((skill) => skill.name)], [[], []]);
  assert.deepEqual(draft.players[2].advancements, []);
});

test("a stale roll put on the table advancement that gave its skill: one PATCH naming the roll there", async () => {
  await open(storedTeam(4, frenzied({ via: "table" })));
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(save.bindRoll("t1", "p3", { ...ROLL, result: { ...ROLL.result, skill: "Block" } }, OPEN), { ok: false }, "no advancement gave Block");
  assert.deepEqual(save.bindRoll("t1", "p3", { ...ROLL, stale: true }, OPEN), { ok: true });
  assert.deepEqual(save.bindRoll("t1", "p3", { ...ROLL, stale: true }, OPEN), { ok: false }, "a second press: the advancement names a site roll now");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const cade = patches()[0].body.roster.players[2];
  assert.deepEqual(cade.advancements, [{ type: "random", grants: { skill: "Frenzy" }, roll: SITE }]);
  assert.deepEqual(cade.extraSkills.map((skill) => skill.name), ["Frenzy"], "the skill as it was");
});

test("a fix by hand is one PATCH: the Niggling Injuries, a characteristic, the contracts, a skill no advancement gave; a fix the rules refuse sends nothing", async () => {
  const draft = await open(storedTeam(4, squad()));
  const before = structuredClone(draft);
  const fix = (over) => save.fixPlayer("t1", human, "p4", fixOf(over), OPEN);
  assert.deepEqual(fix({ stats: { ma: 5 } }), { ok: false, refusal: "MA cannot improve further" }, "MA 5, then +5 is past 9");
  assert.deepEqual(fix({ lasting: { ma: 1 }, stats: { ma: 4 } }), { ok: false, refusal: "MA cannot improve further" }, "MA 5, back to 6, then +4");
  // AG is a target: up is a lower number, and the words say better, never higher.
  assert.deepEqual(fix({ stats: { ag: 3 } }), { ok: false, refusal: "AG cannot improve further" }, "AG 3+ cannot become 0+");
  assert.deepEqual(fix({ stats: { ag: -4 } }), { ok: false, refusal: "AG cannot be changed that far" }, "AG 3+ cannot become 7+");
  assert.deepEqual(fix({ stats: { ma: -5 } }), { ok: false, refusal: "MA cannot be changed that far" }, "MA 5 cannot become 0");
  assert.deepEqual(fix({ niggling: 10 }), { ok: false, refusal: "Niggling Injury: from 0 to 9" });
  assert.deepEqual(fix({ contracts: 21 }), { ok: false, refusal: "Extended contracts: from 0 to 20" });
  assert.deepEqual(fix({ dropSkills: ["Block"] }), { ok: false, refusal: "Block came with an advancement: undo the advancement instead" });
  assert.deepEqual(fix({}), { ok: false }, "nothing changes");
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
  api.reply(PATCH_URL, 200, { team: teamAt(5) });
  assert.deepEqual(fix({ niggling: 0, lasting: { ma: 1 }, contracts: 1 }), { ok: true, value: 70 }, "a Lineman's 50k and a contract's 20k");
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const dell = patches()[0].body.roster.players[3];
  assert.deepEqual([dell.nigglingInjuries, dell.niglingInjury, dell.injuryStatMods?.ma, dell.statMods?.ma, dell.extendedContracts], [0, false, undefined, undefined, 1]);
});

// The owner, 2026-10-21: the god's D8 goes with every advancement, its skill with the advancement's own step (favoured.mjs).
test("an advancement with the god's skill is one PATCH: the advancement, and the skill among his favoured", async () => {
  const draft = await open(nurgleTeam(4));
  const mouth = (favoured) => ({ type: "primary", grant: { skill: "Monstrous Mouth" }, favoured });
  assert.deepEqual(save.advancePlayer("t1", nurgle, "n1", mouth("Monstrous Mouth"), skillGroups, OPEN),
    { ok: false, refusal: "Monstrous Mouth cannot be taken with this advancement" }, "the skill the advancement gives");
  assert.deepEqual(save.advancePlayer("t1", nurgle, "n1", mouth("Block"), skillGroups, OPEN),
    { ok: false, refusal: "Block cannot be taken with this advancement" }, "not the god's");
  assert.deepEqual(draft.players[0].advancements ?? [], [], "a refusal changes nothing");
  api.reply(PATCH_URL, 200, { team: nurgleTeam(5) });
  assert.equal(save.advancePlayer("t1", nurgle, "n1", mouth("Tentacles"), skillGroups, OPEN).ok, true);
  assert.deepEqual(await settle(), quiet("saved"));
  assert.equal(patches().length, 1);
  const rot = patches()[0].body.roster.players[0];
  // The skill is tied to the advancement that brought it, so its undo takes it back (de470aa).
  assert.deepEqual([rot.advancements, rot.favouredSkills], [[{ type: "primary", grants: { skill: "Monstrous Mouth" }, favoured: "Tentacles" }], [{ name: "Tentacles", access: "favoured" }]]);
  assert.deepEqual(draft.players[0].favouredSkills, [{ name: "Tentacles", access: "favoured" }]);
});

// K15: what closes the screen just now is asked at the press, whatever the sheet drew before it.
test("another tab's coach, or a write the screen has closed at the press: none of them is sent", async () => {
  const draft = await open(storedTeam(4, frenzied({ via: "table" })));
  const before = structuredClone(draft);
  const presses = (options) => [
    save.amendPlayer("t1", "p1", { number: "9", name: "Anna" }, options),
    save.fixPlayer("t1", human, "p4", fixOf({ niggling: 0 }), options),
    save.advancePlayer("t1", human, "p3", { type: "primary", grant: { skill: "Block" } }, skillGroups, options),
    save.undoAdvancement("t1", "p3", options),
    save.bindRoll("t1", "p3", ROLL, options),
  ];
  const AFTER = "Advancement — after the post-match";
  let asked = 0;
  for (const refused of presses({ closed: () => { asked += 1; return AFTER; } })) assert.deepEqual(refused, { ok: false, refusal: AFTER });
  assert.equal(asked, 5, "each press asks");
  api.items.set(TOKEN, "someone-else");
  for (const refused of presses({ closed: () => "" })) assert.match(refused.refusal, /another tab/);
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
  const rot = (await open(nurgleTeam(4))).players[0];
  api.items.set(TOKEN, "someone-else");
  assert.match(save.advancePlayer("t1", nurgle, "n1", { type: "primary", grant: { skill: "Block" }, favoured: "Tentacles" }, skillGroups, OPEN).refusal, /another tab/);
  assert.deepEqual([rot.favouredSkills ?? [], api.calls.length], [[], 0]);
});

// K15, review Important 1: the queue cannot know a match is on, so a step that is not told why the screen is closed is
// a mistake of its caller, said at once — never a write that goes during a match.
test("a player's step not told why the screen is closed throws, and nothing is sent or changed", async () => {
  const draft = await open(storedTeam(4, frenzied({ via: "table" })));
  const before = structuredClone(draft);
  const steps = [
    (options) => save.amendPlayer("t1", "p1", { number: "9", name: "Anna" }, options),
    (options) => save.fixPlayer("t1", human, "p4", fixOf({ niggling: 0 }), options),
    (options) => save.advancePlayer("t1", human, "p3", { type: "primary", grant: { skill: "Block" } }, skillGroups, options),
    (options) => save.undoAdvancement("t1", "p3", options),
    (options) => save.bindRoll("t1", "p3", ROLL, options),
  ];
  for (const step of steps) {
    for (const options of [undefined, {}, { closed: "" }]) assert.throws(() => step(options), TypeError, JSON.stringify(options));
  }
  assert.deepEqual([draft, save.saveState("t1")], [before, quiet("idle")]);
  await tick();
  assert.equal(api.calls.length, 0);
});

// K8: the server gives a player's rolls back last first; a 409 without the team is not another device's save.
test("a roll given back out of its turn is refused in words, not a conflict: nothing more goes until the server's roster is taken", async () => {
  const draft = await open(storedTeam(4, frenzied()));
  api.reply(PATCH_URL, 409, { error: { code: "DICE_ROLL_USED", params: {}, message: "x" } });
  assert.equal(save.undoAdvancement("t1", "p3", OPEN).ok, true);
  const refused = await settle();
  assert.deepEqual([refused.status, refused.kind, refused.code, refused.refusal, refused.waiting], ["error", "invalid", "DICE_ROLL_USED", USED, 1]);
  assert.deepEqual(save.amendPlayer("t1", "p1", { number: "9", name: "Anna" }, OPEN), { ok: false, refusal: USED });
  await tick();
  assert.equal(patches().length, 1, "the refused step is not sent again");
  assert.deepEqual(draft.players[2].advancements, [], "his own undo stays on the screen until the server's roster is taken");
  const taken = save.takeServerTeam(storedTeam(4, frenzied()));
  assert.deepEqual([taken.players[2].advancements.length, save.saveState("t1")], [1, quiet("idle")]);
});

// K16: a skill a used site roll was rerolled against stays; the server's 422 is said for the step that met it — an
// edit's own words; an advancement's, a bound roll's and a counter's the server's (`error.DICE_ROLL_MISMATCH`, review Minor 2).
test("a 422 of a site roll is said in the words of the step that met it: an edit's, an advancement's, a counter's the server's", async () => {
  await open(storedTeam(4, frenzied({ via: "table" })));
  const mismatch = { error: { code: "DICE_ROLL_MISMATCH", params: { playerId: "p3" }, message: "x" } };
  const refusalAfter = async (press) => {
    save.takeServerTeam(storedTeam(4, frenzied({ via: "table" })));
    api.reply(PATCH_URL, 422, mismatch);
    assert.equal(press().ok, true);
    const refused = await settle();
    assert.deepEqual([refused.status, refused.kind, refused.code], ["error", "invalid", "DICE_ROLL_MISMATCH"]);
    return refused.refusal;
  };
  assert.equal(await refusalAfter(() => save.undoAdvancement("t1", "p3", OPEN)), "A roll on the site was rerolled against this skill, so it stays.");
  assert.equal(await refusalAfter(() => save.fixPlayer("t1", human, "p4", fixOf({ niggling: 0 }), OPEN)), "A roll on the site was rerolled against this skill, so it stays.");
  assert.equal(await refusalAfter(() => save.bindRoll("t1", "p3", ROLL, OPEN)), "This advancement does not match its roll on the site.");
  assert.equal(await refusalAfter(() => save.advancePlayer("t1", human, "p3", { type: "primary", grant: { skill: "Block" } }, skillGroups, OPEN)),
    "This advancement does not match its roll on the site.");
  assert.equal(await refusalAfter(() => save.stepSpp("t1", "p1", "touchdowns", 1)), "This advancement does not match its roll on the site.", "error.DICE_ROLL_MISMATCH");
  save.takeServerTeam(storedTeam(4, squad()));
});

test("every refusal an advancement or an edit can meet is worded in both dictionaries, with the same placeholders", () => {
  const keys = [
    ...[...ADVANCE_REFUSALS, "DICE_ROLL_USED"].map((code) => `teamAdvance.refusal.${code}`),
    ...[...EDIT_REFUSALS, ...FIX_REFUSALS, "DICE_ROLL_MISMATCH"].map((code) => `teamPlayer.refusal.${code}`),
    "teamPlayer.matchDropped", "teamPlayer.favoured.held", "teamPlayer.favoured.given",
  ];
  const placeholders = (text) => [...text.matchAll(/\{(\w+)\}/g)].map(([, name]) => name).sort();
  // An advancement's 422 for its roll is the server's own words: no copy of them under the step's key (review Minor 2).
  assert.ok(!EN["teamAdvance.refusal.DICE_ROLL_MISMATCH"] && !RU["teamAdvance.refusal.DICE_ROLL_MISMATCH"] && EN["error.DICE_ROLL_MISMATCH"]);
  for (const key of keys) {
    assert.ok(EN[key] && RU[key], `${key} in both`);
    assert.deepEqual(placeholders(RU[key]), placeholders(EN[key]), key);
  }
  // A skill in place of a characteristic names no access (`access: ""`): the words read the same with one and without.
  for (const access of ["primary", ""]) {
    for (const [words, skill] of [[EN, "Block"], [RU, "Block"]]) {
      const said = words["teamAdvance.refusal.GRANT_NOT_AVAILABLE"].replace(/\{(\w+)\}/g, (_, name) => ({ skill, access })[name]);
      assert.ok(said.startsWith("Block ") && !/\{|\s{2}|\s[.,:]/.test(said), `${said} (access "${access}")`);
    }
  }
});
