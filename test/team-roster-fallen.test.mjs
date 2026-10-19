import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { readSnapshot } = await import("../src/screens/team/roster/data.mjs");
const { fallenWriting, markDeath, readFallen, undoDeath } = await import("../src/screens/team/roster/fallen.mjs");

const dictionary = (locale) => JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));

const NO_ANSWER = "The server did not answer.";
const LOST = "The answer did not come: the roster is read again to see what the server holds.";
const OTHER_TAB = "Someone signed in or out in another tab, so nothing was saved here.";

setDictionaries({
  en: {
    "auth.otherTab": OTHER_TAB,
    "teamRoster.fallen.lost": LOST,
    "request.offline": "No connection.",
    "request.noAnswer": NO_ANSWER,
    "error.TEAM_SAVED_ELSEWHERE": "The team was saved elsewhere.",
    "error.ROSTER_BREAKS_THE_RULES": "The roster breaks the rules.",
    "error.PLAYER_NOT_FOUND": "Player not found.",
    "error.FIELD_INVALID": "The field {field} is not valid.",
    "error.FALLEN_FROM_MATCH": "A match recorded this death.",
    "error.FALLEN_NOT_FOUND": "Fallen player not found.",
    "error.FALLEN_NOT_RESTORABLE": "The roster cannot read him.",
    "validation.DUPLICATE_PLAYER_ID": "Players {names} are stored under one id.",
  },
  ru: {},
});

const TOKEN = "gata-league-auth-token";
const FALLEN_URL = "GET /api/teams/t1/fallen";
const TEAM_URL = "GET /api/teams/t1";
const EVENTS_URL = "GET /api/teams/t1/events";
const DEATH_URL = "POST /api/teams/t1/players/p1/death";
const UNDO_URL = "DELETE /api/teams/t1/fallen/f1";

const tick = () => new Promise((resolve) => setImmediate(resolve));
/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await tick();
  }
}

/** A signed-in coach whose token is the browser's, and nothing left in the fake from the test before. */
function open() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
}

const teamAt = (revision, players = []) => ({ id: "t1", name: "Iron Rooks", revision, roster: { players } });
/** A record as GET …/fallen and the death's answer send it (publicFallen). */
const recordOf = (over = {}) => ({
  id: "f1", player: { id: "p1", name: "Ann" }, cause: "Foul", pairingId: null, roundNumber: null, diedAt: "2026-10-19T09:00:00Z", fromMatch: false, ...over,
});
const elsewhere = { error: { code: "TEAM_SAVED_ELSEWHERE", params: {}, message: "x" } };
const rulesRefusal = {
  error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
  violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
};
const refusalOf = (code, message = "x") => ({ error: { code, params: {}, message } });
const sent = (key) => api.calls.filter((call) => call.key === key);
const DEATH = { cause: "Foul", revision: 4 };

test("the words of the fallen are in both dictionaries", () => {
  const keys = ["teamRoster.fallen.lost", "auth.otherTab", "error.TEAM_SAVED_ELSEWHERE", "error.ROSTER_BREAKS_THE_RULES", "error.PLAYER_NOT_FOUND",
    "error.FALLEN_FROM_MATCH", "error.FALLEN_NOT_FOUND", "error.FALLEN_NOT_RESTORABLE"];
  for (const locale of ["en", "ru"]) {
    const words = dictionary(locale);
    for (const key of keys) assert.ok(typeof words[key] === "string" && words[key].trim(), `${locale} has ${key}`);
  }
  assert.equal(dictionary("en")["teamRoster.fallen.lost"], "The answer did not come: the roster is read again to see what the server holds.");
  assert.equal(dictionary("ru")["teamRoster.fallen.lost"], "Ответ не пришёл: состав перечитывается, чтобы узнать, что на сервере.");
});

