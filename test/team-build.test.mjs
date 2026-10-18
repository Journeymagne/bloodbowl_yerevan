import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { fileURLToPath } from "node:url";

import { expandCollections } from "../src/data/reference.mjs";
import { builderStaffCosts, builderStaffMaximums, medicalStaffDefinitions } from "../src/domain/league-rules.mjs";
import * as build from "../src/domain/roster/build.mjs";
import { setRosterCaptain } from "../src/domain/roster/players.mjs";
import { rowsForTeam } from "../src/domain/roster/values.mjs";
import { blockingViolations, checkRoster, loadTeamReference } from "../server/domain/roster.mjs";

const root = fileURLToPath(new URL("..", import.meta.url));
const data = expandCollections(JSON.parse(readFileSync(new URL("../public/data.en.json", import.meta.url), "utf8")));
const human = data.teams.find((team) => team.slug === "teams/human");
const goblin = data.teams.find((team) => team.slug === "teams/goblin");
const undead = data.teams.find((team) => team.slug === "teams/shambling-undead");
const row = (team, position) => rowsForTeam(team).findIndex((item) => item.position === position);

test("a new build is the race's, named, with its first league, nothing hired and 600k left", () => {
  const draft = build.newBuild(human, { name: "  Iron Rooks " });
  assert.equal(draft.teamSlug, "teams/human");
  assert.equal(draft.teamName, "Iron Rooks");
  assert.equal(draft.selectedLeague, "Old World Classic");
  assert.deepEqual(build.buildTotals(human, draft), { playersCost: 0, staffCost: 0, total: 0, left: 600, count: 0, short: 7, over: 0, ready: false });
});

test("hiring takes the next free number; a full position and a squad of fourteen refuse with the rule's code", () => {
  const draft = build.newBuild(human, { name: "R" });
  assert.equal(build.hirePlayer(human, draft, row(human, "Ogre")), null);
  assert.deepEqual(build.hirePlayer(human, draft, row(human, "Ogre")), { code: "POSITION_MAX", params: { position: "Ogre", max: 1 } });
  assert.equal(build.hirePlayer(human, draft, row(human, "Thrower")), null);
  assert.deepEqual(draft.players.map((player) => player.number), ["1", "2"]);
  draft.players[0].number = "7";
  assert.equal(build.nextFreeNumber(draft.players), 1);
  while (draft.players.length < 14) assert.equal(build.hirePlayer(human, draft, row(human, "Human Lineman")), null);
  assert.deepEqual(build.hirePlayer(human, draft, row(human, "Human Lineman")), { code: "ROSTER_MAX_PLAYERS", params: { max: 14, count: 14 } });
});

test("going over the budget is allowed and counted: the save waits for it to be put right (BuilderOver: 820k, 220k over)", () => {
  const draft = build.newBuild(human, { name: "R" });
  for (const [position, times] of [["Human Lineman", 3], ["Thrower", 1], ["Catcher", 2], ["Blitzer", 2], ["Ogre", 1]]) {
    for (let index = 0; index < times; index += 1) assert.equal(build.hirePlayer(human, draft, row(human, position)), null);
  }
  build.stepStaff(human, draft, "startingRerolls", 1);
  build.stepStaff(human, draft, "startingRerolls", 1);
  build.stepStaff(human, draft, "dedicatedFans", 1);
  build.stepStaff(human, draft, "dedicatedFans", 1);
  assert.deepEqual(build.buildTotals(human, draft), { playersCost: 680, staffCost: 140, total: 820, left: -220, count: 9, short: 0, over: 220, ready: false });
});

test("dropping takes the last of that position, and its captaincy with him", () => {
  const draft = build.newBuild(human, { name: "R" });
  build.hirePlayer(human, draft, row(human, "Thrower"));
  build.hirePlayer(human, draft, row(human, "Thrower"));
  setRosterCaptain(draft, draft.players[1].id);
  assert.equal(build.dropPlayer(human, draft, row(human, "Thrower")), true);
  assert.equal(draft.players.some((player) => player.isCaptain), false);
  assert.equal(build.dropPlayer(human, draft, row(human, "Ogre")), false);
});

