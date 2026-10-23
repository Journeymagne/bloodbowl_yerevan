import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { loadMyTeams, onMyTeamsChange } = await import("../src/data/teams.mjs");
const treasury = await import("../src/data/treasury.mjs");

setDictionaries({ en: { "auth.otherTab": "Other tab", "request.offline": "No connection.", "treasury.changedElsewhere": "Changed elsewhere.",
  "error.ROSTER_BREAKS_THE_RULES": "Breaks the rules.", "validation.TREASURY_INVALID": "Treasury below zero.", "error.STAGE_PURCHASE_LOCKED": "Locked by the stage.",
  "error.TEAM_NOT_FOUND": "Team not found.", "treasury.mayHaveWritten": "May have written.", "treasury.history.unreadable": "Unreadable.",
  "error.TEAM_IN_MATCH": "Playing a match." }, ru: {} });
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
  assert.deepEqual(treasury.ledgerOf("t1"), { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "", errorMore: false });
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
  // A history of its own: 21 lines, the page of the first two read.
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY, { ...ENTRY, id: "l8" }], next: null, since: null, total: 21 });
  await treasury.readLedger("t1");
  const heard = [];
  const off = treasury.onLedgerChange(() => heard.push("ledger"));
  const fresh = { ...ENTRY, id: "l10" };
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } }, entry: fresh });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly", note: "" }), { entry: fresh });
  assert.deepEqual(api.calls.at(-1).body, { delta: 20, reason: "friendly", note: null, revision: 3 });
  assert.deepEqual(state.myTeams.items.map((item) => [item.id, item.revision ?? null]), [["t0", null], ["t1", 4]]);
  // The history read above (l9, l8; 21 lines) gets the new line on top and counts it.
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
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "May have written.", unknown: true });
  const applied = { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } };
  api.reply("POST /api/teams/t1/treasury", 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: applied });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "Changed elsewhere.", changed: true });
  // The first try changed nothing here, so the retry goes out with the revision the team had: it is the server that says it moved.
  assert.deepEqual(api.calls.filter((call) => call.key === "POST /api/teams/t1/treasury").map((call) => call.body.revision), [3, 3]);
  assert.equal(state.myTeams.items[1].roster.treasury, 90);
  await settle();
  assert.ok(api.calls.some((call) => call.key === FIRST_PAGE), "the history is read again");
});

test("a refused or conflicting save is said; a roster save keeps the columns and the logo as they are", async () => {
  coach();
  api.reply("POST /api/teams/t1/treasury", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: [{ code: "TREASURY_INVALID", params: {} }] });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: -100, reason: "fine" }), { refusal: "Breaks the rules. Treasury below zero." });
  api.reply("PATCH /api/teams/t1", 422, { error: { code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" }, message: "x" } });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t0", name: "Other" }, TEAM] }); // the stage's refusal reads the list again
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, startingRerolls: 2 }), { refusal: "Locked by the stage." });
  await settle();
  const body = api.calls.findLast((call) => call.key === "PATCH /api/teams/t1").body;
  assert.deepEqual([body.name, body.baseTeamSlug, body.logoData, body.revision, body.roster.logoData, body.roster.teamSlug], ["Wardens", "teams/human", TEAM.logoData, 3, undefined, "teams/human"]);
});

// Stage 09a, Task 1: the server refuses a write of a team that plays a match (TEAM_IN_MATCH); the team's page says so.
test("while the team plays a match an entry and a roster save are refused in the server's words, and the team is left as it is", async () => {
  coach();
  const playing = { error: { code: "TEAM_IN_MATCH", params: {}, message: "x" } };
  api.reply("POST /api/teams/t1/treasury", 422, playing);
  assert.deepEqual(await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" }), { refusal: "Playing a match." });
  api.reply("PATCH /api/teams/t1", 422, playing);
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, cheerleaders: 2 }), { refusal: "Playing a match." });
  assert.deepEqual([state.myTeams.items[1], treasury.isWriting("t1")], [TEAM, false]);
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams/t1/treasury", "PATCH /api/teams/t1"], "each sent once, nothing read again");
});