test("the fallen are read for the team, and an answer that is not a list is a read that failed", async () => {
  open();
  api.reply(FALLEN_URL, 200, { fallen: [recordOf()] });
  assert.deepEqual(await readFallen("t1"), { fallen: [recordOf()] });
  assert.equal(sent(FALLEN_URL).length, 1);
  // An empty list is a team with no dead, not a read that failed.
  api.reply(FALLEN_URL, 200, { fallen: [] });
  assert.deepEqual(await readFallen("t1"), { fallen: [] });
  // A 2xx whose body is not the list (a proxy's page, which api.mjs reads as `{}`), or whose records are not records.
  for (const body of [{}, null, { fallen: null }, { fallen: "f1" }, { fallen: {} }, { fallen: [null] }, { fallen: ["f1"] }, { fallen: [{}] },
    { fallen: [recordOf(), { ...recordOf(), id: 7 }] }, { fallen: [[]] }]) {
    api.reply(FALLEN_URL, 200, body);
    assert.deepEqual(await readFallen("t1"), { error: NO_ANSWER }, JSON.stringify(body));
  }
  api.fail(FALLEN_URL);
  assert.deepEqual(await readFallen("t1"), { error: "No connection." });
  api.reply(FALLEN_URL, 404, refusalOf("TEAM_NOT_FOUND", "no team"));
  assert.deepEqual(await readFallen("t1"), { error: "no team" });
  api.reply(FALLEN_URL, 502, {});
  assert.deepEqual(await readFallen("t1"), { error: NO_ANSWER });
});

test("the team's id is one segment of the path", async () => {
  open();
  api.reply("GET /api/teams/a%2Fb/fallen", 200, { fallen: [] });
  assert.deepEqual(await readFallen("a/b"), { fallen: [] });
  api.assertAnswered();
});

test("the roster's snapshot is the team, its records and its fallen; either failing fails it", async () => {
  open();
  api.reply(TEAM_URL, 200, { team: teamAt(4) });
  api.reply(EVENTS_URL, 200, { events: [], revision: 4 });
  api.reply(FALLEN_URL, 200, { fallen: [recordOf()] });
  assert.deepEqual(await readSnapshot("t1"), { team: teamAt(4), events: [], fallen: [recordOf()] });
  api.assertAnswered();
  // The fallen failing fails it, in the fallen's words.
  api.fail(FALLEN_URL);
  assert.deepEqual(await readSnapshot("t1"), { error: "No connection." });
  api.reply(FALLEN_URL, 200, {});
  assert.deepEqual(await readSnapshot("t1"), { error: NO_ANSWER });
  // The roster failing fails it, and it is the roster's word when both failed.
  api.reply(FALLEN_URL, 200, { fallen: [] });
  api.reply(TEAM_URL, 200, {});
  assert.deepEqual(await readSnapshot("t1"), { error: NO_ANSWER });
  api.fail(TEAM_URL, new TypeError("Failed to fetch"));
  api.reply(FALLEN_URL, 200, {});
  assert.deepEqual(await readSnapshot("t1"), { error: "No connection." });
  api.reply(TEAM_URL, 502, {});
  api.fail(FALLEN_URL);
  assert.deepEqual(await readSnapshot("t1"), { error: NO_ANSWER });
});

test("a death is one POST with the cause and the revision the coach's roster is on; its answer is the team and the record", async () => {
  open();
  api.reply(DEATH_URL, 201, { team: teamAt(5), fallen: recordOf() });
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { team: teamAt(5), fallen: recordOf() });
  assert.equal(sent(DEATH_URL).length, 1);
  assert.deepEqual(sent(DEATH_URL)[0].body, { cause: "Foul", revision: 4 });
  assert.equal(api.calls.length, 1);
  assert.equal(fallenWriting("t1"), false);
  // Both ids are one segment each.
  api.reply("POST /api/teams/t%2F1/players/p%201/death", 201, { team: teamAt(5), fallen: recordOf() });
  assert.deepEqual((await markDeath("t/1", "p 1", DEATH)).fallen, recordOf());
  api.assertAnswered();
});

// Review Focus 1: a request that got no answer may have been written; sending it again is the screen's reading, not ours.
test("a death whose answer was lost is not sent again; nor is an undo", async () => {
  open();
  api.fail(DEATH_URL);
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: LOST, code: null, lost: true });
  await tick();
  assert.equal(sent(DEATH_URL).length, 1);
  assert.equal(fallenWriting("t1"), false);
  api.fail(UNDO_URL);
  assert.deepEqual(await undoDeath("t1", "f1"), { refusal: LOST, code: null, lost: true });
  await tick();
  assert.equal(sent(UNDO_URL).length, 1);
  assert.equal(fallenWriting("t1"), false);
});

