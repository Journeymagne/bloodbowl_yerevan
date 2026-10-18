import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { installFakeApi } from "./helpers/fake-api.mjs";

const api = installFakeApi();
const { rememberSessionToken } = await import("../src/core/api-client.mjs");
const { setDictionaries } = await import("../src/core/i18n.mjs");
const { state } = await import("../src/core/state.mjs");
const teams = await import("../src/data/teams.mjs");

setDictionaries({
  en: {
    "auth.otherTab": "Other tab",
    "request.offline": "No connection.",
    "request.noAnswer": "No answer.",
    "error.ROSTER_BREAKS_THE_RULES": "Breaks the rules.",
    "validation.POSITION_MAX": "{position}: at most {max}.",
    "error.TEAM_IN_SEASON_CANNOT_BE_DELETED": "Played in a season.",
    "error.SERVER_ERROR": "The server failed.",
    "error.TEAM_NAME_REQUIRED": "Name the team.",
  },
  ru: {},
});
const TOKEN = "gata-league-auth-token";
const BODY = { name: "Iron Rooks", baseTeamSlug: "teams/human", logoData: null, roster: { players: [] } };
const IRON_ROOKS = { name: "Iron Rooks", baseTeamSlug: "teams/human" };
const ids = () => state.myTeams.items.map((item) => item.id);
const tick = () => new Promise((resolve) => setImmediate(resolve));
/** Wait until `count` requests are held at the gate. */
async function waitHeld(gate, count = 1) {
  for (let spins = 0; gate.count < count; spins += 1) {
    assert.ok(spins < 50, `${count} request(s) were to be held`);
    await tick();
  }
}
// A build whose fate is not known is remembered for its coach: a test starts as a coach no test has been.
let coaches = 0;
function coach(items = [{ id: "t1", name: "Old" }]) {
  api.reset();
  api.items.set(TOKEN, "tok");
  rememberSessionToken("tok");
  state.auth.currentUser = { id: `u${++coaches}`, login: "coach", preferences: { activeTeamId: "t1" } };
  state.myTeams = { items, loaded: true, loading: false, error: "" };
  state.season = { data: null, loaded: true, loading: false, error: "" };
  state.activeTeamId = items[0]?.id ?? null;
}

test("a new team goes to the server once and to the head of the list without a reload", async () => {
  coach();
  api.reply("POST /api/teams", 201, { team: { id: "t2", name: "Iron Rooks" } });
  const result = await teams.createTeam(BODY, { startedAt: 0 });
  assert.deepEqual(result, { team: { id: "t2", name: "Iron Rooks" } });
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams"]);
  assert.deepEqual(api.calls[0].body, BODY);
  assert.deepEqual(ids(), ["t2", "t1"]);
});

test("a team the server refused is said with the rules it breaks", async () => {
  coach();
  const violations = [{ code: "POSITION_MAX", params: { position: "Ogre", max: 1 } }, { code: "POSITION_MAX", params: { position: "Troll", max: 2 } }];
  api.reply("POST /api/teams", 422, { error: { code: "ROSTER_BREAKS_THE_RULES", params: {}, message: "x" }, violations });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "Breaks the rules. Ogre: at most 1. Troll: at most 2." });
  assert.deepEqual(ids(), ["t1"]);
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams"]);
});

test("a refusal with no rules listed is said as it stands, and is not looked for on the server", async () => {
  coach();
  api.reply("POST /api/teams", 400, { error: { code: "TEAM_NAME_REQUIRED", params: {}, message: "x" } });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "Name the team." });
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams"]);
});