// Stage 12 (decision 26, the hand-off of 08): the stage the list holds may be old — an admin moved the team into the
// season since it was read. The refusal is the server's, and the list is read again so the page draws the stage it has.
test("a purchase the stage refuses reads the coach's teams again and says the server's words", async () => {
  coach();
  state.myTeams.items[1].stage = "draft";
  const locked = { error: { code: "STAGE_PURCHASE_LOCKED", params: { key: "startingRerolls", stage: "active" }, message: "x" } };
  api.reply("PATCH /api/teams/t1", 422, locked);
  api.reply("GET /api/teams", 200, { teams: [{ id: "t0", name: "Other" }, { ...TEAM, revision: 4, stage: "active" }] });
  // The active team's preference a read of the list may write is not this test's.
  const sent = () => api.calls.map((call) => call.key).filter((key) => key !== "PATCH /api/auth/preferences");
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, startingRerolls: 1 }), { refusal: "Locked by the stage." });
  await settle();
  assert.deepEqual(sent(), ["PATCH /api/teams/t1", "GET /api/teams"], "sent once, then the list read; nothing was written, so no history");
  assert.deepEqual([state.myTeams.items[1].stage, state.myTeams.items[1].revision, treasury.isWriting("t1")], ["active", 4, false]);

  api.calls.length = 0;
  const words = (error) => `Refused: ${error.code}.`;
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, startingRerolls: 1 }, {}, { words }), { refusal: "Refused: STAGE_PURCHASE_LOCKED." }, "the writer's words");
  await settle();
  assert.deepEqual(sent(), ["PATCH /api/teams/t1", "GET /api/teams"]);

  // A coach who has gone by the time the refusal comes: nothing is read for them.
  api.calls.length = 0;
  const gate = api.hold("PATCH /api/teams/t1");
  const saving = treasury.saveTeamRoster("t1", { ...TEAM.roster, startingRerolls: 1 });
  await waitHeld(gate);
  state.auth.currentUser = { id: "u2", login: "other" };
  gate.release({ status: 422, body: locked });
  assert.deepEqual(await saving, { refusal: "Locked by the stage." });
  await settle();
  assert.deepEqual(sent(), ["PATCH /api/teams/t1"]);
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

/**
 * The body of the last PATCH of the team, once the save given has been answered with the team as it was. The draft
 * carries a name of its own and the race `race` (none by default, as a roster stored before it carried one).
 */
async function savedBody(identity, race = "") {
  coach();
  api.reply("PATCH /api/teams/t1", 200, { team: { ...TEAM, revision: 4 } });
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...TEAM.roster, teamSlug: race, teamName: "y" }, identity), { team: { ...TEAM, revision: 4 } });
  await settle();
  return api.calls.filter((call) => call.key === "PATCH /api/teams/t1").at(-1).body;
}
const sent = (body) => [body.name, body.baseTeamSlug, body.logoData, body.revision, body.roster.teamName, body.roster.teamSlug, body.roster.treasury];

test("a team saved with another name keeps the roster, the race and the logo as the list holds them", async () => {
  const body = await savedBody({ name: "Rooks" });
  assert.deepEqual(sent(body), ["Rooks", "teams/human", TEAM.logoData, 3, "Rooks", "teams/human", 70]);
  assert.equal(body.roster.logoData, undefined);
  assert.deepEqual(sent(await savedBody({ name: "Rooks" }, "teams/human")), ["Rooks", "teams/human", TEAM.logoData, 3, "Rooks", "teams/human", 70]);
});