test("an answer that is none is lost in every way it can be: offline, timed out, a 5xx, a status without the server's words", async () => {
  const timedOut = Object.assign(new Error("aborted"), { name: "AbortError" });
  const answers = [
    (key) => api.fail(key),
    (key) => api.fail(key, timedOut),
    (key) => api.reply(key, 500, refusalOf("INTERNAL_ERROR")),
    (key) => api.reply(key, 502, {}),
    (key) => api.reply(key, 404, {}),
  ];
  for (const [index, answer] of answers.entries()) {
    open();
    answer(DEATH_URL);
    assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: LOST, code: null, lost: true }, `death, answer ${index}`);
    assert.equal(sent(DEATH_URL).length, 1, `death, answer ${index}, is not sent again`);
    answer(UNDO_URL);
    assert.deepEqual(await undoDeath("t1", "f1"), { refusal: LOST, code: null, lost: true }, `undo, answer ${index}`);
    assert.equal(sent(UNDO_URL).length, 1, `undo, answer ${index}, is not sent again`);
  }
});

test("a 2xx without the team is an answer that did not come", async () => {
  open();
  // The death's answer holds the team and the record, both; a body that is not JSON is read as `{}` (a proxy's page).
  const bodies = [{}, null, { team: teamAt(5) }, { fallen: recordOf() }, { team: null, fallen: recordOf() }, { team: teamAt(5), fallen: null },
    { team: "t1", fallen: recordOf() }, { team: teamAt(5), fallen: "f1" }, { team: [], fallen: recordOf() }, { team: teamAt(5), fallen: [] }];
  for (const [index, body] of bodies.entries()) {
    api.reply(DEATH_URL, 201, body);
    assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: LOST, code: null, lost: true }, `death, body ${index}`);
  }
  api.reply(DEATH_URL, 200, {});
  assert.equal((await markDeath("t1", "p1", DEATH)).lost, true);
  for (const [index, body] of [{}, null, { team: null }, { team: "t1" }, { team: [] }, { fallen: recordOf() }].entries()) {
    api.reply(UNDO_URL, 200, body);
    assert.deepEqual(await undoDeath("t1", "f1"), { refusal: LOST, code: null, lost: true }, `undo, body ${index}`);
  }
  // None of those was sent twice.
  assert.equal(sent(DEATH_URL).length, bodies.length + 1);
  assert.equal(fallenWriting("t1"), false);
});

test("another device's save: the death is refused with the server's team", async () => {
  open();
  api.reply(DEATH_URL, 409, { ...elsewhere, team: teamAt(6) });
  const answer = await markDeath("t1", "p1", DEATH);
  assert.deepEqual(answer, { refusal: "The team was saved elsewhere.", code: "TEAM_SAVED_ELSEWHERE", conflict: teamAt(6) });
  assert.equal(answer.conflict.revision, 6);
  assert.equal(answer.lost, undefined);
  // A 409 that carries no team still is the other device's save; the screen reads the roster itself.
  api.reply(DEATH_URL, 409, elsewhere);
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: "The team was saved elsewhere.", code: "TEAM_SAVED_ELSEWHERE", conflict: null });
  api.reply(DEATH_URL, 409, { ...elsewhere, team: "t1" });
  assert.equal((await markDeath("t1", "p1", DEATH)).conflict, null);
  // It was refused, so nothing was written: the next press is a fresh attempt on the new revision.
  api.reply(DEATH_URL, 201, { team: teamAt(7), fallen: recordOf() });
  assert.deepEqual(await markDeath("t1", "p1", { cause: "Foul", revision: 6 }), { team: teamAt(7), fallen: recordOf() });
  assert.deepEqual(sent(DEATH_URL).at(-1).body, { cause: "Foul", revision: 6 });
});

test("a death the server refuses is said in the server's words and named", async () => {
  open();
  api.reply(DEATH_URL, 404, refusalOf("PLAYER_NOT_FOUND"));
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: "Player not found.", code: "PLAYER_NOT_FOUND" });
  api.reply(DEATH_URL, 400, { error: { code: "FIELD_INVALID", params: { field: "cause" }, message: "x" } });
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: "The field cause is not valid.", code: "FIELD_INVALID" });
  api.reply(DEATH_URL, 422, rulesRefusal);
  assert.deepEqual(await markDeath("t1", "p1", DEATH), {
    refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id.", code: "ROSTER_BREAKS_THE_RULES",
  });
  assert.equal(sent(DEATH_URL).length, 3);
});

