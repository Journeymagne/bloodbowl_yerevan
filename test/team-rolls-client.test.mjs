import assert from "node:assert/strict";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

// Stage 07d, Task 4: a player's dice on the site, asked of the server outside the save queue (roster/rolls.mjs).
const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const { askRoll, readRolls, rollAsking } = await import("../src/screens/team/roster/rolls.mjs");

setDictionaries({
  en: {
    "auth.otherTab": "Someone signed in or out in another tab, so nothing was saved here.",
    "request.offline": "No connection.",
    "request.noAnswer": "The server did not answer.",
    "error.DICE_CATEGORY": "A random skill can only be rolled in one of the player's primary categories.",
    "error.PLAYER_NOT_FOUND": "This player is no longer on the team.",
    "error.ROSTER_BREAKS_THE_RULES": "The roster breaks the rules.",
    "validation.DUPLICATE_PLAYER_ID": "Players {names} are stored under one id.",
  },
});

const TOKEN = "gata-league-auth-token";
const ASK_URL = "POST /api/teams/t1/players/p3/rolls";
const ROLLS_URL = "GET /api/teams/t1/rolls";
/** A random skill rolled for Cade, as the server answers it (`publicRoll`). */
const ROLL = {
  id: "r1", playerId: "p3", purpose: "random_skill", params: { category: "General", sides: 16, captain: false },
  result: { skill: "Frenzy", attempts: [{ roll: 4, skill: "Frenzy", duplicate: false }] }, usedAt: null, createdAt: "2026-10-19T10:00:00Z",
};
const D8 = { ...ROLL, id: "r2", purpose: "stat", params: { sides: 8 }, result: { roll: 3, stats: ["ar", "ma", "pa"] } };
const asks = () => api.calls.filter((call) => call.key === ASK_URL);
const tick = () => new Promise((resolve) => setImmediate(resolve));

/** A signed-in coach, with nothing asked yet. */
function signIn() {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: "u1", login: "coach" };
}

test("a roll is asked with the purpose and, for a random skill, the category; its answer is the roll", async () => {
  signIn();
  api.reply(ASK_URL, 200, { roll: ROLL });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "random_skill", category: "General" }), { roll: ROLL });
  api.reply(ASK_URL, 200, { roll: D8 });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "stat", category: "General" }), { roll: D8 });
  assert.deepEqual(asks().map(({ body }) => body), [{ purpose: "random_skill", category: "General" }, { purpose: "stat" }], "a D8 has no category");
  api.assertAnswered();
});

// Review Focus 2: the same ask gets the same roll from the server, but a second press while one is out sends nothing.
test("one ask in the air per player: a second press while it is out sends nothing", async () => {
  signIn();
  const gate = api.hold(ASK_URL);
  const first = askRoll("t1", "p3", { purpose: "random_skill", category: "General" });
  assert.equal(rollAsking("t1", "p3"), true);
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "random_skill", category: "General" }), { ignored: true });
  // Another player's die is his own.
  api.reply("POST /api/teams/t1/players/p4/rolls", 200, { roll: { ...D8, playerId: "p4" } });
  assert.equal(rollAsking("t1", "p4"), false);
  assert.deepEqual(await askRoll("t1", "p4", { purpose: "stat" }), { roll: { ...D8, playerId: "p4" } });
  await tick();
  assert.equal(asks().length, 1);
  gate.release({ status: 200, body: { roll: ROLL } });
  assert.deepEqual(await first, { roll: ROLL });
  assert.equal(rollAsking("t1", "p3"), false, "answered, the press is open again");
});