test("a name given goes without the blanks at its ends, in the body and in the roster alike", async () => {
  const body = await savedBody({ name: "  Rooks \t" });
  assert.deepEqual([body.name, body.roster.teamName], ["Rooks", "Rooks"]);
  const none = await savedBody({ name: null });
  assert.deepEqual([none.name, none.roster.teamName], ["", ""], "no name is no name, for the server to refuse");
});

// Owner, 2026-10-20: a coach does not change a team's race. Whatever a draft or an identity says, the save goes under
// the race the team has, in the body and in the roster alike; nothing throws.
test("an identity that names a race sends the team's race: no save changes it", async () => {
  for (const [identity, race] of [[{ baseTeamSlug: "teams/goblin" }, ""], [{ baseTeamSlug: "teams/shambling-undead" }, "teams/shambling-undead"], [{ name: "Rooks", baseTeamSlug: "teams/orc" }, "teams/human"]]) {
    const body = await savedBody(identity, race);
    assert.deepEqual([body.baseTeamSlug, body.roster.teamSlug], ["teams/human", "teams/human"], `${JSON.stringify(identity)} on a draft of ${race || "no race"}`);
  }
});

// Final review M3, as 07d's second review leaves it: the race is the team's column, never the roster's own say.
test("a team whose stored roster names another race than its column saves under the column's race, as before 07d — nothing throws", async () => {
  coach();
  const legacy = { ...structuredClone(TEAM), roster: { ...TEAM.roster, teamSlug: "teams/humans" } };
  state.myTeams.items = [state.myTeams.items[0], legacy];
  api.reply("PATCH /api/teams/t1", 200, { team: { ...legacy, revision: 4 } });
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  // Stage 08's resources: the stored roster with one more cheerleader, no identity.
  assert.deepEqual(await treasury.saveTeamRoster("t1", { ...legacy.roster, cheerleaders: 2 }), { team: { ...legacy, revision: 4 } });
  const { body } = api.calls.filter((call) => call.key === "PATCH /api/teams/t1").at(-1);
  assert.deepEqual([body.baseTeamSlug, body.roster.teamSlug, body.roster.cheerleaders], ["teams/human", "teams/human", 2], "under the team's race, as before 07d");
  await settle();
  // A draft of another race than the stored roster's, with or without a name: nothing throws, the team's race goes.
  state.myTeams.items = [state.myTeams.items[0], legacy];
  for (const identity of [undefined, { name: "Rooks" }]) {
    const answer = await treasury.saveTeamRoster("t1", { ...legacy.roster, teamSlug: "teams/shambling-undead", players: [] }, identity);
    assert.ok(answer.team, JSON.stringify(identity));
    const sentRace = api.calls.filter((call) => call.key === "PATCH /api/teams/t1").at(-1).body;
    assert.deepEqual([sentRace.baseTeamSlug, sentRace.roster.teamSlug], ["teams/human", "teams/human"], JSON.stringify(identity));
    await settle();
    state.myTeams.items = [state.myTeams.items[0], legacy];
  }
});

test("a logo given goes in place of the team's, never inside the roster; an empty one takes it off", async () => {
  const body = await savedBody({ logoData: "data:image/png;base64,BB" });
  assert.deepEqual(sent(body), ["Wardens", "teams/human", "data:image/png;base64,BB", 3, "Wardens", "teams/human", 70]);
  assert.equal(body.roster.logoData, undefined);
  assert.equal((await savedBody({ logoData: "" })).logoData, "");
  assert.equal((await savedBody({ logoData: null })).logoData, null);
});

test("without an identity a save is as before: the team's name, race and logo, whatever the draft says", async () => {
  for (const identity of [undefined, {}, { name: undefined, logoData: undefined }]) {
    assert.deepEqual(sent(await savedBody(identity)), ["Wardens", "teams/human", TEAM.logoData, 3, "Wardens", "teams/human", 70], JSON.stringify(identity));
  }
});