// The server's INSERT can commit before the answer is built, and a failure there comes back as a coded 500.
test("a server that failed after it may have written is not believed: the team is looked for", async () => {
  coach();
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  api.reply("POST /api/teams", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  api.reply("GET /api/teams", 200, { teams: [made, { id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { team: made, recovered: true });
  coach();
  api.reply("POST /api/teams", 500, { error: { code: "SERVER_ERROR", params: {}, message: "x" } });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "The server failed." });
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams", "GET /api/teams"]);
});

// K3b: a team the coach already has by that name and race is not the one the server made.
const OLD_ROOKS = { id: "old", ...IRON_ROOKS, createdAt: "2026-10-01T10:00:00Z" };

test("an answer lost on the way finds the team the server made: the new id, by name and race", async () => {
  coach([{ id: "t1", name: "Old" }, OLD_ROOKS]);
  api.fail("POST /api/teams");
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  api.reply("GET /api/teams", 200, { teams: [made, { id: "t1", name: "Old" }, OLD_ROOKS] });
  const result = await teams.createTeam(BODY, { startedAt: Date.parse("2026-10-18T10:00:00Z") });
  assert.deepEqual(result, { team: made, recovered: true });
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams", "GET /api/teams"]);
  assert.deepEqual(ids(), ["t2", "t1", "old"]);
});

test("a client clock ahead of the server's still finds the team, and the build is not sent twice", async () => {
  coach([{ id: "t1", name: "Old" }, OLD_ROOKS]);
  api.fail("POST /api/teams");
  // The coach's clock says 10:00, the server's row says it was made at 09:58.
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T09:58:00Z" };
  api.reply("GET /api/teams", 200, { teams: [made, { id: "t1", name: "Old" }, OLD_ROOKS] });
  const result = await teams.createTeam(BODY, { startedAt: Date.parse("2026-10-18T10:00:00Z") });
  assert.deepEqual(result, { team: made, recovered: true });
  assert.equal(api.calls.filter((call) => call.key === "POST /api/teams").length, 1);
});

test("a name is the server's: it trims what the coach typed", async () => {
  coach();
  api.fail("POST /api/teams");
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  api.reply("GET /api/teams", 200, { teams: [made, { id: "t1", name: "Old" }] });
  const result = await teams.createTeam({ ...BODY, name: "  Iron Rooks " }, { startedAt: 0 });
  assert.equal(result.team.id, "t2");
});

test("an answer lost, and no new team of that name and race: the build did not reach the server", async () => {
  coach([{ id: "t1", name: "Old" }, OLD_ROOKS]);
  api.fail("POST /api/teams");
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1", name: "Old" }, OLD_ROOKS, { id: "t3", name: "Another", baseTeamSlug: "teams/human", createdAt: "2026-10-18T10:05:00Z" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: Date.parse("2026-10-18T10:00:00Z") }), { refusal: "No connection." });
});

test("an answer lost and the list unreadable: the refusal is the build's, and nothing is invented", async () => {
  coach();
  api.fail("POST /api/teams");
  api.fail("GET /api/teams");
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "No connection." });
  assert.deepEqual(ids(), ["t1"]);
});

test("a server that sent no code (a proxy's 502) has not answered; one that did has", async () => {
  coach();
  api.reply("POST /api/teams", 502, {});
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  api.reply("GET /api/teams", 200, { teams: [made, { id: "t1", name: "Old" }] });
  assert.equal((await teams.createTeam(BODY, { startedAt: 0 })).recovered, true);
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams", "GET /api/teams"]);
});

test("several new teams alike (another tab made one): the latest, whatever the coach's clock says", async () => {
  const earlier = { id: "a", ...IRON_ROOKS, createdAt: "2026-10-18T09:00:00Z" };
  const later = { id: "b", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  for (const startedAt of ["2026-10-18T10:00:00Z", "2026-10-18T12:00:00Z"]) {
    coach();
    api.fail("POST /api/teams");
    api.reply("GET /api/teams", 200, { teams: [earlier, later, { id: "t1", name: "Old" }] });
    assert.equal((await teams.createTeam(BODY, { startedAt: Date.parse(startedAt) })).team.id, "b", startedAt);
  }
});

// The ids the list held before the build is sent are what says which team is new, so a list that was never
// read (it failed at sign-in) is read first. Only when that fails too does the build's start stand in.
const unread = () => { state.myTeams = { items: [], loaded: false, loading: false, error: "no answer" }; };
const STARTED = Date.parse("2026-10-18T10:00:00Z");
const OFFLINE = { error: new TypeError("Failed to fetch") };

test("a list never read is read before the build is sent, and the ids it held decide what is new", async () => {
  coach();
  unread();
  // The coach's own older team of that name and race, made (by the server's clock) after the build began.
  const owned = { ...OLD_ROOKS, createdAt: "2026-10-18T10:03:00Z" };
  const gate = api.hold("GET /api/teams");
  api.fail("POST /api/teams");
  api.reply("GET /api/teams", 200, { teams: [owned, { id: "t1", name: "Old" }] });
  const creating = teams.createTeam(BODY, { startedAt: STARTED });
  await waitHeld(gate);
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams"], "nothing is sent before the list is read");
  gate.release();
  assert.deepEqual(await creating, { refusal: "No connection." });
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams", "POST /api/teams", "GET /api/teams"]);
});

test("when that read fails, only a team made since the build began is the build's", async () => {
  coach();
  unread();
  const made = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
  const gate = api.hold("GET /api/teams");
  api.fail("POST /api/teams");
  api.reply("GET /api/teams", 200, { teams: [OLD_ROOKS, { id: "t1", name: "Old" }] });
  let creating = teams.createTeam(BODY, { startedAt: STARTED });
  await waitHeld(gate);
  gate.release(OFFLINE);
  assert.deepEqual(await creating, { refusal: "No connection." }, "the older team is not the build's");
  coach();
  unread();
  const again = api.hold("GET /api/teams");
  api.fail("POST /api/teams");
  api.reply("GET /api/teams", 200, { teams: [made, OLD_ROOKS, { id: "t1", name: "Old" }] });
  creating = teams.createTeam(BODY, { startedAt: STARTED });
  await waitHeld(again);
  again.release(OFFLINE);
  assert.deepEqual(await creating, { team: made, recovered: true });
});

test("a list never read is read first, and the team made goes on it without a second read", async () => {
  coach();
  unread();
  api.reply("POST /api/teams", 201, { team: { id: "t2", name: "Iron Rooks" } });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { team: { id: "t2", name: "Iron Rooks" } });
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams", "POST /api/teams"]);
  assert.deepEqual(ids(), ["t2", "t1"]);
});