test("a lost answer is said as lost, and asking again sends the same request again", async () => {
  signIn();
  api.fail(ASK_URL);
  const ask = () => askRoll("t1", "p3", { purpose: "random_skill", category: "General" });
  assert.deepEqual(await ask(), { lost: true });
  assert.equal(rollAsking("t1", "p3"), false);
  // A proxy's page in place of the server's answer, and a server that failed: the roll may be made all the same.
  api.reply(ASK_URL, 502, "<html>Bad gateway</html>");
  assert.deepEqual(await ask(), { lost: true });
  api.reply(ASK_URL, 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  assert.deepEqual(await ask(), { lost: true });
  api.reply(ASK_URL, 200, { roll: ROLL });
  assert.deepEqual(await ask(), { roll: ROLL }, "the server hands back the roll it made");
  const bodies = asks().map(({ body }) => body);
  assert.equal(bodies.length, 4);
  for (const body of bodies) assert.deepEqual(body, { purpose: "random_skill", category: "General" });
});

test("a roll of the other purpose waiting is said with its purpose", async () => {
  signIn();
  api.reply(ASK_URL, 409, { error: { code: "DICE_ROLL_WAITING", params: { purpose: "stat" }, message: "x" } });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "random_skill", category: "General" }), { waiting: "stat" });
  api.reply(ASK_URL, 409, { error: { code: "DICE_ROLL_WAITING", params: { purpose: "random_skill" }, message: "x" } });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "stat" }), { waiting: "random_skill" });
});

// K21: a 2.x roster with two players under one id is refused with the rules it breaks, and who to fix.
test("a refusal is said in the server's words", async () => {
  signIn();
  api.reply(ASK_URL, 422, { error: { code: "DICE_CATEGORY", params: {}, message: "x" } });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "random_skill", category: "Passing" }),
    { refusal: "A random skill can only be rolled in one of the player's primary categories.", code: "DICE_CATEGORY" });
  api.reply(ASK_URL, 422, {
    error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" },
    violations: [{ code: "DUPLICATE_PLAYER_ID", params: { names: "Ann, Bo" } }],
  });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "stat" }),
    { refusal: "The roster breaks the rules. Players Ann, Bo are stored under one id.", code: "ROSTER_BREAKS_THE_RULES" });
  api.reply(ASK_URL, 404, { error: { code: "PLAYER_NOT_FOUND", params: {}, message: "x" } });
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "stat" }), { refusal: "This player is no longer on the team.", code: "PLAYER_NOT_FOUND" });
  assert.equal(rollAsking("t1", "p3"), false);
});

test("a 2xx with no roll is no answer", async () => {
  signIn();
  for (const body of [{}, null, { roll: null }, { roll: { ...ROLL, id: "" } }, { roll: { ...ROLL, purpose: "block" } }, { roll: { ...ROLL, result: "Frenzy" } }]) {
    api.reply(ASK_URL, 200, body);
    assert.deepEqual(await askRoll("t1", "p3", { purpose: "random_skill", category: "General" }), { lost: true }, JSON.stringify(body));
  }
});

// K15: the screen's reason is asked at the press, as the queue's steps ask it.
test("another tab's coach asks nothing, nor does a press the screen has closed", async () => {
  signIn();
  api.items.set(TOKEN, "someone-else");
  assert.match((await askRoll("t1", "p3", { purpose: "stat" })).refusal, /another tab/);
  api.items.set(TOKEN, "tok");
  assert.deepEqual(await askRoll("t1", "p3", { purpose: "stat", closed: () => "Advancement — after the post-match" }),
    { refusal: "Advancement — after the post-match" });
  assert.equal(rollAsking("t1", "p3"), false);
  await tick();
  assert.equal(api.calls.length, 0);
});

// T3 hand-off: the team's rolls include those of players who have left the roster; a player's are his alone.
test("the team's rolls are read; a body that is no list is no answer", async () => {
  signIn();
  const left = { ...D8, id: "r0", playerId: "p9", usedAt: "2026-10-01T10:00:00Z" };
  api.reply(ROLLS_URL, 200, { rolls: [left, ROLL] });
  assert.deepEqual(await readRolls("t1"), { rolls: [left, ROLL] });
  assert.deepEqual(await readRolls("t1", "p3"), { rolls: [ROLL] });
  assert.deepEqual(await readRolls("t1", "p4"), { rolls: [] });
  for (const body of [{}, null, { rolls: {} }]) {
    api.reply(ROLLS_URL, 200, body);
    assert.deepEqual(await readRolls("t1"), { error: "The server did not answer." }, JSON.stringify(body));
  }
  api.fail(ROLLS_URL);
  assert.deepEqual(await readRolls("t1"), { error: "No connection." });
  assert.ok(api.calls.every(({ key }) => key === ROLLS_URL), "a read only");
});