test("a save with an identity is one write like any other: one at a time, this tab's, a 409 taken as the server has it", async () => {
  coach();
  api.reply("PATCH /api/teams/t1", 200, { team: { ...TEAM, revision: 4 } });
  const gate = api.hold("PATCH /api/teams/t1");
  const first = treasury.saveTeamRoster("t1", TEAM.roster, { name: "Rooks" });
  assert.equal(treasury.isWriting("t1"), true);
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster, { name: "Crows" }), { ignored: true });
  api.reply(FIRST_PAGE, 200, { entries: [], next: null, since: null, total: 0 });
  gate.release();
  await first;
  assert.equal(api.calls.filter((call) => call.key === "PATCH /api/teams/t1").length, 1);
  api.items.set(TOKEN, "other-tab");
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster, { name: "Crows" }), { refusal: "Other tab" });
  api.items.set(TOKEN, "tok");
  const theirs = { ...TEAM, name: "Ravens", revision: 5 };
  api.reply("PATCH /api/teams/t1", 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: theirs });
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster, { name: "Crows" }), { refusal: "Changed elsewhere.", changed: true });
  assert.equal(state.myTeams.items[1].name, "Ravens");
  await settle();
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

test("an answer that is not a page of the history is a failed read, not an empty one: nothing is kept, the reason is said (T10 I-1)", async () => {
  coach();
  // A coach of its own: the cache is kept per coach, and this one has read nothing yet.
  state.auth.currentUser = { id: "u-shape", login: "coach" };
  const nothing = { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "Unreadable.", errorMore: false };
  const pages = [{}, { entries: null, total: 0 }, { entries: {}, total: 0 }, { entries: [null], total: 1 }, { entries: ["l1"], total: 1 },
    { entries: [], total: "3" }, { entries: [], total: -1 }, { entries: [], total: 1.5 }, { entries: [] },
    { entries: [], total: 0, next: 5 }, { entries: [], total: 0, since: {} }];
  for (const body of pages) {
    api.reply(FIRST_PAGE, 200, body);
    await treasury.readLedger("t1");
    assert.deepEqual(treasury.ledgerOf("t1"), nothing, JSON.stringify(body));
  }
  api.reply(FIRST_PAGE, 200, null);
  await treasury.readLedger("t1");
  assert.deepEqual([treasury.ledgerOf("t1").loaded, treasury.ledgerOf("t1").loading, Boolean(treasury.ledgerOf("t1").error)], [false, false, true], "null");
});

test("a history read, then an answer that is not a page: the lines read stay, and so does «More»'s cursor", async () => {
  coach();
  state.auth.currentUser = { id: "u-shape-2", login: "coach" };
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: "c1", since: null, total: 21 });
  await treasury.readLedger("t1");
  api.reply("GET /api/teams/t1/ledger?before=c1&limit=20", 200, { entries: "l8", next: null, since: null, total: 21 });
  await treasury.readLedger("t1", { more: true });
  assert.deepEqual([ids(), treasury.ledgerOf("t1").next, treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loaded, treasury.ledgerOf("t1").error], [["l9"], "c1", 21, true, "Unreadable."]);
  api.reply(FIRST_PAGE, 200, {});
  await treasury.readLedger("t1");
  assert.deepEqual([ids(), treasury.ledgerOf("t1").error], [["l9"], "Unreadable."]);
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

test("an answer that never came says the entry may have been written; a refusal the server gave does not", async () => {
  coach();
  const entry = { delta: 20, reason: "friendly" };
  const unknown = { refusal: "May have written.", unknown: true };
  api.fail("POST /api/teams/t1/treasury");
  assert.deepEqual(await treasury.addTreasuryEntry("t1", entry), unknown);
  api.reply("POST /api/teams/t1/treasury", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  assert.deepEqual(await treasury.addTreasuryEntry("t1", entry), unknown);
  api.reply("PATCH /api/teams/t1", 502, {});
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster), unknown);
  api.reply("PATCH /api/teams/t1", 422, { error: { code: "STAGE_PURCHASE_LOCKED", params: {}, message: "x" } });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t0", name: "Other" }, TEAM] });
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster), { refusal: "Locked by the stage." });
  await settle();
});