test("a list that cannot be read at all is read again after the team is made, not called complete with that one team on it", async () => {
  coach();
  unread();
  const gate = api.hold("GET /api/teams");
  api.reply("POST /api/teams", 201, { team: { id: "t2", name: "Iron Rooks" } });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t2", name: "Iron Rooks" }, { id: "t1", name: "Old" }] });
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  await waitHeld(gate);
  gate.release(OFFLINE);
  assert.deepEqual(await creating, { team: { id: "t2", name: "Iron Rooks" } });
  assert.deepEqual(api.calls.map((call) => call.key), ["GET /api/teams", "POST /api/teams", "GET /api/teams"]);
  assert.deepEqual(ids(), ["t2", "t1"]);
});

test("a list read in flight when the team is made is read again, not left to overwrite the new team", async () => {
  coach();
  const gate = api.hold("GET /api/teams");
  api.reply("POST /api/teams", 201, { team: { id: "t2", name: "Iron Rooks" } });
  const reading = teams.loadMyTeams(true);
  await waitHeld(gate);
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  await waitHeld(gate, 2);
  gate.release({ status: 200, body: { teams: [{ id: "t2", name: "Iron Rooks" }, { id: "t1", name: "Old" }] } });
  await reading;
  assert.deepEqual(await creating, { team: { id: "t2", name: "Iron Rooks" } });
  assert.equal(api.calls.filter((call) => call.key === "GET /api/teams").length, 2);
  assert.deepEqual(ids(), ["t2", "t1"]);
  assert.equal(state.myTeams.loading, false);
});

// An attempt whose fate is not known is looked for before anything is sent again: the coach's retry would
// otherwise make the team twice.
const MADE = { id: "t2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" };
const postsSent = () => api.calls.filter((call) => call.key === "POST /api/teams").length;

test("an answer lost and the list unreadable: the retry finds the team the first build made, and sends nothing", async () => {
  coach();
  api.fail("POST /api/teams");
  api.fail("GET /api/teams");
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: STARTED }), { refusal: "No connection." });
  // Online again, and the first build had been written after all.
  api.reply("POST /api/teams", 201, { team: { id: "t3", ...IRON_ROOKS } });
  api.reply("GET /api/teams", 200, { teams: [MADE, { id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: STARTED + 60_000 }), { team: MADE, recovered: true });
  assert.equal(postsSent(), 1);
  assert.deepEqual(ids(), ["t2", "t1"]);
  // The team is found, so the attempt is over: a build of the same name after it is a build of its own.
  api.reply("POST /api/teams", 201, { team: { id: "t4", ...IRON_ROOKS } });
  const before = api.calls.length;
  assert.equal((await teams.createTeam(BODY, { startedAt: STARTED })).team.id, "t4");
  assert.deepEqual(api.calls.slice(before).map((call) => call.key), ["POST /api/teams"]);
});

