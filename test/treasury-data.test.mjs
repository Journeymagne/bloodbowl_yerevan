import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { onMyTeamsChange } = await import("../src/data/teams.mjs");
const treasury = await import("../src/data/treasury.mjs");

setDictionaries({ en: { "auth.otherTab": "Other tab", "request.offline": "No connection.", "treasury.changedElsewhere": "Changed elsewhere.",
  "error.ROSTER_BREAKS_THE_RULES": "Breaks the rules.", "validation.TREASURY_INVALID": "Treasury below zero.", "error.STAGE_PURCHASE_LOCKED": "Locked by the stage.",
  "error.TEAM_NOT_FOUND": "Team not found." }, ru: {} });
const TOKEN = "gata-league-auth-token";
const TEAM = { id: "t1", name: "Wardens", baseTeamSlug: "teams/human", logoData: "data:image/png;base64,AA", revision: 3, stage: "active", roster: { treasury: 70, cheerleaders: 1, players: [] } };
const ENTRY = { id: "l9", kind: "manual", delta: 20, balanceAfter: 90, reason: "friendly", note: null, pairingId: null, createdAt: "2026-10-18T12:00:00Z" };
const FIRST_PAGE = "GET /api/teams/t1/ledger?limit=20";
const settle = () => new Promise((resolve) => { setImmediate(resolve); });
/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await settle();
  }
}
const ids = () => treasury.ledgerOf("t1").entries.map((entry) => entry.id);
function coach() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
  state.myTeams = { items: [{ id: "t0", name: "Other" }, structuredClone(TEAM)], loaded: true, loading: false, error: "" };
}

test("the history is read a page at a time, with its count and since when it is kept", async () => {
  coach();
  assert.deepEqual(treasury.ledgerOf("t1"), { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "" });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: "c1", since: "2026-10-01T00:00:00Z", total: 21 });
  await treasury.readLedger("t1");
  assert.deepEqual([treasury.ledgerOf("t1").entries.length, treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loaded], [1, 21, true]);
  api.reply("GET /api/teams/t1/ledger?before=c1&limit=20", 200, { entries: [{ ...ENTRY, id: "l8" }], next: null, since: "2026-10-01T00:00:00Z", total: 21 });
  await treasury.readLedger("t1", { more: true });
  assert.deepEqual(treasury.ledgerOf("t1").entries.map((entry) => entry.id), ["l9", "l8"]);
  assert.equal(treasury.ledgerOf("t1").next, null);
});

test("an entry goes once, and its answer replaces the team and heads the history", async () => {
  coach();
  const heard = [];
  const off = treasury.onLedgerChange(() => heard.push("ledger"));
  const fresh = { ...ENTRY, id: "l10" };
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: fresh });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly", note: "" }), { entry: fresh });
  assert.deepEqual(api.calls[0].body, { delta: 20, reason: "friendly", note: null, revision: 3 });
  assert.deepEqual(state.myTeams.items.map((item) => [item.id, item.revision ?? null]), [["t0", null], ["t1", 4]]);
  // The history the first test loaded (l9, l8; 21 lines) gets the new line on top and counts it.
  assert.deepEqual([treasury.ledgerOf("t1").entries.map((entry) => entry.id), treasury.ledgerOf("t1").total], [["l10", "l9", "l8"], 22]);
  assert.ok(heard.length >= 1);
  off();
});

test("the frame hears the team's new revision in the list the write replaced it in, with no write on its way", async () => {
  coach();
  const heard = [];
  const off = onMyTeamsChange(() => heard.push([state.myTeams.items.map((item) => item.revision ?? null), treasury.isWriting("t1")]));
  const before = state.myTeams.items[1];
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: ENTRY });
  await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  off();
  assert.deepEqual(heard, [[[null, 4], false]]);
  assert.equal(before.revision, 3, "the team a screen still holds is not edited");
});

test("a second write while one is on its way is not sent", async () => {
  coach();
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: ENTRY });
  const gate = api.hold("POST /api/teams/t1/treasury");
  const first = treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  assert.equal(treasury.isWriting("t1"), true);
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { ignored: true });
  assert.deepEqual(await treasury.saveTeamRoster("t1", { treasury: 5 }), { ignored: true });
  gate.release();
  await first;
  assert.equal(api.calls.length, 1);
  assert.equal(treasury.isWriting("t1"), false);
});

test("a retry after a lost answer meets the revision: the team is taken as it is, no second entry", async () => {
  coach();
  api.fail("POST /api/teams/t1/treasury");
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "No connection." });
  const applied = { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } };
  api.reply("POST /api/teams/t1/treasury", 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: applied });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "Changed elsewhere." });
  assert.equal(state.myTeams.items[1].roster.treasury, 90);
  await settle();
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read again");
});

test("a refused or conflicting save is said; a roster save keeps the columns and the logo as they are", async () => {
  coach();
  api.reply("POST /api/teams/t1/treasury", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "TREASURY_INVALID", params: {} }] });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: -100, reason: "fine" }), { refusal: "Breaks the rules. Treasury below zero." });
  api.reply("PATCH /api/teams/t1", 422, { error: { code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" }, message: "x" } });
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, startingRerolls: 2 }), { refusal: "Locked by the stage." });
  const body = api.calls.at(-1).body;
  assert.deepEqual([body.name, body.baseTeamSlug, body.logoData, body.revision, body.roster.logoData, body.roster.teamSlug], ["Wardens", "teams/human", TEAM.logoData, 3, undefined, "teams/human"]);
});