test("one write of the fallen at a time per team: a second press while one is on its way sends nothing", async () => {
  open();
  api.reply(DEATH_URL, 201, { team: teamAt(5), fallen: recordOf() });
  api.reply(UNDO_URL, 200, { team: teamAt(5) });
  api.reply("POST /api/teams/t2/players/p1/death", 201, { team: teamAt(5), fallen: recordOf() });
  const gate = api.hold(DEATH_URL);
  const first = markDeath("t1", "p1", DEATH);
  assert.equal(fallenWriting("t1"), true);
  await waitHeld(gate);
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { ignored: true });
  // A death and an undo are the same writing: the team's record of the dead is touched once at a time.
  assert.deepEqual(await undoDeath("t1", "f1"), { ignored: true });
  assert.equal(sent(DEATH_URL).length, 1);
  assert.equal(sent(UNDO_URL).length, 0);
  // Another team is another writing.
  assert.equal(fallenWriting("t2"), false);
  assert.equal((await markDeath("t2", "p1", DEATH)).team.revision, 5);
  gate.release();
  assert.deepEqual(await first, { team: teamAt(5), fallen: recordOf() });
  assert.equal(fallenWriting("t1"), false);
  // The writing is over, so the next press goes.
  assert.equal((await undoDeath("t1", "f1")).team.revision, 5);
});

test("the writing is over however the write came out: a refusal, a lost answer, a body that is none", async () => {
  open();
  const gate = api.hold(UNDO_URL);
  api.reply(UNDO_URL, 422, refusalOf("FALLEN_NOT_RESTORABLE"));
  const pending = undoDeath("t1", "f1");
  await waitHeld(gate);
  assert.equal(fallenWriting("t1"), true);
  gate.release();
  assert.equal((await pending).code, "FALLEN_NOT_RESTORABLE");
  assert.equal(fallenWriting("t1"), false);
  api.fail(DEATH_URL);
  await markDeath("t1", "p1", DEATH);
  assert.equal(fallenWriting("t1"), false);
  api.reply(DEATH_URL, 201, {});
  await markDeath("t1", "p1", DEATH);
  assert.equal(fallenWriting("t1"), false);
  assert.equal(fallenWriting("nobody"), false);
});

test("another tab's coach: nothing is sent", async () => {
  open();
  api.items.set(TOKEN, "someone-else");
  assert.deepEqual(await markDeath("t1", "p1", DEATH), { refusal: OTHER_TAB, code: null });
  assert.deepEqual(await undoDeath("t1", "f1"), { refusal: OTHER_TAB, code: null });
  assert.equal(api.calls.length, 0);
  assert.equal(fallenWriting("t1"), false);
});

test("an undo is one DELETE of the record; a refusal says the rules it breaks", async () => {
  open();
  api.reply(UNDO_URL, 200, { team: teamAt(6) });
  assert.deepEqual(await undoDeath("t1", "f1"), { team: teamAt(6) });
  assert.equal(sent(UNDO_URL).length, 1);
  assert.equal(sent(UNDO_URL)[0].body, null);
  assert.equal(api.calls.length, 1);
  api.reply("DELETE /api/teams/t%2F1/fallen/f%201", 200, { team: teamAt(6) });
  assert.deepEqual(await undoDeath("t/1", "f 1"), { team: teamAt(6) });
  api.reply(UNDO_URL, 422, rulesRefusal);
  assert.deepEqual(await undoDeath("t1", "f1"), {
    refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id.", code: "ROSTER_BREAKS_THE_RULES",
  });
  const refusals = [
    [403, "FALLEN_FROM_MATCH", "A match recorded this death."],
    [404, "FALLEN_NOT_FOUND", "Fallen player not found."],
    [422, "FALLEN_NOT_RESTORABLE", "The roster cannot read him."],
  ];
  for (const [status, code, words] of refusals) {
    api.reply(UNDO_URL, status, refusalOf(code));
    const answer = await undoDeath("t1", "f1");
    assert.deepEqual(answer, { refusal: words, code }, code);
    assert.equal("conflict" in answer, false, `${code} has no conflict branch`);
  }
  // An undo has no revision: a 409 is worded like any refusal and carries no team to settle.
  api.reply(UNDO_URL, 409, { ...elsewhere, team: teamAt(6) });
  assert.deepEqual(await undoDeath("t1", "f1"), { refusal: "The team was saved elsewhere.", code: "TEAM_SAVED_ELSEWHERE" });
});

test("violations that are not a list are still the server's refusal, not a throw", async () => {
  open();
  api.reply(DEATH_URL, 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations: "no" });
  const answer = await markDeath("t1", "p1", DEATH);
  assert.equal(answer.code, "ROSTER_BREAKS_THE_RULES");
  assert.ok(answer.refusal.startsWith("The roster breaks the rules."));
  assert.equal(answer.lost, undefined);
  assert.equal(fallenWriting("t1"), false);
});