test("a retry whose list cannot be read is refused with nothing sent", async () => {
  coach();
  api.fail("POST /api/teams");
  api.fail("GET /api/teams");
  await teams.createTeam(BODY, { startedAt: STARTED });
  api.reply("POST /api/teams", 201, { team: { id: "t3", ...IRON_ROOKS } });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: STARTED }), { refusal: "No connection." });
  assert.equal(postsSent(), 1);
});

test("a retry that finds nothing sends the build, and the attempt is forgotten once it has", async () => {
  coach();
  api.fail("POST /api/teams");
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: STARTED }), { refusal: "No connection." });
  api.reply("POST /api/teams", 201, { team: MADE });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: STARTED }), { team: MADE });
  assert.deepEqual(api.calls.map((call) => call.key), ["POST /api/teams", "GET /api/teams", "GET /api/teams", "POST /api/teams"]);
  // A third build of the same name is a build of its own: nothing is looked for first.
  api.reply("POST /api/teams", 201, { team: { id: "t3", ...IRON_ROOKS } });
  const before = api.calls.length;
  assert.equal((await teams.createTeam(BODY, { startedAt: STARTED })).team.id, "t3");
  assert.deepEqual(api.calls.slice(before).map((call) => call.key), ["POST /api/teams"]);
});

test("an undecided build is forgotten when another coach signs in", async () => {
  coach();
  api.fail("POST /api/teams");
  api.fail("GET /api/teams");
  await teams.createTeam(BODY, { startedAt: STARTED });
  state.auth.currentUser = { id: "other", login: "other" };
  state.myTeams = { items: [], loaded: true, loading: false, error: "" };
  api.reply("POST /api/teams", 201, { team: { id: "x1", ...IRON_ROOKS } });
  const before = api.calls.length;
  assert.equal((await teams.createTeam(BODY, { startedAt: STARTED })).team.id, "x1");
  assert.deepEqual(api.calls.slice(before).map((call) => call.key), ["POST /api/teams"]);
});

test("a list read under a token another tab has changed is not looked in", async () => {
  coach();
  api.fail("POST /api/teams");
  const gate = api.hold("GET /api/teams");
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  await waitHeld(gate);
  api.items.set(TOKEN, "other-tab");
  gate.release({ status: 200, body: { teams: [{ id: "x2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" }, { id: "x1" }] } });
  assert.deepEqual(await creating, { refusal: "Other tab" });
});

test("a token another tab changed while the list was read first: nothing is sent", async () => {
  coach();
  unread();
  const gate = api.hold("GET /api/teams");
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  await waitHeld(gate);
  api.items.set(TOKEN, "other-tab");
  gate.release({ status: 200, body: { teams: [{ id: "x1" }] } });
  assert.deepEqual(await creating, { refusal: "Other tab" });
  assert.equal(postsSent(), 0);
});

test("a coach who changed while the list was read first is sent nothing for", async () => {
  coach();
  unread();
  const gate = api.hold("GET /api/teams");
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  await waitHeld(gate);
  state.auth.currentUser = { id: "other", login: "other" };
  gate.release({ status: 200, body: { teams: [{ id: "t1" }] } });
  assert.deepEqual(await creating, { refusal: "Other tab" });
  assert.equal(postsSent(), 0);
});