test("staff stop at their maximum; bribes need Bribery and Corruption, a medic the race's own", () => {
  const draft = build.newBuild(human, { name: "R" });
  for (let index = 0; index < 6; index += 1) build.stepStaff(human, draft, "cheerleaders", 1);
  assert.deepEqual(build.stepStaff(human, draft, "cheerleaders", 1), { code: "STAFF_MAX", params: { key: "cheerleaders", max: 6 } });
  assert.deepEqual(build.stepStaff(human, draft, "bribes", 1), { code: "STAFF_UNAVAILABLE", params: { key: "bribes" } });
  assert.equal(build.staffAvailable(goblin, "bribes"), true);
  assert.equal(build.staffAvailable(undead, "apothecary"), false);
  assert.equal(build.staffAvailable(undead, "mortuaryAssistant"), true);
  assert.equal(build.staffAvailable(human, "teamRerolls"), false, "not sold while building");
  assert.equal(build.stepStaff(human, draft, "assistantCoaches", -1), null);
  assert.equal(draft.assistantCoaches, 0);
});

test("the request is what POST /api/teams reads: the race, the name, the roster without the logo, the treasury left; no rule it blocks is broken", async () => {
  await loadTeamReference(root);
  const draft = build.newBuild(human, { name: "Iron Rooks" });
  for (const [position, times] of [["Human Lineman", 5], ["Thrower", 1], ["Catcher", 1], ["Blitzer", 1]]) {
    for (let index = 0; index < times; index += 1) build.hirePlayer(human, draft, row(human, position));
  }
  build.stepStaff(human, draft, "startingRerolls", 1);
  build.stepStaff(human, draft, "dedicatedFans", 1);
  draft.logoData = "data:image/png;base64,AAAA";
  const request = build.buildRequest(human, draft);
  assert.deepEqual([request.name, request.baseTeamSlug, request.logoData], ["Iron Rooks", "teams/human", "data:image/png;base64,AAAA"]);
  assert.equal(request.roster.treasury, 45, "Builder.html: 555k spent, 45k left");
  assert.equal("logoData" in request.roster, false);
  assert.deepEqual(blockingViolations(checkRoster("teams/human", request.roster).violations), []);
});

test("a race's first league and first favoured alignment are the build's; a race with none has none", () => {
  const chosen = data.teams.find((team) => team.slug === "teams/chaos-chosen");
  const renegade = data.teams.find((team) => team.slug === "teams/chaos-renegade");
  const draft = build.newBuild(chosen, { name: "R" });
  assert.deepEqual([draft.selectedLeague, draft.favouredChoice], ["Chaos Clash", "Undivided"]);
  assert.equal(build.newBuild(human, { name: "R" }).favouredChoice, "");
  assert.equal(build.newBuild(renegade, { name: "R" }).selectedLeague, "");
});

test("a build is ready from seven players to the last of the 600k; one short, or 50k over, is not", () => {
  const draft = build.newBuild(human, { name: "R" });
  const hire = (times) => {
    for (let index = 0; index < times; index += 1) assert.equal(build.hirePlayer(human, draft, row(human, "Human Lineman")), null);
  };
  hire(6);
  assert.deepEqual([build.buildTotals(human, draft).short, build.buildTotals(human, draft).ready], [1, false]);
  hire(1);
  assert.deepEqual(build.buildTotals(human, draft), { playersCost: 350, staffCost: 0, total: 350, left: 250, count: 7, short: 0, over: 0, ready: true });
  hire(5);
  assert.deepEqual(build.buildTotals(human, draft), { playersCost: 600, staffCost: 0, total: 600, left: 0, count: 12, short: 0, over: 0, ready: true });
  hire(1);
  assert.deepEqual(build.buildTotals(human, draft), { playersCost: 650, staffCost: 0, total: 650, left: -50, count: 13, short: 0, over: 50, ready: false });
});