test("another tab's coach: nothing is written", async () => {
  coach();
  api.items.set(TOKEN, "other-tab");
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "Other tab" });
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster), { refusal: "Other tab" });
  assert.equal(api.calls.length, 0);
});

test("a team the list does not hold is not written", async () => {
  coach();
  assert.deepEqual(await treasury.addTreasuryEntry("gone", { delta: 20, reason: "friendly" }), { refusal: "Team not found." });
  assert.deepEqual(await treasury.saveTeamRoster("gone", TEAM.roster), { refusal: "Team not found." });
  assert.equal(api.calls.length, 0);
  assert.equal(treasury.isWriting("gone"), false);
});

test("a saved roster replaces the team and reads the history again: the server wrote lines this page has not", async () => {
  coach();
  const saved = { ...TEAM, revision: 4, roster: { ...TEAM.roster, cheerleaders: 2 } };
  api.reply("PATCH /api/teams/t1", 200, { team: saved });
  api.reply(FIRST_PAGE, 200, { entries: [{ ...ENTRY, id: "l11", kind: "purchase" }], next: null, since: null, total: 1 });
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, cheerleaders: 2 }), { team: saved });
  assert.deepEqual(state.myTeams.items.map((item) => [item.id, item.revision ?? null]), [["t0", null], ["t1", 4]]);
  await settle();
  assert.deepEqual(ids(), ["l11"]);
  assert.equal(api.calls[0].body.roster.cheerleaders, 2);
});

test("a read that fails keeps the lines and says why; the next one that comes clears it", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  await treasury.readLedger("t1");
  api.fail(FIRST_PAGE);
  await treasury.readLedger("t1");
  assert.deepEqual([ids(), treasury.ledgerOf("t1").error, treasury.ledgerOf("t1").loading], [["l9"], "No connection.", false]);
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  await treasury.readLedger("t1");
  assert.equal(treasury.ledgerOf("t1").error, "");
});

test("more with no next page sends nothing", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  await treasury.readLedger("t1");
  await treasury.readLedger("t1", { more: true });
  assert.equal(api.calls.length, 1);
});

test("only the newest read of a team is written: the older answer, coming late, is dropped", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: "c1", since: null, total: 21 });
  await treasury.readLedger("t1");
  const older = api.hold("GET /api/teams/t1/ledger?before=c1&limit=20");
  const more = treasury.readLedger("t1", { more: true });
  await waitHeld(older);
  api.reply(FIRST_PAGE, 200, { entries: [{ ...ENTRY, id: "l20" }], next: null, since: null, total: 22 });
  await treasury.readLedger("t1");
  older.release({ status: 200, body: { entries: [{ ...ENTRY, id: "l8" }], next: null, since: null, total: 21 } });
  await more;
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loading], [["l20"], 22, false]);
});

test("one listener that throws does not stop the rest from hearing the cache", async () => {
  coach();
  const heard = [];
  const quiet = console.error;
  console.error = () => {};
  const offs = [treasury.onLedgerChange(() => { throw new Error("broken"); }), treasury.onLedgerChange(() => heard.push("second"))];
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  try {
    await treasury.readLedger("t1");
  } finally {
    console.error = quiet;
    for (const off of offs) off();
  }
  assert.ok(heard.length >= 1);
});

test("a write that lands while a read is on its way is not undone by that read's older answer", async () => {
  coach();
  const known = { ...ENTRY, id: "l1" };
  api.reply(FIRST_PAGE, 200, { entries: [known], next: null, since: null, total: 1 });
  await treasury.readLedger("t1");
  // The read asked before the write: its answer is from before the entry exists.
  const older = api.hold(FIRST_PAGE);
  const reading = treasury.readLedger("t1");
  await waitHeld(older);
  // The read the write sends once it lands stands at its own gate.
  const newer = api.hold(FIRST_PAGE);
  const fresh = { ...ENTRY, id: "l10" };
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: fresh });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { entry: fresh });
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total], [["l10", "l1"], 2]);
  await waitHeld(newer);
  older.release({ status: 200, body: { entries: [known], next: null, since: null, total: 1 } });
  await reading;
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loading], [["l10", "l1"], 2, true], "the late answer wrote nothing; the re-read is still on its way");
  newer.release({ status: 200, body: { entries: [{ ...ENTRY, id: "l11" }, fresh, known], next: null, since: null, total: 3 } });
  await settle();
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loading], [["l11", "l10", "l1"], 3, false]);
});

test("a write whose coach has gone by the time it is answered leaves the next coach's list alone", async () => {
  coach();
  const gate = api.hold("POST /api/teams/t1/treasury");
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: ENTRY });
  const writing = treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  await waitHeld(gate);
  state.auth.currentUser = null;
  state.myTeams = { items: [], loaded: false, loading: false, error: "" };
  gate.release();
  assert.deepEqual(await writing, { entry: ENTRY });
  assert.deepEqual(state.myTeams, { items: [], loaded: false, loading: false, error: "" });
});