test("without options the build began now, and a 2xx with no team in it is not an answer: the team is looked for", async () => {
  coach();
  api.reply("POST /api/teams", 201, { team: MADE });
  assert.deepEqual(await teams.createTeam(BODY), { team: MADE });
  coach();
  api.reply("POST /api/teams", 200, {});
  api.reply("GET /api/teams", 200, { teams: [MADE, { id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { team: MADE, recovered: true });
  coach();
  api.reply("POST /api/teams", 200, {});
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1", name: "Old" }] });
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "No answer." });
});

test("another tab's coach: a team is neither created nor deleted", async () => {
  coach();
  api.items.set(TOKEN, "other-tab");
  assert.deepEqual(await teams.createTeam(BODY, { startedAt: 0 }), { refusal: "Other tab" });
  assert.deepEqual(await teams.deleteTeam("t1"), { refusal: "Other tab" });
  assert.equal(api.calls.length, 0);
});

test("a team made while another coach signed in is not put on that coach's list", async () => {
  coach();
  const gate = api.hold("POST /api/teams");
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  state.auth.currentUser = { id: "u2", login: "other" };
  state.myTeams = { items: [{ id: "x1" }], loaded: true, loading: false, error: "" };
  gate.release({ status: 201, body: { team: { id: "t2", name: "Iron Rooks" } } });
  assert.deepEqual(await creating, { team: { id: "t2", name: "Iron Rooks" } });
  assert.deepEqual(ids(), ["x1"]);
});

test("an answer lost while another coach signed in finds nothing on that coach's list", async () => {
  coach();
  const gate = api.hold("POST /api/teams");
  const creating = teams.createTeam(BODY, { startedAt: 0 });
  // The other coach has a team of the same name and race, which is new to the list the build began with.
  state.auth.currentUser = { id: "u2", login: "other", preferences: { activeTeamId: "x1" } };
  state.myTeams = { items: [{ id: "x1" }], loaded: true, loading: false, error: "" };
  state.activeTeamId = "x1";
  api.reply("GET /api/teams", 200, { teams: [{ id: "x2", ...IRON_ROOKS, createdAt: "2026-10-18T10:05:00Z" }, { id: "x1" }] });
  gate.release({ error: new TypeError("Failed to fetch") });
  assert.deepEqual(await creating, { refusal: "No connection." });
});

test("a team added goes first, replaces the one it was, clears the error, and the frame hears it", () => {
  coach([{ id: "t1", name: "Old" }, { id: "t2", name: "Before" }]);
  state.myTeams.error = "stale";
  state.myTeams.loaded = false;
  let heard = 0;
  const stop = teams.onMyTeamsChange(() => { heard += 1; });
  teams.addMyTeam({ id: "t2", name: "After" });
  stop();
  assert.deepEqual(state.myTeams.items, [{ id: "t2", name: "After" }, { id: "t1", name: "Old" }]);
  assert.equal(state.myTeams.loaded, true);
  assert.equal(state.myTeams.error, "");
  assert.equal(heard, 1);
});

test("a deleted team leaves the list read again; a refused one stays, with the server's reason", async () => {
  coach([{ id: "t1" }, { id: "t2" }]);
  api.reply("DELETE /api/teams/t1", 409, { error: { code: "TEAM_IN_SEASON_CANNOT_BE_DELETED", params: {}, message: "x" } });
  assert.deepEqual(await teams.deleteTeam("t1"), { refusal: "Played in a season." });
  assert.deepEqual(api.calls.map((call) => call.key), ["DELETE /api/teams/t1"]);
  assert.equal(state.season.loaded, true, "a team that stays leaves the season as it was");
  api.reply("DELETE /api/teams/t2", 200, { ok: true });
  api.reply("GET /api/teams", 200, { teams: [{ id: "t1" }] });
  api.reply("GET /api/games", 200, { games: [] });
  assert.deepEqual(await teams.deleteTeam("t2"), {});
  assert.deepEqual(ids(), ["t1"]);
  assert.equal(state.season.loaded, false, "the season is read again, as the old delete had it");
  assert.deepEqual(api.calls.map((call) => call.key).slice(1), ["DELETE /api/teams/t2", "GET /api/teams", "GET /api/games"]);
  api.assertAnswered();
});

test("a team is deleted at the address the caller names (an admin's), and a lost answer is a refusal", async () => {
  coach([{ id: "t1" }]);
  api.fail("DELETE /api/admin/teams/t9");
  assert.deepEqual(await teams.deleteTeam("t9", { endpoint: "/api/admin/teams/t9" }), { refusal: "No connection." });
  assert.deepEqual(api.calls.map((call) => call.key), ["DELETE /api/admin/teams/t9"]);
  assert.deepEqual(ids(), ["t1"]);
});

// The words of a refusal are made from a template (`validation.${code}`): every code the server can send a new team back with.
test("every rule a new team can be refused over is worded in both languages", () => {
  const source = readFileSync(new URL("../server/domain/roster.mjs", import.meta.url), "utf8");
  const codes = [...source.match(/BLOCKING_CODES = new Set\(\[([^\]]*)\]/)[1].matchAll(/"(\w+)"/g)].map((match) => match[1]);
  assert.ok(codes.length > 0, "the server's list was found");
  for (const locale of ["en", "ru"]) {
    const dictionary = JSON.parse(readFileSync(new URL(`../src/i18n/${locale}.json`, import.meta.url), "utf8"));
    for (const code of codes) assert.equal(typeof dictionary[`validation.${code}`], "string", `${locale} validation.${code}`);
  }
});