test("a 409 on a roster save is marked as changed too, and takes the team as it is", async () => {
  coach();
  const applied = { ...TEAM, revision: 4, roster: { ...TEAM.roster, cheerleaders: 2 } };
  api.reply("PATCH /api/teams/t1", 409, { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" }, team: applied });
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  assert.deepEqual(await treasury.saveTeamRoster("t1", TEAM.roster), { refusal: "Changed elsewhere.", changed: true });
  assert.deepEqual(state.myTeams.items[1], applied);
});

test("a line a read already brought is not added a second time when the entry's answer comes", async () => {
  coach();
  const known = { ...ENTRY, id: "l1" };
  const fresh = { ...ENTRY, id: "l10" };
  api.reply(FIRST_PAGE, 200, { entries: [known], next: null, since: null, total: 1 });
  await treasury.readLedger("t1");
  // The server has written the line when this read is answered; the entry's own answer is still on its way.
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: fresh });
  const gate = api.hold("POST /api/teams/t1/treasury");
  const adding = treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  await waitHeld(gate);
  api.reply(FIRST_PAGE, 200, { entries: [fresh, known], next: null, since: null, total: 2 });
  await treasury.readLedger("t1");
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total], [["l10", "l1"], 2]);
  gate.release();
  assert.deepEqual(await adding, { entry: fresh });
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total], [["l10", "l1"], 2], "each line once, counted once");
  await settle();
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").loading], [["l10", "l1"], 2, false]);
  assert.equal(api.calls.filter((call) => call.key === FIRST_PAGE).length, 3, "a read was sent while the write was on its way: the first page is read once more");
});

test("a page read after the entry was written, before its answer, is put right by reading the first page again", async () => {
  coach();
  const [l2, l1, l0, fresh] = ["l2", "l1", "l0", "l10"].map((id) => ({ ...ENTRY, id }));
  api.reply(FIRST_PAGE, 200, { entries: [l2, l1], next: "c1", since: null, total: 3 });
  await treasury.readLedger("t1");
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: fresh });
  const gate = api.hold("POST /api/teams/t1/treasury");
  const adding = treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  await waitHeld(gate);
  // The count the page says already holds the new line (4), the lines it brings do not.
  api.reply("GET /api/teams/t1/ledger?before=c1&limit=20", 200, { entries: [l0], next: null, since: null, total: 4 });
  await treasury.readLedger("t1", { more: true });
  api.reply(FIRST_PAGE, 200, { entries: [fresh, l2, l1, l0], next: null, since: null, total: 4 });
  gate.release();
  await adding;
  await settle();
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total, treasury.ledgerOf("t1").next], [["l10", "l2", "l1", "l0"], 4, null]);
});

test("a list read on its way when a write lands is read again, so it cannot bring the old revision back", async () => {
  coach();
  state.auth.currentUser.preferences = { activeTeamId: "t1" };
  state.activeTeamId = "t1";
  const stale = { teams: [{ id: "t0", name: "Other" }, structuredClone(TEAM)] };
  const older = api.hold("GET /api/teams");
  const listing = loadMyTeams(true);
  await waitHeld(older);
  // The list read the write sends once it lands stands at its own gate.
  const newer = api.hold("GET /api/teams");
  api.reply("POST /api/teams/t1/treasury", 201, { team: { ...TEAM, revision: 4 }, entry: ENTRY });
  await treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  await waitHeld(newer);
  older.release({ status: 200, body: stale });
  await settle();
  assert.equal(state.myTeams.items[1].revision, 4, "the answer asked before the write wrote nothing");
  newer.release({ status: 200, body: { teams: [{ id: "t0", name: "Other" }, { ...TEAM, revision: 4 }] } });
  await listing;
  assert.deepEqual(state.myTeams.items.map((item) => [item.id, item.revision ?? null]), [["t0", null], ["t1", 4]]);
});