test("dropping keeps the counts in step with the players, and the captain of the ones who stay", () => {
  const draft = build.newBuild(human, { name: "R" });
  const thrower = row(human, "Thrower");
  build.hirePlayer(human, draft, thrower);
  build.hirePlayer(human, draft, thrower);
  setRosterCaptain(draft, draft.players[0].id);
  assert.equal(build.dropPlayer(human, draft, thrower), true);
  assert.deepEqual([draft.players.length, draft.players[0].isCaptain, draft.roster], [1, true, { [thrower]: 1 }]);
  assert.equal(build.dropPlayer(human, draft, thrower), true);
  assert.deepEqual([draft.players, draft.roster], [[], {}]);
});

test("the next free number skips the ones worn, ignores what is no number, and is 99 when all are worn", () => {
  const worn = (numbers) => numbers.map((number) => ({ number }));
  assert.equal(build.nextFreeNumber([]), 1);
  assert.equal(build.nextFreeNumber(worn(["1", "2", "4"])), 3);
  assert.equal(build.nextFreeNumber(worn(["", "x", 1])), 2);
  assert.equal(build.nextFreeNumber(worn(Array.from({ length: 99 }, (_, index) => String(index + 1)))), 99);
});

test("a hire for a row the race does not have is the caller's mistake, not a refusal", () => {
  assert.throws(() => build.hirePlayer(human, build.newBuild(human, { name: "R" }), 99), RangeError);
});

test("a race's medic is bought once and taken back, the bribes of a Bribery race cost 50k each, a refusal changes nothing", () => {
  const draft = build.newBuild(undead, { name: "R" });
  assert.equal(build.stepStaff(undead, draft, "mortuaryAssistant", 1), null);
  assert.deepEqual(build.stepStaff(undead, draft, "mortuaryAssistant", 1), { code: "STAFF_MAX", params: { key: "mortuaryAssistant", max: 1 } });
  assert.deepEqual(build.stepStaff(undead, draft, "apothecary", 1), { code: "STAFF_UNAVAILABLE", params: { key: "apothecary" } });
  assert.deepEqual(build.stepStaff(undead, draft, "teamRerolls", 1), { code: "STAFF_UNAVAILABLE", params: { key: "teamRerolls" } });
  assert.deepEqual([draft.mortuaryAssistant, draft.apothecary, draft.teamRerolls, build.buildTotals(undead, draft).staffCost], [1, 0, 0, 50]);
  assert.equal(build.stepStaff(undead, draft, "mortuaryAssistant", -1), null);
  assert.equal(draft.mortuaryAssistant, 0);

  const mob = build.newBuild(goblin, { name: "R" });
  for (let index = 0; index < 3; index += 1) assert.equal(build.stepStaff(goblin, mob, "bribes", 1), null);
  assert.deepEqual(build.stepStaff(goblin, mob, "bribes", 1), { code: "STAFF_MAX", params: { key: "bribes", max: 3 } });
  assert.deepEqual([mob.bribes, build.buildTotals(goblin, mob).staffCost], [3, 150]);
});

test("what the build sells has a price, a maximum and a counter in the draft; Team Rerolls are not sold", () => {
  const draft = build.newBuild(human, { name: "R" });
  for (const key of build.BUILD_STAFF_KEYS) {
    assert.ok(builderStaffCosts[key] > 0 && builderStaffMaximums[key] > 0, `${key} has a price and a maximum`);
    assert.equal(draft[key], 0, `${key} starts at none`);
  }
  assert.equal(build.BUILD_STAFF_KEYS.includes("teamRerolls"), false);
  for (const staff of medicalStaffDefinitions) assert.ok(build.BUILD_STAFF_KEYS.includes(staff.key), `${staff.key} is sold to the races that may have it`);
});
