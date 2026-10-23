import assert from "node:assert/strict";
import test from "node:test";
import { fireEvent } from "./helpers/fake-dom.mjs";
import {
  PATCH, PLAYERS, api, coach, gamesAre, LIVE_GAME, order, patches, releaseCurrentScreen,
  renderTeamRoster, save, settle, team, toggle, view,
} from "./helpers/roster-screen.mjs";
import { rosterMemory } from "../src/screens/team/roster/memory.mjs";
import { rosterInOrder } from "../src/domain/roster/order.mjs";

const move = (key, direction = "ArrowDown") => fireEvent(toggle(key), "keydown", { altKey: true, key: direction });
const slots = [0, 1, 2, 4, 5, 6];
const currentIds = () => patches().at(-1).body.roster.players.map(({ id }) => id);
const answer = (revision = 5) => api.reply(PATCH, 200, { team: team({ revision }) });

test("moving visible slots preserves hidden players, duplicate IDs and every player field", () => {
  const players = structuredClone(PLAYERS);
  players[1].id = players[0].id;
  const before = structuredClone(players);
  const result = rosterInOrder(players, [6, 0, 1, 2, 4, 5]);
  assert.deepEqual(result, [before[6], before[0], before[1], before[3], before[2], before[4], before[5]]);
  assert.equal(result[3], players[3], "missing player's slot and identity remain untouched");
  assert.deepEqual(players, before, "planning does not mutate the original array");
  for (const indices of [[0, 0], [-1, 0], [0, 7], [0, 1.5], [0], [0, 1]]) assert.equal(rosterInOrder(players, indices), null);
});

test("keyboard reorder saves only order, retains selected player, and survives reopening", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("p1#0"), "click");
  answer();
  move("p1#0");
  await settle();
  assert.deepEqual(currentIds(), ["p2", "p1", "p3", "p4", "p5", "p6", "p7"]);
  assert.deepEqual(order(), ["Bors", "Ann", "Cade", "Edda", "Finn", "Grom", "Dell"]);
  assert.equal(rosterMemory("t1").selected, "p1#0");
  assert.equal(patches()[0].body.revision, 4);
  const saved = patches()[0].body.roster;
  const original = save.trackRoster(team()).players;
  for (const player of saved.players) assert.deepEqual(player, original.find(({ id }) => id === player.id));
  coach({ teamAnswer: team({ revision: 5, roster: saved }) });
  await renderTeamRoster("t1");
  assert.deepEqual(order().slice(0, 3), ["Bors", "Ann", "Cade"]);
  releaseCurrentScreen();
});

test("rapid reorders queue on consecutive revisions, without losing earlier changes", async () => {
  coach();
  await renderTeamRoster("t1");
  answer(6);
  const gate = api.hold(PATCH);
  move("p1#0");
  move("p1#0");
  await settle();
  assert.equal(patches().length, 1);
  gate.release({ status: 200, body: { team: team({ revision: 5 }) } });
  await settle();
  assert.deepEqual(patches().map(({ body }) => body.revision), [4, 5]);
  assert.deepEqual(currentIds(), ["p2", "p3", "p1", "p4", "p5", "p6", "p7"]);
  releaseCurrentScreen();
});

test("a match or conflict disables reordering and direct queue requests respect the lock", async () => {
  coach();
  gamesAre([LIVE_GAME]);
  await renderTeamRoster("t1");
  assert.equal(view.querySelectorAll("[data-reorder-index]").length, 0);
  move("p1#0");
  assert.equal(patches().length, 0);
  assert.deepEqual(save.reorderPlayers("t1", [1, 0], { closed: () => "locked" }), { ok: false, refusal: "locked" });
  coach();
  await renderTeamRoster("t1");
  api.reply(PATCH, 409, { error: { code: "TEAM_SAVED_ELSEWHERE" }, team: team({ revision: 8 }) });
  move("p1#0");
  await settle();
  assert.equal(save.saveState("t1").status, "conflict");
  assert.equal(view.querySelectorAll("[data-reorder-index]").length, 0);
  move("p1#0");
  assert.equal(patches().length, 1);
  releaseCurrentScreen();
});

test("filtered reorder keeps all hidden slots and clears column sorting", async () => {
  coach();
  const memory = rosterMemory("t1");
  memory.query = "Human Lineman";
  memory.sort = { key: "player", dir: "asc" };
  await renderTeamRoster("t1");
  answer();
  move("p1#0");
  await settle();
  assert.deepEqual(currentIds(), ["p6", "p2", "p3", "p4", "p5", "p1", "p7"]);
  assert.equal(memory.sort, null);
  memory.query = "";
  releaseCurrentScreen();
});

test("restoring canonical order from a sorted view clears sorting without an unnecessary save", async () => {
  coach();
  const memory = rosterMemory("t1");
  memory.query = "Human Lineman";
  memory.sort = { key: "player", dir: "desc" };
  await renderTeamRoster("t1");
  assert.deepEqual(order(), ["Finn", "Ann", "Dell"]);
  move("p1#0", "ArrowUp");
  assert.deepEqual(order(), ["Ann", "Finn", "Dell"]);
  assert.equal(memory.sort, null);
  assert.equal(patches().length, 0);
  memory.query = "";
  releaseCurrentScreen();
});

test("ordinary clicks and early touch scrolls never save an order; screen leave cancels a pending hold", async () => {
  coach();
  await renderTeamRoster("t1");
  fireEvent(toggle("p1#0"), "click");
  assert.equal(rosterMemory("t1").selected, "p1#0");
  const touch = { identifier: 1, clientX: 40, clientY: 80 };
  fireEvent(toggle("p1#0"), "touchstart", { touches: [touch], changedTouches: [touch] });
  fireEvent(toggle("p1#0"), "touchmove", { changedTouches: [{ ...touch, clientY: 110 }] });
  fireEvent(toggle("p1#0"), "touchend", { changedTouches: [{ ...touch, clientY: 110 }] });
  fireEvent(toggle("p1#0"), "pointerdown", { pointerId: 2, pointerType: "mouse", button: 0, clientX: 40, clientY: 80 });
  releaseCurrentScreen();
  await new Promise((resolve) => setTimeout(resolve, 380));
  assert.equal(patches().length, 0);
  assert.equal(view.querySelector("[data-roster-dragging]"), null);
});

test("a queued roster order keeps its numbers, captain, skills, injuries and SPP", async () => {
  coach();
  await renderTeamRoster("t1");
  const before = structuredClone(save.trackRoster(team()));
  answer();
  assert.equal(save.reorderPlayers("t1", [...slots].reverse(), { closed: () => "" }).ok, true);
  await settle();
  assert.deepEqual(patches()[0].body.roster.players, rosterInOrder(before.players, [...slots].reverse()));
  releaseCurrentScreen();
});