test("a coach is never shown another coach's history on the same page", async () => {
  coach();
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: "c1", since: null, total: 5 });
  await treasury.readLedger("t1");
  state.auth.currentUser = { id: "u2", login: "other" };
  assert.deepEqual(treasury.ledgerOf("t1"), { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "", errorMore: false });
  await treasury.readLedger("t1", { more: true });
  assert.equal(api.calls.length, 1, "the cursor of the other coach's history is not used");
  state.auth.currentUser = { id: "u1", login: "coach" };
  assert.deepEqual([ids(), treasury.ledgerOf("t1").total], [["l9"], 5]);
});

test("a read whose coach has gone writes nothing, and leaves nothing on its way behind", async () => {
  coach();
  state.myTeams.items.push({ ...TEAM, id: "t5" });
  const gate = api.hold("GET /api/teams/t5/ledger?limit=20");
  const reading = treasury.readLedger("t5");
  await waitHeld(gate);
  assert.equal(treasury.ledgerOf("t5").loading, true);
  state.auth.currentUser = { id: "u2", login: "other" };
  gate.release({ status: 200, body: { entries: [ENTRY], next: null, since: null, total: 1 } });
  await reading;
  assert.deepEqual(treasury.ledgerOf("t5"), { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "", errorMore: false });
  state.auth.currentUser = { id: "u1", login: "coach" };
  assert.deepEqual(treasury.ledgerOf("t5"), { entries: [], next: null, since: null, total: 0, loaded: false, loading: false, error: "", errorMore: false }, "not written, and no longer loading");
  // Nothing is on its way: a write that lands sends no read after it.
  api.reply("POST /api/teams/t5/treasury", 201, { team: { ...TEAM, id: "t5", revision: 4 }, entry: ENTRY });
  await treasury.addTreasuryEntry("t5", { delta: 20, reason: "friendly" });
  await settle();
  assert.equal(api.calls.filter((call) => call.key.startsWith("GET")).length, 1);
});

test("a write whose answer was lost reads the team and its history again, once each, for the coach who wrote it (final I-1)", async () => {
  coach();
  const fresh = { ...TEAM, revision: 4, roster: { ...TEAM.roster, treasury: 90 } };
  api.reply(FIRST_PAGE, 200, { entries: [ENTRY], next: null, since: null, total: 1 });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t0", name: "Other" }, fresh] });
  const reads = () => api.calls.filter((call) => call.key === FIRST_PAGE || call.key === "GET /api/teams").map((call) => call.key);
  for (const [key, write] of [
    ["POST /api/teams/t1/treasury", () => treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" })],
    ["PATCH /api/teams/t1", () => treasury.saveTeamRoster("t1", TEAM.roster)],
  ]) {
    api.calls.length = 0;
    api.fail(key);
    assert.deepEqual(await write(), { refusal: "May have written.", unknown: true }, key);
    await settle();
    assert.deepEqual(reads().sort(), ["GET /api/teams", FIRST_PAGE].sort(), key);
    assert.equal(state.myTeams.items[1].revision, 4, "the list holds what the server holds");
    assert.deepEqual(ids(), ["l9"]);
  }
  // A coach who signed out while the answer was lost: nothing is read for them.
  api.calls.length = 0;
  const gate = api.hold("POST /api/teams/t1/treasury");
  const writing = treasury.addTreasuryEntry("t1", { delta: 20, reason: "friendly" });
  await waitHeld(gate);
  state.auth.currentUser = { id: "u2", login: "other" };
  gate.release({ error: new TypeError("Failed to fetch") });
  assert.equal((await writing).unknown, true);
  await settle();
  assert.deepEqual(reads(), []);
});
